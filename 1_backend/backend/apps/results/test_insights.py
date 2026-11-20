from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.subjects.models import Subject
from apps.tests_app.models import Choice, Question, Test

from .models import ExtraAttempt, PracticeProgress, TestAttempt


class InsightsBase(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher', first_name='Nilufar')
        self.other = User.objects.create_user('t2', 't2@x.uz', 'x', role='teacher')
        self.s1 = User.objects.create_user('s1', 's1@x.uz', 'x', role='student', first_name='Aziz')
        self.s2 = User.objects.create_user('s2', 's2@x.uz', 'x', role='student', first_name='Madina')
        self.subject = Subject.objects.create(name='Matematika')
        self.test = Test.objects.create(title='Alg', created_by=self.teacher, subject=self.subject, max_attempts=1,
                                        show_results='detailed', status='active', duration_minutes=10)
        self.q1 = self.make_q('2+2?', 'Qo\'shish', [('4', True), ('5', False)], points=2)
        self.q2 = self.make_q('Juftlar', 'Sonlar', [('2', True), ('3', False), ('4', True)], qtype='multiple', points=3)

    def make_q(self, text, topic, choices, qtype='single', points=1, test=None):
        q = Question.objects.create(test=test or self.test, text=text, topic=topic, question_type=qtype, points=points)
        for i, (t, c) in enumerate(choices):
            Choice.objects.create(question=q, text=t, is_correct=c, order=i)
        return q

    def take(self, student, picks, test=None, violation=False):
        """picks: {question: [choice texts]}; testni yechadi va topshiradi."""
        test = test or self.test
        self.client.force_authenticate(student)
        r = self.client.post(f'/api/tests/{test.id}/start/')
        self.assertEqual(r.status_code, 201, r.data)
        for q, texts in picks.items():
            ids = [c.id for c in q.choices.all() if c.text in texts]
            self.client.post(f'/api/tests/{test.id}/save-answer/', {'question_id': q.id, 'choice_ids': ids}, format='json')
        res = self.client.post(f'/api/tests/{test.id}/submit/', {'violation': violation}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        return res.data


class CorrectionTests(InsightsBase):
    def test_change_correct_answer_regrades_everyone(self):
        self.take(self.s1, {self.q1: ['5'], self.q2: ['2', '4']})    # 3/5 ball
        self.take(self.s2, {self.q1: ['4'], self.q2: ['2', '4']})    # 5/5
        self.client.force_authenticate(self.teacher)
        wrong = self.q1.choices.get(text='5').id
        r = self.client.post(f'/api/questions/{self.q1.id}/correct/', {'correct_choice_ids': [wrong]}, format='json')
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual(r.data['regraded'], 2)
        by = {a.student_id: a for a in TestAttempt.objects.all()}
        self.assertEqual(by[self.s1.id].percentage, 100)
        self.assertEqual(by[self.s2.id].percentage, 60)
        self.assertEqual(by[self.s2.id].correct_answers, 1)

    def test_cancel_question_gives_everyone_points(self):
        self.take(self.s1, {self.q1: ['5']})                         # q1 xato, q2 javobsiz: 0
        self.client.force_authenticate(self.teacher)
        r = self.client.post(f'/api/questions/{self.q2.id}/correct/', {'cancel': True}, format='json')
        self.assertEqual(r.status_code, 200)
        a = TestAttempt.objects.get(student=self.s1)
        self.assertEqual(a.score, 3)                                  # q2 ballari berildi
        self.assertEqual(a.percentage, 60)
        detail = self.client.get(f'/api/results/attempt/{a.id}/').data
        voided = next(q for q in detail['questions'] if q['question_id'] == self.q2.id)
        self.assertTrue(voided['voided'] and voided['is_correct'])

    def test_validation_and_permissions(self):
        self.client.force_authenticate(self.teacher)
        bad = self.client.post(f'/api/questions/{self.q1.id}/correct/', {'correct_choice_ids': []}, format='json')
        self.assertEqual(bad.status_code, 400)
        two = [c.id for c in self.q1.choices.all()]
        self.assertEqual(self.client.post(f'/api/questions/{self.q1.id}/correct/', {'correct_choice_ids': two}, format='json').status_code, 400)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(f'/api/questions/{self.q1.id}/correct/', {'cancel': True}, format='json').status_code, 404)
        self.client.force_authenticate(self.s1)
        self.assertEqual(self.client.post(f'/api/questions/{self.q1.id}/correct/', {'cancel': True}, format='json').status_code, 403)

    def test_question_analysis(self):
        self.take(self.s1, {self.q1: ['5'], self.q2: ['2', '4']})
        self.take(self.s2, {self.q1: ['4']})
        self.client.force_authenticate(self.teacher)
        data = self.client.get(f'/api/results/test/{self.test.id}/question-analysis/').data
        q1, q2 = data['questions']
        self.assertEqual(data['attempts_count'], 2)
        self.assertEqual(q1['correct_percent'], 50.0)
        self.assertEqual(q2['correct_percent'], 50.0)
        self.assertEqual(q2['blank'], 1)
        five = next(c for c in q1['choices'] if c['text'] == '5')
        self.assertEqual(five['selected'], 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/results/test/{self.test.id}/question-analysis/').status_code, 404)
        self.client.force_authenticate(self.s1)
        self.assertEqual(self.client.get(f'/api/results/test/{self.test.id}/question-analysis/').status_code, 403)

    def test_results_include_topics_and_extras(self):
        self.take(self.s1, {self.q1: ['5'], self.q2: ['2', '4']})
        self.client.force_authenticate(self.teacher)
        self.client.post(f'/api/results/test/{self.test.id}/grant-attempt/', {'student': self.s1.id}, format='json')
        data = self.client.get(f'/api/results/test/{self.test.id}/').data
        self.assertEqual(data['topics'][0]['name'], 'Qo\'shish')      # eng zaifi birinchi
        self.assertEqual(data['extras'], {str(self.s1.id): 1})


class ExtraAttemptTests(InsightsBase):
    def test_grant_attempt_lifts_limit(self):
        self.take(self.s1, {self.q1: ['4']}, violation=True)
        self.assertEqual(self.client.post(f'/api/tests/{self.test.id}/start/').status_code, 403)
        listing = self.client.get('/api/tests/').data['results'][0]
        self.assertEqual(listing['attempts_allowed'], 1)
        self.client.force_authenticate(self.teacher)
        r = self.client.post(f'/api/results/test/{self.test.id}/grant-attempt/', {'student': self.s1.id}, format='json')
        self.assertEqual(r.data['extra'], 1)
        self.client.force_authenticate(self.s1)
        self.assertEqual(self.client.get('/api/tests/').data['results'][0]['attempts_allowed'], 2)
        self.assertEqual(self.client.post(f'/api/tests/{self.test.id}/start/').status_code, 201)
        self.client.post(f'/api/tests/{self.test.id}/submit/')
        self.assertEqual(self.client.post(f'/api/tests/{self.test.id}/start/').status_code, 403)   # +1 dan ortiq yo'q

    def test_grant_only_staff_and_students(self):
        self.client.force_authenticate(self.s1)
        self.assertEqual(self.client.post(f'/api/results/test/{self.test.id}/grant-attempt/', {'student': self.s1.id}, format='json').status_code, 403)
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.post(f'/api/results/test/{self.test.id}/grant-attempt/', {'student': self.teacher.id}, format='json').status_code, 404)
        self.assertEqual(ExtraAttempt.objects.count(), 0)


class StudentInsightsTests(InsightsBase):
    def setUp(self):
        super().setUp()
        self.hidden = Test.objects.create(title='Yashirin', created_by=self.teacher, subject=self.subject, max_attempts=0,
                                          show_results='score_only', status='active')
        self.hq = self.make_q('Yashirin savol', 'H', [('a', True), ('b', False)], test=self.hidden)

    def test_analytics_only_counts_detailed_tests(self):
        self.take(self.s1, {self.q1: ['5'], self.q2: ['2', '4']})
        self.take(self.s1, {self.hq: ['b']}, test=self.hidden)
        self.client.force_authenticate(self.s1)
        data = self.client.get('/api/results/my-analytics/').data
        names = {t['name']: t['percent'] for t in data['topics']}
        self.assertEqual(names, {"Qo'shish": 0.0, 'Sonlar': 100.0})
        self.assertNotIn('H', names)                                  # yashirin test sizib chiqmaydi
        self.assertEqual((data['attempts_used'], data['hidden_tests']), (1, 1))

    def test_mistakes_and_practice_flow(self):
        self.take(self.s1, {self.q1: ['5'], self.q2: ['2', '4']})
        self.take(self.s1, {self.hq: ['b']}, test=self.hidden)
        self.client.force_authenticate(self.s1)
        mistakes = self.client.get('/api/results/my-mistakes/').data
        self.assertEqual([m['question_id'] for m in mistakes], [self.q1.id])      # yashirin testniki yo'q
        self.assertEqual(mistakes[0]['wrong_count'], 1)
        right = [c.id for c in self.q1.choices.filter(is_correct=True)]
        wrong = [c.id for c in self.q1.choices.filter(is_correct=False)]
        pr = lambda ids: self.client.post('/api/results/practice/', {'question_id': self.q1.id, 'choice_ids': ids}, format='json')
        self.assertFalse(pr(wrong).data['correct'])
        self.assertEqual(pr(right).data['streak'], 1)
        last = pr(right).data
        self.assertTrue(last['mastered'])
        self.assertTrue(self.client.get('/api/results/my-mistakes/').data[0]['mastered'])
        # xatosiz savol mashq ro'yxatida emas; yashirin test savoli ham
        self.assertEqual(self.client.post('/api/results/practice/', {'question_id': self.q2.id, 'choice_ids': [1]}, format='json').status_code, 404)
        self.assertEqual(self.client.post('/api/results/practice/', {'question_id': self.hq.id, 'choice_ids': [1]}, format='json').status_code, 404)
        self.assertEqual(PracticeProgress.objects.get(student=self.s1, question=self.q1).streak, 2)

    def test_correction_resets_practice(self):
        self.take(self.s1, {self.q1: ['5']})
        self.client.force_authenticate(self.s1)
        self.client.post('/api/results/practice/', {'question_id': self.q1.id, 'choice_ids': [self.q1.choices.get(text='4').id]}, format='json')
        self.client.force_authenticate(self.teacher)
        self.client.post(f'/api/questions/{self.q1.id}/correct/', {'cancel': True}, format='json')
        self.assertFalse(PracticeProgress.objects.exists())

    def test_student_only(self):
        self.client.force_authenticate(self.teacher)
        for url in ('/api/results/my-analytics/', '/api/results/my-mistakes/', '/api/results/goals/'):
            self.assertEqual(self.client.get(url).status_code, 403, url)

    def test_goals_crud(self):
        self.client.force_authenticate(self.s1)
        r = self.client.post('/api/results/goals/', {'subject': self.subject.id, 'target': 85, 'deadline': '2027-01-01'}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        dup = self.client.post('/api/results/goals/', {'subject': self.subject.id, 'target': 90}, format='json')
        self.assertEqual(dup.status_code, 400)
        overall = self.client.post('/api/results/goals/', {'target': 70}, format='json')
        self.assertEqual(overall.status_code, 201)
        self.assertEqual(self.client.post('/api/results/goals/', {'target': 60}, format='json').status_code, 400)   # umumiy ham bitta
        self.assertEqual(self.client.post('/api/results/goals/', {'subject': self.subject.id, 'target': 0}, format='json').status_code, 400)
        gid = r.data['id']
        self.assertEqual(self.client.put(f'/api/results/goals/{gid}/', {'subject': self.subject.id, 'target': 95}, format='json').data['target'], 95)
        self.assertEqual(len(self.client.get('/api/results/goals/').data), 2)
        # boshqa o'quvchi ko'rmaydi va tegolmaydi
        self.client.force_authenticate(self.s2)
        self.assertEqual(self.client.get('/api/results/goals/').data, [])
        self.assertEqual(self.client.delete(f'/api/results/goals/{gid}/').status_code, 404)
        self.client.force_authenticate(self.s1)
        self.assertEqual(self.client.delete(f'/api/results/goals/{gid}/').status_code, 204)


class StaffStudentsTests(InsightsBase):
    def test_students_list_and_profile_scoped_to_teacher(self):
        self.take(self.s1, {self.q1: ['4'], self.q2: ['2', '4']})
        self.take(self.s2, {self.q1: ['5']}, violation=True)
        self.client.force_authenticate(self.teacher)
        rows = self.client.get('/api/results/students/').data
        self.assertEqual({r['username'] for r in rows}, {'s1', 's2'})
        s2 = next(r for r in rows if r['username'] == 's2')
        self.assertEqual((s2['blocked'], s2['attempts']), (1, 1))
        prof = self.client.get(f'/api/results/students/{self.s2.id}/').data
        self.assertEqual(prof['student']['username'], 's2')
        self.assertEqual(len(prof['attempts']), 1)
        self.assertTrue(prof['attempts'][0]['violation'])
        self.assertTrue(prof['topics'])
        # boshqa o'qituvchi bu o'quvchini ko'rmaydi
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get('/api/results/students/').data, [])
        self.assertEqual(self.client.get(f'/api/results/students/{self.s1.id}/').status_code, 404)
        self.client.force_authenticate(self.s1)
        self.assertEqual(self.client.get('/api/results/students/').status_code, 403)
