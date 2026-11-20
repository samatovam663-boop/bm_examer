from datetime import timedelta

from django.db.models import Count
from django.utils import timezone
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from django.conf import settings

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from . import bulk
from .models import User
from .permissions import IsAdmin
from .serializers import (AdminCreateUserSerializer, AdminUserSerializer, ChangePasswordSerializer, LoginSerializer,
                          RegisterSerializer, UserSerializer)


def set_refresh_cookie(response, token):
    response.set_cookie(
        settings.JWT_REFRESH_COOKIE_NAME, token,
        max_age=int(settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'].total_seconds()),
        path=settings.JWT_REFRESH_COOKIE_PATH, httponly=True, samesite='Strict', secure=settings.JWT_COOKIE_SECURE)


def clear_refresh_cookie(response):
    response.delete_cookie(settings.JWT_REFRESH_COOKIE_NAME, path=settings.JWT_REFRESH_COOKIE_PATH, samesite='Strict')


def require_xhr_header(request):
    """CSRF himoyasi: begona sayt brauzerdan custom sarlavha yubora olmaydi (CORS preflight to'xtatadi)."""
    if request.headers.get('X-Requested-With') != 'XMLHttpRequest':
        return Response({'detail': "X-Requested-With sarlavhasi kerak."}, status=status.HTTP_403_FORBIDDEN)
    return None


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    throttle_scope = 'login'          # parolni terib topishdan himoya (settings: THROTTLE_LOGIN)

    def post(self, request, *args, **kwargs):
        response = super().post(request, *args, **kwargs)
        refresh = response.data.pop('refresh', None)
        if response.status_code == 200 and refresh:
            set_refresh_cookie(response, refresh)
        return response


class RefreshView(APIView):
    """Refresh token faqat httpOnly cookie'dan o'qiladi. Javob: {"access": ...}."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_scope = 'refresh'

    def post(self, request):
        denied = require_xhr_header(request)
        if denied:
            return denied
        raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        try:
            if not raw:
                raise TokenError('no cookie')
            refresh = RefreshToken(raw)        # muddat va blacklist shu yerda tekshiriladi
            user = User.objects.filter(pk=refresh[settings.SIMPLE_JWT.get('USER_ID_CLAIM', 'user_id')], is_active=True).first()
            if user is None:
                raise TokenError('inactive user')
        except TokenError:
            response = Response({'detail': "Sessiya tugagan. Qayta kiring."}, status=status.HTTP_401_UNAUTHORIZED)
            clear_refresh_cookie(response)
            return response
        return Response({'access': str(refresh.access_token)})


class LogoutView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        denied = require_xhr_header(request)
        if denied:
            return denied
        raw = request.COOKIES.get(settings.JWT_REFRESH_COOKIE_NAME)
        if raw:
            try:
                RefreshToken(raw).blacklist()
            except TokenError:
                pass                           # allaqachon yaroqsiz: baribir cookie o'chiriladi
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'register'


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    throttle_scope = 'password'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            raise ValidationError({'old_password': "Eski parol noto'g'ri."})
        user.set_password(serializer.validated_data['new_password'])
        user.save(update_fields=['password'])
        return Response({'detail': "Parol o'zgartirildi."})


class UserViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin,
                  mixins.DestroyModelMixin, viewsets.GenericViewSet):
    queryset = User.objects.all().order_by('-created_at')
    serializer_class = AdminUserSerializer
    permission_classes = [IsAdmin]
    filterset_fields = ['role', 'is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering_fields = ['created_at', 'username']

    def get_serializer_class(self):
        return AdminCreateUserSerializer if self.action == 'create' else AdminUserSerializer

    @action(detail=False, methods=['post'])
    def bulk(self, request):
        """Ko'plab o'quvchi qo'shish. Javobda parollar faqat shu safar qaytadi."""
        rows = request.data.get('rows')
        if not isinstance(rows, list) or not rows:
            raise ValidationError("Ro'yxat bo'sh.")
        if len(rows) > bulk.MAX_ROWS:
            raise ValidationError(f"Bir martada ko'pi bilan {bulk.MAX_ROWS} ta o'quvchi qo'shiladi.")
        return Response(bulk.create_students([r for r in rows if isinstance(r, dict)]), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        """Parol esdan chiqsa: eskisini ko'rib bo'lmaydi, admin yangisini beradi (bo'sh bo'lsa tasodifiy)."""
        user = self.get_object()
        password = str(request.data.get('password') or '').strip() or bulk.random_password()
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise ValidationError({'password': list(exc.messages)})
        user.set_password(password)
        user.save(update_fields=['password'])
        return Response({'username': user.username, 'password': password})

    def perform_update(self, serializer):
        if serializer.instance == self.request.user:
            data = serializer.validated_data
            if data.get('role', 'admin') != 'admin' or not data.get('is_active', True):
                raise ValidationError("O'zingizning admin rolingiz yoki faolligingizni o'zgartira olmaysiz.")
        serializer.save()

    def perform_destroy(self, instance):
        if instance == self.request.user:
            raise ValidationError("O'zingizni o'chira olmaysiz.")
        instance.delete()

    @action(detail=False, methods=['get'])
    def stats(self, request):
        by_role = dict(User.objects.values_list('role').annotate(c=Count('id')))
        week_ago = timezone.now() - timedelta(days=7)
        return Response({
            'total': User.objects.count(),
            'active': User.objects.filter(is_active=True).count(),
            'by_role': {r: by_role.get(r, 0) for r in ('admin', 'teacher', 'student')},
            'new_last_7_days': User.objects.filter(created_at__gte=week_ago).count(),
        })
