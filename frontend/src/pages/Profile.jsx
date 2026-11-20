import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiCamera } from 'react-icons/fi'
import { useAuth } from '../context/AuthContext'
import { api, errorMessage, fieldErrors } from '../api'
import { Avatar, Badge, Button, Card, Input, PageHead } from '../components/common/ui'
import { ROLE, fileToDataUrl, fmtDate } from '../utils/format'

export default function Profile() {
  const { user, updateProfile } = useAuth()
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name, email: user.email, phone: user.phone })
  const [pw, setPw] = useState({ old_password: '', new_password: '' })
  const [errors, setErrors] = useState({})
  const [pwErrors, setPwErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const save = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      await updateProfile(form)
      toast.success('Profil saqlandi')
    } catch (err) {
      setErrors(fieldErrors(err))
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const changePw = async (e) => {
    e.preventDefault()
    setPwErrors({})
    try {
      await api.changePassword(pw)
      setPw({ old_password: '', new_password: '' })
      toast.success('Parol o\'zgartirildi')
    } catch (err) {
      setPwErrors(fieldErrors(err))
    }
  }

  const pickAvatar = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await updateProfile({ avatar: await fileToDataUrl(file, 256) })
      toast.success('Rasm yangilandi')
    } catch (err) {
      toast.error(err.message)
    }
    e.target.value = ''
  }

  return (
    <div className="stack">
      <PageHead title="Profil" text="Shaxsiy ma'lumotlar va xavfsizlik" />
      <div className="grid cols-2">
        <Card title="Ma'lumotlarim">
          <form className="stack" onSubmit={save}>
            <div className="row">
              <Avatar user={user} size="lg" />
              <div className="stack tight">
                <b style={{ fontSize: '1.05rem' }}>@{user.username}</b>
                <div className="row"><Badge tone="accent">{ROLE[user.role]}</Badge><span className="muted small">{fmtDate(user.created_at)} dan beri</span></div>
                <input ref={fileRef} type="file" accept="image/*" hidden id="avatar-file" onChange={pickAvatar} />
                <Button size="sm" onClick={() => fileRef.current?.click()}><FiCamera /> Rasm yuklash</Button>
              </div>
            </div>
            <div className="form-grid">
              <Input label="Ism" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} error={errors.first_name} />
              <Input label="Familiya" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} error={errors.last_name} />
              <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} error={errors.email} />
              <Input label="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} error={errors.phone} />
            </div>
            <div><Button variant="primary" type="submit" disabled={busy}>Saqlash</Button></div>
          </form>
        </Card>
        <Card title="Parolni o'zgartirish">
          <form className="stack" onSubmit={changePw}>
            <Input label="Eski parol" type="password" autoComplete="current-password" value={pw.old_password}
              onChange={(e) => setPw({ ...pw, old_password: e.target.value })} error={pwErrors.old_password} required />
            <Input label="Yangi parol" type="password" autoComplete="new-password" value={pw.new_password}
              onChange={(e) => setPw({ ...pw, new_password: e.target.value })} error={pwErrors.new_password} help="Kamida 8 ta belgi" required />
            <div><Button variant="primary" type="submit">Parolni yangilash</Button></div>
          </form>
        </Card>
      </div>
    </div>
  )
}
