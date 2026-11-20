"""Ommaviy o'quvchi qo'shish: login/parol avtomatik yaratiladi (frontend demo bilan bir xil qoidalar)."""
import re
import secrets
import unicodedata

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import User

CYR = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'j', 'з': 'z', 'и': 'i', 'й': 'y',
    'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f',
    'х': 'x', 'ц': 's', 'ч': 'ch', 'ш': 'sh', 'щ': 'sh', 'ъ': '', 'ы': 'i', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
    'ў': 'o', 'қ': 'q', 'ғ': 'g', 'ҳ': 'h',
}
PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
MAX_ROWS = 200


def slug(text):
    """'Aziz Yusupov' -> 'aziz.yusupov'; o', g' va kirill harflari lotinga o'giriladi."""
    text = text.lower()
    text = re.sub(r"[ʻʼ'`’‘]", '', text)
    text = ''.join(CYR.get(c, c) for c in text)
    text = unicodedata.normalize('NFD', text)
    text = ''.join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r'[^a-z0-9.]+', '', text)
    text = re.sub(r'\.{2,}', '.', text)
    return text.strip('.')


def random_password(length=8):
    return ''.join(secrets.choice(PASSWORD_ALPHABET) for _ in range(length))


def create_students(rows):
    """rows: [{first_name, last_name, username?, password?, phone?, line?}] -> {created, errors}.
    Har bir qator alohida tekshiriladi: to'g'rilari saqlanadi, xatolari qaytariladi."""
    taken = set(User.objects.values_list('username', flat=True))
    taken = {u.lower() for u in taken}
    created, errors = [], []
    for i, row in enumerate(rows):
        line = row.get('line', i + 1)
        first = str(row.get('first_name') or '').strip()
        last = str(row.get('last_name') or '').strip()
        username = str(row.get('username') or '').strip().lower()
        if not username:
            base = slug('.'.join(p for p in (first, last) if p)) or 'oquvchi'
            username, n = base, 2
            while username in taken:
                username, n = f'{base}{n}', n + 1
        if not first and not last and not row.get('username'):
            errors.append({'line': line, 'error': 'Ism yoki login kerak.'})
            continue
        if not re.fullmatch(r'[a-z0-9._-]{3,30}', username):
            errors.append({'line': line, 'error': f'"{username}" login yaroqsiz (3-30 ta lotin harf, raqam, nuqta).'})
            continue
        if username in taken:
            errors.append({'line': line, 'error': f'"{username}" logini band.'})
            continue
        password = str(row.get('password') or '').strip() or random_password()
        try:
            validate_password(password)
        except DjangoValidationError as exc:
            errors.append({'line': line, 'error': ' '.join(exc.messages)})
            continue
        user = User.objects.create_user(
            username=username, email=f'{username}@bm-examer.uz', password=password, first_name=first,
            last_name=last, phone=str(row.get('phone') or '').strip(), role=User.Role.STUDENT)
        taken.add(username)
        created.append({'id': user.id, 'username': username, 'first_name': first, 'last_name': last,
                        'phone': user.phone, 'role': user.role, 'password': password})
    return {'created': created, 'errors': errors}
