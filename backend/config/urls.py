import gzip
from functools import lru_cache
from pathlib import Path

from django.conf import settings
from django.contrib import admin
from django.db import connection
from django.http import HttpResponse, JsonResponse
from django.urls import include, path, re_path
from django.views.static import serve


def health(request):
    """Deploy tekshiruvi (load balancer, monitoring): ilova va baza ishlayaptimi."""
    try:
        connection.ensure_connection()
    except Exception:  # noqa: BLE001
        return JsonResponse({'status': 'error', 'database': False}, status=503)
    return JsonResponse({'status': 'ok', 'database': True})


urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', health, name='health'),
    path('api/auth/', include('apps.accounts.urls')),
    path('api/users/', include('apps.accounts.user_urls')),
    path('api/subjects/', include('apps.subjects.urls')),
    path('api/question-banks/', include('apps.question_bank.urls')),
    path('api/results/', include('apps.results.urls')),
    path('api/groups/', include('apps.groups.urls')),
    path('api/', include('apps.tests_app.urls')),
]

if settings.SERVE_MEDIA:
    urlpatterns += [re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT})]


@lru_cache(maxsize=1)
def _frontend_bytes():
    """Frontend bitta ~6 MB HTML: xotirada bir marta o'qiladi va gzip qilinadi (har so'rovda siqmaslik uchun)."""
    raw = Path(settings.FRONTEND_INDEX).read_bytes()
    return raw, gzip.compress(raw, compresslevel=6)


def frontend(request, path=''):
    """React SPA: sahifa yangilanganda (/teacher/tests kabi yo'llar) ham index.html qaytadi."""
    raw, packed = _frontend_bytes()
    if 'gzip' in request.headers.get('Accept-Encoding', ''):
        response = HttpResponse(packed, content_type='text/html; charset=utf-8')
        response['Content-Encoding'] = 'gzip'
    else:
        response = HttpResponse(raw, content_type='text/html; charset=utf-8')
    response['Vary'] = 'Accept-Encoding'
    response['Cache-Control'] = 'no-cache'
    return response


if settings.FRONTEND_INDEX:
    # api/, admin/, static/, media/ ga tegmaydi: ular yuqorida (yoki WhiteNoise'da) hal qilinadi
    urlpatterns += [re_path(r'^(?!api/|admin/|static/|media/)(?P<path>.*)$', frontend)]
