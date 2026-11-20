import json
from datetime import timedelta
from unittest import mock

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.results.models import TestAttempt
from apps.results.services import attempt_expires_at

from . import ai
from .models import Choice, Question, Test


def add_question(test):
    q = Question.objects.create(test=test, text='Q?')
    Choice.objects.create(question=q, text='a', is_correct=True)
    Choice.objects.create(question=q, text='b', is_correct=False)


class ScheduleTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.student = User.objects.create_user('s', 's@x.uz', 'x', role='student')
        self.now = timezone.now()

    def test_draft_activates_when_start_time_comes(self):
        t = Test.objects.create(title='A', created_by=self.teacher, starts_at=self.now - timedelta(minutes=1),
                                ends_at=self.now + timedelta(hours=1))
        add_question(t)
        self.client.force_authenticate(self.student)
        listed = self.client.get('/api/tests/').data['results']
        self.assertEqual([x['id'] for x in listed], [t.id])
        t.refresh_from_db()
        self.assertEqual(t.status, 'active')

    def test_future_or_questionless_test_stays_draft(self):
        future = Test.objects.create(title='F', created_by=self.teacher, starts_at=self.now + timedelta(hours=1))
        add_question(future)
        empty = Test.objects.create(title='E', created_by=self.teacher, starts_at=self.now - timedelta(minutes=1))
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get('/api/tests/').data['count'], 0)
        future.refresh_from_db(), empty.refresh_from_db()
        self.assertEqual((future.status, empty.status), ('draft', 'draft'))

    def test_active_test_completes_and_open_attempts_are_graded(self):
        t = Test.objects.create(title='C', created_by=self.teacher, status='active', duration_minutes=60,
                                ends_at=self.now + timedelta(minutes=30))
        add_question(t)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(f'/api/tests/{t.id}/start/').status_code, 201)
        Test.objects.filter(pk=t.pk).update(ends_at=self.now - timedelta(seconds=1))
        self.client.force_authenticate(self.teacher)
        self.client.get('/api/tests/')                          # so'rov kelganda jadval qo'llanadi
        t.refresh_from_db()
        self.assertEqual(t.status, 'completed')
        self.assertTrue(TestAttempt.objects.get(student=self.student).is_completed)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post(f'/api/tests/{t.id}/start/').status_code, 404)

    def test_attempt_cannot_outlive_end_time(self):
        t = Test.objects.create(title='D', created_by=self.teacher, status='active', duration_minutes=60,
                                ends_at=self.now + timedelta(minutes=10))
        add_question(t)
        self.client.force_authenticate(self.student)
        r = self.client.post(f'/api/tests/{t.id}/start/')
        attempt = TestAttempt.objects.get(pk=r.data['attempt_id'])
        self.assertLessEqual(attempt_expires_at(attempt), t.ends_at)
        self.assertLess(attempt_expires_at(attempt), attempt.started_at + timedelta(minutes=60))

    def test_end_must_follow_start(self):
        self.client.force_authenticate(self.teacher)
        r = self.client.post('/api/tests/', {'title': 'X', 'duration_minutes': 5, 'starts_at': '2030-01-02T10:00:00Z',
                                             'ends_at': '2030-01-01T10:00:00Z'}, format='json')
        self.assertEqual(r.status_code, 400)
        ok = self.client.post('/api/tests/', {'title': 'X', 'duration_minutes': 5, 'starts_at': '2030-01-01T10:00:00Z',
                                              'ends_at': '2030-01-02T10:00:00Z'}, format='json')
        self.assertEqual(ok.status_code, 201, ok.data)


