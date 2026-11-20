from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from .models import User
from .validators import validate_image_size


class UserSerializer(serializers.ModelSerializer):
    """O'z profili: role va is_active o'zgartirilmaydi."""

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'avatar', 'phone',
                  'is_active', 'created_at')
        read_only_fields = ('id', 'username', 'role', 'is_active', 'created_at')
        extra_kwargs = {'avatar': {'validators': [validate_image_size]}}


class AdminUserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'first_name', 'last_name', 'role', 'avatar', 'phone',
                  'is_active', 'created_at')
        read_only_fields = ('id', 'created_at')
        extra_kwargs = {'avatar': {'validators': [validate_image_size]}}


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, validators=[validate_password])
    email = serializers.EmailField(required=True)
    # admin sifatida ro'yxatdan o'tish mumkin emas
    role = serializers.ChoiceField(choices=[('student', 'Student'), ('teacher', 'Teacher')], default='student')

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'phone')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class AdminCreateUserSerializer(serializers.ModelSerializer):
    """Admin foydalanuvchi yaratadi (CRUD'ning C qismi). Rol ixtiyoriy tanlanadi, standart: student."""
    password = serializers.CharField(write_only=True, validators=[validate_password])
    email = serializers.EmailField(required=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'password', 'first_name', 'last_name', 'role', 'phone', 'is_active')

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, validators=[validate_password])


class LoginSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context=self.context).data
        return data
