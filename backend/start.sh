#!/bin/sh
# Konteyner ishga tushganda: bazani yangilash, admin yaratish (bo'lmasa), serverni yoqish.
# Render bepul rejasida shell yo'q, shuning uchun createsuperuser shu yerda muhit o'zgaruvchilaridan bajariladi.
set -e

python manage.py migrate --noinput

if [ -n "$DJANGO_SUPERUSER_USERNAME" ] && [ -n "$DJANGO_SUPERUSER_PASSWORD" ]; then
  # Admin allaqachon bor bo'lsa buyruq xato qaytaradi: bu normal, e'tibor bermaymiz
  python manage.py createsuperuser --noinput --email "${DJANGO_SUPERUSER_EMAIL:-admin@example.com}" || true
fi

exec gunicorn config.wsgi:application --bind "0.0.0.0:${PORT:-10000}" --workers 2 --timeout 60 --access-logfile -
