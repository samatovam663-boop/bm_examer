import random

from django.db import IntegrityError, transaction
from django.db.models import Count, IntegerField, Max, OuterRef, Q, Subquery, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsStudent, IsTeacherOrAdmin
from apps.results import services
from apps.results.models import Answer, AnswerChoice, ExtraAttempt, TestAttempt

from . import ai
from .models import Choice, Question, Test
from .scheduling import sync_schedule
from .serializers import (GenerateQuestionsSerializer, QuestionImageSerializer, QuestionSerializer, SaveAnswerSerializer,
                          StudentQuestionSerializer, TestSerializer)
from .utils import (ensure_test_editable, export_questions_excel, export_questions_word, parse_questions_excel,
                    remove_question_image)


MAX_BULK = 200


def student_questions(attempt, context):
    """Urinish uchun savollar. Aralashtirish attempt.id ga bog'liq (deterministik),
    shuning uchun sahifa yangilanganda tartib o'zgarmaydi."""
    test = attempt.test
    questions = list(test.questions.prefetch_related('choices'))
    if test.shuffle_questions:
        random.Random(attempt.pk).shuffle(questions)
    data = [dict(d) for d in StudentQuestionSerializer(questions, many=True, context=context).data]
    if test.shuffle_choices:
        for item in data:
            if item['question_type'] != Question.QuestionType.TRUE_FALSE:
                random.Random(attempt.pk * 100003 + item['id']).shuffle(item['choices'])
    return data


