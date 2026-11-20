# Deploy (production)

Bitta server (Linux), nginx oldinda, Django gunicorn ortida, SQLite. Hamma maxfiy ma'lumot `backend/.env` da, kodda emas.

## 1. Tayyorlash

```bash
# serverda (Ubuntu misoli)
sudo apt install python3-venv nginx
git clone <repo> /srv/bm_examer && cd /srv/bm_examer/backend
python3 -m venv venv && venv/bin/pip install -r requirements.txt

cp .env.example .env            # to'ldiring: DJANGO_SECRET_KEY, DJANGO_ALLOWED_HOSTS, DJANGO_BEHIND_PROXY=1
venv/bin/python manage.py migrate
venv/bin/python manage.py collectstatic --noinput
venv/bin/python manage.py createsuperuser     # admin foydalanuvchi (rol avtomatik admin bo'ladi)
venv/bin/python manage.py check --deploy
```

`DJANGO_DEBUG` standart holatda **0**; `DJANGO_SECRET_KEY` yoki `DJANGO_ALLOWED_HOSTS` bo'lmasa Django ishga tushmaydi (ataylab: xavfsiz tomonga xato).

## 2. Frontend

```bash
cd frontend && npm ci && npm run build:http      # natija: frontend/dist-http/index.html (bitta fayl)
```

`dist-http/` ni nginx beradigan papkaga ko'chiring (misol: `/var/www/bm_examer`). Frontend `/api` ga so'rov yuboradi, shuning uchun
frontend va backend **bir domenda** bo'lsa CORS kerak emas.

## 3. Jarayon va nginx

- `deploy/bm-examer.service`: gunicorn systemd xizmati (`systemctl enable --now bm-examer`).
- `deploy/nginx.conf`: `/` frontend, `/api` va `/admin` gunicorn'ga, `/static` va `/media` fayl sifatida. HTTPS uchun `certbot --nginx`.

SQLite bitta fayl: gunicorn'ni 2-4 worker bilan ishlating (ko'p worker + yozish kam bo'lsa muammo yo'q). Yuklama o'sganda PostgreSQL'ga o'tish
`DATABASES` ni almashtirishdan iborat (boshqa kod o'zgarmaydi).

## 4. Yuklangan rasmlar (media)

Rasmlar `MEDIA_ROOT` da. Eng yaxshi yo'l: nginx `/media/` ni to'g'ridan-to'g'ri beradi (konfigda bor). Nginx bo'lmasa `SERVE_MEDIA=1`
bilan Django o'zi beradi (sekinroq). `MEDIA_ROOT` va `SQLITE_PATH` ni zaxira nusxaga (backup) qo'shing.

## 5. Xavfsizlik ro'yxati

| Narsa | Holat |
|---|---|
| Maxfiy kalit, DEBUG, hostlar | `.env` dan; bo'lmasa ishga tushmaydi |
| HTTPS, HSTS, xavfsiz cookie | `DEBUG=0` da avtomatik; proxy ortida `DJANGO_BEHIND_PROXY=1` |
| Login/ro'yxatdan o'tish/parol cheklovi | `THROTTLE_*` (standart 20/min, 20/soat, 10/soat) |
| Brauzer API sahifasi | Productionda o'chiq (faqat JSON) |
| JWT muddati | access 30 daqiqa, refresh 7 kun (`JWT_*`) |
| Token saqlash | refresh: `httpOnly` + `Secure` + `SameSite=Strict` cookie (`/api/auth/` yo'li); access: faqat brauzer xotirasida |
| `/api/health/` | Monitoring uchun, autentifikatsiyasiz |

**Tokenlar:** refresh token JS'ga ko'rinmaydi, shuning uchun XSS bo'lsa ham uni o'g'irlab bo'lmaydi. Access token faqat ochiq
sahifa xotirasida turadi (30 daqiqa). `/api/auth/refresh/` va `/api/auth/logout/` `X-Requested-With` sarlavhasini talab qiladi (CSRF himoyasi),
logout tokenni bazada bekor qiladi (`token_blacklist`). Frontend va API **bir domenda** bo'lishi kerak (nginx orqali), aks holda
`SameSite=Strict` cookie yuborilmaydi. Bekor qilingan va muddati o'tgan tokenlar jadvalini tozalash uchun kuniga bir marta cron:
`venv/bin/python manage.py flushexpiredtokens`. Parol cheklovlari (`THROTTLE_*`) gunicorn worker'lari bo'yicha alohida sanaladi (har workerda o'z hisobi).

## 6. Claude bilan savol yaratish

`ANTHROPIC_API_KEY` ni `.env` ga yozing (bo'lmasa tugma "sozlanmagan" deb xabar beradi). Model: `ANTHROPIC_MODEL`. Har bir foydalanuvchi
soatiga 20 ta so'rov bilan cheklangan (`THROTTLE_AI`). Kalit faqat serverda turadi, brauzerga chiqmaydi.

## 7. Yangilash

```bash
git pull && venv/bin/pip install -r requirements.txt && venv/bin/python manage.py migrate && venv/bin/python manage.py collectstatic --noinput
sudo systemctl restart bm-examer
```
