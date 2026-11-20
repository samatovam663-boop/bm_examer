from rest_framework.test import APITestCase

from .models import User


class AdminUserCrudTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user('adm', 'a@x.uz', 'x', role='admin')
        self.teacher = User.objects.create_user('tch', 't@x.uz', 'x', role='teacher')
        self.client.force_authenticate(self.admin)

    def test_admin_creates_user(self):
        r = self.client.post('/api/users/', {'username': 'newbie', 'email': 'n@x.uz', 'password': 'Str0ng-pass-91',
                                             'role': 'student', 'first_name': 'Ali'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn('password', r.data)
        self.assertTrue(User.objects.get(username='newbie').check_password('Str0ng-pass-91'))

    def test_only_admin_creates(self):
        self.client.force_authenticate(self.teacher)
        r = self.client.post('/api/users/', {'username': 'x1', 'email': 'x@x.uz', 'password': 'Str0ng-pass-91'})
        self.assertEqual(r.status_code, 403)

    def test_bulk_generates_logins_and_reports_errors(self):
        rows = [
            {'first_name': 'Ali', 'last_name': 'Valiyev'},
            {'first_name': 'Ali', 'last_name': 'Valiyev'},                       # takror: ali.valiyev2
            {'first_name': "Gulnoza", 'last_name': "O'rinboyeva", 'username': 'gulnoza.o', 'password': 'Parol2026x'},
            {'first_name': 'Xato', 'username': 'ab'},                            # login juda qisqa
            {'first_name': 'Хуршид', 'last_name': 'Эшматов'},                     # kirill -> lotin
        ]
        r = self.client.post('/api/users/bulk/', {'rows': rows}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        logins = [c['username'] for c in r.data['created']]
        self.assertEqual(logins, ['ali.valiyev', 'ali.valiyev2', 'gulnoza.o', 'xurshid.eshmatov'])
        self.assertEqual(r.data['errors'][0]['line'], 4)
        self.assertEqual(r.data['created'][2]['password'], 'Parol2026x')
        self.assertEqual(len(r.data['created'][0]['password']), 8)
        # parol haqiqatan o'rnatilgan
        u = User.objects.get(username='ali.valiyev')
        self.assertTrue(u.check_password(r.data['created'][0]['password']))
        self.assertEqual(u.role, 'student')

    def test_bulk_limit(self):
        r = self.client.post('/api/users/bulk/', {'rows': [{'first_name': 'A'}] * 201}, format='json')
        self.assertEqual(r.status_code, 400)

    def test_reset_password(self):
        student = User.objects.create_user('stu', 's@x.uz', 'Old-pass-123', role='student')
        r = self.client.post(f'/api/users/{student.id}/reset-password/', {}, format='json')
        self.assertEqual(r.status_code, 200)
        student.refresh_from_db()
        self.assertFalse(student.check_password('Old-pass-123'))
        self.assertTrue(student.check_password(r.data['password']))
        weak = self.client.post(f'/api/users/{student.id}/reset-password/', {'password': '123'}, format='json')
        self.assertEqual(weak.status_code, 400)

    def test_pagination_page_size(self):
        for i in range(25):
            User.objects.create_user(f'u{i}', f'u{i}@x.uz', 'x')
        self.assertEqual(len(self.client.get('/api/users/?page_size=100').data['results']), 27)
        self.assertEqual(len(self.client.get('/api/users/').data['results']), 20)


class SubjectPermissionTests(APITestCase):
    def test_teacher_can_delete_subject_student_cannot(self):
        from apps.subjects.models import Subject
        teacher = User.objects.create_user('t', 't@x.uz', 'x', role='teacher')
        student = User.objects.create_user('s', 's@x.uz', 'x', role='student')
        subject = Subject.objects.create(name='Fizika')
        self.client.force_authenticate(student)
        self.assertEqual(self.client.delete(f'/api/subjects/{subject.id}/').status_code, 403)
        self.client.force_authenticate(teacher)
        self.assertEqual(self.client.delete(f'/api/subjects/{subject.id}/').status_code, 204)
