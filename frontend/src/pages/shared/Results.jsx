import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiArrowLeft, FiAward, FiDownload, FiPercent, FiPlus, FiUsers } from 'react-icons/fi'
import { api, errorMessage, FEATURES } from '../../api'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Loader, PageHead, Pagination, Stat, Tabs } from '../../components/common/ui'
import { BarList, Columns } from '../../components/charts/Charts'
import { exportResults } from '../../utils/fileIOTests'
import { saveFile } from '../../utils/fileIO'
import { fmtDateTime, fmtDuration, pctTone } from '../../utils/format'
import QuestionAnalysis from './QuestionAnalysis'

const EXT = { excel: 'xlsx', word: 'docx', pdf: 'pdf' }

/** Teacher/admin: test natijalari, savollar tahlili, reyting va statistika. */
export default function Results() {
  const { testId } = useParams()
  const { user } = useAuth()
  const base = HOME_BY_ROLE[user.role]
  const navigate = useNavigate()
  const [tab, setTab] = useState('summary')
  const [grant, setGrant] = useState(null)
  const [busy, setBusy] = useState('')
  const [group, setGroup] = useState('')
  const { data, loading, error, reload } = useAsync(() => api.testResults(testId, { group }), [testId, group])
  const rankPg = usePaged(data?.ranking || [], 8)
  const attPg = usePaged(data?.attempts || [], 10)

  if (loading && !data) return <Loader />
  if (error) return <div className="notice bad">{error}</div>
  const { test, stats, ranking, attempts } = data
  const extras = data.extras || {}
  const topics = data.topics || []

  const buckets = ['0-39', '40-59', '60-79', '80-100'].map((label, i) => {
    const [lo, hi] = [[0, 40], [40, 60], [60, 80], [80, 101]][i]
    const n = attempts.filter((a) => a.percentage >= lo && a.percentage < hi).length
    return { label, value: attempts.length ? Math.round((n / attempts.length) * 100) : 0 }
  })

  const doExport = async (kind) => {
    setBusy(kind)
    try {
      await saveFile(`natijalar_${test.test_code}.${EXT[kind]}`, await exportResults[kind](test, attempts))
      toast.success('Fayl tayyor')
    } catch (err) {
      if (err?.code === 'declined') toast('Saqlash bekor qilindi', { icon: 'ℹ️' })
      else toast.error(err?.message || 'Faylni yaratib bo\'lmadi')
    } finally {
      setBusy('')
    }
  }

  const giveAttempt = async () => {
    try {
      await api.grantAttempt(test.id, grant.student)
      toast.success(`${grant.student_name}ga qo'shimcha urinish berildi`)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setGrant(null)
  }

  return (
    <div className="stack">
      <PageHead title={`Natijalar: ${test.title}`} text={`Test kodi ${test.test_code}`} actions={(
        <>
          <Button onClick={() => navigate(`${base}/tests/${test.id}`)}><FiArrowLeft /> Testga qaytish</Button>
          {[['pdf', 'PDF'], ['excel', 'Excel'], ['word', 'Word']].map(([k, label]) => (
            <Button key={k} size="sm" disabled={!attempts.length || !!busy} onClick={() => doExport(k)}><FiDownload /> {busy === k ? '…' : label}</Button>
          ))}
        </>
      )} />

      {(data.groups || []).length > 0 && (
        <div className="toolbar">
          <span className="muted small">Guruh bo'yicha:</span>
          <select className="select" aria-label="Guruh" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">Barcha guruhlar</option>
            {data.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}

      <div className="grid cols-4">
        <Stat icon={<FiUsers />} label="O'quvchilar" value={stats.students_count} hint={`${stats.attempts_count} ta urinish`} />
        <Stat icon={<FiPercent />} label="O'rtacha" value={`${stats.average_percentage}%`} />
        <Stat icon={<FiAward />} label="Eng yuqori" value={`${stats.highest_percentage}%`} />
        <Stat label="Eng past" value={`${stats.lowest_percentage}%`} />
      </div>

      {attempts.length === 0 ? (
        <Card><EmptyState title="Natijalar hali yo'q" text="O'quvchilar testni yakunlagach shu yerda ko'rinadi." /></Card>
      ) : (
        <>
          {FEATURES.questionAnalysis && (
            <Tabs value={tab} onChange={setTab} items={[{ value: 'summary', label: 'Umumiy natijalar' }, { value: 'questions', label: 'Savollar tahlili' }]} />
          )}

          {tab === 'questions' && FEATURES.questionAnalysis ? <QuestionAnalysis testId={test.id} onRegraded={reload} /> : (
            <>
              <div className="grid cols-2">
                <Card title="Reyting">
                  {rankPg.items.map((r) => (
                    <div className="list-row" key={r.student}>
                      <span className={`rank ${r.rank <= 3 ? `r${r.rank}` : ''}`}>{r.rank}</span>
                      <div className="grow">{FEATURES.students ? <Link to={`${base}/students/${r.student}`}><b>{r.student_name}</b></Link> : <b>{r.student_name}</b>}<div className="muted small">{r.attempts} ta urinish · {fmtDuration(r.duration_seconds)}</div></div>
                      <Badge tone={pctTone(r.best_percentage)}>{r.best_percentage}%</Badge>
                    </div>
                  ))}
                  <Pagination page={rankPg.page} pageSize={rankPg.pageSize} count={rankPg.count} onChange={rankPg.setPage} />
                </Card>
                <Card title="Natijalar taqsimoti (% o'quvchi)">
                  <Columns items={buckets} />
                </Card>
              </div>

              {(data.group_stats || []).length > 1 && (
                <Card title="Guruhlar solishtirmasi" actions={<span className="muted small">Shu testni yechgan guruhlarning o'rtacha natijasi</span>}>
                  <BarList items={data.group_stats.filter((g) => g.average != null).map((g) => ({ label: `${g.name} (${g.attempts})`, value: g.average }))} />
                  {data.group_stats.some((g) => g.average == null) && (
                    <p className="muted small" style={{ marginTop: 10 }}>
                      Hali yechmagan: {data.group_stats.filter((g) => g.average == null).map((g) => g.name).join(', ')}
                    </p>
                  )}
                </Card>
              )}

              {topics.length > 0 && (
                <Card title="Mavzular bo'yicha sinf natijasi" actions={<span className="muted small">Eng zaif mavzu birinchi: darsda shunga e'tibor bering</span>}>
                  <BarList tone="" items={topics.map((t) => ({ label: `${t.name} (${t.total})`, value: t.percent }))} />
                  {topics.length > 1 && topics[0].percent < 60 && (
                    <div className="notice" style={{ marginTop: 14 }}>
                      <FiAlertTriangle /> <span><b>{topics[0].name}</b> mavzusida o'quvchilarning faqat {topics[0].percent}% javobi to'g'ri. Bu mavzuni qayta tushuntirish foydali bo'lishi mumkin.</span>
                    </div>
                  )}
                </Card>
              )}

              <Card title="Barcha urinishlar" pad0>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>O'quvchi</th><th>Urinish</th><th>Ball</th><th>To'g'ri</th><th>Foiz</th><th>Vaqt</th><th>Tab</th><th>Sana</th><th /></tr></thead>
                    <tbody>
                      {attPg.items.map((a) => (
                        <tr key={a.id}>
                          <td>
                            {FEATURES.students ? <Link to={`${base}/students/${a.student}`}><b>{a.student_name}</b></Link> : <b>{a.student_name}</b>}
                            {extras[a.student] > 0 && <div><Badge tone="accent">+{extras[a.student]} qo'shimcha urinish berilgan</Badge></div>}
                          </td>
                          <td className="num">#{a.attempt_number}</td>
                          <td className="num">{a.score}</td>
                          <td className="num">{a.correct_answers}/{a.total_questions}</td>
                          <td>
                            <div className="row" style={{ gap: 6 }}>
                              <Badge tone={pctTone(a.percentage)}>{a.percentage}%</Badge>
                              {a.violation && <Badge tone="bad"><FiAlertTriangle /> Bloklangan</Badge>}
                            </div>
                          </td>
                          <td className="num muted">{fmtDuration(a.duration_seconds)}</td>
                          <td>{a.tab_switches > 0 ? <Badge tone="warn"><FiAlertTriangle /> {a.tab_switches}</Badge> : <span className="muted">0</span>}</td>
                          <td className="muted small">{fmtDateTime(a.started_at)}</td>
                          <td>
                            <div className="actions">
                              <Button size="sm" onClick={() => navigate(`${base}/attempt/${a.id}`)}>Tahlil</Button>
                              {FEATURES.grantAttempt && (
                                <Button size="sm" variant={a.violation ? 'primary' : 'ghost'} title="Shu o'quvchiga yana bir urinish berish" onClick={() => setGrant(a)}><FiPlus /> Urinish</Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination page={attPg.page} pageSize={attPg.pageSize} count={attPg.count} onChange={attPg.setPage} />
              </Card>
            </>
          )}
        </>
      )}

      {grant && (
        <ConfirmDialog title="Qo'shimcha urinish berish" confirmLabel="Urinish berish" onClose={() => setGrant(null)} onConfirm={giveAttempt}
          text={`${grant.student_name} uchun "${test.title}" testida urinishlar limiti 1 taga oshiriladi. Eski natija o'chmaydi, yangi urinish alohida hisoblanadi.${grant.violation ? ' Oldingi urinish boshqa oynaga o\'tgani uchun bloklangan edi.' : ''}`} />
      )}
    </div>
  )
}
