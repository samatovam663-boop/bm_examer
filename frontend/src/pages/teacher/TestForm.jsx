import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { api, errorMessage, fieldErrors } from '../../api'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { Button, Card, Checkbox, Input, Loader, PageHead, Select, Textarea } from '../../components/common/ui'
import { DIFFICULTY, SHOW } from '../../utils/format'

const EMPTY = {
  title: '', description: '', subject: '', duration_minutes: 30, difficulty: 'medium', max_attempts: 1,
  show_results: 'score_only', shuffle_questions: false, shuffle_choices: false,
  groups: [], starts_at: '', ends_at: '',
}

// <input type="datetime-local"> mahalliy vaqt qiymati bilan ishlaydi; serverda ISO (UTC)
const isoToLocal = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const localToIso = (v) => (v ? new Date(v).toISOString() : null)

export default function TestForm() {
  const { id } = useParams()
  const { user } = useAuth()
  const base = HOME_BY_ROLE[user.role]
  const navigate = useNavigate()
  const subjects = useAsync(() => api.listSubjects())
  const groups = useAsync(() => api.listGroups())
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(!!id)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    api.getTest(id).then((t) => setForm({ ...t, subject: t.subject ?? '', groups: t.groups || [], starts_at: isoToLocal(t.starts_at), ends_at: isoToLocal(t.ends_at) })).catch((e) => toast.error(errorMessage(e))).finally(() => setLoading(false))
  }, [id])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const toggle = (k) => (e) => setForm({ ...form, [k]: e.target.checked })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const t = await api.saveTest({
        ...form, id: id ? Number(id) : undefined, starts_at: localToIso(form.starts_at), ends_at: localToIso(form.ends_at),
      })
      toast.success(id ? 'Test saqlandi' : 'Test yaratildi. Endi savollar qo\'shing.')
      navigate(`${base}/tests/${t.id}`)
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (!Object.keys(fe).length) toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Loader />

  return (
    <form className="stack" onSubmit={submit} style={{ maxWidth: 860 }}>
      <PageHead title={id ? 'Testni tahrirlash' : 'Yangi test'} text="Test kodi saqlangach avtomatik yaratiladi" />
      <Card title="Asosiy ma'lumotlar">
        <div className="stack">
          <Input label="Test nomi" value={form.title} onChange={set('title')} error={errors.title} required autoFocus />
          <Textarea label="Tavsif" value={form.description} onChange={set('description')} />
          <div className="form-grid">
            <Select label="Fan" value={form.subject} onChange={set('subject')}>
              <option value="">Fan tanlanmagan</option>
              {(subjects.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <Select label="Qiyinlik" value={form.difficulty} onChange={set('difficulty')}>
              {Object.entries(DIFFICULTY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input label="Davomiyligi (daqiqa)" type="number" min="1" value={form.duration_minutes} onChange={set('duration_minutes')} error={errors.duration_minutes} />
            <Input label="Urinishlar soni" type="number" min="0" value={form.max_attempts} onChange={set('max_attempts')} help="0 = cheksiz" />
          </div>
        </div>
      </Card>
      <Card title="Kimlar yecha oladi">
        <div className="stack">
          {(groups.data || []).length === 0 ? (
            <p className="muted small">Guruh tanlanmasa, test barcha o'quvchilarga ko'rinadi. Faqat ma'lum sinfga bermoqchi bo'lsangiz, avval "Guruhlar" bo'limida guruh yarating.</p>
          ) : (
            <>
              <div className="row" style={{ gap: 18 }}>
                {groups.data.map((g) => (
                  <Checkbox key={g.id} label={`${g.name} (${g.student_count})`} checked={form.groups.includes(g.id)}
                    onChange={(e) => setForm({ ...form, groups: e.target.checked ? [...form.groups, g.id] : form.groups.filter((x) => x !== g.id) })} />
                ))}
              </div>
              {errors.groups && <span className="err" style={{ color: 'var(--bad)', fontSize: '0.82rem' }}>{errors.groups}</span>}
              <p className="muted small">{form.groups.length ? 'Test faqat tanlangan guruh(lar) o\'quvchilariga ko\'rinadi.' : 'Guruh tanlanmagan: test barcha o\'quvchilarga ko\'rinadi.'}</p>
            </>
          )}
        </div>
      </Card>

      <Card title="Vaqt jadvali (ixtiyoriy)">
        <div className="stack">
          <div className="form-grid">
            <Input label="Boshlanish vaqti" type="datetime-local" value={form.starts_at} onChange={set('starts_at')} error={errors.starts_at}
              help="Shu vaqtda qoralama test o'zi aktivlashadi (savollari bo'lsa)." />
            <Input label="Tugash vaqti" type="datetime-local" value={form.ends_at} onChange={set('ends_at')} error={errors.ends_at}
              help="Shu vaqtda test o'zi yopiladi, davom etayotgan urinishlar baholanadi." />
          </div>
          <p className="muted small">Bo'sh qoldirsangiz, testni aktivlashtirish va yakunlashni o'zingiz qo'lda qilasiz. O'quvchining vaqti tugash vaqtidan oshmaydi.</p>
        </div>
      </Card>

      <Card title="Natija va xavfsizlik">
        <div className="stack">
          <Select label="O'quvchiga natija qanday ko'rsatiladi" value={form.show_results} onChange={set('show_results')}>
            {Object.entries(SHOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Checkbox label="Savollar tartibini aralashtirish" checked={form.shuffle_questions} onChange={toggle('shuffle_questions')} />
          <Checkbox label="Variantlar tartibini aralashtirish" checked={form.shuffle_choices} onChange={toggle('shuffle_choices')} />
          <p className="muted small">Aralashtirish har bir o'quvchi uchun alohida bo'ladi, sahifa yangilansa tartib o'zgarmaydi.</p>
        </div>
      </Card>
      <div className="row">
        <Button variant="primary" type="submit" disabled={busy}>{busy ? 'Saqlanmoqda…' : 'Saqlash'}</Button>
        <Button onClick={() => navigate(-1)}>Bekor qilish</Button>
      </div>
    </form>
  )
}
