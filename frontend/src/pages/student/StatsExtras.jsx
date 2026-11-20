import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiAward, FiCalendar, FiCheckCircle, FiEdit2, FiFlag, FiLayers, FiLock, FiPlus, FiRefreshCw, FiStar, FiTrash2, FiTrendingUp, FiZap,
} from 'react-icons/fi'
import { api, errorMessage, fieldErrors } from '../../api'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Modal, Progress, Select } from '../../components/common/ui'
import { BarList } from '../../components/charts/Charts'
import { QTYPE, DIFFICULTY, pctTone } from '../../utils/format'

const DAY = 864e5
const MONTHS = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyun', 'Iyul', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek']
const dayKey = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/** Ketma-ket faol kunlar: joriy (bugun yoki kecha tugagan bo'lsa) va eng uzun. */
export function streaks(attempts) {
  const days = [...new Set(attempts.map((a) => dayKey(a.finished_at)))].sort()
  let longest = 0
  let run = 0
  let prev = null
  days.forEach((k) => {
    const t = new Date(`${k}T00:00:00`).getTime()
    run = prev !== null && Math.round((t - prev) / DAY) === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
    prev = t
  })
  let current = 0
  const daySet = new Set(days)
  let cursor = new Date()
  if (!daySet.has(dayKey(cursor))) cursor = new Date(cursor.getTime() - DAY)
  while (daySet.has(dayKey(cursor))) {
    current += 1
    cursor = new Date(cursor.getTime() - DAY)
  }
  return { current, longest, activeDays: days.length }
}

// ---------- mavzular va savol turlari ----------

export function TopicAnalysis({ analytics }) {
  const navigate = useNavigate()
  if (!analytics) return null
  const { topics, types, levels, attempts_used: used, hidden_tests: hidden } = analytics
  const sorted = [...topics].sort((a, b) => a.percent - b.percent)
  const toItems = (list, nameOf) => list.map((x) => ({ label: `${nameOf(x.name)} (${x.total})`, value: x.percent, tone: pctTone(x.percent) }))
  const weakest = sorted.find((t) => t.total >= 2 && t.percent < 70)

  return (
    <Card title="Mavzular va savol turlari bo'yicha"
      actions={<Button size="sm" onClick={() => navigate('/student/mistakes')}><FiRefreshCw /> Xatolar ustida ishlash</Button>}>
      {used === 0 ? (
        <EmptyState icon={<FiLayers />} title="Tahlil uchun ma'lumot yo'q"
          text={hidden ? 'Yechgan testlaringizda o\'qituvchi javoblar tahlilini yashirgan.' : 'Natijalari batafsil ko\'rsatiladigan testni yeching.'} />
      ) : (
        <div className="stack">
          {weakest && (
            <div className="notice"><FiFlag /><span>Eng zaif mavzu: <b>{weakest.name}</b> ({weakest.percent}%). Shu mavzu savollarini "Xatolarim" bo'limida mashq qiling.</span></div>
          )}
          <div className="grid cols-2">
            <div className="stack tight">
              <span className="label">Mavzular (zaifi birinchi)</span>
              <BarList items={toItems(sorted, (n) => n)} />
            </div>
            <div className="stack">
              <div className="stack tight">
                <span className="label">Savol turlari</span>
                <BarList items={toItems(types, (n) => QTYPE[n] || n)} />
              </div>
              <div className="stack tight">
                <span className="label">Qiyinlik darajasi</span>
                <BarList items={toItems(['easy', 'medium', 'hard'].map((k) => levels.find((l) => l.name === k)).filter(Boolean), (n) => DIFFICULTY[n] || n)} />
              </div>
            </div>
          </div>
          <p className="muted small">
            {used} ta urinish asosida.{hidden ? ` ${hidden} ta test hisobga olinmadi: o'qituvchi ularda javoblar tahlilini yashirgan.` : ''}
          </p>
        </div>
      )}
    </Card>
  )
}

// ---------- maqsadlar ----------

export function currentFor(goal, attempts) {
  const rel = attempts.filter((a) => goal.subject == null || a.subject === goal.subject)
    .sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at))
  const last = rel.slice(-5)
  return { value: last.length ? Math.round(mean(last.map((a) => a.percentage)) * 10) / 10 : null, count: rel.length }
}

function GoalForm({ goal, subjects, onClose, onSaved }) {
  const [form, setForm] = useState({ id: goal?.id, subject: goal?.subject ?? '', target: goal?.target ?? 85, deadline: goal?.deadline || '' })
  const [errors, setErrors] = useState({})
  const save = async () => {
    try {
      await api.saveGoal({ ...form, target: Number(form.target) })
      toast.success('Maqsad saqlandi')
      onSaved()
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (!Object.keys(fe).length) toast.error(errorMessage(err))
    }
  }
  return (
    <Modal title={goal ? 'Maqsadni tahrirlash' : 'Yangi maqsad'} onClose={onClose}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save}>Saqlash</Button></>}>
      <Select label="Qaysi fan bo'yicha" value={form.subject} error={errors.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
        <option value="">Umumiy (barcha fanlar)</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
      <Input label="Maqsad: o'rtacha natija (%)" type="number" min="1" max="100" value={form.target} error={errors.target}
        help="So'nggi 5 ta urinishning o'rtachasi shu darajaga yetsa, maqsad bajarilgan hisoblanadi."
        onChange={(e) => setForm({ ...form, target: e.target.value })} />
      <Input label="Muddat (ixtiyoriy)" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
    </Modal>
  )
}

