"""Mahalliy tekshirish uchun namunaviy ma'lumot: `python manage.py seed_demo`. Bir necha marta ishlatsa ham xavfsiz.
Barcha demo foydalanuvchilar paroli: demo1234 (faqat mahalliy rivojlanish uchun, productionda ishlatmang)."""
from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.subjects.models import Subject
from apps.tests_app.models import Choice, Question, Test

PASSWORD = 'demo1234'

USERS = [
    ('admin', 'Admin', 'Boshqaruvchi', 'admin'),
    ('nilufar', 'Nilufar', 'Karimova', 'teacher'),
    ('aziz', 'Aziz', 'Yusupov', 'student'),
    ('madina', 'Madina', 'Karimova', 'student'),
    ('bobur', 'Bobur', 'Ergashev', 'student'),
]

QUESTIONS = [
    ('$x^2 - 5x + 6 = 0$ tenglamaning ildizlari yig\'indisi?', 'single', 2, 'Viyet teoremasi', [('5', 1), ('6', 0), ('-5', 0), ('1', 0)]),
    ('$D = b^2 - 4ac$ ifoda nima deb ataladi?', 'single', 1, 'Diskriminant', [('Diskriminant', 1), ('Determinant', 0), ('Differensial', 0)]),
    ('Qaysilari $x^2 - 9 = 0$ tenglamaning ildizlari?', 'multiple', 3, 'Tenglama ildizlari', [('3', 1), ('-3', 1), ('9', 0), ('0', 0)]),
    ('$D < 0$ bo\'lsa, kvadrat tenglama haqiqiy ildizga ega emas.', 'true_false', 1, 'Diskriminant', [('True', 1), ('False', 0)]),
]


class Command(BaseCommand):
    help = "Demo foydalanuvchilar, fanlar va bitta faol test yaratadi."

    def handle(self, *args, **options):
        users = {}
        for username, first, last, role in USERS:
            user, created = User.objects.get_or_create(
                username=username, defaults={'first_name': first, 'last_name': last, 'role': role,
                                             'email': f'{username}@bm-examer.uz'})
            if created:
                user.set_password(PASSWORD)
                user.save()
            users[username] = user
        for name in ('Matematika', 'Fizika', 'Informatika'):
            Subject.objects.get_or_create(name=name)
        teacher = users['nilufar']
        test, created = Test.objects.get_or_create(
            title='Kvadrat tenglamalar', created_by=teacher,
            defaults={'subject': Subject.objects.get(name='Matematika'), 'duration_minutes': 15, 'max_attempts': 2,
                      'show_results': Test.ShowResults.DETAILED, 'shuffle_questions': True, 'shuffle_choices': True,
                      'status': Test.Status.ACTIVE, 'description': 'Diskriminant va Viyet teoremasi.'})
        if created:
            for order, (text, qtype, points, topic, choices) in enumerate(QUESTIONS):
                q = Question.objects.create(test=test, text=text, question_type=qtype, points=points, topic=topic,
                                            order=order, has_formula='$' in text)
                Choice.objects.bulk_create([Choice(question=q, text=t, is_correct=bool(c), order=i) for i, (t, c) in enumerate(choices)])
        self.stdout.write(self.style.SUCCESS(f'Tayyor. Test kodi: {test.test_code}. Foydalanuvchilar paroli: {PASSWORD}'))
