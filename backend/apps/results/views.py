from datetime import timedelta

from django.db.models import Avg, Count, Max, Min, Q
from django.http import HttpResponse
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.permissions import IsStudent, IsTeacherOrAdmin
from apps.accounts.serializers import UserSerializer
from apps.subjects.models import Subject
from apps.tests_app.models import Test
from apps.tests_app.scheduling import sync_schedule

from . import export, services
from .models import ExtraAttempt, Goal, TestAttempt
from .serializers import AttemptSerializer, GoalSerializer

EXPORT_TYPES = {
    'excel': (export.results_excel, 'xlsx',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    'pdf': (export.results_pdf, 'pdf', 'application/pdf'),
    'word': (export.results_word, 'docx',
             'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
}


def staff_test_or_404(user, test_id):
    """Admin: istalgan test; teacher: faqat o'zining testi."""
    qs = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
    return get_object_or_404(qs, pk=test_id)


class MyResultsView(generics.ListAPIView):
    permission_classes = [IsStudent]
    serializer_class = AttemptSerializer
    filterset_fields = ['test']
    ordering_fields = ['started_at', 'percentage']

    def get_queryset(self):
        return (TestAttempt.objects.filter(student=self.request.user, is_completed=True)
                .select_related('test', 'student'))


class TestResultsView(APIView):
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request, test_id):
        sync_schedule()
        test = staff_test_or_404(request.user, test_id)
        all_attempts = test.attempts.filter(is_completed=True).select_related('test', 'student')
        attempts = all_attempts
        ranking = services.leaderboard(test)
        group_id = request.query_params.get('group')
        if group_id and group_id.isdigit():
            # guruh bo'yicha filtr: urinishlar, statistika va reyting faqat shu guruh a'zolari uchun
            members = set(User.objects.filter(student_groups=group_id).values_list('id', flat=True))
            attempts = attempts.filter(student__in=members)
            ranking = [{**r, 'rank': i} for i, r in enumerate((r for r in ranking if r['student'] in members), start=1)]
        stats = attempts.aggregate(attempts=Count('id'), average=Avg('percentage'),
                                   highest=Max('percentage'), lowest=Min('percentage'))
        group_stats = []
        for g in test.groups.all():
            ga = all_attempts.filter(student__in=g.students.all()).aggregate(n=Count('id'), avg=Avg('percentage'))
            group_stats.append({'group': g.id, 'name': g.name, 'students': g.students.count(), 'attempts': ga['n'],
                                'average': round(ga['avg'], 1) if ga['avg'] is not None else None})
        return Response({
            'test': {'id': test.id, 'title': test.title, 'test_code': test.test_code, 'status': test.status},
            'groups': [{'id': g.id, 'name': g.name} for g in test.groups.all()],
            'group_stats': group_stats,
            'stats': {
                'attempts_count': stats['attempts'],
                'students_count': attempts.values('student').distinct().count(),
                'average_percentage': round(stats['average'] or 0, 2),
                'highest_percentage': stats['highest'] or 0,
                'lowest_percentage': stats['lowest'] or 0,
            },
            'ranking': ranking,
            'attempts': AttemptSerializer(attempts, many=True, context={'request': request}).data,
            'topics': services.topic_stats(attempts),
            'extras': {str(e.student_id): e.count for e in test.extra_attempts.all()},
        })


class AttentionView(APIView):
    """O'qituvchi dashboardi uchun "e'tibor talab qiladi": past natijali o'quvchilar, bloklanganlar,
    tez yopiladigan testlar va zaif mavzular (o'qituvchining testlari, admin: hammasi)."""
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request):
        sync_schedule()
        user = request.user
        attempts = list(_staff_attempts(user))
        by = {}
        for a in attempts:
            by.setdefault(a.student_id, []).append(a)
        low = []
        for items in by.values():
            avg = sum(a.percentage for a in items) / len(items)
            if avg < 50:
                s = items[0].student
                low.append({'id': s.id, 'name': s.get_full_name() or s.username, 'average': round(avg, 1), 'attempts': len(items)})
        low.sort(key=lambda x: x['average'])
        week = timezone.now() - timedelta(days=7)
        blocked = [{'attempt_id': a.id, 'student': a.student_id, 'student_name': a.student.get_full_name() or a.student.username,
                    'test': a.test_id, 'test_title': a.test.title, 'at': a.finished_at}
                   for a in sorted(attempts, key=lambda a: a.finished_at, reverse=True) if a.violation and a.finished_at >= week]
        tests = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
        soon = timezone.now() + timedelta(hours=72)
        closing = [{'id': t.id, 'title': t.title, 'test_code': t.test_code, 'ends_at': t.ends_at}
                   for t in tests.filter(status='active', ends_at__isnull=False, ends_at__lte=soon).order_by('ends_at')]
        weak = [t for t in services.topic_stats(attempts) if t['total'] >= 3 and t['percent'] < 60][:5]
        return Response({'low_students': low[:8], 'blocked': blocked[:8], 'closing_tests': closing[:8], 'weak_topics': weak})


