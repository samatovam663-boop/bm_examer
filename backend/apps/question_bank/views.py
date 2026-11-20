from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.accounts.permissions import IsTeacherOrAdmin
from apps.tests_app.models import Choice, Question, Test
from apps.tests_app.serializers import QuestionSerializer
from apps.tests_app.utils import ensure_test_editable

from .models import QuestionBank
from .serializers import AddToTestSerializer, QuestionBankSerializer


class QuestionBankViewSet(viewsets.ModelViewSet):
    serializer_class = QuestionBankSerializer
    permission_classes = [IsTeacherOrAdmin]
    filterset_fields = ['subject']
    search_fields = ['name']

    def get_queryset(self):
        qs = QuestionBank.objects.select_related('subject').annotate(questions_count=Count('questions'))
        user = self.request.user
        return qs if user.role == 'admin' else qs.filter(created_by=user)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get', 'post'])
    def questions(self, request, pk=None):
        bank = self.get_object()
        context = self.get_serializer_context()
        if request.method == 'POST':
            serializer = QuestionSerializer(data=request.data, context=context)
            serializer.is_valid(raise_exception=True)
            extra = {} if 'order' in request.data else {'order': bank.questions.count()}
            serializer.save(bank=bank, **extra)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        qs = bank.questions.prefetch_related('choices')
        return Response(QuestionSerializer(qs, many=True, context=context).data)

    @action(detail=True, methods=['post'], url_path='add-to-test')
    def add_to_test(self, request, pk=None):
        bank = self.get_object()
        serializer = AddToTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        tests = Test.objects.all() if request.user.role == 'admin' else Test.objects.filter(created_by=request.user)
        test = get_object_or_404(tests, pk=serializer.validated_data['test_id'])
        ensure_test_editable(test)

        questions = bank.questions.prefetch_related('choices')
        ids = serializer.validated_data.get('question_ids')
        if ids:
            questions = questions.filter(pk__in=ids)
            if questions.count() != len(set(ids)):
                raise ValidationError("Ba'zi savollar bu bankda topilmadi.")
        questions = list(questions)
        if not questions:
            raise ValidationError("Qo'shish uchun savollar yo'q.")

        # savollar nusxalanadi: bank o'zgarsa test o'zgarmasligi uchun
        start = test.questions.count()
        with transaction.atomic():
            for i, q in enumerate(questions):
                copy = Question.objects.create(
                    test=test, question_type=q.question_type, text=q.text, image=q.image,
                    has_formula=q.has_formula, topic=q.topic, difficulty=q.difficulty, points=q.points, order=start + i)
                Choice.objects.bulk_create([
                    Choice(question=copy, text=c.text, is_correct=c.is_correct, order=c.order)
                    for c in q.choices.all()])
        return Response({'added': len(questions)}, status=status.HTTP_201_CREATED)
