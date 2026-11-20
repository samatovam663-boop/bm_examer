import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FiAlertTriangle, FiAward, FiCheckCircle, FiClock, FiTarget, FiTrendingDown, FiTrendingUp, FiZap,
} from 'react-icons/fi'
import { api, FEATURES } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Badge, Button, Card, EmptyState, Loader, PageHead, Pagination, Progress, Stat, Tabs } from '../../components/common/ui'
import { BarList, Columns, LineChart, Radar } from '../../components/charts/Charts'
import { fmtDate, pctTone } from '../../utils/format'
import { AchievementsCard, ActivityCalendar, GoalsCard, TopicAnalysis } from './StatsExtras'

const DAY = 864e5
const RANGES = [
  { value: 'all', label: 'Hammasi', days: null },
  { value: '30', label: '30 kun', days: 30 },
  { value: '7', label: '7 kun', days: 7 },
]

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const r1 = (n) => Math.round(n * 10) / 10

function weeklyActivity(attempts, weeks = 8) {
  const now = Date.now()
  const buckets = Array.from({ length: weeks }, (_, i) => ({ label: i === weeks - 1 ? 'Shu hafta' : `-${weeks - 1 - i} h`, value: 0 }))
  attempts.forEach((a) => {
    const idx = weeks - 1 - Math.floor((now - new Date(a.finished_at).getTime()) / (7 * DAY))
    if (idx >= 0 && idx < weeks) buckets[idx].value += 1
  })
  return buckets
}

function Insight({ icon, tone = '', title, text }) {
  return (
    <div className="card flat" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <span className="stat-icon" style={tone === 'bad' ? { background: 'var(--bad-soft)', color: 'var(--bad)' } : tone === 'good' ? { background: 'var(--good-soft)', color: 'var(--good)' } : undefined}>{icon}</span>
      <div style={{ minWidth: 0 }}>
        <b style={{ display: 'block' }}>{title}</b>
        <span className="muted small">{text}</span>
      </div>
    </div>
  )
}

