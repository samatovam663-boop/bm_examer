from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (('BM_examer', {'fields': ('role', 'avatar', 'phone')}),)
    add_fieldsets = UserAdmin.add_fieldsets + (('BM_examer', {'fields': ('role', 'phone')}),)
    list_display = ('username', 'email', 'role', 'is_active', 'created_at')
    list_filter = ('role', 'is_active')
