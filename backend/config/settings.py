"""
BM_examer sozlamalari. Hamma muhimi muhit o'zgaruvchilaridan (yoki backend/.env faylidan) olinadi:
kodda maxfiy ma'lumot yo'q. To'liq ro'yxat: backend/.env.example, deploy: DEPLOY.md.
"""
import os
from datetime import timedelta
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

BASE_DIR = Path(__file__).resolve().parent.parent


# ---------- muhit o'zgaruvchilari ----------

def _load_env_file(path):
    """Kichik .env o'qigich (KEY=VALUE, # izoh). Haqiqiy muhit o'zgaruvchilari ustun turadi."""
    if not path.exists():
        return
    for raw in path.read_text(encoding='utf-8').splitlines():
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, _, value = line.partition('=')
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key.strip(), value)


_load_env_file(BASE_DIR / '.env')


def env(name, default=None):
    return os.environ.get(name, default)


def env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in ('1', 'true', 'yes', 'on')


def env_int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        raise ImproperlyConfigured(f'{name} butun son bo\'lishi kerak.')


def env_list(name, default=''):
    return [x.strip() for x in os.environ.get(name, default).split(',') if x.strip()]


# ---------- asosiy ----------

# DEBUG standart holatda O'CHIQ: unutib qoldirilsa productionda xavfsiz tomonga xato qiladi.
DEBUG = env_bool('DJANGO_DEBUG', False)

SECRET_KEY = env('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured(
            "DJANGO_SECRET_KEY o'rnatilmagan. Yarating: python -c \"from django.core.management.utils import "
            "get_random_secret_key as g; print(g())\" va backend/.env ga yozing.")
    SECRET_KEY = 'dev-only-insecure-key-not-for-production'
elif not DEBUG and len(SECRET_KEY) < 32:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY juda qisqa (kamida 32 ta belgi, tasodifiy bo'lsin).")

ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1' if DEBUG else '')
# Render o'z domenini (xxx.onrender.com) shu o'zgaruvchida beradi: qo'lda yozish shart emas
if env('RENDER_EXTERNAL_HOSTNAME'):
    ALLOWED_HOSTS.append(env('RENDER_EXTERNAL_HOSTNAME'))
if not DEBUG and not ALLOWED_HOSTS:
    raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS bo'sh. Domen(lar)ni vergul bilan yozing, masalan: exam.example.uz")


# ---------- ilovalar ----------

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',   # logout'da refresh tokenni bekor qilish
    'django_filters',
    'corsheaders',
    'apps.accounts',
    'apps.subjects',
    'apps.tests_app',
    'apps.question_bank',
    'apps.results',
    'apps.groups',
]

AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',   # admin va boshqa static fayllar (collectstatic'dan keyin)
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# ---------- ma'lumotlar bazasi ----------

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': env('SQLITE_PATH', str(BASE_DIR / 'db.sqlite3')),
        'OPTIONS': {'timeout': 20},  # parallel so'rovlarda "database is locked" kamroq chiqadi
    }
}

# DATABASE_URL (postgres://user:parol@host:5432/nom?sslmode=require) berilsa PostgreSQL ishlatiladi.
# Render bepul rejasida fayl tizimi har restartda tozalanadi, shuning uchun SQLite u yerda yaroqsiz.
if env('DATABASE_URL'):
    from urllib.parse import parse_qsl, unquote, urlparse
    _db = urlparse(env('DATABASE_URL'))
    if _db.scheme not in ('postgres', 'postgresql'):
        raise ImproperlyConfigured("DATABASE_URL 'postgres://...' ko'rinishida bo'lishi kerak.")
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': _db.path.lstrip('/'),
        'USER': unquote(_db.username or ''),
        'PASSWORD': unquote(_db.password or ''),
        'HOST': _db.hostname,
        'PORT': _db.port or 5432,
        'CONN_MAX_AGE': 60,
        'CONN_HEALTH_CHECKS': True,
        'OPTIONS': dict(parse_qsl(_db.query)),   # masalan sslmode=require
    }


# ---------- parol, til, vaqt ----------

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True


# ---------- static va media ----------

STATIC_URL = '/static/'
STATIC_ROOT = Path(env('STATIC_ROOT', str(BASE_DIR / 'staticfiles')))
STATIC_ROOT.mkdir(parents=True, exist_ok=True)   # WhiteNoise papka yo'q deb ogohlantirmasligi uchun (collectstatic to'ldiradi)
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}

MEDIA_URL = '/media/'
MEDIA_ROOT = Path(env('MEDIA_ROOT', str(BASE_DIR / 'media')))
# Yuklangan rasmlarni productionda nginx/Caddy yoki obyekt saqlash bersin (DEPLOY.md). Kichik o'rnatish uchun
# SERVE_MEDIA=1 bilan Django o'zi beradi (sekinroq, lekin ishlaydi).
SERVE_MEDIA = env_bool('SERVE_MEDIA', DEBUG)

