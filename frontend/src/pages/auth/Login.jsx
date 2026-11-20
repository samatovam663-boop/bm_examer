import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { errorMessage, IS_DEMO } from '../../api'
import { Button, Input } from '../../components/common/ui'

const DEMO = [
  { label: 'Admin', sub: 'admin', username: 'admin' },
  { label: 'O\'qituvchi', sub: 'nilufar', username: 'nilufar' },
  { label: 'O\'quvchi', sub: 'aziz', username: 'aziz' },
]

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />

  const submit = async (username, password) => {
    setBusy(true)
    setError('')
    try {
      const u = await login(username, password)
      toast.success(`Xush kelibsiz, ${u.first_name || u.username}!`)
      navigate(HOME_BY_ROLE[u.role], { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">BM</span> BM_examer</div>
        <div>
          <h1>Tizimga kirish</h1>
          <p className="muted">Testlarni yarating, yeching va natijalarni kuzating.</p>
        </div>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); submit(form.username, form.password) }}>
          <Input label="Login" value={form.username} autoComplete="username" required
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <Input label="Parol" type="password" value={form.password} autoComplete="current-password" required
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          {error && <div className="notice bad" role="alert">{error}</div>}
          <Button variant="primary" type="submit" block disabled={busy}>{busy ? 'Kirilmoqda…' : 'Kirish'}</Button>
        </form>
        {IS_DEMO && (
          <div className="demo-box">
            <span className="small muted">Demo: rolni tanlang (parol: <b className="mono">demo1234</b>)</span>
            <div className="demo-grid">
              {DEMO.map((d) => (
                <Button key={d.username} disabled={busy} onClick={() => submit(d.username, 'demo1234')}>
                  <b>{d.label}</b><span className="muted mono">{d.sub}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        <p className="small muted">Hisobingiz yo'qmi? <Link to="/register">Ro'yxatdan o'ting</Link></p>
      </div>
    </div>
  )
}
