from rest_framework.permissions import BasePermission, SAFE_METHODS


class _RolePermission(BasePermission):
    roles = ()

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role in self.roles)


class IsAdmin(_RolePermission):
    roles = ('admin',)


class IsTeacher(_RolePermission):
    roles = ('teacher',)


class IsTeacherOrAdmin(_RolePermission):
    roles = ('teacher', 'admin')


class IsStudent(_RolePermission):
    roles = ('student',)


class IsOwnerOrAdmin(BasePermission):
    """Obyekt egasi (created_by yoki student) yoki admin."""

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.role == 'admin':
            return True
        owner = getattr(obj, 'created_by', None) or getattr(obj, 'student', None)
        return owner == user


class ReadOnlyOrTeacherAdmin(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return user.role in ('teacher', 'admin')
