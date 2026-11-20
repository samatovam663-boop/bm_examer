import { useNavigate } from 'react-router-dom'
import { FiAlertTriangle, FiCheckCircle, FiClock, FiLayers, FiPercent, FiPlus, FiTarget, FiTrendingDown, FiUsers } from 'react-icons/fi'
import { api } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Button, Card, EmptyState, Loader, PageHead, Stat } from '../../components/common/ui'
import { BarList, Donut } from '../../components/charts/Charts'
import { fmtDateTime } from '../../utils/format'

/** Eng muhim muammolar bir joyda: past natijali o'quvchilar, bloklanganlar, tez yopiladigan testlar, zaif mavzular. */
function AttentionCard({ base }) {
  const navigate = useNavigate()
  const { data, loading, error } = useAsync(() => api.attention())
  if (loading || error || !data) return null
  const total = data.low_students.length + data.blocked.length + data.closing_tests.length + data.weak_topics.length
  const sections = [
    {
      key: 'closing', icon: <FiClock />, title: 'Tez orada yopiladigan testlar', show: data.closing_tests.length > 0,
      body: data.closing_tests.map((t) => (
        <div className="list-row" key={t.id}>
          <div className="grow"><b>{t.title}</b><div className="muted small">{fmtDateTime(t.ends_at)} da yopiladi</div></div>
          <Button size="sm" onClick={() => navigate(`${base}/tests/${t.id}`)}>Ochish</Button>
        </div>
      )),
    },
    {
      key: 'blocked', icon: <FiAlertTriangle />, title: 'Oxirgi 7 kunda bloklangan urinishlar', show: data.blocked.length > 0,
      body: data.blocked.map((b) => (
        <div className="list-row" key={b.attempt_id}>
          <div className="grow"><b>{b.student_name}</b><div className="muted small">{b.test_title} · {fmtDateTime(b.at)}</div></div>
          <Button size="sm" onClick={() => navigate(`${base}/attempt/${b.attempt_id}`)}>Ko'rish</Button>
        </div>
      )),
    },
    {
      key: 'low', icon: <FiTrendingDown />, title: 'Natijasi past o\'quvchilar (o\'rtacha 50% dan kam)', show: data.low_students.length > 0,
      body: data.low_students.map((s) => (
        <div className="list-row" key={s.id}>
          <div className="grow"><b>{s.name}</b><div className="muted small">{s.attempts} ta urinish</div></div>
          <Badge tone="bad">{s.average}%</Badge>
        </div>
      )),
    },
    {
      key: 'weak', icon: <FiTarget />, title: 'Zaif mavzular (60% dan kam to\'g\'ri)', show: data.weak_topics.length > 0,
      body: data.weak_topics.map((t) => (
        <div className="list-row" key={t.name}>
          <div className="grow"><b>{t.name}</b><div className="muted small">{t.total} ta javob asosida</div></div>
          <Badge tone="warn">{t.percent}%</Badge>
        </div>
      )),
    },
  ].filter((s) => s.show)

  return (
    <Card title={<span className="row"><FiAlertTriangle /> E'tibor talab qiladi</span>} actions={total ? <Badge tone="warn">{total}</Badge> : null}>
      {sections.length === 0 ? (
        <EmptyState icon={<FiCheckCircle />} title="Hammasi joyida" text="Hozircha e'tibor talab qiladigan narsa yo'q." />
      ) : (
        <div className="grid cols-2">
          {sections.map((s) => (
            <div key={s.key} className="stack tight">
              <span className="label row" style={{ gap: 8 }}>{s.icon} {s.title}</span>
              <div>{s.body}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function TeacherDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { data: s, loading, error } = useAsync(() => api.stats())

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>

  return (
    <div className="stack">
      <PageHead title={`Salom, ${user.first_name || user.username}`} text="Testlaringiz va o'quvchilar natijalari"
        actions={<Button variant="primary" onClick={() => navigate('/teacher/tests/new')}><FiPlus /> Yangi test</Button>} />
      <AttentionCard base="/teacher" />
      <div className="grid cols-4">
        <Stat icon={<FiLayers />} label="Testlarim" value={s.tests_count} hint={`${s.tests_by_status.active} ta faol`} />
        <Stat icon={<FiCheckCircle />} label="Yakunlangan urinishlar" value={s.attempts_count} />
        <Stat icon={<FiUsers />} label="O'quvchilar" value={s.students_count} />
        <Stat icon={<FiPercent />} label="O'rtacha natija" value={`${s.average_percentage}%`} />
      </div>
      <div className="grid cols-2">
        <Card title="Testlar holati">
          <Donut centerValue={s.tests_count} centerLabel="test" items={[
            { label: 'Draft', value: s.tests_by_status.draft, color: 'var(--chart-6)' },
            { label: 'Faol', value: s.tests_by_status.active, color: 'var(--chart-3)' },
            { label: 'Yakunlangan', value: s.tests_by_status.completed, color: 'var(--chart-1)' },
          ]} />
        </Card>
        <Card title="So'nggi testlar bo'yicha o'rtacha natija">
          {s.recent_tests.length === 0 ? <EmptyState title="Testlar yo'q" /> : (
            <BarList items={s.recent_tests.filter((t) => t.attempts > 0).map((t) => ({ label: t.title, value: t.average_percentage }))} />
          )}
        </Card>
      </div>
      <Card title="Testlar" actions={<Button size="sm" onClick={() => navigate('/teacher/tests')}>Hammasi</Button>}>
        {s.recent_tests.map((t) => (
          <div className="list-row" key={t.id}>
            <div className="grow"><b>{t.title}</b><div className="muted small">{t.attempts} ta urinish</div></div>
            <Button size="sm" onClick={() => navigate(`/teacher/results/${t.id}`)}>Natijalar</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate(`/teacher/tests/${t.id}`)}>Ochish</Button>
          </div>
        ))}
      </Card>
    </div>
  )
}
