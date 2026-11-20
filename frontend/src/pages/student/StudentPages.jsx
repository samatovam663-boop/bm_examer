import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiArrowLeft, FiAward, FiCheckCircle, FiClock, FiHelpCircle, FiKey, FiPercent, FiPlay, FiRepeat, FiSearch, FiTrendingUp,
} from 'react-icons/fi'
import { api, errorMessage } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useAsync, useDebounced } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Badge, Button, Card, EmptyState, Input, Loader, PageHead, Pager, Pagination, Stat } from '../../components/common/ui'
import { LineChart } from '../../components/charts/Charts'
import { DIFFICULTY, SHOW, fmtDateTime, fmtDuration, pctTone } from '../../utils/format'

const TESTS_PER_PAGE = 6

function TestCard({ t }) {
  const navigate = useNavigate()
  const allowed = t.attempts_allowed ?? t.max_attempts // o'qituvchi qo'shimcha urinish bergan bo'lishi mumkin
  const left = allowed ? Math.max(0, allowed - (t.my_attempts || 0)) : null
  const blocked = left === 0
  return (
    <Card className="test-card">
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <Badge tone="accent">{t.subject_name || 'Fansiz'}</Badge>
        <Badge>{DIFFICULTY[t.difficulty]}</Badge>
      </div>
      <div className="grow">
        <h3>{t.title}</h3>
        <p className="muted small" style={{ marginTop: 4 }}>{t.description || t.created_by_name}</p>
      </div>
      <div className="meta">
        <span><FiHelpCircle /> {t.questions_count} savol</span>
        <span><FiClock /> {t.duration_minutes} daq</span>
        <span><FiRepeat /> {left === null ? 'Cheksiz' : `${left} ta qoldi`}</span>
        {t.ends_at && <span style={{ color: 'var(--warn)' }}><FiClock /> {fmtDateTime(t.ends_at)} gacha</span>}
      </div>
      <Button variant={blocked ? '' : 'primary'} disabled={blocked} onClick={() => navigate(`/student/tests/${t.id}`)}>
        {blocked ? 'Urinishlar tugagan' : <><FiPlay /> Boshlash</>}
      </Button>
    </Card>
  )
}

export function StudentDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const tests = useAsync(() => api.listTests({ page_size: 4 }))
  const results = useAsync(() => api.myResults())

  if (tests.loading || results.loading) return <Loader />
  const list = results.data?.results || []
  const avg = list.length ? Math.round(list.reduce((s, a) => s + a.percentage, 0) / list.length) : 0
  const best = list.length ? Math.max(...list.map((a) => a.percentage)) : 0

  return (
    <div className="stack">
      <PageHead title={`Salom, ${user.first_name || user.username}`} text="Mavjud testlar va so'nggi natijalaringiz"
        actions={<Button onClick={() => navigate('/student/code')}><FiKey /> Kod bilan kirish</Button>} />
      <div className="grid cols-4">
        <Stat icon={<FiCheckCircle />} label="Yechilgan testlar" value={list.length} />
        <Stat icon={<FiPercent />} label="O'rtacha natija" value={`${avg}%`} />
        <Stat icon={<FiTrendingUp />} label="Eng yaxshi natija" value={`${best}%`} />
        <Stat icon={<FiPlay />} label="Faol testlar" value={tests.data?.count ?? 0} />
      </div>
      <Card title="Yangi testlar" actions={<Button size="sm" onClick={() => navigate('/student/tests')}>Hammasi</Button>}>
        {tests.data?.results.length ? (
          <div className="grid cols-2">{tests.data.results.map((t) => <TestCard key={t.id} t={t} />)}</div>
        ) : <EmptyState title="Faol testlar yo'q" text="O'qituvchi test aktivlashtirganda shu yerda paydo bo'ladi." />}
      </Card>
      <Card title="So'nggi natijalar">
        {list.length === 0 ? <EmptyState title="Hali test yechmagansiz" /> : list.slice(0, 5).map((a) => (
          <div className="list-row" key={a.id}>
            <div className="grow"><b>{a.test_title}</b><div className="muted small">{fmtDateTime(a.finished_at)}</div></div>
            <Badge tone={pctTone(a.percentage)}>{a.percentage}%</Badge>
            <Button size="sm" onClick={() => navigate(`/student/result/${a.id}`)}>Ko'rish</Button>
          </div>
        ))}
      </Card>
    </div>
  )
}

