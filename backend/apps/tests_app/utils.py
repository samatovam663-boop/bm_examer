import io
import secrets
import string

from rest_framework.exceptions import ValidationError

CODE_ALPHABET = string.ascii_uppercase + string.digits
CODE_LENGTH = 6

MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 1000

TYPE_ALIASES = {
    'single': 'single', 'bitta': 'single', 's': 'single',
    'multiple': 'multiple', "ko'p": 'multiple', 'kop': 'multiple', 'm': 'multiple',
    'true_false': 'true_false', 'true/false': 'true_false', 'tf': 'true_false', 'truefalse': 'true_false',
}
TRUE_VALUES = {'true', 'rost', 'ha', 'yes'}
FALSE_VALUES = {'false', "yolg'on", 'yolgon', "yo'q", 'yoq', 'no'}


def generate_test_code():
    """Unikal test kodi: BM-A1B2C3."""
    from .models import Test

    while True:
        code = 'BM-' + ''.join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if not Test.objects.filter(test_code=code).exists():
            return code


def remove_question_image(question):
    """Rasmni savoldan ajratadi; fayl diskdan faqat boshqa savol unga havola qilmasa o'chadi (nusxalar fayl nomini baham ko'radi)."""
    name = question.image.name
    if not name:
        return
    shared = type(question).objects.filter(image=name).exclude(pk=question.pk).exists()
    if shared:
        question.image = None
        question.save(update_fields=['image'])
    else:
        question.image.delete(save=True)


def ensure_test_editable(test):
    """Urinishlar boshlangan testning savollari o'zgartirilmaydi (natijalar buzilmasligi uchun)."""
    if test is not None and test.attempts.exists():
        raise ValidationError("Bu testda urinishlar mavjud, savollarni o'zgartirib bo'lmaydi.")


def safe_cell(value):
    """Excel formula injection'dan himoya: =,+,-,@ bilan boshlangan matn oldiga ' qo'yiladi."""
    if isinstance(value, str) and value[:1] in ('=', '+', '-', '@', '\t', '\r'):
        return "'" + value
    return value


# ---------- Excel import ----------

def _parse_bool(raw):
    raw = str(raw).strip().lower()
    if raw in TRUE_VALUES:
        return True
    if raw in FALSE_VALUES:
        return False
    raise ValueError("true/false savolda to'g'ri javob 'true' yoki 'false' bo'lishi kerak")


def parse_questions_excel(file_obj):
    """Excel -> [(qator_raqami, savol_dict)], [xatolar].

    Ustunlar: A savol matni | B tur | C ball | D qiyinlik | E to'g'ri javob(lar) | F... variantlar
    """
    from openpyxl import load_workbook

    if file_obj.size > MAX_IMPORT_BYTES:
        raise ValidationError("Fayl hajmi 5 MB dan oshmasligi kerak.")
    try:
        wb = load_workbook(io.BytesIO(file_obj.read()), read_only=True, data_only=True)
    except Exception:
        raise ValidationError("Fayl to'g'ri .xlsx formatida emas.")
    rows = list(wb.active.iter_rows(values_only=True))
    if len(rows) > MAX_IMPORT_ROWS + 1:
        raise ValidationError(f"Bir martada ko'pi bilan {MAX_IMPORT_ROWS} ta savol import qilinadi.")

    parsed, errors = [], []
    for idx, row in enumerate(rows, start=1):
        row = list(row) + [None] * (6 - len(row))
        if not any(c not in (None, '') for c in row):
            continue
        first = str(row[0] or '').strip().lower()
        if idx == 1 and first in ('question', 'savol', 'text', 'savol matni'):
            continue
        try:
            text = str(row[0] or '').strip()
            if not text:
                raise ValueError('savol matni bo\'sh')
            q_type = TYPE_ALIASES.get(str(row[1] or 'single').strip().lower())
            if not q_type:
                raise ValueError("noma'lum savol turi")
            points = int(float(row[2])) if row[2] not in (None, '') else 1
            difficulty = str(row[3] or 'medium').strip().lower()
            correct_raw = row[4]
            texts = [str(c).strip() for c in row[5:] if c not in (None, '') and str(c).strip()]

            if q_type == 'true_false':
                answer = _parse_bool(correct_raw)
                data = {'question_type': q_type, 'text': text, 'points': points, 'difficulty': difficulty,
                        'correct_answer': answer}
            else:
                nums = {int(float(p)) for p in str(correct_raw).replace(';', ',').split(',') if p.strip()}
                if not nums or any(n < 1 or n > len(texts) for n in nums):
                    raise ValueError("to'g'ri javob raqamlari variantlarga mos emas")
                data = {'question_type': q_type, 'text': text, 'points': points, 'difficulty': difficulty,
                        'choices': [{'text': t, 'is_correct': (i + 1) in nums, 'order': i}
                                    for i, t in enumerate(texts)]}
            parsed.append((idx, data))
        except (ValueError, TypeError) as exc:
            errors.append({'row': idx, 'error': str(exc)})
    return parsed, errors


# ---------- Export ----------

def _correct_label(question):
    if question.question_type == 'true_false':
        return 'true' if any(c.is_correct and c.text.lower() == 'true' for c in question.choices.all()) else 'false'
    return ','.join(str(i + 1) for i, c in enumerate(question.choices.all()) if c.is_correct)


def export_questions_excel(questions):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = 'Savollar'
    ws.append(['Savol', 'Tur', 'Ball', 'Qiyinlik', "To'g'ri javob", 'Variantlar...'])
    for q in questions:
        choices = [safe_cell(c.text) for c in q.choices.all()]
        ws.append([safe_cell(q.text), q.question_type, q.points, q.difficulty, _correct_label(q)] + choices)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def export_questions_word(test, questions):
    from docx import Document

    doc = Document()
    doc.add_heading(test.title, level=1)
    key = []
    for n, q in enumerate(questions, start=1):
        doc.add_paragraph(f'{n}. {q.text}  ({q.points} ball)')
        letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        correct = []
        for i, c in enumerate(q.choices.all()):
            doc.add_paragraph(f'{letters[i % 26]}) {c.text}')
            if c.is_correct:
                correct.append(letters[i % 26])
        key.append(f"{n}: {', '.join(correct)}")
    doc.add_heading('Javoblar kaliti', level=2)
    doc.add_paragraph('; '.join(key))
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