export function GoalsCard({ goals, attempts, subjects, onChanged }) {
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const subjectName = (id) => (id == null ? 'Umumiy' : subjects.find((s) => s.id === id)?.name || 'Fan')

  const remove = async () => {
    try {
      await api.deleteGoal(del.id)
      toast.success('Maqsad o\'chirildi')
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setDel(null)
  }

  return (
    <Card title="Maqsadlarim" actions={<Button size="sm" variant="primary" onClick={() => setEdit({})}><FiPlus /> Maqsad qo'yish</Button>}>
      {goals.length === 0 ? (
        <EmptyState icon={<FiFlag />} title="Hali maqsad qo'ymagansiz"
          text="Masalan: Matematikadan o'rtacha 85% ga chiqish. Progress shu yerda ko'rinib turadi." />
      ) : (
        <div className="stack">
          {goals.map((g) => {
            const cur = currentFor(g, attempts)
            const done = cur.value != null && cur.value >= g.target
            const left = g.deadline ? Math.ceil((new Date(`${g.deadline}T23:59:59`) - Date.now()) / DAY) : null
            const pct = cur.value == null ? 0 : Math.min(100, (cur.value / g.target) * 100)
            return (
              <div className="q-item" key={g.id}>
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 8 }}>
                      <b>{subjectName(g.subject)}: {g.target}%</b>
                      {done ? <Badge tone="good"><FiCheckCircle /> Erishildi</Badge>
                        : left != null && left < 0 ? <Badge tone="bad">Muddat o'tdi</Badge>
                          : left != null ? <Badge tone={left <= 7 ? 'warn' : ''}>{left} kun qoldi</Badge> : null}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Button size="sm" icon aria-label="Tahrirlash" onClick={() => setEdit(g)}><FiEdit2 /></Button>
                    <Button size="sm" icon variant="danger" aria-label="O'chirish" onClick={() => setDel(g)}><FiTrash2 /></Button>
                  </div>
                </div>
                <Progress value={pct} tone={done ? 'good' : ''} />
                <span className="muted small">
                  {cur.value == null ? 'Bu fan bo\'yicha hali urinish yo\'q.'
                    : done ? `Hozirgi o'rtacha ${cur.value}%: maqsad bajarildi!`
                      : `Hozirgi o'rtacha ${cur.value}% (so'nggi ${Math.min(5, cur.count)} ta urinish). Yana ${Math.round((g.target - cur.value) * 10) / 10}% kerak.`}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {edit && <GoalForm goal={edit.id ? edit : null} subjects={subjects} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); onChanged() }} />}
      {del && <ConfirmDialog title="Maqsadni o'chirish" confirmLabel="O'chirish" danger onClose={() => setDel(null)} onConfirm={remove}
        text={`"${subjectName(del.subject)}: ${del.target}%" maqsadi o'chiriladi.`} />}
    </Card>
  )
}

// ---------- yutuqlar ----------

export function AchievementsCard({ attempts, goals, subjects }) {
  const list = useMemo(() => {
    const asc = [...attempts].sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at))
    const n = asc.length
    const st = streaks(asc)
    let run = 0, bestRun = 0
    asc.forEach((a) => { run = a.percentage >= 70 ? run + 1 : 0; bestRun = Math.max(bestRun, run) })
    const subjectsUsed = new Set(asc.filter((a) => a.subject != null).map((a) => a.subject)).size
    const fast = asc.some((a) => a.percentage >= 80 && a.duration_seconds != null && a.test_duration_minutes && a.duration_seconds <= a.test_duration_minutes * 30)
    const goalsDone = goals.filter((g) => {
      const c = currentFor(g, asc)
      return c.value != null && c.value >= g.target
    }).length
    const row = (id, icon, title, text, have, need) => ({ id, icon, title, text, earned: have >= need, progress: `${Math.min(have, need)}/${need}` })
    return [
      row('first', <FiStar />, 'Birinchi qadam', 'Birinchi testni yakunlang', n, 1),
      row('ten', <FiLayers />, 'Tajribali', '10 ta urinishni yakunlang', n, 10),
      row('perfect', <FiAward />, 'A\'lochi', 'Testdan 100% oling', asc.some((a) => a.percentage >= 100) ? 1 : 0, 1),
      row('steady', <FiTrendingUp />, 'Barqaror', 'Ketma-ket 3 marta 70% va undan yuqori', bestRun, 3),
      row('fast', <FiZap />, 'Tezkor', 'Vaqtning yarmida 80% dan yuqori natija', fast ? 1 : 0, 1),
      row('subjects', <FiLayers />, 'Ko\'p qirrali', '3 xil fandan test yeching', subjectsUsed, 3),
      row('habit', <FiCalendar />, 'Kunlik odat', 'Ketma-ket 3 kun test yeching', st.longest, 3),
      row('goal', <FiFlag />, 'Maqsadli', 'Qo\'ygan maqsadingizga erishing', goalsDone, 1),
    ]
  }, [attempts, goals, subjects])

  const earned = list.filter((a) => a.earned).length
  return (
    <Card title="Yutuqlar" actions={<Badge tone="accent">{earned} / {list.length}</Badge>}>
      <div className="grid cols-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
        {list.map((a) => (
          <div key={a.id} className="card flat" style={{ padding: 14, opacity: a.earned ? 1 : 0.62, display: 'flex', gap: 12, alignItems: 'flex-start' }}
            title={a.earned ? 'Qo\'lga kiritildi' : `Jarayon: ${a.progress}`}>
            <span className="stat-icon" style={a.earned ? { background: 'var(--grad)', color: '#fff' } : undefined}>{a.earned ? a.icon : <FiLock />}</span>
            <div style={{ minWidth: 0 }}>
              <b style={{ display: 'block' }}>{a.title}</b>
              <span className="muted small">{a.text}</span>
              {!a.earned && <div className="small" style={{ color: 'var(--accent)', marginTop: 4 }}>{a.progress}</div>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ---------- faollik kalendari ----------

export function ActivityCalendar({ attempts }) {
  const st = useMemo(() => streaks(attempts), [attempts])
  const WEEKS = 17
  const cell = 20
  const gap = 5
  const { cells, months } = useMemo(() => {
    const counts = {}
    attempts.forEach((a) => { const k = dayKey(a.finished_at); counts[k] = (counts[k] || 0) + 1 })
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const weekday = (today.getDay() + 6) % 7 // dushanba = 0
    const start = new Date(today.getTime() - (WEEKS * 7 - 1 - (6 - weekday)) * DAY)
    const out = []
    const mon = []
    for (let w = 0; w < WEEKS; w++) {
      for (let d = 0; d < 7; d++) {
        const date = new Date(start.getTime() + (w * 7 + d) * DAY)
        if (date > today) continue
        out.push({ w, d, key: dayKey(date), n: counts[dayKey(date)] || 0, date })
        if (d === 0 && (date.getDate() <= 7)) mon.push({ w, label: MONTHS[date.getMonth()] })
      }
    }
    return { cells: out, months: mon }
  }, [attempts])

  const W = WEEKS * (cell + gap) + 28
  const H = 7 * (cell + gap) + 22
  const dayNames = ['Du', '', 'Ch', '', 'Ju', '', 'Ya']
  const opacity = (n) => (n === 0 ? 0 : n === 1 ? 0.4 : n === 2 ? 0.7 : 1)

  return (
    <Card title="Faollik kalendari" actions={(
      <div className="row" style={{ gap: 10 }}>
        <Badge tone={st.current ? 'good' : ''}><FiZap /> {st.current} kunlik seriya</Badge>
        <span className="muted small">Eng uzun: {st.longest} kun · Faol kunlar: {st.activeDays}</span>
      </div>
    )}>
      <div style={{ overflowX: 'auto' }}>
        <svg className="chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }} role="img"
          aria-label={`Oxirgi ${WEEKS} haftadagi faollik. Joriy seriya ${st.current} kun.`}>
          {dayNames.map((n, i) => n && <text key={i} x={0} y={22 + i * (cell + gap) + cell - 3} style={{ fontSize: 10 }}>{n}</text>)}
          {months.map((m) => <text key={m.w} x={28 + m.w * (cell + gap)} y={10} style={{ fontSize: 10 }}>{m.label}</text>)}
          {cells.map((c) => (
            <g key={c.key}>
              <rect x={28 + c.w * (cell + gap)} y={18 + c.d * (cell + gap)} width={cell} height={cell} rx="4" fill="var(--card-2)" stroke="var(--border)" strokeWidth="0.5" />
              {c.n > 0 && <rect x={28 + c.w * (cell + gap)} y={18 + c.d * (cell + gap)} width={cell} height={cell} rx="4" fill="var(--chart-1)" opacity={opacity(c.n)}>
                <title>{`${c.key}: ${c.n} ta urinish`}</title>
              </rect>}
              {c.n === 0 && <title>{`${c.key}: faollik yo'q`}</title>}
            </g>
          ))}
        </svg>
      </div>
      <div className="legend" style={{ marginTop: 8 }}>
        <span>Kam</span>
        {[0, 1, 2, 3].map((n) => <i key={n} style={{ background: n ? 'var(--chart-1)' : 'var(--card-2)', opacity: n ? opacity(n) : 1, border: '1px solid var(--border)', borderRadius: 3 }} />)}
        <span>Ko'p</span>
      </div>
    </Card>
  )
}
