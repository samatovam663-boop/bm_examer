import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  FiBarChart2, FiBook, FiClock, FiDatabase, FiGrid, FiHome, FiKey, FiLayers, FiLogOut, FiMenu, FiMoon, FiRefreshCw, FiSun, FiUser, FiUserCheck, FiUsers,
} from 'react-icons/fi'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { Avatar, Button } from '../common/ui'
import { ROLE, fullName } from '../../utils/format'
import { FEATURES, IS_DEMO, resetDemo } from '../../api'

const NAV = {
  admin: [
    { to: '/admin', label: 'Bosh sahifa', icon: <FiHome />, end: true },
    { to: '/admin/users', label: 'Foydalanuvchilar', icon: <FiUsers /> },
    { to: '/admin/subjects', label: 'Fanlar', icon: <FiBook /> },
    { to: '/admin/tests', label: 'Testlar monitoringi', icon: <FiLayers /> },
    { to: '/admin/groups', label: 'Guruhlar', icon: <FiUserCheck /> },
    { to: '/admin/students', label: 'O\'quvchilar natijasi', icon: <FiGrid />, feature: 'students' },
  ],
  teacher: [
    { to: '/teacher', label: 'Bosh sahifa', icon: <FiHome />, end: true },
    { to: '/teacher/tests', label: 'Testlarim', icon: <FiLayers /> },
    { to: '/teacher/groups', label: 'Guruhlar', icon: <FiUserCheck /> },
    { to: '/teacher/students', label: 'O\'quvchilarim', icon: <FiUsers />, feature: 'students' },
    { to: '/teacher/banks', label: 'Savol banki', icon: <FiDatabase /> },
    { to: '/teacher/subjects', label: 'Fanlar', icon: <FiBook /> },
  ],
  student: [
    { to: '/student', label: 'Bosh sahifa', icon: <FiHome />, end: true },
    { to: '/student/tests', label: 'Testlar', icon: <FiGrid /> },
    { to: '/student/code', label: 'Kod bilan kirish', icon: <FiKey /> },
    { to: '/student/history', label: 'Natijalarim', icon: <FiClock /> },
    { to: '/student/stats', label: 'Statistika', icon: <FiBarChart2 /> },
    { to: '/student/mistakes', label: 'Xatolarim', icon: <FiRefreshCw />, feature: 'mistakes' },
  ],
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { theme, toggle } = useTheme()
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => { setOpen(false) }, [location.pathname])

  const doLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const reset = () => {
    resetDemo()
    window.location.reload()
  }

  return (
    <div className="shell">
      <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Asosiy menyu">
        <div className="brand"><span className="brand-mark">BM</span> BM_examer</div>
        <div className="nav-section">{ROLE[user.role]}</div>
        {NAV[user.role].filter((item) => item.feature === undefined || FEATURES[item.feature]).map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            {item.icon} {item.label}
          </NavLink>
        ))}
        <div className="nav-section">Hisob</div>
        <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}><FiUser /> Profil</NavLink>
        <div className="sidebar-foot stack tight">
          {IS_DEMO && (
            <div className="notice info small" style={{ flexDirection: 'column', gap: 6 }}>
              <span>Demo rejim: ma'lumotlar faqat shu brauzerda saqlanadi.</span>
              <Button size="sm" onClick={reset}>Demo ma'lumotni tiklash</Button>
            </div>
          )}
          <button className="nav-link" style={{ border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }} onClick={doLogout}>
            <FiLogOut /> Chiqish
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <Button className="menu-btn" icon onClick={() => setOpen(true)} aria-label="Menyuni ochish"><FiMenu /></Button>
          <span className="muted small" style={{ marginLeft: 'auto' }} />
          <div className="row" style={{ gap: 10 }}>
            <Button icon onClick={toggle} aria-label={theme === 'dark' ? 'Yorug\' mavzu' : 'Qorong\'i mavzu'}>
              {theme === 'dark' ? <FiSun /> : <FiMoon />}
            </Button>
            <NavLink to="/profile" className="user-chip" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Avatar user={user} />
              <span className="who">
                <b style={{ display: 'block', lineHeight: 1.2 }}>{fullName(user)}</b>
                <span className="muted small">{ROLE[user.role]}</span>
              </span>
            </NavLink>
          </div>
        </header>
        <Outlet />
      </div>
    </div>
  )
}
