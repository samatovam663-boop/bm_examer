from rest_framework import serializers

from .models import Goal, TestAttempt


class GoalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Goal
        fields = ('id', 'subject', 'target', 'deadline', 'created_at')
        read_only_fields = ('id', 'created_at')

    def validate_target(self, value):
        if not 1 <= value <= 100:
            raise serializers.ValidationError("Maqsad 1 dan 100 gacha bo'lsin.")
        return value


class AttemptSerializer(serializers.ModelSerializer):
    test_title = serializers.CharField(source='test.title', read_only=True)
    subject = serializers.IntegerField(source='test.subject_id', read_only=True)
    subject_name = serializers.CharField(source='test.subject.name', read_only=True, default=None)
    test_duration_minutes = serializers.IntegerField(source='test.duration_minutes', read_only=True)
    student_name = serializers.SerializerMethodField()
    duration_seconds = serializers.SerializerMethodField()

    class Meta:
        model = TestAttempt
        fields = ('id', 'test', 'test_title', 'subject', 'subject_name', 'test_duration_minutes', 'student',
                  'student_name', 'attempt_number', 'started_at', 'finished_at', 'duration_seconds', 'score',
                  'total_questions', 'correct_answers', 'percentage', 'is_completed', 'tab_switches', 'violation')

    def get_student_name(self, obj):
        return obj.student.get_full_name() or obj.student.username

    def get_duration_seconds(self, obj):
        if obj.finished_at:
            return int((obj.finished_at - obj.started_at).total_seconds())
        return None
