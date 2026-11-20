# BM_examer: onlayn test platformasi

Django REST Framework (backend) + React/Vite (frontend) + SQLite.

## Ishga tushirish (haqiqiy backend bilan)

```bash
# 1) Backend (Python 3.11+)
cd backend
python -m venv venv
venv\Scripts\activate          # Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env          # Linux/macOS: cp. Mahalliy ishlash uchun .env ga DJANGO_DEBUG=1 va ixtiyoriy DJANGO_SECRET_KEY yozing
python manage.py migrate
python manage.py seed_demo      # ixtiyoriy: demo foydalanuvchilar (parol: demo1234) va bitta faol test
python manage.py runserver      # http://127.0.0.1:8000

# 2) Frontend (Node 20+), boshqa terminalda
cd frontend
npm install
npm run dev:http                # http://localhost:5174, /api so'rovlari Django'ga yo'naltiriladi
```

Demo foydalanuvchilar (`seed_demo`): `admin`, `nilufar` (o'qituvchi), `aziz`, `madina`, `bobur` (o'quvchilar).

## Rejimlar

| Buyruq | Nima |
|---|---|
| `npm run dev:http` | Haqiqiy Django bilan (JWT, SQLite). |
| `npm run dev` | Demo: backendsiz, ma'lumot brauzerda saqlanadi (artifakt shu rejimda). |
| `npm run build:http` | Production build (`dist-http/`). |
| `npm run build` + `node scripts/make-artifact.mjs` | Demo artifakt (`dist/artifact.html`). |

Backend testlari: `cd backend && venv\Scripts\python manage.py test apps`

## Imkoniyatlar (demo va backend rejimida bir xil)

Topshiriq talablari (test, savol, bank, yechish, natija, admin) va qo'shimchalar: mavzu va savol turi tahlili, "Xatolarim" va mashq,
maqsadlar, yutuqlar, faollik kalendari, savollar tahlili, xato savolni tuzatish va qayta baholash, qo'shimcha urinish berish,
o'quvchilar ro'yxati va profili, ommaviy o'quvchi qo'shish, Excel/Word/PDF import va eksport.

Shuningdek: guruhlar (sinflar) va testni guruhga tayinlash, test vaqtini rejalashtirish (boshlanish/tugash), o'qituvchi dashboardida
"E'tibor talab qiladi" bloki, Claude bilan savol yaratish. Claude: artifaktda foydalanuvchining o'z hisobidan, haqiqiy saytda server
orqali (`ANTHROPIC_API_KEY` kerak, kalit brauzerga chiqmaydi).
`frontend/src/api/index.js` dagi `FEATURES` bayroqlari yangi imkoniyatni backend tayyor bo'lguncha http rejimida yashirish uchun.

## Production

`DEPLOY.md` (server sozlash, nginx, gunicorn, xavfsizlik ro'yxati), `backend/.env.example` (barcha sozlamalar), `deploy/` (nginx va systemd namunalari).
`DJANGO_DEBUG` standart 0: `DJANGO_SECRET_KEY` va `DJANGO_ALLOWED_HOSTS` bo'lmasa Django ishga tushmaydi. Mahalliy rivojlanish uchun `backend/.env` ga
`DJANGO_DEBUG=1` yozing (yoki `.env.example` ni nusxalang).

Batafsil: `PROJECT_CONTEXT.md`, texnik topshiriq bo'yicha reja: `development_plan.md`.
