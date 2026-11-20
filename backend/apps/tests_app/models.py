from django.conf import settings
from django.db import models

from .utils import generate_test_code


class Difficulty(models.TextChoices):
    EASY = 'easy', 'Easy'
    MEDIUM = 'medium', 'Medium'
    HARD = 'hard', 'Hard'


class Test(models.Model):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ACTIVE = 'active', 'Active'
        COMPLETED = 'completed', 'Completed'

    class ShowResults(models.TextChoices):
        SCORE_ONLY = 'score_only', 'Score only'
        CORRECT_ANSWERS = 'correct_answers', 'Correct answers'
        DETAILED = 'detailed', 'Detailed'

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    subject = models.ForeignKey('subjects.Subject', on_delete=models.SET_NULL, null=True, blank=True,
                                related_name='tests')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tests')
    test_code = models.CharField(max_length=12, unique=True, editable=False)
    duration_minutes = models.PositiveIntegerField(default=30)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    shuffle_questions = models.BooleanField(default=False)
    shuffle_choices = models.BooleanField(default=False)
    max_attempts = models.PositiveIntegerField(default=1, help_text='0 = cheksiz')
    show_results = models.CharField(max_length=20, choices=ShowResults.choices, default=ShowResults.SCORE_ONLY)
    # bo'sh = hamma o'quvchiga ochiq; guruh(lar) tanlansa, faqat shu guruh o'quvchilari ko'radi va yecha oladi
    groups = models.ManyToManyField('groups.Group', blank=True, related_name='tests')
    # rejalashtirish: starts_at kelganda draft test o'zi aktivlashadi, ends_at da yopiladi (bo'sh = qo'lda)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.test_code:
            self.test_code = generate_test_code()
        super().save(*args, **kwargs)

    def __str__(self):
        return f'{self.title} [{self.test_code}]'


class Question(models.Model):
    class QuestionType(models.TextChoices):
        SINGLE = 'single', 'Single choice'
        MULTIPLE = 'multiple', 'Multiple choice'
        TRUE_FALSE = 'true_false', 'True/False'

    test = models.ForeignKey(Test, on_delete=models.CASCADE, null=True, blank=True, related_name='questions')
    bank = models.ForeignKey('question_bank.QuestionBank', on_delete=models.CASCADE, null=True, blank=True,
                             related_name='questions')
    question_type = models.CharField(max_length=12, choices=QuestionType.choices, default=QuestionType.SINGLE)
    text = models.TextField()
    image = models.ImageField(upload_to='questions/', blank=True, null=True)
    has_formula = models.BooleanField(default=False)
    topic = models.CharField(max_length=60, blank=True)
    difficulty = models.CharField(max_length=10, choices=Difficulty.choices, default=Difficulty.MEDIUM)
    points = models.PositiveIntegerField(default=1)
    # xato savolni tuzatish: bekor qilingan savol hamma o'quvchi uchun to'g'ri hisoblanadi
    voided = models.BooleanField(default=False)
    corrected_at = models.DateTimeField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.text[:50]


class Choice(models.Model):
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='choices')
    text = models.CharField(max_length=500)
    is_correct = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order', 'id']

    def __str__(self):
        return self.text[:50]