export function StudentTests() {
  const [search, setSearch] = useState('')
  const [subject, setSubject] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search)
  const subjects = useAsync(() => api.listSubjects())
  const { data, loading, error } = useAsync(
    () => api.listTests({ search: q, subject, page, page_size: TESTS_PER_PAGE }), [q, subject, page])

  return (
    <div className="stack">
      <PageHead title="Testlar" text="Faol testlardan birini tanlang" />
      <div className="toolbar">
        <div className="search">
          <FiSearch />
          <input className="input" aria-label="Qidirish" placeholder="Test nomi yoki kodi" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="select" aria-label="Fan" value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1) }}>
          <option value="">Barcha fanlar</option>
          {(subjects.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {loading && !data ? <Loader /> : error ? <div className="notice bad">{error}</div> : data.results.length === 0 ? (
        <Card><EmptyState title="Test topilmadi" text="Boshqa fanni tanlang yoki test kodi bilan kiring." /></Card>
      ) : (
        <>
          <div className="grid cols-3">{data.results.map((t) => <TestCard key={t.id} t={t} />)}</div>
          <Pager page={page} pageSize={TESTS_PER_PAGE} count={data.count} onChange={setPage} />
        </>
      )}
    </div>
  )
}

export function JoinByCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const t = await api.testByCode(code)
      navigate(`/student/tests/${t.id}`)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <PageHead title="Kod bilan kirish" text="O'qituvchi bergan test kodini kiriting" />
      <Card>
        <form className="stack" onSubmit={submit}>
          <Input label="Test kodi" placeholder="BM-A1B2C3" value={code} className="mono" error={error} autoFocus
            onChange={(e) => setCode(e.target.value.toUpperCase())} />
          <Button variant="primary" type="submit" disabled={!code.trim() || busy}><FiKey /> Testni topish</Button>
        </form>
        <p className="muted small" style={{ marginTop: 12 }}>Demo uchun kodlar: <span className="mono">BM-K7Q2XA</span>, <span className="mono">BM-F8V4LR</span>, <span className="mono">BM-P2Y6HN</span></p>
      </Card>
    </div>
  )
}

export function TestIntro() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: t, loading, error } = useAsync(() => api.getTest(id), [id])
  const [busy, setBusy] = useState(false)

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>
  const allowed = t.attempts_allowed ?? t.max_attempts
  const left = allowed ? Math.max(0, allowed - (t.my_attempts || 0)) : null

  const start = () => {
    setBusy(true)
    navigate(`/student/exam/${t.id}`)
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <PageHead title={t.title} text={t.description} actions={<Button onClick={() => navigate('/student/tests')}><FiArrowLeft /> Orqaga</Button>} />
      <Card>
        <div className="grid cols-3">
          <div><div className="muted small">Savollar</div><b className="num" style={{ fontSize: '1.4rem' }}>{t.questions_count}</b></div>
          <div><div className="muted small">Davomiyligi</div><b className="num" style={{ fontSize: '1.4rem' }}>{t.duration_minutes} daq</b></div>
          <div><div className="muted small">Urinishlar</div><b className="num" style={{ fontSize: '1.4rem' }}>{left === null ? 'Cheksiz' : `${left} ta qoldi`}</b></div>
        </div>
        <hr className="divider" style={{ margin: '18px 0' }} />
        <ul className="stack tight muted" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Vaqt boshlangach to'xtatib bo'lmaydi, tugagach test avtomatik yakunlanadi.</li>
          <li>Javoblar har safar tanlaganingizda avtomatik saqlanadi.</li>
          <li><b>Boshqa oyna yoki tabga o'tsangiz, test darhol yakunlanadi</b> va faqat shu paytgacha bergan javoblaringiz baholanadi. Urinish sarflanadi.</li>
          <li>Sahifa yangilansa yoki internet uzilsa, test davom etadi: javoblaringiz saqlanadi, vaqt esa ketaveradi.</li>
          {t.ends_at && <li><b>Test {fmtDateTime(t.ends_at)} da yopiladi.</b> Shu vaqtdan keyin davom etayotgan urinish ham tugaydi.</li>}
          <li>Natija: {SHOW[t.show_results].toLowerCase()}.</li>
        </ul>
        <div style={{ marginTop: 20 }}>
          <Button variant="primary" disabled={busy || left === 0} onClick={start}><FiPlay /> Testni boshlash</Button>
          {left === 0 && <p className="muted small" style={{ marginTop: 8 }}>Urinishlar limiti tugagan.</p>}
        </div>
      </Card>
    </div>
  )
}