class AttentionTests(APITestCase):
    def test_attention_lists_problems(self):
        teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        s1 = User.objects.create_user('weak', 'w@x.uz', 'x', role='student', first_name='Past')
        t = Test.objects.create(title='Alg', created_by=teacher, status='active',
                                ends_at=timezone.now() + timedelta(hours=5), show_results='detailed')
        for i in range(3):
            q = Question.objects.create(test=t, text=f'Q{i}', topic='Zaif')
            Choice.objects.create(question=q, text='a', is_correct=True)
            Choice.objects.create(question=q, text='b', is_correct=False)
        for _ in range(1):
            self.client.force_authenticate(s1)
            self.client.post(f'/api/tests/{t.id}/start/')
            self.client.post(f'/api/tests/{t.id}/submit/', {'violation': True}, format='json')
        self.client.force_authenticate(teacher)
        data = self.client.get('/api/results/attention/').data
        self.assertEqual(data['low_students'][0]['name'], 'Past')
        self.assertEqual(data['blocked'][0]['test_title'], 'Alg')
        self.assertEqual(data['closing_tests'][0]['id'], t.id)
        self.assertEqual(data['weak_topics'][0]['name'], 'Zaif')
        self.client.force_authenticate(s1)
        self.assertEqual(self.client.get('/api/results/attention/').status_code, 403)


GOOD = [
    {'question_type': 'single', 'text': '2+2?', 'difficulty': 'easy', 'topic': 'Qo\'shish',
     'choices': [{'text': '4', 'is_correct': True}, {'text': '5', 'is_correct': False}]},
    {'question_type': 'multiple', 'text': 'Juft sonlar', 'choices': [
        {'text': '2', 'is_correct': True}, {'text': '3', 'is_correct': False}, {'text': '4', 'is_correct': True}]},
    {'question_type': 'single', 'text': 'Ikki to\'g\'ri', 'choices': [{'text': 'a', 'is_correct': True}, {'text': 'b', 'is_correct': True}]},
    {'question_type': 'essay', 'text': 'Noma\'lum tur', 'choices': []},
]


class AiTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.student = User.objects.create_user('s', 's@x.uz', 'x', role='student')
        self.body = {'topic': 'Kvadrat tenglamalar', 'count': 4, 'types': ['single', 'multiple'], 'points': 2}

    def test_generate_validates_and_drops_bad_questions(self):
        reply = 'Mana savollar:\n```json\n' + json.dumps(GOOD) + '\n```'
        self.client.force_authenticate(self.teacher)
        with mock.patch.object(ai, 'call_claude', return_value=reply) as call:
            r = self.client.post('/api/questions/generate/', self.body, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(len(r.data['questions']), 2)
        self.assertEqual(r.data['dropped'], 2)
        self.assertEqual(r.data['questions'][0]['points'], 2)
        self.assertIn('Kvadrat tenglamalar', call.call_args[0][0])
        # chiqqan savollar bulk orqali haqiqatan saqlanadi
        t = Test.objects.create(title='T', created_by=self.teacher)
        saved = self.client.post('/api/questions/bulk/', {'test_id': t.id, 'questions': r.data['questions']}, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)

    def test_missing_key_is_503_and_bad_reply_is_502(self):
        self.client.force_authenticate(self.teacher)
        with self.settings(ANTHROPIC_API_KEY=''):
            self.assertEqual(self.client.post('/api/questions/generate/', self.body, format='json').status_code, 503)
        with mock.patch.object(ai, 'call_claude', return_value='uzr, bilmayman'):
            self.assertEqual(self.client.post('/api/questions/generate/', self.body, format='json').status_code, 502)

    def test_input_limits_and_permissions(self):
        self.client.force_authenticate(self.teacher)
        for bad in ({**self.body, 'topic': 'ab'}, {**self.body, 'count': 50}, {**self.body, 'types': []},
                    {**self.body, 'notes': 'x' * 501}):
            self.assertEqual(self.client.post('/api/questions/generate/', bad, format='json').status_code, 400)
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.post('/api/questions/generate/', self.body, format='json').status_code, 403)

    def test_prompt_contains_only_expected_input(self):
        p = ai.build_prompt({**self.body, 'difficulty': 'mixed', 'notes': '', 'existing': ['Eski savol'], 'test_title': 'Alg'})
        self.assertIn('Eski savol', p)
        self.assertIn('Faqat JSON massiv', p)
