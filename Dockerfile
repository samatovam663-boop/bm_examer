# Render (va istalgan Docker hosting) uchun: bitta konteynerda frontend + Django.
# 1-bosqich: React'ni bitta index.html ga yig'ish. 2-bosqich: Django (gunicorn) shu faylni o'zi beradi.

FROM node:22-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build:http

FROM python:3.13-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=frontend /app/frontend/dist-http/index.html /app/frontend_dist/index.html
ENV FRONTEND_INDEX=/app/frontend_dist/index.html
# collectstatic faqat admin fayllarini yig'adi; vaqtinchalik kalit faqat shu buyruq uchun
RUN DJANGO_SECRET_KEY=build-only-key-not-used-at-runtime-0123456789 DJANGO_ALLOWED_HOSTS=localhost \
    python manage.py collectstatic --noinput
EXPOSE 10000
CMD ["sh", "start.sh"]
