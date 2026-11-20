import io

from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APITestCase

from apps.accounts.models import User

from .models import Test


def make_xlsx(rows):
    wb = Workbook()
    for row in rows:
        wb.active.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return SimpleUploadedFile('q.xlsx', buf.getvalue())


class QuestionApiTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.other = User.objects.create_user('t2', 't2@x.uz', 'x', role='teacher')
        self.client.force_authenticate(self.teacher)
        r = self.client.post('/api/tests/', {'title': 'Math', 'duration_minutes': 10, 'max_attempts': 1})
        self.assertEqual(r.status_code, 201, r.data)
        self.test = Test.objects.get(pk=r.data['id'])

    def test_code_generated_and_readonly(self):
        self.assertRegex(self.test.test_code, r'^BM-[A-Z0-9]{6}$')
        r = self.client.patch(f'/api/tests/{self.test.id}/', {'test_code': 'HACKED', 'status': 'active'})
        self.test.refresh_from_db()
        self.assertNotEqual(self.test.test_code, 'HACKED')
        self.assertEqual(self.test.status, 'draft')

    def test_question_validation(self):
        url = f'/api/tests/{self.test.id}/questions/'
        bad = self.client.post(url, {'text': '2+2?', 'question_type': 'single', 'choices': [
            {'text': '4', 'is_correct': True}, {'text': '5', 'is_correct': True}]}, format='json')
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post(url, {'text': 'Find $x$', 'question_type': 'single', 'choices': [
            {'text': '4', 'is_correct': True}, {'text': '5', 'is_correct': False}]}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)
        self.assertTrue(ok.data['has_formula'])
        tf = self.client.post(url, {'text': 'Earth is round', 'question_type': 'true_false',
                                    'correct_answer': True}, format='json')
        self.assertEqual(tf.status_code, 201, tf.data)
        self.assertEqual(len(tf.data['choices']), 2)

    def test_activate_needs_questions(self):
        self.assertEqual(self.client.post(f'/api/tests/{self.test.id}/activate/').status_code, 400)

    def test_other_teacher_cannot_access(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/tests/{self.test.id}/').status_code, 404)

    def test_import_export_roundtrip(self):
        file = make_xlsx([
            ['Savol', 'Tur', 'Ball', 'Qiyinlik', "To'g'ri javob", 'Variantlar'],
            ['2+2?', 'single', 2, 'easy', 1, '4', '5'],
            ['Tub sonlar', 'multiple', 3, 'medium', '1,3', '2', '4', '5'],
            ['Yer yumaloq', 'true_false', 1, 'easy', 'true'],
        ])
        r = self.client.post('/api/questions/import/', {'file': file, 'test_id': self.test.id}, format='multipart')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['imported'], 3)
        self.assertEqual(self.test.questions.count(), 3)

        exp = self.client.get(f'/api/questions/export/{self.test.id}/?type=excel')
        self.assertEqual(exp.status_code, 200)
        self.assertEqual(self.client.get(f'/api/questions/export/{self.test.id}/?type=word').status_code, 200)

    def test_import_is_atomic_and_reports_rows(self):
        file = make_xlsx([
            ['2+2?', 'single', 1, 'easy', 1, '4', '5'],
            ['Xato', 'single', 1, 'easy', 9, 'a', 'b'],
        ])
        r = self.client.post('/api/questions/import/', {'file': file, 'test_id': self.test.id}, format='multipart')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['errors'][0]['row'], 2)
        self.assertEqual(self.test.questions.count(), 0)
