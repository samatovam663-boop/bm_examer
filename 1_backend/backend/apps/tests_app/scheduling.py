from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone

from apps.results import services

from .models import Question, Test


def sync_schedule(now=None):
    """Rejalashtirilgan testlarni holatga keltiradi (so'rov kelganda chaqiriladi, alohida jarayon kerak emas):
    - starts_at kelgan va savollari bor draft test -> active (ends_at o'tmagan bo'lsa);
    - ends_at o'tgan active test -> completed va ochiq urinishlar avtomatik baholanadi."""
    now = now or timezone.now()
    has_questions = Exists(Question.objects.filter(test=OuterRef('pk')))
    Test.objects.filter(status=Test.Status.DRAFT, starts_at__lte=now).filter(has_questions).exclude(
        ends_at__lte=now).update(status=Test.Status.ACTIVE)
    for test in Test.objects.filter(status=Test.Status.ACTIVE, ends_at__lte=now):
        with transaction.atomic():
            test.status = Test.Status.COMPLETED
            test.save(update_fields=['status', 'updated_at'])
            for attempt in test.attempts.filter(is_completed=False).select_related('test'):
                services.grade_attempt(attempt)
