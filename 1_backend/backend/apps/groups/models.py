from django.conf import settings
from django.db import models


class Group(models.Model):
    """O'quvchilar guruhi (sinf). Test guruhga tayinlansa, faqat shu guruh o'quvchilari ko'radi."""
    name = models.CharField(max_length=100)
    teacher = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='teaching_groups')
    students = models.ManyToManyField(settings.AUTH_USER_MODEL, blank=True, related_name='student_groups')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        constraints = [models.UniqueConstraint(fields=['teacher', 'name'], name='unique_group_name_per_teacher')]

    def __str__(self):
        return self.name
