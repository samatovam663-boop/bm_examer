from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.tests_app.models import Choice, Question, Test

from .models import Group


class GroupTests(APITestCase):
    def setUp(self):
        self.teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        self.other = User.objects.create_user('t2', 't2@x.uz', 'x', role='teacher')
        self.admin = User.objects.create_user('adm', 'a@x.uz', 'x', role='admin')
        self.a = User.objects.create_user('a', 'a1@x.uz', 'x', role='student', first_name='Aziz')
        self.b = User.objects.create_user('b', 'b1@x.uz', 'x', role='student', first_name='Bobur')
        self.c = User.objects.create_user('c', 'c1@x.uz', 'x', role='student', first_name='Cyrus')
        self.client.force_authenticate(self.teacher)

    def make_group(self, name='9-A', students=()):
        r = self.client.post('/api/groups/', {'name': name}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        if students:
            self.client.post(f"/api/groups/{r.data['id']}/members/", {'add': [s.id for s in students]}, format='json')
        return r.data['id']

    def make_test(self, **kw):
        t = Test.objects.create(title='T', created_by=self.teacher, status='active', **kw)
        q = Question.objects.create(test=t, text='Q?')
        Choice.objects.create(question=q, text='a', is_correct=True)
        Choice.objects.create(question=q, text='b', is_correct=False)
        return t

    def test_crud_and_unique_name(self):
        gid = self.make_group('9-A', [self.a, self.b])
        dup = self.client.post('/api/groups/', {'name': '9-a'}, format='json')
        self.assertEqual(dup.status_code, 400)
        data = self.client.get(f'/api/groups/{gid}/').data
        self.assertEqual(data['student_count'], 2)
        self.assertEqual(self.client.patch(f'/api/groups/{gid}/', {'name': '9-B'}, format='json').data['name'], '9-B')
        self.assertEqual(self.client.delete(f'/api/groups/{gid}/').status_code, 204)

    def test_membership_only_students_and_remove(self):
        gid = self.make_group('G', [self.a])
        bad = self.client.post(f'/api/groups/{gid}/members/', {'add': [self.teacher.id]}, format='json')
        self.assertEqual(bad.status_code, 400)
        r = self.client.post(f'/api/groups/{gid}/members/', {'add': [self.b.id], 'remove': [self.a.id]}, format='json')
        self.assertEqual([s['username'] for s in r.data['students']], ['b'])

    def test_pool_search_and_exclude(self):
        gid = self.make_group('G', [self.a])
        names = [p['username'] for p in self.client.get(f'/api/groups/pool/?exclude_group={gid}').data]
        self.assertEqual(sorted(names), ['b', 'c'])
        self.assertEqual([p['username'] for p in self.client.get('/api/groups/pool/?search=bob').data], ['b'])

    def test_teachers_are_isolated_and_students_forbidden(self):
        gid = self.make_group('G')
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f'/api/groups/{gid}/').status_code, 404)
        self.assertEqual(self.client.get('/api/groups/').data['count'], 0)
        self.client.force_authenticate(self.a)
        self.assertEqual(self.client.get('/api/groups/').status_code, 403)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.get('/api/groups/').data['count'], 1)

    def test_test_assigned_to_group_is_visible_only_to_members(self):
        gid = self.make_group('G', [self.a])
        t = self.make_test()
        t.groups.add(gid)
        open_test = self.make_test()
        self.client.force_authenticate(self.a)
        titles = {x['id'] for x in self.client.get('/api/tests/').data['results']}
        self.assertEqual(titles, {t.id, open_test.id})
        self.assertEqual(self.client.post(f'/api/tests/{t.id}/start/').status_code, 201)
        self.client.force_authenticate(self.b)                       # guruhda emas
        titles = {x['id'] for x in self.client.get('/api/tests/').data['results']}
        self.assertEqual(titles, {open_test.id})
        self.assertEqual(self.client.post(f'/api/tests/{t.id}/start/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/tests/by-code/{t.test_code}/').status_code, 404)

    def test_assign_groups_validation(self):
        mine = self.make_group('mine')
        self.client.force_authenticate(self.other)
        theirs = self.client.post('/api/groups/', {'name': 'theirs'}, format='json').data['id']
        self.client.force_authenticate(self.teacher)
        r = self.client.post('/api/tests/', {'title': 'X', 'duration_minutes': 5, 'groups': [mine]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(r.data['groups_names'], ['mine'])
        bad = self.client.post('/api/tests/', {'title': 'Y', 'duration_minutes': 5, 'groups': [theirs]}, format='json')
        self.assertEqual(bad.status_code, 400)

    def test_results_filter_and_group_stats(self):
        gid = self.make_group('G', [self.a])
        other_gid = self.make_group('H', [self.b])
        t = self.make_test()
        t.groups.add(gid, other_gid)
        for student in (self.a, self.b):
            self.client.force_authenticate(student)
            self.client.post(f'/api/tests/{t.id}/start/')
            self.client.post(f'/api/tests/{t.id}/submit/')
        self.client.force_authenticate(self.c)                    # ikkala guruhda ham yo'q: yecha olmaydi
        self.assertEqual(self.client.post(f'/api/tests/{t.id}/start/').status_code, 404)
        self.client.force_authenticate(self.teacher)
        full = self.client.get(f'/api/results/test/{t.id}/').data
        self.assertEqual(full['stats']['attempts_count'], 2)
        self.assertEqual({g['name'] for g in full['groups']}, {'G', 'H'})
        self.assertEqual({(g['name'], g['students'], g['attempts']) for g in full['group_stats']}, {('G', 1, 1), ('H', 1, 1)})
        filtered = self.client.get(f'/api/results/test/{t.id}/?group={gid}').data
        self.assertEqual(filtered['stats']['attempts_count'], 1)
        self.assertEqual([r['student'] for r in filtered['ranking']], [self.a.id])
        self.assertEqual(filtered['ranking'][0]['rank'], 1)

    def test_group_stats_endpoint(self):
        gid = self.make_group('G', [self.a, self.b])
        t = self.make_test()
        self.client.force_authenticate(self.a)
        self.client.post(f'/api/tests/{t.id}/start/')
        self.client.post(f'/api/tests/{t.id}/submit/')
        self.client.force_authenticate(self.teacher)
        data = self.client.get(f'/api/groups/{gid}/stats/').data
        self.assertEqual(len(data['members']), 2)
        self.assertEqual(data['attempts'], 1)
        self.assertEqual(next(m for m in data['members'] if m['username'] == 'b')['average'], None)
        self.assertIsInstance(Group.objects.get(pk=gid), Group)
