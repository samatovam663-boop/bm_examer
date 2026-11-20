from django.contrib import admin

from .models import Answer, AnswerChoice, TestAttempt


class AnswerInline(admin.TabularInline):
    model = Answer
    extra = 0


@admin.register(TestAttempt)
class TestAttemptAdmin(admin.ModelAdmin):
    list_display = ('test', 'student', 'attempt_number', 'percentage', 'is_completed', 'tab_switches')
    list_filter = ('is_completed',)
    inlines = [AnswerInline]


admin.site.register(AnswerChoice)
