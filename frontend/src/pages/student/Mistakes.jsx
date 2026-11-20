import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiArrowRight, FiCheckCircle, FiRefreshCw, FiTarget, FiXCircle } from 'react-icons/fi'
import { api, errorMessage } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Badge, Button, Card, EmptyState, Loader, PageHead, Pager, Progress, Select, Stat } from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import { QTYPE, fmtDate } from '../../utils/format'

const NEED = 2 // ketma-ket to'g'ri javoblar soni (backend bilan bir xil bo'lishi kerak)

function shuffle(list) {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Xato qilingan savollarni qayta yechish: ketma-ket 2 marta to'g'ri javob bergach savol "o'zlashtirildi" hisoblanadi. */
function Practice({ items, onFinish }) {
  const [queue] = useState(() => shuffle(items))
  const [idx, setIdx] = useState(0)
  const [selected, setSelected] = useState([])
  const [checked, setChecked] = useState(null)
  const [log, setLog] = useState([])
  const [busy, setBusy] = useState(false)
  const q = queue[idx]
  const isMulti = q?.question_type === 'multiple'

  const pick = (id) => {
    if (checked) return
    setSelected((s) => (isMulti ? (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) : (s.includes(id) ? [] : [id])))
  }

  const check = async () => {
    setBusy(true)
    try {
      const r = await api.practiceAnswer(q.question_id, selected)
      setChecked(r)
      setLog((l) => [...l, { id: q.question_id, correct: r.correct, mastered: r.mastered }])
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const next = () => {
    setSelected([])
    setChecked(null)
    setIdx(idx + 1)
  }

  if (!q) {
    const ok = log.filter((l) => l.correct).length
    const mastered = log.filter((l) => l.mastered).length
    return (
      <Card>
        <EmptyState icon={<FiCheckCircle />} title="Mashq tugadi"
          text={`${log.length} ta savoldan ${ok} tasiga to'g'ri javob berdingiz. ${mastered ? `${mastered} ta savol o'zlashtirildi!` : ''}`}
          action={<Button variant="primary" onClick={() => onFinish(true)}>Xatolar ro'yxatiga qaytish</Button>} />
      </Card>
    )
  }

  return (
    <div className="stack" style={{ maxWidth: 820 }}>
      <div className="row between">
        <b>{idx + 1} / {queue.length}</b>
        <Button size="sm" variant="ghost" onClick={() => onFinish(log.length > 0)}>Mashqni tugatish</Button>
      </div>
      <Progress value={(idx / queue.length) * 100} />
      <Card>
        <div className="stack">
          <div className="row" style={{ gap: 8 }}>
            <Badge tone="accent">{QTYPE[q.question_type]}</Badge>
            {q.topic && <Badge tone="warn">{q.topic}</Badge>}
            <span className="muted small">{q.test_title}</span>
          </div>
          <div style={{ fontSize: '1.1rem', lineHeight: 1.6 }}><MathRenderer text={q.text} as="div" /></div>
          {q.image && <img className="q-img" src={q.image} alt="Savol rasmi" />}
          {isMulti && <span className="muted small">Bir nechta to'g'ri javobni belgilang.</span>}
          <div className="stack tight">
            {q.choices.map((c) => {
              const sel = selected.includes(c.id)
              const right = checked && checked.correct_choice_ids.includes(c.id)
              const wrong = checked && sel && !right
              return (
                <button key={c.id} type="button" className={`answer ${sel ? 'selected' : ''}`}
                  style={right ? { borderColor: 'var(--good)', background: 'var(--good-soft)' } : wrong ? { borderColor: 'var(--bad)', background: 'var(--bad-soft)' } : undefined}
                  onClick={() => pick(c.id)} disabled={!!checked}>
                  <span className={`mark ${isMulti ? 'square' : 'round'}`}>✓</span>
                  <MathRenderer text={c.text} />
                  {right && <FiCheckCircle style={{ marginLeft: 'auto', color: 'var(--good)' }} />}
                  {wrong && <FiXCircle style={{ marginLeft: 'auto', color: 'var(--bad)' }} />}
                </button>
              )
            })}
          </div>
          {checked && (
            <div className={`notice ${checked.correct ? 'info' : 'bad'}`}>
              {checked.correct ? <FiCheckCircle /> : <FiXCircle />}
              <span>
                {checked.correct ? 'To\'g\'ri!' : 'Noto\'g\'ri. To\'g\'ri javob yashil rangda ko\'rsatildi.'}{' '}
                {checked.mastered ? 'Bu savol o\'zlashtirildi.' : checked.correct ? `Yana ${NEED - checked.streak} marta to'g'ri javob bersangiz o'zlashtirasiz.` : ''}
              </span>
            </div>
          )}
          <div className="row between">
            <span />
            {checked
              ? <Button variant="primary" onClick={next}>{idx + 1 < queue.length ? <>Keyingi <FiArrowRight /></> : 'Yakunlash'}</Button>
              : <Button variant="primary" disabled={!selected.length || busy} onClick={check}>Tekshirish</Button>}
          </div>
        </div>
      </Card>
    </div>
  )
}

export default function Mistakes() {
  const navigate = useNavigate()
  const { data, loading, error, reload } = useAsync(() => api.myMistakes())
  const [topic, setTopic] = useState('')
  const [onlyOpen, setOnlyOpen] = useState('open')
  const [practicing, setPracticing] = useState(false)

  const all = data || []
  const topics = useMemo(() => [...new Set(all.map((m) => m.topic || 'Mavzusiz'))].sort(), [all])
  const filtered = useMemo(() => all.filter((m) =>
    (!topic || (m.topic || 'Mavzusiz') === topic) && (onlyOpen === 'all' || !m.mastered)), [all, topic, onlyOpen])
  const pg = usePaged(filtered, 6)

  if (loading) return <Loader />
  if (error) return <div className="notice bad">{error}</div>

  const mastered = all.filter((m) => m.mastered).length
  const open = all.length - mastered
  const openItems = filtered.filter((m) => !m.mastered)

  if (practicing) {
    return (
      <div className="stack">
        <PageHead title="Xatolar ustida mashq" text="Avval xato qilgan savollaringizni qayta yeching" />
        <Practice items={openItems.length ? openItems : filtered} onFinish={(changed) => { setPracticing(false); if (changed) reload() }} />
      </div>
    )
  }

  return (
    <div className="stack">
      <PageHead title="Xatolarim" text="Xato qilgan savollaringiz to'g'ri javoblari bilan. Ularni qayta yechib o'zlashtiring."
        actions={<Button variant="primary" disabled={!filtered.length} onClick={() => setPracticing(true)}><FiRefreshCw /> Mashqni boshlash ({openItems.length || filtered.length})</Button>} />

      {all.length === 0 ? (
        <Card><EmptyState icon={<FiTarget />} title="Xatolar ro'yxati bo'sh"
          text="Natijalari batafsil ko'rsatiladigan testlarni yechgach, xato qilingan savollar shu yerda paydo bo'ladi."
          action={<Button onClick={() => navigate('/student/tests')}>Testlarga o'tish</Button>} /></Card>
      ) : (
        <>
          <div className="grid cols-3">
            <Stat icon={<FiXCircle />} label="Xato qilingan savollar" value={all.length} />
            <Stat icon={<FiCheckCircle />} label="O'zlashtirildi" value={mastered} hint={`ketma-ket ${NEED} marta to'g'ri javob`} />
            <div className="card stat">
              <div className="label"><span className="stat-icon"><FiTarget /></span>Qolgani</div>
              <div className="value">{open}</div>
              <Progress value={all.length ? (mastered / all.length) * 100 : 0} tone="good" />
            </div>
          </div>

          <div className="toolbar">
            <Select aria-label="Mavzu" value={topic} onChange={(e) => setTopic(e.target.value)} className="" >
              <option value="">Barcha mavzular</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select aria-label="Holat" value={onlyOpen} onChange={(e) => setOnlyOpen(e.target.value)}>
              <option value="open">Faqat o'zlashtirilmaganlar</option>
              <option value="all">Hammasi</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <Card><EmptyState icon={<FiCheckCircle />} title="Ajoyib!" text="Tanlangan filtrda o'zlashtirilmagan xato qolmadi." /></Card>
          ) : (
            <>
              <div className="stack">
                {pg.items.map((m) => (
                  <Card key={m.question_id}>
                    <div className="stack tight">
                      <div className="row between">
                        <div className="row" style={{ gap: 8 }}>
                          {m.topic && <Badge tone="warn">{m.topic}</Badge>}
                          <Badge>{m.test_title}</Badge>
                          <Badge tone="bad">{m.wrong_count} marta xato</Badge>
                        </div>
                        {m.mastered
                          ? <Badge tone="good"><FiCheckCircle /> O'zlashtirildi</Badge>
                          : <span className="muted small">Mashq: {m.practice_streak} / {NEED} · {fmtDate(m.last_attempt_at)}</span>}
                      </div>
                      <MathRenderer text={m.text} as="div" />
                      {m.image && <img className="q-img" src={m.image} alt="Savol rasmi" />}
                      <div className="choices" style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                        {m.choices.map((c) => {
                          const picked = m.selected_choice_ids.includes(c.id)
                          return (
                            <div key={c.id} className={`choice-view ${c.is_correct ? 'correct' : picked ? 'wrong' : ''}`}>
                              {c.is_correct ? <FiCheckCircle style={{ color: 'var(--good)' }} /> : picked ? <FiXCircle style={{ color: 'var(--bad)' }} /> : <span style={{ width: 16 }} />}
                              <MathRenderer text={c.text} />
                              {picked && <span className="muted small" style={{ marginLeft: 'auto' }}>sizning javobingiz</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
              <Pager page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
            </>
          )}
        </>
      )}
    </div>
  )
}
