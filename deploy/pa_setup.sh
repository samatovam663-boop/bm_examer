#!/bin/bash
# PythonAnywhere (bepul reja) uchun o'rnatish. Bash konsolida:   bash ~/bm_examer/pa_setup.sh
# Oldin Web tabda "Manual configuration" bilan veb-ilova (Python 3.12) yaratilgan bo'lishi kerak.
set -e
APP="$HOME/bm_examer"
VENV="$HOME/.virtualenvs/bm-venv"
PYV=/usr/bin/python3.12
cd "$APP/backend"

[ -x "$PYV" ] || { echo "XATO: $PYV topilmadi. Web tabda boshqa Python tanlagan bo'lsangiz, shu faylda PYV ni o'zgartiring."; exit 1; }

echo "1/5 Virtual muhit va kutubxonalar (3-6 daqiqa)..."
[ -d "$VENV" ] || "$PYV" -m venv "$VENV"
# PythonAnywhere bepul rejasida 512 MB joy bor: faqat kerakli paketlar (PostgreSQL va Windows serverlari kerak emas)
grep -v -i -E '^(psycopg|waitress|gunicorn)' requirements.txt > /tmp/req-pa.txt
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet -r /tmp/req-pa.txt

echo "2/5 Sozlamalar (.env)..."
if [ ! -f .env ]; then
  KEY=$("$VENV/bin/python" -c "import secrets; print(secrets.token_urlsafe(50))")
  cat > .env <<EOF
DJANGO_DEBUG=0
DJANGO_SECRET_KEY=$KEY
DJANGO_ALLOWED_HOSTS=$USER.pythonanywhere.com
DJANGO_SSL_REDIRECT=0
DJANGO_HSTS_SECONDS=0
DJANGO_BEHIND_PROXY=1
SERVE_MEDIA=1
FRONTEND_INDEX=$APP/frontend_dist/index.html
THROTTLE_LOGIN=120/min
THROTTLE_REGISTER=200/hour
EOF
fi

echo "3/5 Baza..."
"$VENV/bin/python" manage.py migrate --noinput

echo "4/5 Static fayllar..."
"$VENV/bin/python" manage.py collectstatic --noinput > /dev/null

echo "5/5 WSGI fayl..."
WSGI="/var/www/${USER}_pythonanywhere_com_wsgi.py"
if [ -f "$WSGI" ]; then
  cp "$WSGI" "$WSGI.bak" 2>/dev/null || true
  cat > "$WSGI" <<EOF
import os
import sys

path = '$APP/backend'
if path not in sys.path:
    sys.path.insert(0, path)

os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
EOF
  echo "WSGI fayl yozildi."
else
  echo "OGOHLANTIRISH: $WSGI topilmadi. Avval Web tabda veb-ilova yarating, keyin bu skriptni qayta ishga tushiring."
fi

echo
echo "TAYYOR. Endi Web tabda:"
echo "  1) Virtualenv maydoniga yozing:  $VENV"
echo "  2) Force HTTPS ni yoqing (Enabled)"
echo "  3) Yashil 'Reload' tugmasini bosing"
echo "Sayt: https://$USER.pythonanywhere.com"