class TestViewSet(viewsets.ModelViewSet):
    serializer_class = TestSerializer
    filterset_fields = ['status', 'subject', 'difficulty']
    search_fields = ['title', 'test_code', 'description']
    ordering_fields = ['created_at', 'title']

    def get_permissions(self):
        if self.action in ('start', 'submit', 'save_answer'):
            return [IsStudent()]
        if self.action in ('list', 'retrieve', 'by_code', 'questions'):
            return [IsAuthenticated()]
        return [IsTeacherOrAdmin()]

    def get_queryset(self):
        user = self.request.user
        sync_schedule()  # rejalashtirilgan testlarni aktivlashtirish/yopish
        # annotate (GROUP BY) Meta.ordering'ni e'tiborsiz qoldiradi, shuning uchun tartib aniq beriladi (sahifalash barqaror bo'lsin)
        qs = Test.objects.select_related('subject', 'created_by').prefetch_related('groups').annotate(
            questions_count=Count('questions', distinct=True)).order_by('-created_at', '-id')
        if user.role == 'admin':
            return qs
        if user.role == 'teacher':
            return qs.filter(created_by=user)
        extra = ExtraAttempt.objects.filter(test=OuterRef('pk'), student=user).values('count')[:1]
        # guruhga tayinlangan test faqat shu guruh o'quvchilariga ko'rinadi; guruhsiz test hammaga
        visible = Q(groups=None) | Q(pk__in=Test.objects.filter(groups__students=user).values('pk'))
        return qs.filter(status=Test.Status.ACTIVE).filter(visible).annotate(
            my_attempts=Count('attempts', distinct=True,
                              filter=Q(attempts__student=user, attempts__is_completed=True)),
            extra_attempts_count=Coalesce(Subquery(extra, output_field=IntegerField()), Value(0)))

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        test = self.get_object()
        if test.attempts.exists() and request.query_params.get('force') != 'true':
            return Response({'detail': "Testda natijalar bor. O'chirish uchun ?force=true yuboring."},
                            status=status.HTTP_409_CONFLICT)
        test.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _test_data(self, test):
        return TestSerializer(test, context=self.get_serializer_context()).data

    @action(detail=False, methods=['get'], url_path=r'by-code/(?P<code>[^/.]+)')
    def by_code(self, request, code=None):
        test = get_object_or_404(self.get_queryset(), test_code=code.upper())
        return Response(self._test_data(test))

    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        test = self.get_object()
        if test.status != Test.Status.DRAFT:
            raise ValidationError("Faqat draft holatdagi testni aktivlashtirish mumkin.")
        if not test.questions.exists():
            raise ValidationError("Savollarsiz testni aktivlashtirib bo'lmaydi.")
        test.status = Test.Status.ACTIVE
        test.save(update_fields=['status', 'updated_at'])
        return Response(self._test_data(test))

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        test = self.get_object()
        if test.status != Test.Status.ACTIVE:
            raise ValidationError("Faqat faol testni yakunlash mumkin.")
        with transaction.atomic():
            test.status = Test.Status.COMPLETED
            test.save(update_fields=['status', 'updated_at'])
            # tugallanmagan urinishlar yopiladi
            for attempt in test.attempts.filter(is_completed=False).select_related('test'):
                services.grade_attempt(attempt)
        return Response(self._test_data(test))

    @action(detail=True, methods=['post'])
    def duplicate(self, request, pk=None):
        """Testdan nusxa: qoralama holatda, yangi test kodi bilan; savollar variantlari bilan ko'chiriladi."""
        src = self.get_object()
        with transaction.atomic():
            copy = Test.objects.create(
                title=f'{src.title} (nusxa)', description=src.description, subject=src.subject,
                created_by=request.user, duration_minutes=src.duration_minutes, difficulty=src.difficulty,
                shuffle_questions=src.shuffle_questions, shuffle_choices=src.shuffle_choices,
                max_attempts=src.max_attempts, show_results=src.show_results)
            for q in src.questions.prefetch_related('choices'):
                new_q = Question.objects.create(
                    test=copy, question_type=q.question_type, text=q.text, image=q.image, has_formula=q.has_formula,
                    topic=q.topic, difficulty=q.difficulty, points=q.points, order=q.order)
                Choice.objects.bulk_create([Choice(question=new_q, text=c.text, is_correct=c.is_correct, order=c.order)
                                            for c in q.choices.all()])
        return Response(self._test_data(copy), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='reorder-questions')
    def reorder_questions(self, request, pk=None):
        """Savollar tartibi: body {"ids": [3, 1, 2]}. Natijalarga ta'sir qilmagani uchun urinishlardan keyin ham mumkin."""
        test = self.get_object()
        ids = request.data.get('ids')
        mine = {q.id: q for q in test.questions.all()}
        if not isinstance(ids, list) or sorted(ids) != sorted(mine):
            raise ValidationError("Savollar ro'yxati mos kelmadi.")
        with transaction.atomic():
            for position, qid in enumerate(ids):
                Question.objects.filter(pk=qid).update(order=position)
        return Response({'detail': 'Tartib saqlandi.'})

    @action(detail=True, methods=['get', 'post'])
    def questions(self, request, pk=None):
        test = self.get_object()
        context = self.get_serializer_context()
        if request.method == 'POST':
            if request.user.role not in ('teacher', 'admin'):
                raise PermissionDenied()
            ensure_test_editable(test)
            serializer = QuestionSerializer(data=request.data, context=context)
            serializer.is_valid(raise_exception=True)
            extra = {} if 'order' in request.data else {'order': test.questions.count()}
            serializer.save(test=test, **extra)
            return Response(serializer.data, status=status.HTTP_201_CREATED)

        if request.user.role == 'student':
            attempt = services.get_open_attempt(test, request.user)
            if attempt is None:
                raise PermissionDenied("Savollarni ko'rish uchun testni boshlang.")
            return Response(student_questions(attempt, context))
        qs = test.questions.prefetch_related('choices')
        return Response(QuestionSerializer(qs, many=True, context=context).data)

    # ---------- student ----------

    @action(detail=True, methods=['post'])
    def start(self, request, pk=None):
        test = self.get_object()
        user = request.user
        attempt = services.get_open_attempt(test, user)
        if attempt is None:
            done = test.attempts.filter(student=user, is_completed=True).count()
            if test.max_attempts and done >= test.max_attempts + services.extra_attempts(test, user):
                raise PermissionDenied("Urinishlar limiti tugagan.")
            if not test.questions.exists():
                raise ValidationError("Testda savollar yo'q.")
            last = test.attempts.filter(student=user).aggregate(m=Max('attempt_number'))['m'] or 0
            try:
                attempt = TestAttempt.objects.create(test=test, student=user, attempt_number=last + 1)
            except IntegrityError:
                return Response({'detail': "Urinish allaqachon boshlangan, qayta urinib ko'ring."},
                                status=status.HTTP_409_CONFLICT)
        saved = {}
        for ac in AnswerChoice.objects.filter(answer__attempt=attempt):
            saved.setdefault(ac.answer.question_id, []).append(ac.choice_id)
        return Response({
            'attempt_id': attempt.id,
            'attempt_number': attempt.attempt_number,
            'started_at': attempt.started_at,
            'expires_at': services.attempt_expires_at(attempt),
            'duration_minutes': test.duration_minutes,
            'tab_switches': attempt.tab_switches,
            'questions': student_questions(attempt, self.get_serializer_context()),
            'saved_answers': saved,
        }, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='save-answer')
    def save_answer(self, request, pk=None):
        test = self.get_object()
        serializer = SaveAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        attempt = services.get_open_attempt(test, request.user)
        if attempt is None:
            raise ValidationError("Faol urinish yo'q yoki vaqt tugagan.")
        question = get_object_or_404(test.questions.prefetch_related('choices'), pk=data['question_id'])
        choice_ids = set(data['choice_ids'])
        valid_ids = {c.id for c in question.choices.all()}
        if not choice_ids <= valid_ids:
            raise ValidationError("Variant bu savolga tegishli emas.")
        if question.question_type != Question.QuestionType.MULTIPLE and len(choice_ids) > 1:
            raise ValidationError("Bu savolda faqat bitta variant tanlanadi.")

        with transaction.atomic():
            if choice_ids:
                answer, _ = Answer.objects.get_or_create(attempt=attempt, question=question)
                answer.selected_choices.all().delete()
                AnswerChoice.objects.bulk_create([AnswerChoice(answer=answer, choice_id=cid) for cid in choice_ids])
            else:
                Answer.objects.filter(attempt=attempt, question=question).delete()
            if 'tab_switches' in data and data['tab_switches'] > attempt.tab_switches:
                attempt.tab_switches = data['tab_switches']
                attempt.save(update_fields=['tab_switches'])
        return Response({'saved': True})

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        test = self.get_object()
        attempt = (TestAttempt.objects.filter(test=test, student=request.user, is_completed=False)
                   .select_related('test').first())
        if attempt is None:
            raise ValidationError("Faol urinish yo'q.")
        tab_switches = request.data.get('tab_switches')
        try:
            tab_switches = int(tab_switches) if tab_switches is not None else None
        except (TypeError, ValueError):
            raise ValidationError({'tab_switches': 'Butun son bo\'lishi kerak.'})
        violation = request.data.get('violation') in (True, 'true', 'True', '1', 1)
        services.grade_attempt(attempt, tab_switches=tab_switches, violation=violation)
        return Response(services.build_attempt_detail(attempt, request.user, self.get_serializer_context()))


