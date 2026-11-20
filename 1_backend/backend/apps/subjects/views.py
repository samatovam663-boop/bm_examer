from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from apps.accounts.permissions import ReadOnlyOrTeacherAdmin

from .models import Subject
from .serializers import SubjectSerializer


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    search_fields = ['name', 'description']

    # spec FR-SUBJ-2: fan qo'shish, tahrirlash va o'chirish admin va teacher uchun.
    # O'chirishda testlar o'chmaydi: ularning fani bo'shatiladi (SET_NULL).
    permission_classes = [ReadOnlyOrTeacherAdmin]