class QuestionAnalysisView(APIView):
    """Savollar bo'yicha tahlil: to'g'ri javob foizi, variantlar taqsimoti."""
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request, test_id):
        return Response(services.question_analysis(staff_test_or_404(request.user, test_id)))


class GrantAttemptView(APIView):
    """O'quvchiga qo'shimcha urinish berish (masalan, tasodifan bloklangan bo'lsa). Eski natija o'chmaydi."""
    permission_classes = [IsTeacherOrAdmin]

    def post(self, request, test_id):
        test = staff_test_or_404(request.user, test_id)
        student = get_object_or_404(User, pk=request.data.get('student'), role=User.Role.STUDENT)
        extra, _ = ExtraAttempt.objects.get_or_create(test=test, student=student, defaults={'count': 0})
        extra.count += 1
        extra.save(update_fields=['count'])
        return Response({'extra': extra.count})


class MyAnalyticsView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return Response(services.my_analytics(request.user))


class MyMistakesView(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        return Response(services.my_mistakes(request.user, request))


class PracticeView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        ids = request.data.get('choice_ids')
        if not isinstance(ids, list) or not all(isinstance(i, int) for i in ids):
            raise ValidationError({'choice_ids': "Butun sonlar ro'yxati kerak."})
        result = services.practice(request.user, request.data.get('question_id'), ids)
        if result is None:
            raise NotFound("Bu savol mashq ro'yxatida yo'q.")
        return Response(result)


class GoalListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsStudent]
    serializer_class = GoalSerializer
    pagination_class = None

    def get_queryset(self):
        return Goal.objects.filter(student=self.request.user)

    def _check_unique(self, serializer, exclude=None):
        subject = serializer.validated_data.get('subject')
        clash = Goal.objects.filter(student=self.request.user, subject=subject)
        if exclude:
            clash = clash.exclude(pk=exclude)
        if clash.exists():
            raise ValidationError({'subject': "Bu fan uchun maqsad allaqachon bor. Uni tahrirlang."})

    def perform_create(self, serializer):
        self._check_unique(serializer)
        serializer.save(student=self.request.user)


class GoalDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsStudent]
    serializer_class = GoalSerializer

    def get_queryset(self):
        return Goal.objects.filter(student=self.request.user)

    def perform_update(self, serializer):
        GoalListCreateView._check_unique(self, serializer, exclude=serializer.instance.pk)
        serializer.save()


def _staff_attempts(user):
    tests = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
    return TestAttempt.objects.filter(test__in=tests, is_completed=True).select_related('test', 'test__subject', 'student')


class StudentsListView(APIView):
    """O'qituvchining (admin: barcha) testlarini yechgan o'quvchilar va ularning umumiy ko'rsatkichlari."""
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request):
        by = {}
        for a in _staff_attempts(request.user):
            by.setdefault(a.student_id, []).append(a)
        rows = []
        for attempts in by.values():
            s = attempts[0].student
            pcts = [a.percentage for a in attempts]
            rows.append({
                'id': s.id, 'username': s.username, 'first_name': s.first_name, 'last_name': s.last_name,
                'avatar': request.build_absolute_uri(s.avatar.url) if s.avatar else None,
                'name': s.get_full_name() or s.username, 'attempts': len(attempts),
                'average': round(sum(pcts) / len(pcts), 1), 'best': max(pcts),
                'last_at': max(a.finished_at for a in attempts), 'blocked': sum(1 for a in attempts if a.violation),
            })
        rows.sort(key=lambda r: r['last_at'], reverse=True)
        return Response(rows)


