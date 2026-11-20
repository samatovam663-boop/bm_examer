from django.conf import settings
from django.db import models


class TestAttempt(models.Model):
    test = models.ForeignKey('tests_app.Test', on_delete=models.CASCADE, related_name='attempts')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='attempts')
    attempt_number = models.PositiveIntegerField(default=1)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    score = models.FloatField(default=0)
    total_questions = models.PositiveIntegerField(default=0)
    correct_answers = models.PositiveIntegerField(default=0)
    percentage = models.FloatField(default=0)
    is_completed = models.BooleanField(default=False)
    tab_switches = models.PositiveIntegerField(default=0)
    # boshqa tab/oynaga o'tgani uchun avtomatik yakunlangan (bloklangan) urinish
    violation = models.BooleanField(default=False)

    class Meta:
        ordering = ['-started_at']
        constraints = [
            models.UniqueConstraint(fields=['test', 'student', 'attempt_number'], name='unique_attempt_number'),
            # bitta test uchun bir vaqtda faqat bitta ochiq urinish
            models.UniqueConstraint(fields=['test', 'student'], condition=models.Q(is_completed=False),
                                    name='unique_open_attempt'),
        ]

    def __str__(self):
        return f'{self.student} - {self.test} #{self.attempt_number}'


class Answer(models.Model):
    attempt = models.ForeignKey(TestAttempt, on_delete=models.CASCADE, related_name='answers')
    question = models.ForeignKey('tests_app.Question', on_delete=models.CASCADE, related_name='answers')
    is_correct = models.BooleanField(default=False)
    points_earned = models.FloatField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['attempt', 'question'], name='unique_answer_per_question'),
        ]


class ExtraAttempt(models.Model):
    """O'qituvchi bergan qo'shimcha urinishlar (masalan, tasodifan bloklangan o'quvchiga)."""
    test = models.ForeignKey('tests_app.Test', on_delete=models.CASCADE, related_name='extra_attempts')
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='extra_attempts')
    count = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['test', 'student'], name='unique_extra_attempt')]


class PracticeProgress(models.Model):
    """Xato qilingan savolni mashq qilish: ketma-ket to'g'ri javoblar soni (streak)."""
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='practice_progress')
    question = models.ForeignKey('tests_app.Question', on_delete=models.CASCADE, related_name='practice_progress')
    streak = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['student', 'question'], name='unique_practice_progress')]


class Goal(models.Model):
    """O'quvchining maqsadi: fan (yoki umumiy, subject=None) bo'yicha o'rtacha natija."""
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='goals')
    subject = models.ForeignKey('subjects.Subject', on_delete=models.CASCADE, null=True, blank=True, related_name='goals')
    target = models.PositiveSmallIntegerField()
    deadline = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class AnswerChoice(models.Model):
    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name='selected_choices')
    choice = models.ForeignKey('tests_app.Choice', on_delete=models.CASCADE, related_name='+')

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['answer', 'choice'], name='unique_answer_choice'),
        ]
