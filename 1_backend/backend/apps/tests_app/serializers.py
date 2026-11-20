import re

from django.db import transaction
from rest_framework import serializers

from apps.accounts.validators import validate_image_size
from apps.groups.models import Group

from .models import Choice, Question, Test

FORMULA_RE = re.compile(r'\$[^$]+\$|\\\(|\\\[')


class ChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Choice
        fields = ('id', 'text', 'is_correct', 'order')
        read_only_fields = ('id',)


class StudentChoiceSerializer(serializers.ModelSerializer):
    """Student uchun: is_correct ko'rsatilmaydi."""

    class Meta:
        model = Choice
        fields = ('id', 'text', 'order')


class QuestionSerializer(serializers.ModelSerializer):
    choices = ChoiceSerializer(many=True, required=False)
    # true_false savol uchun qisqa yo'l: choices o'rniga to'g'ri javob
    correct_answer = serializers.BooleanField(write_only=True, required=False)

    class Meta:
        model = Question
        fields = ('id', 'test', 'bank', 'question_type', 'text', 'image', 'has_formula', 'topic', 'difficulty',
                  'points', 'order', 'voided', 'corrected_at', 'choices', 'correct_answer')
        read_only_fields = ('id', 'test', 'bank', 'image', 'has_formula', 'voided', 'corrected_at')

    def validate_points(self, value):
        if value < 1:
            raise serializers.ValidationError("Ball kamida 1 bo'lishi kerak.")
        return value

    def validate(self, attrs):
        T = Question.QuestionType
        q_type = attrs.get('question_type') or (self.instance.question_type if self.instance else T.SINGLE)
        choices = attrs.get('choices')
        correct_answer = attrs.pop('correct_answer', None)

        if q_type == T.TRUE_FALSE and choices is None and correct_answer is not None:
            choices = attrs['choices'] = [
                {'text': 'True', 'is_correct': correct_answer, 'order': 0},
                {'text': 'False', 'is_correct': not correct_answer, 'order': 1},
            ]

        if choices is None:
            if self.instance is None:
                raise serializers.ValidationError({'choices': 'Variantlar kerak.'})
            if q_type != self.instance.question_type:
                raise serializers.ValidationError({'choices': "Savol turi o'zgarsa, variantlar ham yuborilishi kerak."})
            return attrs

        for i, choice in enumerate(choices):
            choice.setdefault('order', i)
        correct = sum(1 for c in choices if c.get('is_correct'))
        if q_type == T.TRUE_FALSE:
            if len(choices) != 2 or correct != 1:
                raise serializers.ValidationError({'choices': "True/False savolda 2 ta variant va 1 ta to'g'ri javob bo'lishi kerak."})
        elif q_type == T.SINGLE:
            if len(choices) < 2 or correct != 1:
                raise serializers.ValidationError({'choices': "Kamida 2 ta variant va aynan 1 ta to'g'ri javob bo'lishi kerak."})
        else:
            if len(choices) < 2 or correct < 1:
                raise serializers.ValidationError({'choices': "Kamida 2 ta variant va kamida 1 ta to'g'ri javob bo'lishi kerak."})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        choices = validated_data.pop('choices')
        validated_data['has_formula'] = bool(FORMULA_RE.search(validated_data.get('text', '')))
        question = Question.objects.create(**validated_data)
        Choice.objects.bulk_create([Choice(question=question, **c) for c in choices])
        return question

    @transaction.atomic
    def update(self, instance, validated_data):
        choices = validated_data.pop('choices', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.has_formula = bool(FORMULA_RE.search(instance.text))
        instance.save()
        if choices is not None:
            instance.choices.all().delete()
            Choice.objects.bulk_create([Choice(question=instance, **c) for c in choices])
        return instance


class StudentQuestionSerializer(serializers.ModelSerializer):
    choices = StudentChoiceSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ('id', 'question_type', 'text', 'image', 'has_formula', 'points', 'order', 'choices')


class QuestionImageSerializer(serializers.ModelSerializer):
    image = serializers.ImageField(validators=[validate_image_size])

    class Meta:
        model = Question
        fields = ('image',)


class TestSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True, default=None)
    created_by_name = serializers.SerializerMethodField()
    questions_count = serializers.SerializerMethodField()
    my_attempts = serializers.IntegerField(read_only=True)  # faqat student uchun annotatsiya qilinadi
    attempts_allowed = serializers.SerializerMethodField()
    groups = serializers.PrimaryKeyRelatedField(many=True, queryset=Group.objects.all(), required=False)
    groups_names = serializers.SerializerMethodField()

    class Meta:
        model = Test
        fields = ('id', 'title', 'description', 'subject', 'subject_name', 'created_by', 'created_by_name',
                  'test_code', 'duration_minutes', 'difficulty', 'status', 'shuffle_questions',
                  'shuffle_choices', 'max_attempts', 'show_results', 'groups', 'groups_names', 'starts_at', 'ends_at',
                  'questions_count', 'my_attempts', 'attempts_allowed', 'created_at', 'updated_at')
        read_only_fields = ('id', 'created_by', 'test_code', 'status', 'created_at', 'updated_at')

    def get_groups_names(self, obj):
        return [g.name for g in obj.groups.all()]

    def validate_groups(self, groups):
        user = self.context['request'].user
        if user.role != 'admin' and any(g.teacher_id != user.id for g in groups):
            raise serializers.ValidationError("Faqat o'zingizning guruhlaringizni tanlay olasiz.")
        return groups

    def validate(self, attrs):
        starts = attrs.get('starts_at', self.instance.starts_at if self.instance else None)
        ends = attrs.get('ends_at', self.instance.ends_at if self.instance else None)
        if starts and ends and ends <= starts:
            raise serializers.ValidationError({'ends_at': "Tugash vaqti boshlanishdan keyin bo'lishi kerak."})
        return attrs

    def get_attempts_allowed(self, obj):
        """Studentga: max_attempts + o'qituvchi bergan qo'shimcha urinishlar (0 = cheksiz). Boshqalarga None."""
        extra = getattr(obj, 'extra_attempts_count', None)
        if extra is None:
            return None
        return obj.max_attempts + extra if obj.max_attempts else 0

    def get_created_by_name(self, obj):
        return obj.created_by.get_full_name() or obj.created_by.username

    def get_questions_count(self, obj):
        count = getattr(obj, 'questions_count', None)
        return obj.questions.count() if count is None else count

    def validate_duration_minutes(self, value):
        if value < 1:
            raise serializers.ValidationError("Davomiylik kamida 1 daqiqa bo'lishi kerak.")
        return value


class GenerateQuestionsSerializer(serializers.Serializer):
    """Claude bilan savol yaratish so'rovi (uzunliklar cheklangan: prompt'ga ortiqcha matn kirmasin)."""
    topic = serializers.CharField(min_length=3, max_length=120)
    count = serializers.IntegerField(min_value=1, max_value=10, default=5)
    difficulty = serializers.ChoiceField(choices=['mixed', 'easy', 'medium', 'hard'], default='mixed')
    types = serializers.ListField(child=serializers.ChoiceField(choices=['single', 'multiple', 'true_false']),
                                  min_length=1, max_length=3)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    points = serializers.IntegerField(min_value=1, max_value=10, default=1)
    test_title = serializers.CharField(max_length=200, required=False, allow_blank=True, default='')
    existing = serializers.ListField(child=serializers.CharField(max_length=2000), required=False, default=list, max_length=60)


class SaveAnswerSerializer(serializers.Serializer):
    question_id = serializers.IntegerField()
    choice_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)
    tab_switches = serializers.IntegerField(required=False, min_value=0)