export default function Stats() {
  const navigate = useNavigate()
  const [range, setRange] = useState('all')

  const { data, loading, error, reload } = useAsync(async () => {
    const [resultsPage, analytics, goals, subjects] = await Promise.all([
      api.myResults({ page_size: 500 }),
      FEATURES.analytics ? api.myAnalytics() : Promise.resolve(null),
      FEATURES.goals ? api.listGoals() : Promise.resolve([]),
      api.listSubjects(),
    ])
    const results = resultsPage.results
    // har bir test uchun boshqa o'quvchilar bilan taqqoslash (reyting orqali)
    const ids = [...new Set(results.map((a) => a.test))]
    const boards = await Promise.allSettled(ids.map((id) => api.leaderboard(id)))
    const byTest = {}
    ids.forEach((id, i) => { if (boards[i].status === 'fulfilled') byTest[id] = boards[i].value })
    return { results, byTest, analytics, goals, subjects }
  })

  const view = useMemo(() => {
    if (!data) return null
    const days = RANGES.find((r) => r.value === range).days
    const since = days ? Date.now() - days * DAY : 0
    const attempts = data.results.filter((a) => new Date(a.finished_at).getTime() >= since)
      .sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at))
    const pct = attempts.map((a) => a.percentage)
    const avg = mean(pct)

    const last = pct.slice(-3)
    const prev = pct.slice(-6, -3)
    const trend = prev.length ? mean(last) - mean(prev) : null

    const totalQ = attempts.reduce((s, a) => s + a.total_questions, 0)
    const correctQ = attempts.reduce((s, a) => s + a.correct_answers, 0)
    const timed = attempts.filter((a) => a.duration_seconds != null && a.test_duration_minutes)
    const timeUse = mean(timed.map((a) => Math.min(1.5, a.duration_seconds / (a.test_duration_minutes * 60)))) * 100

    const subj = {}
    attempts.forEach((a) => {
      const k = a.subject_name || 'Fansiz'
      subj[k] = subj[k] || { name: k, list: [] }
      subj[k].list.push(a.percentage)
    })
    const subjects = Object.values(subj).map((s) => ({ name: s.name, avg: r1(mean(s.list)), count: s.list.length }))
      .sort((a, b) => b.avg - a.avg)

    const best = attempts.length ? attempts.reduce((m, a) => (a.percentage > m.percentage ? a : m)) : null
    return {
      attempts, avg, trend, best, accuracy: totalQ ? (correctQ / totalQ) * 100 : 0, timeUse, subjects,
      blocked: attempts.filter((a) => a.violation).length,
      line: attempts.map((a, i) => ({
        label: new Date(a.finished_at).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }).replace('/', '.'),
        value: a.percentage,
        hint: `${a.test_title}: ${a.percentage}% (${fmtDate(a.finished_at)}, ${i + 1}-urinish)`,
      })),
      weekly: weeklyActivity(attempts),
    }
  }, [data, range])

  // testlar bo'yicha taqqoslash: faqat tanlangan oraliqdagi emas, o'quvchining barcha testlari
  const compare = useMemo(() => {
    if (!data) return []
    const me = data.results[0]?.student
    const byTest = {}
    data.results.forEach((a) => { (byTest[a.test] = byTest[a.test] || []).push(a) })
    return Object.entries(byTest).map(([id, list]) => {
      const board = data.byTest[id] || []
      const mine = board.find((r) => r.student === me)
      const avg = board.length ? mean(board.map((r) => r.best_percentage)) : null
      const best = Math.max(...list.map((a) => a.percentage))
      return {
        id: Number(id), title: list[0].test_title, subject: list[0].subject_name, attempts: list.length, best,
        avg: avg == null ? null : r1(avg), rank: mine?.rank ?? null, total: board.length,
        diff: avg == null ? null : r1(best - avg),
      }
    }).sort((a, b) => b.best - a.best)
  }, [data])

  const cmpPg = usePaged(compare, 6)

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>

  const v = view
  const strongest = v.subjects.length > 1 ? v.subjects[0] : null
  const weakest = v.subjects.length > 1 ? v.subjects[v.subjects.length - 1] : null

  return (
    <div className="stack">
      <PageHead title="Statistika" text="Natijalaringiz dinamikasi, fanlar kesimi va boshqa o'quvchilar bilan taqqoslash"
        actions={<Tabs value={range} onChange={setRange} items={RANGES.map(({ value, label }) => ({ value, label }))} />} />

      {data.results.length === 0 ? (
        <Card><EmptyState icon={<FiTarget />} title="Statistika hali yo'q" text="Birinchi testni yeching, shundan keyin natijalar tahlili shu yerda paydo bo'ladi."
          action={<Button variant="primary" onClick={() => navigate('/student/tests')}>Testlarga o'tish</Button>} /></Card>
      ) : v.attempts.length === 0 ? (
        <Card><EmptyState title="Bu davrda urinishlar yo'q" text="Boshqa davrni tanlang." action={<Button onClick={() => setRange('all')}>Hammasini ko'rsatish</Button>} /></Card>
      ) : (
        <>
          <div className="grid cols-4">
            <Stat icon={<FiCheckCircle />} label="Yechilgan urinishlar" value={v.attempts.length}
              hint={`${new Set(v.attempts.map((a) => a.test)).size} ta turli test`} />
            <div className="card stat">
              <div className="label"><span className="stat-icon"><FiTarget /></span>O'rtacha natija</div>
              <div className="value">{r1(v.avg)}%</div>
              <div className="hint">
                {v.trend == null ? 'Dinamika uchun kamida 4 urinish kerak' : (
                  <Badge tone={v.trend >= 0 ? 'good' : 'bad'}>
                    {v.trend >= 0 ? <FiTrendingUp /> : <FiTrendingDown />} {v.trend >= 0 ? '+' : ''}{r1(v.trend)}% oldingi 3 tadan
                  </Badge>
                )}
              </div>
            </div>
            <Stat icon={<FiAward />} label="Eng yaxshi natija" value={`${v.best.percentage}%`} hint={v.best.test_title} />
            <div className="card stat">
              <div className="label"><span className="stat-icon"><FiZap /></span>Aniqlik</div>
              <div className="value">{r1(v.accuracy)}%</div>
              <Progress value={v.accuracy} tone={pctTone(v.accuracy)} />
              <div className="hint">to'g'ri javoblar ulushi</div>
            </div>
          </div>

          <div className="grid cols-3">
            {v.trend != null && (
              <Insight tone={v.trend >= 0 ? 'good' : 'bad'} icon={v.trend >= 0 ? <FiTrendingUp /> : <FiTrendingDown />}
                title={v.trend >= 0 ? 'Natijalaringiz yaxshilanmoqda' : 'So\'nggi natijalar pasaydi'}
                text={`So'nggi 3 urinish o'rtachasi oldingi 3 tadan ${Math.abs(r1(v.trend))}% ${v.trend >= 0 ? 'yuqori' : 'past'}.`} />
            )}
            {strongest && (
              <Insight tone="good" icon={<FiAward />} title={`Eng kuchli fan: ${strongest.name}`} text={`O'rtacha ${strongest.avg}% (${strongest.count} ta urinish).`} />
            )}
            {weakest && weakest.name !== strongest.name && (
              <Insight tone={weakest.avg < 60 ? 'bad' : ''} icon={<FiTarget />} title={`Ko'proq mashq kerak: ${weakest.name}`} text={`O'rtacha ${weakest.avg}%, farq ${r1(strongest.avg - weakest.avg)}%.`} />
            )}
            <Insight icon={<FiClock />} title="Vaqtni taqsimlash"
              text={`Testlarga ajratilgan vaqtning o'rtacha ${Math.round(v.timeUse)}% ini sarflaysiz.${v.timeUse < 35 ? ' Shoshilmasdan, javoblarni qayta tekshirib ko\'ring.' : ''}`} />
            {v.blocked > 0 && (
              <Insight tone="bad" icon={<FiAlertTriangle />} title={`${v.blocked} ta urinish bloklangan`} text="Test paytida boshqa oynaga o'tilgan. Bunday urinishlar faqat berilgan javoblar bilan baholangan." />
            )}
          </div>

          <Card title="Natijalar dinamikasi (%)">
            {v.line.length < 2 ? <p className="muted">Dinamikani ko'rish uchun kamida 2 ta urinish kerak.</p> : <LineChart items={v.line} avg={v.avg} threshold={70} colorize valueLabels />}
          </Card>

          <div className="grid cols-2">
            <Card title="Fanlar bo'yicha">
              {v.subjects.length === 0 ? <p className="muted">Ma'lumot yo'q.</p> : (
                <div className="stack">
                  {v.subjects.length >= 3 && <div style={{ display: 'grid', placeItems: 'center' }}><Radar items={v.subjects.map((s) => ({ label: s.name, value: Math.round(s.avg) }))} /></div>}
                  <BarList items={v.subjects.map((s) => ({ label: `${s.name} (${s.count})`, value: s.avg }))} />
                </div>
              )}
            </Card>
            <Card title="Haftalik faollik (urinishlar soni)">
              <Columns items={v.weekly} max={Math.max(3, ...v.weekly.map((w) => w.value))} unit=" ta" />
              <p className="muted small" style={{ marginTop: 8 }}>
                Oxirgi 8 haftada {v.weekly.reduce((s, w) => s + w.value, 0)} ta urinish.
              </p>
            </Card>
          </div>

          {FEATURES.analytics && <TopicAnalysis analytics={data.analytics} />}

          <div className="grid cols-2">
            {FEATURES.goals && <GoalsCard goals={data.goals} attempts={data.results} subjects={data.subjects} onChanged={reload} />}
            <AchievementsCard attempts={data.results} goals={data.goals} subjects={data.subjects} />
          </div>

          <ActivityCalendar attempts={data.results} />

          <Card title="Boshqa o'quvchilar bilan taqqoslash" pad0>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Test</th><th>Urinish</th><th>Sizning eng yaxshi</th><th>O'rtacha (hamma)</th><th>Farq</th><th>O'rin</th><th /></tr></thead>
                <tbody>
                  {cmpPg.items.map((c) => (
                    <tr key={c.id}>
                      <td><b>{c.title}</b><div className="muted small">{c.subject || 'Fansiz'}</div></td>
                      <td className="num">{c.attempts}</td>
                      <td><Badge tone={pctTone(c.best)}>{c.best}%</Badge></td>
                      <td className="num muted">{c.avg == null ? '—' : `${c.avg}%`}</td>
                      <td>
                        {c.diff == null ? <span className="muted">—</span> : (
                          <Badge tone={c.diff >= 0 ? 'good' : 'bad'}>{c.diff >= 0 ? '+' : ''}{c.diff}%</Badge>
                        )}
                      </td>
                      <td className="num">{c.rank ? <b>{c.rank} / {c.total}</b> : <span className="muted">—</span>}</td>
                      <td><div className="actions"><Button size="sm" variant="ghost" onClick={() => navigate(`/student/leaderboard/${c.id}`)}><FiAward /> Reyting</Button></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={cmpPg.page} pageSize={cmpPg.pageSize} count={cmpPg.count} onChange={cmpPg.setPage} />
          </Card>
        </>
      )}
    </div>
  )
}
