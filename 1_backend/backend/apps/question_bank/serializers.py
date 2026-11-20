from rest_framework import serializers

from .models import QuestionBank


class QuestionBankSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True, default=None)
    questions_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = QuestionBank
        fields = ('id', 'name', 'subject', 'subject_name', 'created_by', 'questions_count', 'created_at')
        read_only_fields = ('id', 'created_by', 'created_at')


class AddToTestSerializer(serializers.Serializer):
    test_id = serializers.IntegerField()
    # berilmasa bankdagi hamma savollar qo'shiladi
    question_ids = serializers.ListField(child=serializers.IntegerField(), required=False, allow_empty=False)
