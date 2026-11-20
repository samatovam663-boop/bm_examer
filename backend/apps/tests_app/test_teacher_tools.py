import os
import shutil
import tempfile

from django.core.files.base import ContentFile
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.question_bank.models import QuestionBank
from apps.results.models import TestAttempt

from .models import Choice, Question, Test


def make_question(test, text, order=0, topic=''):
    q = Question.objects.create(test=test, text=text, order=order, topic=topic)
    Choice.objects.create(question=q, text='a', is_correct=True, order=0)
    Choice.objects.create(question=q, text='b', is_correct=False, order=1)
    return q


class TeacherToolsTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.other = User.objects.create_user('t2', 't2@x.uz', 'x', role='teacher')
        self.student = User.objects.create_user('s', 's@x.uz', 'x', role='student')
        self.test = Test.objects.create(title='Math', created_by=self.teacher, max_attempts=2)
        self.q1 = make_question(self.test, 'Q1', 0, 'Algebra')
        self.q2 = make_question(self.test, 'Q2', 1)
        self.client.force_authenticate(self.teacher)

    def test_duplicate(self):
        r = self.client.post(f'/api/tests/{self.test.id}/duplicate/')
        self.assertEqual(r.status_code, 201, r.data)
        copy = Test.objects.get(pk=r.data['id'])
        self.assertEqual(copy.status, 'draft')
        self.assertNotEqual(copy.test_code, self.test.test_code)
        self.assertEqual(copy.questions.count(), 2)
        self.assertEqual(copy.questions.first().choices.count(), 2)
        self.assertEqual(copy.questions.get(text='Q1').topic, 'Algebra')

    def test_duplicate_other_teacher_forbidden(self):
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(f'/api/tests/{self.test.id}/duplicate/').status_code, 404)

    def test_reorder_questions(self):
        r = self.client.post(f'/api/tests/{self.test.id}/reorder-questions/', {'ids': [self.q2.id, self.q1.id]}, format='json')
        self.assertEqual(r.status_code, 200)
        self.assertEqual([q.text for q in self.test.questions.all()], ['Q2', 'Q1'])
        bad = self.client.post(f'/api/tests/{self.test.id}/reorder-questions/', {'ids': [self.q1.id]}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_bulk_is_atomic_and_validated(self):
        good = {'question_type': 'single', 'text': 'N1', 'topic': 'T', 'choices': [
            {'text': 'x', 'is_correct': True}, {'text': 'y', 'is_correct': False}]}
        r = self.client.post('/api/questions/bulk/', {'test_id': self.test.id, 'questions': [good, good]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.test.questions.count(), 4)
        bad = {'question_type': 'single', 'text': 'bad', 'choices': [{'text': 'x', 'is_correct': True}]}
        r = self.client.post('/api/questions/bulk/', {'test_id': self.test.id, 'questions': [good, bad]}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.data['errors'][0]['index'], 2)
        self.assertEqual(self.test.questions.count(), 4)   # hech biri saqlanmadi

    def test_bulk_into_bank_and_ownership(self):
        bank = QuestionBank.objects.create(name='B', created_by=self.teacher)
        q = {'question_type': 'true_false', 'text': 'TF', 'correct_answer': True}
        r = self.client.post('/api/questions/bulk/', {'bank_id': bank.id, 'questions': [q]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.client.force_authenticate(self.other)
        r = self.client.post('/api/questions/bulk/', {'bank_id': bank.id, 'questions': [q]}, format='json')
        self.assertEqual(r.status_code, 404)

    def test_violation_flag_on_submit(self):
        self.test.status = 'active'
        self.test.save()
        self.client.force_authenticate(self.student)
        self.client.post(f'/api/tests/{self.test.id}/start/')
        r = self.client.post(f'/api/tests/{self.test.id}/submit/', {'tab_switches': 1, 'violation': True}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertTrue(r.data['violation'])
        self.assertTrue(TestAttempt.objects.get(student=self.student).violation)

    def test_refresh_resumes_attempt(self):
        """Spec FR-RUN-3: sahifa yangilanganda (start qayta chaqirilganda) urinish davom etadi."""
        self.test.status = 'active'
        self.test.save()
        self.client.force_authenticate(self.student)
        first = self.client.post(f'/api/tests/{self.test.id}/start/')
        self.client.post(f'/api/tests/{self.test.id}/save-answer/', {'question_id': self.q1.id, 'choice_ids': [self.q1.choices.first().id]}, format='json')
        again = self.client.post(f'/api/tests/{self.test.id}/start/')
        self.assertEqual(first.data['attempt_id'], again.data['attempt_id'])
        self.assertEqual(dict(again.data['saved_answers']), {self.q1.id: [self.q1.choices.first().id]})

    def test_admin_stats_by_subject(self):
        admin = User.objects.create_user('adm', 'a@x.uz', 'x', role='admin')
        self.client.force_authenticate(admin)
        r = self.client.get('/api/results/stats/')
        self.assertEqual(r.status_code, 200)
        self.assertIn('by_subject', r.data)


class SharedImageTests(APITestCase):
    def setUp(self):
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.addCleanup(shutil.rmtree, self.media, ignore_errors=True)
        self.addCleanup(self.override.disable)
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.test = Test.objects.create(title='Math', created_by=self.teacher)
        self.bank = QuestionBank.objects.create(name='B', created_by=self.teacher)
        self.client.force_authenticate(self.teacher)

    def _bank_question(self):
        q = Question.objects.create(bank=self.bank, text='BQ', topic='Geometry')
        q.image.save('pic.png', ContentFile(b'img'), save=True)
        Choice.objects.create(question=q, text='a', is_correct=True, order=0)
        Choice.objects.create(question=q, text='b', is_correct=False, order=1)
        return q

    def test_add_to_test_keeps_topic(self):
        self._bank_question()
        r = self.client.post(f'/api/question-banks/{self.bank.id}/add-to-test/', {'test_id': self.test.id}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.test.questions.get().topic, 'Geometry')

    def test_deleting_copy_image_keeps_original_file(self):
        bank_q = self._bank_question()
        r = self.client.post(f'/api/question-banks/{self.bank.id}/add-to-test/', {'test_id': self.test.id}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        copy = self.test.questions.get()
        self.assertEqual(copy.image.name, bank_q.image.name)
        r = self.client.delete(f'/api/questions/{copy.id}/image/')
        self.assertEqual(r.status_code, 204)
        copy.refresh_from_db()
        self.assertFalse(copy.image)
        self.assertTrue(os.path.exists(bank_q.image.path))
        # oxirgi havola o'chirilganda fayl ham o'chadi
        path = bank_q.image.path
        bank_q.refresh_from_db()
        from .utils import remove_question_image
        remove_question_image(bank_q)
        self.assertFalse(os.path.exists(path))
