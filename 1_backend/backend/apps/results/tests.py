from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.tests_app.models import Choice, Question, Test

from .models import TestAttempt


class ExamFlowTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.student = User.objects.create_user('s', 's@x.uz', 'x', role='student')
        self.student2 = User.objects.create_user('s2', 's2@x.uz', 'x', role='student')
        self.test = Test.objects.create(title='Math', created_by=self.teacher, duration_minutes=10,
                                        max_attempts=2, show_results='detailed')
        self.q1 = Question.objects.create(test=self.test, text='2+2?', points=2, order=0)
        self.q1c = [Choice.objects.create(question=self.q1, text=t, is_correct=c, order=i)
                    for i, (t, c) in enumerate([('4', True), ('5', False)])]
        self.q2 = Question.objects.create(test=self.test, text='Primes', question_type='multiple', points=3, order=1)
        self.q2c = [Choice.objects.create(question=self.q2, text=t, is_correct=c, order=i)
                    for i, (t, c) in enumerate([('2', True), ('4', False), ('5', True)])]
        self.client.force_authenticate(self.teacher)
        self.client.post(f'/api/tests/{self.test.id}/activate/')

    def as_student(self, user=None):
        self.client.force_authenticate(user or self.student)

    def start(self):
        return self.client.post(f'/api/tests/{self.test.id}/start/')

    def answer(self, question, choices):
        return self.client.post(f'/api/tests/{self.test.id}/save-answer/', {
            'question_id': question.id, 'choice_ids': [c.id for c in choices]}, format='json')

    def test_student_never_sees_correct_flags(self):
        self.as_student()
        r = self.start()
        self.assertEqual(r.status_code, 201, r.data)
        for q in r.data['questions']:
            for c in q['choices']:
                self.assertNotIn('is_correct', c)
        # savollarni test boshlanmasdan ko'rib bo'lmaydi
        self.as_student(self.student2)
        self.assertEqual(self.client.get(f'/api/tests/{self.test.id}/questions/').status_code, 403)

    def test_full_flow_grading(self):
        self.as_student()
        self.start()
        self.assertEqual(self.answer(self.q1, [self.q1c[0]]).status_code, 200)
        self.assertEqual(self.answer(self.q2, [self.q2c[0], self.q2c[2]]).status_code, 200)
        r = self.client.post(f'/api/tests/{self.test.id}/submit/', {'tab_switches': 3}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['score'], 5)
        self.assertEqual(r.data['percentage'], 100)
        self.assertEqual(r.data['tab_switches'], 3)
        self.assertEqual(len(r.data['questions']), 2)

    def test_multiple_requires_exact_set(self):
        self.as_student()
        self.start()
        self.answer(self.q1, [self.q1c[1]])                 # noto'g'ri
        self.answer(self.q2, [self.q2c[0]])                 # to'liq emas
        r = self.client.post(f'/api/tests/{self.test.id}/submit/')
        self.assertEqual(r.data['score'], 0)

    def test_single_choice_rejects_multiple_selection(self):
        self.as_student()
        self.start()
        self.assertEqual(self.answer(self.q1, self.q1c).status_code, 400)

    def test_foreign_choice_rejected(self):
        self.as_student()
        self.start()
        self.assertEqual(self.answer(self.q1, [self.q2c[0]]).status_code, 400)

    def test_attempt_limit_and_resume(self):
        self.as_student()
        first = self.start()
        again = self.start()                                # ochiq urinish davom ettiriladi
        self.assertEqual(first.data['attempt_id'], again.data['attempt_id'])
        self.client.post(f'/api/tests/{self.test.id}/submit/')
        self.start()
        self.client.post(f'/api/tests/{self.test.id}/submit/')
        self.assertEqual(self.start().status_code, 403)     # max_attempts=2

    def test_expired_attempt_is_auto_graded(self):
        self.as_student()
        attempt_id = self.start().data['attempt_id']
        self.answer(self.q1, [self.q1c[0]])
        TestAttempt.objects.filter(pk=attempt_id).update(started_at=timezone.now() - timedelta(minutes=30))
        self.assertEqual(self.answer(self.q2, [self.q2c[0]]).status_code, 400)
        attempt = TestAttempt.objects.get(pk=attempt_id)
        self.assertTrue(attempt.is_completed)
        self.assertEqual(attempt.score, 2)

    def test_show_results_score_only_hides_answers(self):
        Test.objects.filter(pk=self.test.pk).update(show_results='score_only')
        self.as_student()
        self.start()
        r = self.client.post(f'/api/tests/{self.test.id}/submit/')
        self.assertNotIn('questions', r.data)
        detail = self.client.get(f'/api/results/attempt/{r.data["id"]}/')
        self.assertNotIn('questions', detail.data)
        # boshqa student ko'ra olmaydi
        self.as_student(self.student2)
        self.assertEqual(self.client.get(f'/api/results/attempt/{r.data["id"]}/').status_code, 404)

    def test_teacher_results_leaderboard_export(self):
        self.as_student()
        self.start()
        self.answer(self.q1, [self.q1c[0]])
        self.client.post(f'/api/tests/{self.test.id}/submit/')
        self.assertEqual(self.client.get('/api/results/my/').data['count'], 1)
        self.assertEqual(self.client.get(f'/api/results/leaderboard/{self.test.id}/').status_code, 200)
        self.assertEqual(self.client.get(f'/api/results/test/{self.test.id}/').status_code, 403)

        self.client.force_authenticate(self.teacher)
        r = self.client.get(f'/api/results/test/{self.test.id}/')
        self.assertEqual(r.data['stats']['attempts_count'], 1)
        self.assertEqual(r.data['ranking'][0]['rank'], 1)
        for kind in ('excel', 'pdf', 'word'):
            resp = self.client.get(f'/api/results/test/{self.test.id}/export/?type={kind}')
            self.assertEqual(resp.status_code, 200, kind)
            self.assertGreater(len(resp.content), 100)
        self.assertEqual(self.client.get('/api/results/stats/').data['attempts_count'], 1)

    def test_complete_closes_open_attempts_and_blocks_start(self):
        self.as_student()
        self.start()
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(f'/api/tests/{self.test.id}/complete/').status_code, 200)
        self.assertFalse(TestAttempt.objects.filter(is_completed=False).exists())
        self.as_student()
        self.assertEqual(self.start().status_code, 404)     # faol emas

    def test_cannot_edit_questions_after_attempts(self):
        self.as_student()
        self.start()
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.delete(f'/api/questions/{self.q1.id}/').status_code, 400)

    def test_by_code_students_only_active(self):
        self.as_student()
        self.assertEqual(self.client.get(f'/api/tests/by-code/{self.test.test_code.lower()}/').status_code, 200)
        Test.objects.filter(pk=self.test.pk).update(status='draft')
        self.assertEqual(self.client.get(f'/api/tests/by-code/{self.test.test_code}/').status_code, 404)
