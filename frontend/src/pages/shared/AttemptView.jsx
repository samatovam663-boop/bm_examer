import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { FiAlertTriangle, FiArrowLeft, FiAward, FiCheckCircle, FiXCircle } from 'react-icons/fi'
import { api } from '../../api'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Badge, Button, Card, Loader, PageHead, Pagination } from '../../components/common/ui'
import { ScoreRing } from '../../components/charts/Charts'
import MathRenderer from '../../components/common/MathRenderer'
import { QTYPE, SHOW, fmtDateTime, fmtDuration } from '../../utils/format'

/** Bitta urinish natijasi. Ko'rsatiladigan tafsilot test.show_results ga bog'liq (student), staff uchun hammasi. */
export default function AttemptView() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const base = HOME_BY_ROLE[user.role]
  const { data: a, loading, error } = useAsync(() => api.attemptDetail(id), [id])
  const pg = usePaged(a?.questions || [], 10)

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>

  const justFinished = location.state?.finished
  const isStudent = user.role === 'student'

  return (
    <div className="stack" style={{ maxWidth: 920 }}>
      <PageHead title={justFinished ? 'Test yakunlandi' : a.test_title}
        text={`${a.student_name} · ${a.attempt_number}-urinish · ${fmtDateTime(a.finished_at)}`}
        actions={(
          <>
            <Button onClick={() => navigate(isStudent ? `${base}/history` : `${base}/results/${a.test}`)}><FiArrowLeft /> Orqaga</Button>
            {isStudent && <Button onClick={() => navigate(`${base}/leaderboard/${a.test}`)}><FiAward /> Reyting</Button>}
          </>
        )} />

      <Card>
        <div className="row" style={{ gap: 28 }}>
          <ScoreRing value={a.percentage} />
          <div className="grid cols-3 grow" style={{ gap: 18 }}>
            <div><div className="muted small">Ball</div><b className="num" style={{ fontSize: '1.5rem' }}>{a.score}</b></div>
            <div><div className="muted small">To'g'ri javoblar</div><b className="num" style={{ fontSize: '1.5rem' }}>{a.correct_answers}/{a.total_questions}</b></div>
            <div><div className="muted small">Sarflangan vaqt</div><b className="num" style={{ fontSize: '1.5rem' }}>{fmtDuration(a.duration_seconds)}</b></div>
            {!isStudent && (
              <div><div className="muted small">Tab almashtirish</div>
                <b className="num" style={{ fontSize: '1.5rem', color: a.tab_switches ? 'var(--warn)' : undefined }}>{a.tab_switches}</b></div>
            )}
          </div>
        </div>
        {a.violation && (
          <div className="notice bad" style={{ marginTop: 14 }}>
            <FiAlertTriangle /> {isStudent
              ? 'Siz test paytida boshqa oynaga o\'tdingiz, shuning uchun test darhol yakunlandi va faqat shu paytgacha berilgan javoblar baholandi. O\'qituvchi buni ko\'radi.'
              : 'O\'quvchi test paytida boshqa oynaga o\'tgan: test avtomatik yakunlangan, faqat berilgan javoblar baholangan.'}
          </div>
        )}
        {isStudent && !a.violation && a.tab_switches > 0 && (
          <div className="notice" style={{ marginTop: 14 }}><FiAlertTriangle /> Test paytida {a.tab_switches} marta boshqa oynaga o'tgansiz. O'qituvchi buni ko'radi.</div>
        )}
      </Card>

      {a.visibility === 'score_only' ? (
        <div className="notice info">O'qituvchi bu test uchun faqat ball va foizni ko'rsatishni tanlagan ({SHOW.score_only.toLowerCase()}).</div>
      ) : (
        <Card title="Savollar tahlili">
          <div className="stack">
            {pg.items.map((q, i) => {
              const detailed = a.visibility === 'detailed'
              return (
                <div className="q-item" key={q.question_id}>
                  <div className="row" style={{ gap: 8 }}>
                    <b className="num">{pg.offset + i + 1}.</b>
                    <Badge tone="accent">{QTYPE[q.question_type]}</Badge>
                    {q.topic && <Badge tone="warn">{q.topic}</Badge>}
                    {detailed && (q.is_correct
                      ? <Badge tone="good"><FiCheckCircle /> To'g'ri +{q.points_earned}</Badge>
                      : <Badge tone="bad"><FiXCircle /> Noto'g'ri</Badge>)}
                  </div>
                  <MathRenderer text={q.text} as="div" />
                  {q.image && <img className="q-img" src={q.image} alt="Savol rasmi" />}
                  <div className="choices">
                    {q.choices.map((c) => {
                      const picked = detailed && q.selected_choice_ids.includes(c.id)
                      const cls = c.is_correct ? 'correct' : picked ? 'wrong' : ''
                      return (
                        <div key={c.id} className={`choice-view ${cls}`}>
                          {c.is_correct ? <FiCheckCircle style={{ color: 'var(--good)' }} /> : picked ? <FiXCircle style={{ color: 'var(--bad)' }} /> : <span style={{ width: 16 }} />}
                          <MathRenderer text={c.text} />
                          {picked && <span className="muted small" style={{ marginLeft: 'auto' }}>sizning javobingiz</span>}
                        </div>
                      )
                    })}
                  </div>
                  {detailed && q.selected_choice_ids.length === 0 && <span className="muted small">Javob berilmagan</span>}
                </div>
              )
            })}
          </div>
          <Pagination page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
        </Card>
      )}
    </div>
  )
}