export function History() {
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(() => api.myResults())
  const pg = usePaged(data?.results || [], 8)
  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>
  const list = data.results
  // ro'yxat yangidan eskiga; grafik eskidan yangiga qarab chiziladi
  const recent = [...list].reverse().slice(-12)
  const trend = recent.map((a) => ({
    label: new Date(a.finished_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.'),
    value: Math.round(a.percentage),
    hint: `${a.test_title}: ${a.percentage}% (${fmtDateTime(a.finished_at)})`,
  }))
  const avg = recent.reduce((s, a) => s + a.percentage, 0) / (recent.length || 1)
  const best = Math.max(0, ...recent.map((a) => a.percentage))
  const latest = recent[recent.length - 1]
  const delta = recent.length > 1 ? latest.percentage - recent[recent.length - 2].percentage : null

  return (
    <div className="stack">
      <PageHead title="Natijalarim" text="Barcha yakunlangan urinishlar" />
      {list.length === 0 ? <Card><EmptyState title="Hali natijalar yo'q" text="Birinchi testni yeching." /></Card> : (
        <>
          <Card title="So'nggi urinishlar dinamikasi" actions={(
            <div className="legend">
              <span><i style={{ background: 'var(--good)', borderRadius: '50%' }} />70% va yuqori</span>
              <span><i style={{ background: 'var(--warn)', borderRadius: '50%' }} />50-69%</span>
              <span><i style={{ background: 'var(--bad)', borderRadius: '50%' }} />50% dan past</span>
            </div>
          )}>
            <div className="row" style={{ gap: 28, marginBottom: 10 }}>
              <div><div className="muted small">Oxirgi natija</div>
                <b className="num" style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{latest.percentage}%</b>
                {delta != null && <Badge tone={delta >= 0 ? 'good' : 'bad'}>{delta >= 0 ? '▲ +' : '▼ '}{Math.round(delta * 10) / 10}%</Badge>}</div>
              <div><div className="muted small">O'rtacha ({recent.length} ta)</div>
                <b className="num" style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{Math.round(avg * 10) / 10}%</b></div>
              <div><div className="muted small">Eng yaxshi</div>
                <b className="num" style={{ fontSize: '1.6rem', fontFamily: 'var(--font-display)' }}>{best}%</b></div>
            </div>
            {trend.length < 2 ? <p className="muted">Dinamikani ko'rish uchun kamida 2 ta urinish kerak.</p>
              : <LineChart items={trend} avg={avg} threshold={70} colorize valueLabels />}
          </Card>
          <Card pad0>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Test</th><th>Urinish</th><th>To'g'ri</th><th>Foiz</th><th>Vaqt</th><th>Sana</th><th /></tr></thead>
                <tbody>
                  {pg.items.map((a) => (
                    <tr key={a.id}>
                      <td><b>{a.test_title}</b></td>
                      <td className="num">#{a.attempt_number}</td>
                      <td className="num">{a.correct_answers}/{a.total_questions}</td>
                      <td><Badge tone={pctTone(a.percentage)}>{a.percentage}%</Badge></td>
                      <td className="num muted">{fmtDuration(a.duration_seconds)}</td>
                      <td className="muted small">{fmtDateTime(a.finished_at)}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" onClick={() => navigate(`/student/result/${a.id}`)}>Natija</Button>
                          <Button size="sm" variant="ghost" onClick={() => navigate(`/student/leaderboard/${a.test}`)}><FiAward /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
          </Card>
        </>
      )}
    </div>
  )
}

export function Leaderboard() {
  const { testId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(() => api.leaderboard(testId), [testId])
  const pg = usePaged(data || [], 10)
  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <PageHead title="Reyting" text="Har bir o'quvchining eng yaxshi urinishi" actions={<Button onClick={() => navigate('/student/history')}><FiArrowLeft /> Orqaga</Button>} />
      <Card>
        {pg.items.map((r) => {
          const me = r.student === user.id
          return (
            <div className="list-row" key={r.student} style={me ? { background: 'var(--accent-soft)', margin: '0 -12px', padding: '12px', borderRadius: 12 } : undefined}>
              <span className={`rank ${r.rank <= 3 ? `r${r.rank}` : ''}`}>{r.rank}</span>
              <div className="grow"><b>{r.student_name}</b> {me && <Badge tone="accent">Siz</Badge>}
                <div className="muted small">{r.attempts} ta urinish · {fmtDuration(r.duration_seconds)}</div></div>
              <Badge tone={pctTone(r.best_percentage)}>{r.best_percentage}%</Badge>
            </div>
          )
        })}
        <Pagination page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
      </Card>
      <p className="muted small">Foizlar teng bo'lsa, tezroq yakunlagan yuqoriroq turadi. <Link to="/student/tests">Testlarga qaytish</Link></p>
    </div>
  )
}