class QuestionViewSet(viewsets.GenericViewSet):
    """PUT/DELETE /api/questions/{id}/ va rasm yuklash."""
    permission_classes = [IsTeacherOrAdmin]
    serializer_class = QuestionSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Question.objects.select_related('test', 'bank').prefetch_related('choices')
        if user.role == 'admin':
            return qs
        return qs.filter(Q(test__created_by=user) | Q(bank__created_by=user))

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    def update(self, request, pk=None, partial=False):
        question = self.get_object()
        ensure_test_editable(question.test)
        serializer = self.get_serializer(question, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def partial_update(self, request, pk=None):
        return self.update(request, pk, partial=True)

    def destroy(self, request, pk=None):
        question = self.get_object()
        ensure_test_editable(question.test)
        question.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'])
    def correct(self, request, pk=None):
        """Urinishlar boshlangach xato savolni tuzatish: to'g'ri javobni o'zgartirish yoki savolni bekor qilish
        (hammaga ball). Barcha yakunlangan urinishlar qayta baholanadi."""
        question = self.get_object()
        if question.test_id is None:
            raise ValidationError("Bank savolini bu yo'l bilan tuzatib bo'lmaydi, oddiy tahrirlang.")
        cancel = request.data.get('cancel') in (True, 'true', 'True', 1, '1')
        with transaction.atomic():
            if cancel:
                question.voided = True
            else:
                ids = request.data.get('correct_choice_ids')
                valid = {c.id for c in question.choices.all()}
                if not isinstance(ids, list) or not ids or not set(ids) <= valid:
                    raise ValidationError({'correct_choice_ids': "To'g'ri javobni tanlang."})
                if question.question_type != Question.QuestionType.MULTIPLE and len(set(ids)) != 1:
                    raise ValidationError({'correct_choice_ids': "Bu savolda aynan bitta to'g'ri javob bo'lishi kerak."})
                question.choices.update(is_correct=False)
                question.choices.filter(pk__in=ids).update(is_correct=True)
                question.voided = False
            question.corrected_at = timezone.now()
            question.save(update_fields=['voided', 'corrected_at'])
            # mashq natijalari eski javobga bog'liq edi
            question.practice_progress.all().delete()
            regraded = services.regrade_test(question.test)
        return Response({'regraded': regraded})

    @action(detail=True, methods=['post', 'delete'], parser_classes=[MultiPartParser])
    def image(self, request, pk=None):
        question = self.get_object()
        ensure_test_editable(question.test)
        if request.method == 'DELETE':
            remove_question_image(question)
            return Response(status=status.HTTP_204_NO_CONTENT)
        serializer = QuestionImageSerializer(question, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(self.get_serializer(question).data)


class QuestionGenerateView(APIView):
    """Claude bilan savol yaratish. Natija saqlanmaydi: o'qituvchi ko'rib chiqib, /questions/bulk/ orqali qo'shadi."""
    permission_classes = [IsTeacherOrAdmin]
    throttle_scope = 'ai'

    def post(self, request):
        serializer = GenerateQuestionsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            return Response(ai.generate(serializer.validated_data))
        except ai.AiUnavailable as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ai.AiBadReply:
            return Response({'detail': "Claude javobini o'qib bo'lmadi. Mavzuni aniqroq yozib, qayta urinib ko'ring."},
                            status=status.HTTP_502_BAD_GATEWAY)


class QuestionBulkView(APIView):
    """Ko'p savolni bir so'rovda qo'shish (frontenddagi Excel/Word import va Claude uchun).
    Body: {"test_id" | "bank_id": N, "questions": [{question_type, text, points, difficulty, topic, choices}]}.
    Hammasi tekshiriladi: bittasi yaroqsiz bo'lsa hech biri saqlanmaydi."""
    permission_classes = [IsTeacherOrAdmin]

    def post(self, request):
        from apps.question_bank.models import QuestionBank

        user = request.user
        items = request.data.get('questions')
        if not isinstance(items, list) or not items:
            raise ValidationError({'questions': "Savollar ro'yxati bo'sh."})
        if len(items) > MAX_BULK:
            raise ValidationError({'questions': f"Bir martada ko'pi bilan {MAX_BULK} ta savol."})
        test_id, bank_id = request.data.get('test_id'), request.data.get('bank_id')
        if bool(test_id) == bool(bank_id):
            raise ValidationError("test_id yoki bank_id dan faqat bittasini yuboring.")

        if test_id:
            tests = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
            target = get_object_or_404(tests, pk=test_id)
            ensure_test_editable(target)
            kwargs, base = {'test': target}, target.questions.count()
        else:
            banks = QuestionBank.objects.all() if user.role == 'admin' else QuestionBank.objects.filter(created_by=user)
            target = get_object_or_404(banks, pk=bank_id)
            kwargs, base = {'bank': target}, target.questions.count()

        valid, errors = [], []
        for index, data in enumerate(items, start=1):
            serializer = QuestionSerializer(data=data, context={'request': request})
            if serializer.is_valid():
                valid.append(serializer)
            else:
                errors.append({'index': index, 'error': serializer.errors})
        if errors:
            return Response({'detail': "Ba'zi savollar yaroqsiz, hech biri saqlanmadi.", 'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for i, serializer in enumerate(valid):
                serializer.save(order=base + i, **kwargs)
        return Response({'added': len(valid)}, status=status.HTTP_201_CREATED)


class QuestionImportView(APIView):
    """Excel'dan savollarni import: multipart `file` + `test_id` yoki `bank_id`. Hammasi yoki hech narsa."""
    permission_classes = [IsTeacherOrAdmin]
    parser_classes = [MultiPartParser]

    def post(self, request):
        from apps.question_bank.models import QuestionBank

        user = request.user
        file = request.FILES.get('file')
        if not file:
            raise ValidationError({'file': 'Excel fayl yuborilmagan.'})
        test_id, bank_id = request.data.get('test_id'), request.data.get('bank_id')
        if bool(test_id) == bool(bank_id):
            raise ValidationError("test_id yoki bank_id dan faqat bittasini yuboring.")

        if test_id:
            tests = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
            target = get_object_or_404(tests, pk=test_id)
            ensure_test_editable(target)
            kwargs, count = {'test': target}, target.questions.count()
        else:
            banks = QuestionBank.objects.all() if user.role == 'admin' else QuestionBank.objects.filter(created_by=user)
            target = get_object_or_404(banks, pk=bank_id)
            kwargs, count = {'bank': target}, target.questions.count()

        from .serializers import QuestionSerializer as QS
        parsed, errors = parse_questions_excel(file)
        valid = []
        for row, data in parsed:
            serializer = QS(data=data, context={'request': request})
            if serializer.is_valid():
                valid.append(serializer)
            else:
                errors.append({'row': row, 'error': serializer.errors})
        if errors:
            return Response({'detail': 'Importda xatolar bor, hech narsa saqlanmadi.', 'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)
        with transaction.atomic():
            for i, serializer in enumerate(valid):
                serializer.save(order=count + i, **kwargs)
        return Response({'imported': len(valid)}, status=status.HTTP_201_CREATED)


class QuestionExportView(APIView):
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request, test_id):
        kind = request.query_params.get('type', 'excel')
        if kind not in ('excel', 'word'):
            raise ValidationError({'type': "excel yoki word bo'lishi kerak."})
        user = request.user
        tests = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
        test = get_object_or_404(tests, pk=test_id)
        questions = list(test.questions.prefetch_related('choices'))
        if kind == 'excel':
            content = export_questions_excel(questions)
            ctype, ext = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx'
        else:
            content = export_questions_word(test, questions)
            ctype, ext = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx'
        response = HttpResponse(content, content_type=ctype)
        response['Content-Disposition'] = f'attachment; filename="questions_{test.test_code}.{ext}"'
        return response
