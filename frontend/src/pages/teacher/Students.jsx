import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiArrowLeft, FiAward, FiCheckCircle, FiPercent, FiPlus, FiSearch, FiTarget, FiUsers } from 'react-icons/fi'
import { api, errorMessage } from '../../api'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { useAsync, useDebounced } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Loader, PageHead, Pagination, Stat,
} from '../../components/common/ui'
import { BarList, LineChart } from '../../components/charts/Charts'
import { fmtDate, fmtDateTime, fmtDuration, pctTone } from '../../utils/format'

/** O'qituvchining testlarini yechgan o'quvchilar ro'yxati. */
export function StudentsList() {
  const { user } = useAuth()
  const base = HOME_BY_ROLE[user.role]
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const q = useDebounced(search)
  const { data, loading, error } = useAsync(() => api.myStudents())

  const list = useMemo(() => {
    const s = (data || []).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()) || x.username.toLowerCase().includes(q.toLowerCase()))
    const by = {
      recent: (a, b) => new Date(b.last_at) - new Date(a.last_at),
      low: (a, b) => a.average - b.average,
      high: (a, b) => b.average - a.average,
      blocked: (a, b) => b.blocked - a.blocked,
    }[sort]
    return [...s].sort(by)
  }, [data, q, sort])
  const pg = usePaged(list, 10)

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>
  const weak = (data || []).filter((s) => s.average < 50).length

  return (
    <div className="stack">
      <PageHead title="O'quvchilarim" text="Testlaringizni yechgan o'quvchilar va ularning natijalari" />
      <div className="grid cols-3">
        <Stat icon={<FiUsers />} label="O'quvchilar" value={data.length} />
        <Stat icon={<FiTarget />} label="Past natija (50% dan kam)" value={weak} hint="Ularga alohida e'tibor bering" />
        <Stat icon={<FiAlertTriangle />} label="Bloklangan urinishi bor" value={data.filter((s) => s.blocked > 0).length} />
      </div>
      <div className="toolbar">
        <div className="search">
          <FiSearch />
          <input className="input" aria-label="Qidirish" placeholder="Ism yoki login" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="select" aria-label="Tartib" value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="recent">Oxirgi faollik</option>
          <option value="low">Past natija birinchi</option>
          <option value="high">Yuqori natija birinchi</option>
          <option value="blocked">Bloklanganlar birinchi</option>
        </select>
      </div>
      <Card pad0>
        {list.length === 0 ? <EmptyState title="O'quvchi topilmadi" text="O'quvchilar testingizni yechgach shu yerda ko'rinadi." /> : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>O'quvchi</th><th>Urinishlar</th><th>O'rtacha</th><th>Eng yaxshi</th><th>Oxirgi faollik</th><th>Bloklangan</th><th /></tr></thead>
                <tbody>
                  {pg.items.map((s) => (
                    <tr key={s.id}>
                      <td><div className="cell-user"><Avatar user={s} /><div><b>{s.name}</b><div className="muted small">@{s.username}</div></div></div></td>
                      <td className="num">{s.attempts}</td>
                      <td><Badge tone={pctTone(s.average)}>{s.average}%</Badge></td>
                      <td className="num">{s.best}%</td>
                      <td className="muted small">{fmtDate(s.last_at)}</td>
                      <td>{s.blocked ? <Badge tone="bad"><FiAlertTriangle /> {s.blocked}</Badge> : <span className="muted">0</span>}</td>
                      <td><div className="actions"><Button size="sm" onClick={() => navigate(`${base}/students/${s.id}`)}>Profil</Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
          </>
        )}
      </Card>
    </div>
  )
}

/** Bitta o'quvchining rivojlanishi: natijalar dinamikasi, zaif mavzular, urinishlar. */
export function StudentProfile() {
  const { id } = useParams()
  const { user } = useAuth()
  const base = HOME_BY_ROLE[user.role]
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(() => api.studentProfile(id), [id])
  const [grant, setGrant] = useState(null)
  const pg = usePaged(data ? [...data.attempts].reverse() : [], 8)

  if (loading && !data) return <Loader />
  if (error) return <div className="notice bad">{error}</div>
  const { student, attempts, topics, extras } = data
  const name = `${student.first_name} ${student.last_name}`.trim() || student.username
  const pct = attempts.map((a) => a.percentage)
  const avg = pct.length ? pct.reduce((a, b) => a + b, 0) / pct.length : 0
  const blocked = attempts.filter((a) => a.violation).length
  const line = attempts.slice(-14).map((a) => ({
    label: new Date(a.finished_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.'),
    value: a.percentage, hint: `${a.test_title}: ${a.percentage}% (${fmtDateTime(a.finished_at)})`,
  }))
  const weak = topics.find((t) => t.total >= 2 && t.percent < 60)

  const giveAttempt = async () => {
    try {
      await api.grantAttempt(grant.test, student.id)
      toast.success('Qo\'shimcha urinish berildi')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setGrant(null)
  }

  return (
    <div className="stack">
      <PageHead title={name} text={`@${student.username} · ${student.email}${student.phone ? ` · ${student.phone}` : ''}`}
        actions={<Button onClick={() => navigate(`${base}/students`)}><FiArrowLeft /> O'quvchilar</Button>} />

      <div className="grid cols-4">
        <Stat icon={<FiCheckCircle />} label="Yakunlangan urinishlar" value={attempts.length} />
        <Stat icon={<FiPercent />} label="O'rtacha natija" value={`${Math.round(avg * 10) / 10}%`} />
        <Stat icon={<FiAward />} label="Eng yaxshi" value={`${pct.length ? Math.max(...pct) : 0}%`} />
        <Stat icon={<FiAlertTriangle />} label="Bloklangan urinishlar" value={blocked} hint={blocked ? 'Boshqa oynaga o\'tgan' : 'Yo\'q'} />
      </div>

      {weak && (
        <div className="notice"><FiTarget /><span>Eng zaif mavzu: <b>{weak.name}</b> ({weak.percent}% to'g'ri). Ota-ona yoki o'quvchi bilan suhbatda shu mavzuga e'tibor bering.</span></div>
      )}

      <Card title="Natijalar dinamikasi (%)">
        {line.length < 2 ? <p className="muted">Dinamika uchun kamida 2 ta urinish kerak.</p> : <LineChart items={line} avg={avg} threshold={70} colorize valueLabels />}
      </Card>

      <div className="grid cols-2">
        <Card title="Mavzular bo'yicha (zaifi birinchi)">
          {topics.length ? <BarList items={topics.map((t) => ({ label: `${t.name} (${t.total})`, value: t.percent, tone: pctTone(t.percent) }))} /> : <p className="muted">Ma'lumot yo'q.</p>}
        </Card>
        <Card title="Qo'shimcha urinishlar">
          {Object.keys(extras).length === 0 ? <p className="muted">Bu o'quvchiga qo'shimcha urinish berilmagan.</p> : (
            <div className="stack tight">
              {Object.entries(extras).map(([testId, n]) => {
                const t = attempts.find((a) => a.test === Number(testId))
                return <div key={testId} className="row between"><span>{t?.test_title || `Test #${testId}`}</span><Badge tone="accent">+{n}</Badge></div>
              })}
            </div>
          )}
        </Card>
      </div>

      <Card title="Urinishlar" pad0>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Test</th><th>Urinish</th><th>Foiz</th><th>To'g'ri</th><th>Vaqt</th><th>Sana</th><th /></tr></thead>
            <tbody>
              {pg.items.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.test_title}</b><div className="muted small">{a.subject_name || 'Fansiz'}</div></td>
                  <td className="num">#{a.attempt_number}</td>
                  <td><div className="row" style={{ gap: 6 }}><Badge tone={pctTone(a.percentage)}>{a.percentage}%</Badge>{a.violation && <Badge tone="bad">Bloklangan</Badge>}</div></td>
                  <td className="num">{a.correct_answers}/{a.total_questions}</td>
                  <td className="num muted">{fmtDuration(a.duration_seconds)}</td>
                  <td className="muted small">{fmtDateTime(a.finished_at)}</td>
                  <td>
                    <div className="actions">
                      <Button size="sm" onClick={() => navigate(`${base}/attempt/${a.id}`)}>Tahlil</Button>
                      <Button size="sm" variant={a.violation ? 'primary' : 'ghost'} onClick={() => setGrant(a)}><FiPlus /> Urinish</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
      </Card>

      {grant && (
        <ConfirmDialog title="Qo'shimcha urinish berish" confirmLabel="Urinish berish" onClose={() => setGrant(null)} onConfirm={giveAttempt}
          text={`${name} uchun "${grant.test_title}" testida urinishlar limiti 1 taga oshiriladi.`} />
      )}
    </div>
  )
}
