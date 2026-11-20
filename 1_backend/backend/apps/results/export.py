import io
import os

from django.utils import timezone

from apps.tests_app.utils import safe_cell

HEADER = ['№', 'Student', 'Username', 'Urinish', 'Ball', "To'g'ri/Jami", 'Foiz', 'Tab almashtirish',
          'Boshlangan', 'Davomiyligi (daq)']


def _rows(attempts):
    rows = []
    for n, a in enumerate(attempts, start=1):
        duration = round((a.finished_at - a.started_at).total_seconds() / 60, 1) if a.finished_at else ''
        rows.append([
            n, a.student.get_full_name() or a.student.username, a.student.username, a.attempt_number,
            a.score, f'{a.correct_answers}/{a.total_questions}', f'{a.percentage:.1f}%', a.tab_switches,
            timezone.localtime(a.started_at).strftime('%Y-%m-%d %H:%M'), duration,
        ])
    return rows


def results_excel(test, attempts):
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = 'Natijalar'
    ws.append([safe_cell(test.title), test.test_code])
    ws.append(HEADER)
    for row in _rows(attempts):
        ws.append([safe_cell(c) for c in row])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def results_word(test, attempts):
    from docx import Document

    doc = Document()
    doc.add_heading(f'{test.title} ({test.test_code})', level=1)
    table = doc.add_table(rows=1, cols=len(HEADER))
    table.style = 'Table Grid'
    for i, h in enumerate(HEADER):
        table.rows[0].cells[i].text = h
    for row in _rows(attempts):
        cells = table.add_row().cells
        for i, v in enumerate(row):
            cells[i].text = str(v)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _pdf_font():
    """Unicode shrift topishga urinadi; topilmasa Helvetica (lotin harflari)."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    candidates = [
        'C:/Windows/Fonts/arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/Library/Fonts/Arial.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            pdfmetrics.registerFont(TTFont('BMFont', path))
            return 'BMFont'
    return 'Helvetica'


def results_pdf(test, attempts):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle

    font = _pdf_font()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4))
    styles = getSampleStyleSheet()
    title_style = styles['Title']
    title_style.fontName = font
    table = Table([HEADER] + _rows(attempts), repeatRows=1)
    table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('BACKGROUND', (0, 0), (-1, 0), colors.lightgrey),
        ('GRID', (0, 0), (-1, -1), 0.4, colors.grey),
    ]))
    doc.build([Paragraph(f'{test.title} ({test.test_code})'.replace('&', '&amp;').replace('<', '&lt;'),
                         title_style), table])
    return buf.getvalue()
