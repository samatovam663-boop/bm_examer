# Render'ga joylash (bepul reja), bosqichma-bosqich

Natija: `https://bm-examer.onrender.com` kabi HTTPS manzil (Render nomni o'zi beradi, band bo'lsa oxiriga harf qo'shadi).
Bitta xizmat: frontend va backend bir manzilda, shuning uchun kirish (login) cookie'si ishlaydi.

## Bepul rejaning cheklovlari (Render hujjatidan, 2026-11-18)

| Cheklov | Nimani anglatadi |
|---|---|
| 15 daqiqa so'rovsiz qolsa "uxlaydi" | Keyingi ochilish ~1 daqiqa kutadi. Test paytida uxlab qolmaydi, lekin kam foydalanilsa birinchi kirish sekin. |
| Fayl tizimi vaqtinchalik | Har restart/uxlash/yangilashda tozalanadi. **Yuklangan rasmlar (savol rasmi, avatar) yo'qoladi.** |
| Doimiy disk yo'q, shell yo'q | SQLite ishlamaydi (ma'lumot yo'qoladi), shuning uchun tashqi baza kerak. Admin muhit o'zgaruvchilaridan yaratiladi. |
| Render'ning bepul Postgres'i 30 kunda o'chadi | Shuning uchun **Neon** ning bepul bazasi (muddatsiz) ishlatiladi. |
| Oyiga 750 soat | Bitta xizmat uchun yetarli. |

Rasmlar muammosi kerak bo'lsa keyin hal qilinadi (Cloudinary kabi bepul rasm xotirasi ulanadi). Matnli savollar, natijalar, foydalanuvchilar bazada, ular yo'qolmaydi.

## 1-bosqich. GitHub (kod ombori)

Render kodni GitHub'dan oladi.
1. https://github.com da akkaunt oching (bepul).
2. **GitHub Desktop** dasturini o'rnating: https://desktop.github.com , akkauntingiz bilan kiring.
3. GitHub Desktop: **File → Add local repository** → `C:\Users\User\Desktop\BM_examer` papkasini tanlang. "This directory does not appear to be a Git repository" desa **"create a repository"** havolasini bosing → **Create repository**.
4. Chapdagi ro'yxatda `.env`, `venv`, `node_modules`, `db.sqlite3`, `BM_examer_demo.html` **bo'lmasligi** kerak (ular `.gitignore` da yashirilgan). Bo'lsa, to'xtang va menga yozing.
5. Pastda "Summary" ga `birinchi versiya` yozing → **Commit to main**.
6. Tepada **Publish repository** → **"Keep this code private"** belgisini QOLDIRING → **Publish**.

## 2-bosqich. Neon (baza)

1. https://neon.tech → **Sign up** (GitHub bilan kirish oson).
2. **Create project**: nom `bm-examer`, region **Europe (Frankfurt)** (Render ham shu yerda bo'lsin).
3. Loyiha ochilgach **Connect** tugmasini bosing, oynada "Connection string" chiqadi. **Show password** → butun qatorni nusxalang. U `postgresql://...neon.tech/neondb?sslmode=require` ko'rinishida.
   Bu qator parolni o'z ichiga oladi: uni faqat Render'ga kiriting, hech kimga yubormang.

## 3-bosqich. Render

1. https://render.com → **Get Started** → GitHub bilan kiring.
2. **New + → Blueprint** → GitHub'ni ulang (**Only select repositories** → `BM_examer`) → repo'ni tanlang.
3. Render `render.yaml` ni o'qiydi va 4 ta maydonni so'raydi:
   - `DATABASE_URL`: Neon'dan nusxalagan qator.
   - `DJANGO_SUPERUSER_USERNAME`: admin logini, masalan `admin`.
   - `DJANGO_SUPERUSER_PASSWORD`: **o'zingiz o'ylab topgan** kuchli parol (kamida 10 belgi). Yozib qo'ying: keyin ko'rib bo'lmaydi.
   - `DJANGO_SUPERUSER_EMAIL`: pochtangiz.
4. **Apply** (yoki Deploy Blueprint). Birinchi yig'ish 5-10 daqiqa oladi (Logs oynasida ko'rinadi).
5. "Your service is live" chiqsa, tepadagi `https://....onrender.com` havolani oching. Birinchi ochilish sekin bo'lishi mumkin.
6. Admin login/parol bilan kiring → **Foydalanuvchilar** orqali o'qituvchi va o'quvchilarni qo'shing.

## Yangilash
Kodni o'zgartirgach GitHub Desktop → **Commit to main** → **Push origin**. Render o'zi qayta joylaydi.

## Nosozliklar
| Belgi | Sabab / yechim |
|---|---|
| Build xato: `npm`/`pip` | Render → xizmat → **Logs** dagi oxirgi qizil qatorni menga yuboring. |
| `Bad Request (400)` | Manzil `ALLOWED_HOSTS` da yo'q. Render'da `Environment` ga `DJANGO_ALLOWED_HOSTS` = sizning to'liq domeningiz. |
| 500 yoki "database" xatosi | `DATABASE_URL` noto'g'ri nusxalangan (oxirida `?sslmode=require` bo'lsin) yoki Neon loyihasi to'xtab qolgan. |
| Login ishlamaydi | Saytni faqat `https://` orqali oching (cookie shuni talab qiladi). |

## Eslatma
Bu sozlama mahalliy kompyuterda tekshirilgan (frontend berish, DATABASE_URL, admin yaratish), lekin Docker bu kompyuterda yo'qligi uchun
konteyner yig'ilishi Render'ning o'zida birinchi marta sinaladi.
