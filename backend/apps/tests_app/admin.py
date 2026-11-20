from django.contrib import admin

from .models import Choice, Question, Test


class ChoiceInline(admin.TabularInline):
    model = Choice
    extra = 2


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('text', 'question_type', 'test', 'bank', 'points')
    list_filter = ('question_type', 'difficulty')
    inlines = [ChoiceInline]


@admin.register(Test)
class TestAdmin(admin.ModelAdmin):
    list_display = ('title', 'test_code', 'subject', 'created_by', 'status', 'max_attempts')
    list_filter = ('status', 'difficulty', 'subject')
    search_fields = ('title', 'test_code')
    readonly_fields = ('test_code',)
