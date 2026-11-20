from django.db.models import Q
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.accounts.permissions import IsTeacherOrAdmin
from apps.results.models import TestAttempt

from .models import Group
from .serializers import GroupSerializer, MembershipSerializer, person


class GroupViewSet(viewsets.ModelViewSet):
    """Guruhlar: o'qituvchi o'zinikini, admin hammasini boshqaradi."""
    serializer_class = GroupSerializer
    permission_classes = [IsTeacherOrAdmin]
    search_fields = ['name']

    def get_queryset(self):
        qs = Group.objects.select_related('teacher').prefetch_related('students')
        user = self.request.user
        return qs if user.role == 'admin' else qs.filter(teacher=user)

    def perform_create(self, serializer):
        serializer.save(teacher=self.request.user)

    @action(detail=True, methods=['post'])
    def members(self, request, pk=None):
        """Body: {"add": [ids], "remove": [ids]}. Faqat o'quvchilar qo'shiladi."""
        group = self.get_object()
        data = MembershipSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if data.validated_data['add']:
            group.students.add(*data.validated_data['add'])
        if data.validated_data['remove']:
            group.students.remove(*data.validated_data['remove'])
        return Response(self.get_serializer(group).data)

    @action(detail=False, methods=['get'])
    def pool(self, request):
        """Guruhga qo'shish uchun o'quvchilar qidiruvi (?search=, ?exclude_group=). Ko'pi bilan 50 ta."""
        qs = User.objects.filter(role=User.Role.STUDENT, is_active=True)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(username__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
        exclude = request.query_params.get('exclude_group')
        if exclude and exclude.isdigit():
            qs = qs.exclude(student_groups=exclude)
        return Response([person(u) for u in qs.order_by('first_name', 'last_name', 'username')[:50]])

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        """Guruh a'zolarining ko'rsatkichlari (o'qituvchining testlari bo'yicha) va guruh o'rtachasi."""
        group = self.get_object()
        attempts = TestAttempt.objects.filter(student__in=group.students.all(), is_completed=True)
        if request.user.role != 'admin':
            attempts = attempts.filter(test__created_by=request.user)
        by = {}
        for a in attempts:
            by.setdefault(a.student_id, []).append(a)
        members = []
        for u in group.students.all().order_by('first_name', 'last_name', 'username'):
            mine = by.get(u.id, [])
            pcts = [a.percentage for a in mine]
            members.append({**person(u), 'attempts': len(mine), 'average': round(sum(pcts) / len(pcts), 1) if pcts else None,
                            'best': max(pcts) if pcts else None, 'blocked': sum(1 for a in mine if a.violation)})
        pcts = [a.percentage for lst in by.values() for a in lst]
        return Response({'group': group.id, 'name': group.name, 'attempts': len(pcts),
                         'average': round(sum(pcts) / len(pcts), 1) if pcts else None, 'members': members})
