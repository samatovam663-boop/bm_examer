# PythonAnywhere'ga joylash (GitHub kerak emas, bepul)

Tayyor paket: `C:\Users\User\Desktop\BM_examer_pa.zip` (kod + frontend + baza: admin va namuna test bilan). U `deploy\pa_setup.sh` va
`frontend\dist-http\index.html` dan yig'ilgan; kod o'zgarsa paketni qayta yig'ish kerak (Claude'dan so'rang).

1. https://www.pythonanywhere.com → **Pricing & signup → Create a Beginner account**. **Username** havola nomi bo'ladi:
   `username.pythonanywhere.com`. Pochtani tasdiqlang.
2. **Files** tab → **Upload a file** → `BM_examer_pa.zip`.
3. **Consoles** tab → **Bash** → yozing: `unzip -o BM_examer_pa.zip`
4. **Web** tab → **Add a new web app** → Next → **Manual configuration** (Django emas!) → **Python 3.12** → Next.
5. Bash konsolida: `bash ~/bm_examer/pa_setup.sh` (3-6 daqiqa kuting; oxirida "TAYYOR" chiqadi).
6. **Web** tab: **Virtualenv** maydoniga `/home/USERNAME/.virtualenvs/bm-venv` yozing (USERNAME o'rniga o'zingiznikini), **Force HTTPS** ni yoqing,
   yashil **Reload** tugmasini bosing.
7. `https://USERNAME.pythonanywhere.com` ni oching. Admin: login `admin`, parol mahalliy `backend\public_data\ADMIN_LOGIN.txt` da.
   Kirgach Profilda parolni o'zgartiring.

Xato bo'lsa: Web tab → **Error log** dagi oxirgi qatorlarni Claude'ga yuboring.

## Cheklovlar (bepul reja)
- Bitta ishchi jarayon: ko'p odam bir vaqtda kirsa sekinroq.
- 512 MB joy; tashqi internet cheklangan (Claude bilan savol yaratish ishlamasligi mumkin); maxsus domen yo'q.
- Bepul veb-ilova muddati tugamasligi uchun Web tabdagi tugma (**Run until ...**) vaqti-vaqti bilan bosilishi kerak.
- Fayllar doimiy: baza va rasmlar saqlanadi (Render bepul rejasidan farqli).
- Bu baza alohida nusxa: mahalliy kompyuter saytidagi ma'lumotlar bilan sinxronlanmaydi.
