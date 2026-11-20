from rest_framework import serializers

from apps.accounts.models import User

from .models import Group


def person(u):
    return {'id': u.id, 'username': u.username, 'first_name': u.first_name, 'last_name': u.last_name,
            'name': u.get_full_name() or u.username}


class GroupSerializer(serializers.ModelSerializer):
    students = serializers.SerializerMethodField()
    student_count = serializers.SerializerMethodField()
    teacher_name = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ('id', 'name', 'teacher', 'teacher_name', 'students', 'student_count', 'created_at')
        read_only_fields = ('id', 'teacher', 'created_at')

    def get_students(self, obj):
        return [person(u) for u in obj.students.all().order_by('first_name', 'last_name', 'username')]

    def get_student_count(self, obj):
        return obj.students.count()

    def get_teacher_name(self, obj):
        return obj.teacher.get_full_name() or obj.teacher.username

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Guruh nomi kerak.')
        owner = self.context['request'].user if not self.instance else self.instance.teacher
        clash = Group.objects.filter(teacher=owner, name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('Bunday nomli guruh allaqachon bor.')
        return value


class MembershipSerializer(serializers.Serializer):
    add = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)
    remove = serializers.ListField(child=serializers.IntegerField(), required=False, default=list)

    def validate_add(self, ids):
        found = set(User.objects.filter(pk__in=ids, role=User.Role.STUDENT).values_list('pk', flat=True))
        if found != set(ids):
            raise serializers.ValidationError("Ba'zi foydalanuvchilar topilmadi yoki o'quvchi emas.")
        return ids