# Yig'ilgan frontend (npm run build:http -> index.html). Berilsa, Django uni '/' va barcha frontend yo'llarida beradi
# (Render kabi bitta xizmatli joylash uchun). Bo'sh bo'lsa nginx beradi (DEPLOY.md).
FRONTEND_INDEX = env('FRONTEND_INDEX', '')

# kutilmagan katta so'rovlardan himoya
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024


# ---------- REST, JWT, CORS ----------

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': ('rest_framework_simplejwt.authentication.JWTAuthentication',),
    'DEFAULT_PERMISSION_CLASSES': ('rest_framework.permissions.IsAuthenticated',),
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'DEFAULT_PAGINATION_CLASS': 'config.pagination.StandardPagination',
    'PAGE_SIZE': 20,
    # productionda faqat JSON (brauzer API sahifasi yo'q)
    'DEFAULT_RENDERER_CLASSES': (
        ['rest_framework.renderers.JSONRenderer', 'rest_framework.renderers.BrowsableAPIRenderer'] if DEBUG
        else ['rest_framework.renderers.JSONRenderer']
    ),
    # parolni terib topishdan himoya: faqat throttle_scope belgilangan view'lar (login, register, parol) cheklanadi
    'DEFAULT_THROTTLE_CLASSES': ('rest_framework.throttling.ScopedRateThrottle',),
    'DEFAULT_THROTTLE_RATES': {
        'login': env('THROTTLE_LOGIN', '20/min'),
        'register': env('THROTTLE_REGISTER', '20/hour'),
        'password': env('THROTTLE_PASSWORD', '10/hour'),
        'ai': env('THROTTLE_AI', '20/hour'),
        'refresh': env('THROTTLE_REFRESH', '60/min'),
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=env_int('JWT_ACCESS_MINUTES', 30)),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=env_int('JWT_REFRESH_DAYS', 7)),
    # Rotation o'chiq: bir nechta tab bir vaqtda refresh qilsa, biri bekor qilingan token bilan chiqib ketardi.
}

# Refresh token httpOnly cookie'da (JS o'qiy olmaydi, XSS uni o'g'irlay olmaydi). Access token faqat brauzer xotirasida.
# SameSite=Strict + faqat /api/auth/ yo'li + refresh/logout'da X-Requested-With sarlavhasi talab qilinadi (CSRF himoyasi).
JWT_REFRESH_COOKIE_NAME = 'bm_refresh'
JWT_REFRESH_COOKIE_PATH = '/api/auth/'
JWT_COOKIE_SECURE = env_bool('JWT_COOKIE_SECURE', not DEBUG)

# Frontend boshqa domenda bo'lsa shu yerga qo'shing. Bir xil domenda (nginx orqali) CORS kerak emas.
CORS_ALLOWED_ORIGINS = env_list(
    'CORS_ALLOWED_ORIGINS',
    'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174' if DEBUG else '')
CORS_ALLOW_CREDENTIALS = True   # refresh cookie uchun; ruxsat faqat CORS_ALLOWED_ORIGINS dagi aniq domenlarga
CSRF_TRUSTED_ORIGINS = env_list('CSRF_TRUSTED_ORIGINS', '')


# ---------- Claude (savol yaratish, ixtiyoriy) ----------

ANTHROPIC_API_KEY = env('ANTHROPIC_API_KEY', '')
ANTHROPIC_MODEL = env('ANTHROPIC_MODEL', 'claude-sonnet-5-5')


# ---------- xavfsizlik (faqat DEBUG=0 da) ----------

if not DEBUG:
    SECURE_SSL_REDIRECT = env_bool('DJANGO_SSL_REDIRECT', True)
    SECURE_REDIRECT_EXEMPT = [r'^api/health/$']   # platforma health check'i HTTP bilan keladi: HTTPS'ga yo'naltirilmasin
    # Faqat nginx/Caddy kabi ishonchli proxy ortida yoqing (aks holda sarlavhani soxtalashtirish mumkin)
    if env_bool('DJANGO_BEHIND_PROXY', False):
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
        USE_X_FORWARDED_HOST = True
    SESSION_COOKIE_SECURE = SECURE_SSL_REDIRECT
    CSRF_COOKIE_SECURE = SECURE_SSL_REDIRECT
    SECURE_HSTS_SECONDS = env_int('DJANGO_HSTS_SECONDS', 31536000 if SECURE_SSL_REDIRECT else 0)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = SECURE_HSTS_SECONDS > 0
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = 'same-origin'
    X_FRAME_OPTIONS = 'DENY'


# ---------- log ----------

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'root': {'handlers': ['console'], 'level': env('LOG_LEVEL', 'INFO')},
    # 4xx (noto'g'ri so'rov, ruxsat yo'q) oddiy hol, faqat server xatolari (5xx) yoziladi
    'loggers': {'django.request': {'level': 'ERROR'}},
}