class StudentProfileView(APIView):
    """Bitta o'quvchining rivojlanishi: urinishlar, mavzu tahlili, berilgan qo'shimcha urinishlar."""
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request, pk):
        student = get_object_or_404(User, pk=pk, role=User.Role.STUDENT)
        attempts = list(_staff_attempts(request.user).filter(student=student).order_by('finished_at'))
        if not attempts and request.user.role != 'admin':
            raise NotFound("Bu o'quvchi sizning testlaringizni yechmagan.")
        test_ids = {a.test_id for a in attempts}
        extras = {str(e.test_id): e.count for e in ExtraAttempt.objects.filter(student=student, test_id__in=test_ids)}
        return Response({
            'student': UserSerializer(student, context={'request': request}).data,
            'attempts': AttemptSerializer(attempts, many=True, context={'request': request}).data,
            'topics': services.topic_stats(attempts),
            'extras': extras,
        })


class TestResultsExportView(APIView):
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request, test_id):
        # `format` DRF'da band so'rov parametri, shuning uchun `type`
        kind = request.query_params.get('type', 'excel')
        if kind not in EXPORT_TYPES:
            raise ValidationError({'type': "excel, pdf yoki word bo'lishi kerak."})
        test = staff_test_or_404(request.user, test_id)
        attempts = (test.attempts.filter(is_completed=True).select_related('student')
                    .order_by('-percentage', 'started_at'))
        build, ext, content_type = EXPORT_TYPES[kind]
        response = HttpResponse(build(test, attempts), content_type=content_type)
        response['Content-Disposition'] = f'attachment; filename="results_{test.test_code}.{ext}"'
        return response


class AttemptDetailView(APIView):
    def get(self, request, pk):
        attempt = get_object_or_404(TestAttempt.objects.select_related('test', 'student'), pk=pk)
        user = request.user
        is_staff = user.role == 'admin' or (user.role == 'teacher' and attempt.test.created_by_id == user.id)
        if not is_staff and attempt.student_id != user.id:
            raise NotFound()
        if not is_staff and not attempt.is_completed:
            raise ValidationError("Urinish hali yakunlanmagan.")
        return Response(services.build_attempt_detail(attempt, user, {'request': request}))


class LeaderboardView(APIView):
    def get(self, request, test_id):
        user = request.user
        if user.role == 'student':
            test = get_object_or_404(Test, pk=test_id)
            if not test.attempts.filter(student=user, is_completed=True).exists():
                raise PermissionDenied("Reytingni ko'rish uchun avval testni yakunlang.")
        else:
            test = staff_test_or_404(user, test_id)
        return Response(services.leaderboard(test, limit=100))


class StatsView(APIView):
    permission_classes = [IsTeacherOrAdmin]

    def get(self, request):
        user = request.user
        tests = Test.objects.all() if user.role == 'admin' else Test.objects.filter(created_by=user)
        attempts = TestAttempt.objects.filter(test__in=tests, is_completed=True)
        by_status = dict(tests.values_list('status').annotate(c=Count('id')))
        data = {
            'tests_count': tests.count(),
            'tests_by_status': {s: by_status.get(s, 0) for s in ('draft', 'active', 'completed')},
            'attempts_count': attempts.count(),
            'students_count': attempts.values('student').distinct().count(),
            'average_percentage': round(attempts.aggregate(a=Avg('percentage'))['a'] or 0, 2),
        }
        if user.role == 'admin':
            by_role = dict(User.objects.values_list('role').annotate(c=Count('id')))
            data['users_by_role'] = {r: by_role.get(r, 0) for r in ('admin', 'teacher', 'student')}
            data['subjects_count'] = Subject.objects.count()
            # fanlar bo'yicha: testlar soni va yakunlangan urinishlarning o'rtacha foizi (dashboard grafigi uchun)
            data['by_subject'] = [
                {'name': s.name, 'tests': tests.filter(subject=s).count(),
                 'average': round(attempts.filter(test__subject=s).aggregate(a=Avg('percentage'))['a'] or 0, 1)}
                for s in Subject.objects.all()
            ]
        else:
            done = Q(attempts__is_completed=True)
            per_test = tests.annotate(
                n=Count('attempts', filter=done), avg=Avg('attempts__percentage', filter=done)
            ).order_by('-created_at')[:10]
            data['recent_tests'] = [
                {'id': t.id, 'title': t.title, 'attempts': t.n, 'average_percentage': round(t.avg or 0, 2)}
                for t in per_test
            ]
        return Response(data)
