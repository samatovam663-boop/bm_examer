import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { errorMessage, fieldErrors } from '../../api'
import { Button, Input, Select } from '../../components/common/ui'

export default function Register() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', email: '', password: '', role: 'student' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const u = await register(form)
      toast.success('Hisob yaratildi')
      navigate(HOME_BY_ROLE[u.role], { replace: true })
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(Object.keys(fe).length ? fe : { form: errorMessage(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card" style={{ width: 'min(100%, 520px)' }}>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark">BM</span> BM_examer</div>
        <div>
          <h1>Ro'yxatdan o'tish</h1>
          <p className="muted">Admin hisobi faqat administrator tomonidan beriladi.</p>
        </div>
        <form className="stack" onSubmit={submit}>
          <div className="form-grid">
            <Input label="Ism" value={form.first_name} onChange={set('first_name')} error={errors.first_name} />
            <Input label="Familiya" value={form.last_name} onChange={set('last_name')} error={errors.last_name} />
          </div>
          <div className="form-grid">
            <Input label="Login" value={form.username} onChange={set('username')} error={errors.username} required autoComplete="username" />
            <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} required />
          </div>
          <div className="form-grid">
            <Input label="Parol" type="password" value={form.password} onChange={set('password')} error={errors.password}
              help="Kamida 8 ta belgi" required autoComplete="new-password" />
            <Select label="Rol" value={form.role} onChange={set('role')} error={errors.role}>
              <option value="student">O'quvchi</option>
              <option value="teacher">O'qituvchi</option>
            </Select>
          </div>
          {errors.form && <div className="notice bad" role="alert">{errors.form}</div>}
          <Button variant="primary" type="submit" block disabled={busy}>{busy ? 'Yaratilmoqda…' : 'Hisob yaratish'}</Button>
        </form>
        <p className="small muted">Hisobingiz bormi? <Link to="/login">Kirish</Link></p>
      </div>
    </div>
  )
}
