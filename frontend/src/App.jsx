import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { IS_DEMO } from './api'
import { HOME_BY_ROLE, useAuth } from './context/AuthContext'
import AppLayout from './components/layout/AppLayout'
import ProtectedRoute from './components/layout/ProtectedRoute'
import { Button, Loader } from './components/common/ui'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Profile from './pages/Profile'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminUsers from './pages/admin/AdminUsers'
import Subjects from './pages/shared/Subjects'
import Results from './pages/shared/Results'
import AttemptView from './pages/shared/AttemptView'
import TestsList from './pages/teacher/TestsList'
import TestForm from './pages/teacher/TestForm'
import TestDetail from './pages/teacher/TestDetail'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import { BankDetail, BanksList } from './pages/teacher/Banks'
import {
  History, JoinByCode, Leaderboard, StudentDashboard, StudentTests, TestIntro,
} from './pages/student/StudentPages'
import Exam from './pages/student/Exam'
import Stats from './pages/student/Stats'
import Mistakes from './pages/student/Mistakes'
import { StudentProfile, StudentsList } from './pages/teacher/Students'
import Groups from './pages/teacher/Groups'

// Demo (artifakt) rejimida URL ishlatilmaydi, shuning uchun MemoryRouter. Haqiqiy backend bilan BrowserRouter.
const Router = IS_DEMO ? MemoryRouter : BrowserRouter

function Home() {
  const { user, loading } = useAuth()
  if (loading) return <Loader />
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />
}

function NotFound() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // MemoryRouter (artifakt) da window.history.back() ishlamaydi, shuning uchun router'ning o'zi bilan qaytamiz.
  // Oldingi sahifa bo'lmasa (to'g'ridan-to'g'ri kirilgan), "Bosh sahifa" tugmasi bor.
  const goBack = () => navigate(-1)
  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1>Sahifa topilmadi</h1>
        <p className="muted">Bunday sahifa yo'q yoki unga kirish huquqingiz yo'q.</p>
        <div className="row">
          <Button onClick={goBack}>Orqaga qaytish</Button>
          <Button variant="primary" onClick={() => navigate(user ? HOME_BY_ROLE[user.role] : '/login', { replace: true })}>Bosh sahifa</Button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <Toaster position="top-right" toastOptions={{
        style: { background: 'var(--card-solid)', color: 'var(--fg)', border: '1px solid var(--border)', fontFamily: 'var(--font-body)' },
      }} />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['admin']} />}>
          <Route element={<AppLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="/admin/subjects" element={<Subjects />} />
            <Route path="/admin/tests" element={<TestsList />} />
            <Route path="/admin/tests/new" element={<TestForm />} />
            <Route path="/admin/tests/:id" element={<TestDetail />} />
            <Route path="/admin/tests/:id/edit" element={<TestForm />} />
            <Route path="/admin/results/:testId" element={<Results />} />
            <Route path="/admin/attempt/:id" element={<AttemptView />} />
            <Route path="/admin/students" element={<StudentsList />} />
            <Route path="/admin/groups" element={<Groups />} />
            <Route path="/admin/students/:id" element={<StudentProfile />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['teacher']} />}>
          <Route element={<AppLayout />}>
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/tests" element={<TestsList />} />
            <Route path="/teacher/tests/new" element={<TestForm />} />
            <Route path="/teacher/tests/:id" element={<TestDetail />} />
            <Route path="/teacher/tests/:id/edit" element={<TestForm />} />
            <Route path="/teacher/banks" element={<BanksList />} />
            <Route path="/teacher/banks/:id" element={<BankDetail />} />
            <Route path="/teacher/subjects" element={<Subjects />} />
            <Route path="/teacher/results/:testId" element={<Results />} />
            <Route path="/teacher/attempt/:id" element={<AttemptView />} />
            <Route path="/teacher/students" element={<StudentsList />} />
            <Route path="/teacher/groups" element={<Groups />} />
            <Route path="/teacher/students/:id" element={<StudentProfile />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute roles={['student']} />}>
          <Route path="/student/exam/:id" element={<Exam />} />
          <Route element={<AppLayout />}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/tests" element={<StudentTests />} />
            <Route path="/student/tests/:id" element={<TestIntro />} />
            <Route path="/student/code" element={<JoinByCode />} />
            <Route path="/student/history" element={<History />} />
            <Route path="/student/stats" element={<Stats />} />
            <Route path="/student/mistakes" element={<Mistakes />} />
            <Route path="/student/result/:id" element={<AttemptView />} />
            <Route path="/student/leaderboard/:testId" element={<Leaderboard />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  )
}
