from rest_framework.test import APITestCase

from .models import User


class AuthTests(APITestCase):
    def test_register_login_profile(self):
        r = self.client.post('/api/auth/register/', {
            'username': 'ali', 'email': 'ali@x.uz', 'password': 'Str0ng-pass-91', 'role': 'student'})
        self.assertEqual(r.status_code, 201, r.data)
        self.assertNotIn('password', r.data)

        r = self.client.post('/api/auth/login/', {'username': 'ali', 'password': 'Str0ng-pass-91'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['user']['role'], 'student')

        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + r.data['access'])
        self.assertEqual(self.client.get('/api/auth/profile/').data['username'], 'ali')
        # role profil orqali o'zgartirilmaydi
        self.client.put('/api/auth/profile/', {'email': 'new@x.uz', 'role': 'admin'})
        user = User.objects.get(username='ali')
        self.assertEqual(user.role, 'student')
        self.assertEqual(user.email, 'new@x.uz')

    def test_refresh_cookie_flow(self):
        User.objects.create_user('ali', 'ali@x.uz', 'Str0ng-pass-91')
        r = self.client.post('/api/auth/login/', {'username': 'ali', 'password': 'Str0ng-pass-91'})
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('refresh', r.data)          # refresh JS'ga ko'rinmaydi
        self.assertIn('access', r.data)
        cookie = r.cookies['bm_refresh']
        self.assertTrue(cookie['httponly'])
        self.assertEqual(cookie['samesite'], 'Strict')
        self.assertEqual(cookie['path'], '/api/auth/')

        xhr = {'HTTP_X_REQUESTED_WITH': 'XMLHttpRequest'}
        # sarlavhasiz (boshqa saytdan forma) -> 403
        self.assertEqual(self.client.post('/api/auth/refresh/').status_code, 403)
        ok = self.client.post('/api/auth/refresh/', **xhr)
        self.assertEqual(ok.status_code, 200, ok.data)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer ' + ok.data['access'])
        self.assertEqual(self.client.get('/api/auth/profile/').data['username'], 'ali')
        self.client.credentials()

        old = cookie.value
        self.assertEqual(self.client.post('/api/auth/logout/').status_code, 403)
        out = self.client.post('/api/auth/logout/', **xhr)
        self.assertEqual(out.status_code, 204)
        self.assertEqual(out.cookies['bm_refresh'].value, '')
        # bekor qilingan token qayta ishlamaydi
        self.client.cookies['bm_refresh'] = old
        self.client.cookies['bm_refresh']['path'] = '/api/auth/'
        self.assertEqual(self.client.post('/api/auth/refresh/', **xhr).status_code, 401)

    def test_refresh_without_cookie(self):
        r = self.client.post('/api/auth/refresh/', HTTP_X_REQUESTED_WITH='XMLHttpRequest')
        self.assertEqual(r.status_code, 401)

    def test_cannot_register_as_admin(self):
        r = self.client.post('/api/auth/register/', {
            'username': 'evil', 'email': 'e@x.uz', 'password': 'Str0ng-pass-91', 'role': 'admin'})
        self.assertEqual(r.status_code, 400)

    def test_change_password(self):
        User.objects.create_user('bob', 'b@x.uz', 'Old-pass-123')
        self.client.login(username='bob', password='Old-pass-123')
        self.client.force_authenticate(User.objects.get(username='bob'))
        bad = self.client.post('/api/auth/change-password/', {'old_password': 'wrong', 'new_password': 'New-pass-4567'})
        self.assertEqual(bad.status_code, 400)
        ok = self.client.post('/api/auth/change-password/', {'old_password': 'Old-pass-123', 'new_password': 'New-pass-4567'})
        self.assertEqual(ok.status_code, 200)

    def test_users_admin_only(self):
        student = User.objects.create_user('s', 's@x.uz', 'x', role='student')
        admin = User.objects.create_user('a', 'a@x.uz', 'x', role='admin')
        self.client.force_authenticate(student)
        self.assertEqual(self.client.get('/api/users/').status_code, 403)
        self.client.force_authenticate(admin)
        self.assertEqual(self.client.get('/api/users/').status_code, 200)
        self.assertEqual(self.client.get('/api/users/stats/').data['by_role']['student'], 1)
        # o'zini o'chira olmaydi
        self.assertEqual(self.client.delete(f'/api/users/{admin.id}/').status_code, 400)
