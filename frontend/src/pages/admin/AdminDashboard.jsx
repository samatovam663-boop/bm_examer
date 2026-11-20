import { FiBookOpen, FiCheckCircle, FiLayers, FiPercent, FiUsers } from 'react-icons/fi'
import { api } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { Card, Loader, PageHead, Stat } from '../../components/common/ui'
import { BarList, Donut } from '../../components/charts/Charts'
import { ROLE } from '../../utils/format'

export default function AdminDashboard() {
  const { data, loading, error } = useAsync(async () => {
    const [stats, users] = await Promise.all([api.stats(), api.userStats()])
    return { stats, users }
  })

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>
  const { stats, users } = data

  return (
    <div className="stack">
      <PageHead title="Admin paneli" text="Tizimning umumiy holati" />
      <div className="grid cols-4">
        <Stat icon={<FiUsers />} label="Foydalanuvchilar" value={users.total} hint={`${users.new_last_7_days} ta so'nggi 7 kunda`} />
        <Stat icon={<FiLayers />} label="Testlar" value={stats.tests_count} hint={`${stats.tests_by_status.active} ta faol`} />
        <Stat icon={<FiCheckCircle />} label="Yakunlangan urinishlar" value={stats.attempts_count} hint={`${stats.students_count} ta o'quvchi`} />
        <Stat icon={<FiPercent />} label="O'rtacha natija" value={`${stats.average_percentage}%`} />
      </div>
      <div className="grid cols-2">
        <Card title="Foydalanuvchilar rollari bo'yicha">
          <Donut centerValue={users.total} centerLabel="jami"
            items={['admin', 'teacher', 'student'].map((r) => ({ label: ROLE[r], value: users.by_role[r] }))} />
        </Card>
        <Card title="Testlar holati">
          <Donut centerValue={stats.tests_count} centerLabel="test" items={[
            { label: 'Draft', value: stats.tests_by_status.draft, color: 'var(--chart-6)' },
            { label: 'Faol', value: stats.tests_by_status.active, color: 'var(--chart-3)' },
            { label: 'Yakunlangan', value: stats.tests_by_status.completed, color: 'var(--chart-1)' },
          ]} />
        </Card>
      </div>
      <Card title={<span className="row"><FiBookOpen /> Fanlar bo'yicha o'rtacha natija</span>}>
        <BarList items={stats.by_subject.filter((s) => s.tests > 0).map((s) => ({ label: s.name, value: s.average }))} />
        {!stats.by_subject.some((s) => s.tests > 0) && <p className="muted">Hali natijalar yo'q.</p>}
      </Card>
    </div>
  )
}
