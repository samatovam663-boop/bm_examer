import { Navigate, Outlet } from 'react-router-dom'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { Loader } from '../common/ui'

/** Kirmagan foydalanuvchi -> /login; noto'g'ri rol -> o'z bosh sahifasi. */
export default function ProtectedRoute({ roles }) {
  const { user, loading } = useAuth()
  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />
  return <Outlet />
}
