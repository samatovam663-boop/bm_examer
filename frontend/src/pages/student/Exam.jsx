import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiArrowLeft, FiArrowRight, FiFlag, FiMaximize, FiSend } from 'react-icons/fi'
import { api, errorMessage } from '../../api'
import { Badge, Button, Card, ConfirmDialog, Loader } from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import Timer from '../../components/common/Timer'
import { QTYPE } from '../../utils/format'

export default function Exam() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState(null)
  const [error, setError] = useState('')
  const [answers, setAnswers] = useState({})
  const [current, setCurrent] = useState(0)
  const [flagged, setFlagged] = useState(new Set())
  const [tabs, setTabs] = useState(0)
  const [confirm, setConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [saveState, setSaveState] = useState('saved')
  const tabsRef = useRef(0)
  const submittedRef = useRef(false)
  const startedRef = useRef(false)

  // testni boshlash (yoki ochiq urinishni davom ettirish)
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    api.startTest(id)
      .then((s) => {
        setSession(s)
        if (s.previous_blocked) {
          toast.error('Oldingi urinishingiz sahifadan chiqib ketganingiz uchun bloklandi. Test noldan boshlandi.', { duration: 7000 })
        }
        setAnswers(s.saved_answers || {})
        tabsRef.current = s.tab_switches || 0
        setTabs(tabsRef.current)
      })
      .catch((e) => setError(errorMessage(e)))
  }, [id])

  // mode: 'manual' | 'auto' (vaqt tugadi) | 'violation' (boshqa oynaga o'tdi: test bloklanadi)
  const submit = useCallback(async (mode = 'manual') => {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      const result = await api.submitTest(id, { tab_switches: tabsRef.current, violation: mode === 'violation' })
      if (mode === 'violation') toast.error('Boshqa oynaga o\'tganingiz uchun test yakunlandi.', { duration: 6000 })
      else toast.success(mode === 'auto' ? 'Vaqt tugadi, test yakunlandi' : 'Test yakunlandi')
      navigate(`/student/result/${result.id}`, { replace: true, state: { finished: true, violation: mode === 'violation' } })
    } catch (e) {
      submittedRef.current = false
      setSubmitting(false)
      toast.error(errorMessage(e))
    }
  }, [id, navigate])

  // tab almashtirishni aniqlash
  useEffect(() => {
    if (!session) return undefined
    // boshqa tab/oynaga o'tish: test darhol yakunlanadi va shu paytgacha berilgan javoblar bilan baholanadi
    const block = () => {
      if (submittedRef.current) return
      tabsRef.current += 1
      setTabs(tabsRef.current)
      submit('violation')
    }
    const onVisibility = () => { if (document.hidden) block() }
    // boshqa dastur/oyna oldinga chiqsa (tab o'zgarmasa ham) oyna fokusni yo'qotadi
    let blurTimer
    const onBlur = () => {
      clearTimeout(blurTimer)
      blurTimer = setTimeout(() => { if (!document.hasFocus()) block() }, 400)
    }
    const onFocus = () => clearTimeout(blurTimer)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(blurTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
    }
  }, [session, submit])

  // sahifani tasodifan yopishdan ogohlantirish
  useEffect(() => {
    const handler = (e) => { if (!submittedRef.current) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  const questions = session?.questions || []
  const q = questions[current]

  const choose = async (question, choiceId) => {
    const prev = answers[question.id] || []
    let next
    if (question.question_type === 'multiple') {
      next = prev.includes(choiceId) ? prev.filter((x) => x !== choiceId) : [...prev, choiceId]
    } else {
      next = prev.includes(choiceId) ? [] : [choiceId]
    }
    setAnswers((a) => {
      const copy = { ...a }
      if (next.length) copy[question.id] = next
      else delete copy[question.id]
      return copy
    })
    setSaveState('saving')
    try {
      await api.saveAnswer(id, { question_id: question.id, choice_ids: next, tab_switches: tabsRef.current })
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      setAnswers((a) => ({ ...a, [question.id]: prev }))
      toast.error(errorMessage(e))
    }
  }

  const toggleFlag = () => setFlagged((f) => {
    const n = new Set(f)
    if (n.has(q.id)) n.delete(q.id)
    else n.add(q.id)
    return n
  })

  const fullscreen = () => {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else el.requestFullscreen?.().catch(() => toast.error('Fullscreen bu muhitda mavjud emas'))
  }

  const unanswered = useMemo(() => questions.filter((x) => !(answers[x.id]?.length)).length, [questions, answers])

  if (error) {
    return (
      <div className="auth-wrap">
        <div className="card auth-card">
          <h2>Testni boshlab bo'lmadi</h2>
          <div className="notice bad">{error}</div>
          <Button onClick={() => navigate('/student/tests')}><FiArrowLeft /> Testlarga qaytish</Button>
        </div>
      </div>
    )
  }
  if (!session) return <Loader />

  const isMulti = q.question_type === 'multiple'

  return (
    <div className="shell" style={{ gridTemplateColumns: 'minmax(0, 1fr)', maxWidth: 1180, margin: '0 auto' }}>
      <div className="stack">
        <Card className="exam-head" style={{ padding: '12px 18px' }}>
          <div className="row between">
            <div className="row" style={{ gap: 14 }}>
              <b>{current + 1} / {questions.length}</b>
              <span className="muted small">{saveState === 'saving' ? 'Saqlanmoqda…' : saveState === 'error' ? 'Saqlanmadi' : 'Javoblar saqlandi'}</span>
              <Badge tone="warn"><FiAlertTriangle /> Boshqa oynaga o'tmang: test yakunlanadi</Badge>
            </div>
            <div className="row" style={{ gap: 12 }}>
              <Timer expiresAt={session.expires_at} onExpire={() => submit('auto')} />
              <Button size="sm" icon onClick={fullscreen} aria-label="To'liq ekran"><FiMaximize /></Button>
              <Button variant="primary" size="sm" disabled={submitting} onClick={() => setConfirm(true)}><FiSend /> Yakunlash</Button>
            </div>
          </div>
        </Card>

        <div className="exam">
          <Card>
            <div className="stack">
              <div className="row between">
                <div className="row" style={{ gap: 8 }}>
                  <Badge tone="accent">{QTYPE[q.question_type]}</Badge>
                  <Badge>{q.points} ball</Badge>
                </div>
                <Button size="sm" variant={flagged.has(q.id) ? 'primary' : 'ghost'} onClick={toggleFlag}><FiFlag /> {flagged.has(q.id) ? 'Belgilangan' : 'Belgilash'}</Button>
              </div>
              <div style={{ fontSize: '1.12rem', lineHeight: 1.6 }}><MathRenderer text={q.text} as="div" /></div>
              {q.image && <img className="q-img" src={q.image} alt="Savol rasmi" />}
              {isMulti && <span className="muted small">Bir nechta to'g'ri javobni belgilang.</span>}
              <div className="stack tight" role={isMulti ? 'group' : 'radiogroup'} aria-label="Javob variantlari">
                {q.choices.map((c) => {
                  const selected = (answers[q.id] || []).includes(c.id)
                  return (
                    <button key={c.id} type="button" className={`answer ${selected ? 'selected' : ''}`}
                      role={isMulti ? 'checkbox' : 'radio'} aria-checked={selected} onClick={() => choose(q, c.id)}>
                      <span className={`mark ${isMulti ? 'square' : 'round'}`}>✓</span>
                      <MathRenderer text={c.text} />
                    </button>
                  )
                })}
              </div>
              <div className="row between" style={{ marginTop: 8 }}>
                <Button disabled={current === 0} onClick={() => setCurrent(current - 1)}><FiArrowLeft /> Oldingi</Button>
                <Button variant="primary" disabled={current === questions.length - 1} onClick={() => setCurrent(current + 1)}>Keyingi <FiArrowRight /></Button>
              </div>
            </div>
          </Card>

          <aside className="stack">
            <Card title="Savollar">
              <div className="qnav">
                {questions.map((x, i) => (
                  <button key={x.id} type="button" aria-label={`${i + 1}-savol`}
                    className={`${answers[x.id]?.length ? 'answered' : ''} ${i === current ? 'current' : ''} ${flagged.has(x.id) ? 'flagged' : ''}`}
                    onClick={() => setCurrent(i)}>{i + 1}</button>
                ))}
              </div>
              <div className="legend" style={{ marginTop: 14 }}>
                <span><i style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }} />Javob berilgan</span>
                <span><i style={{ background: 'var(--card-2)', border: '1px solid var(--border)' }} />Javobsiz</span>
                <span><i style={{ background: 'var(--warn)', borderRadius: '50%' }} />Belgilangan</span>
              </div>
            </Card>
          </aside>
        </div>
      </div>

      {confirm && (
        <ConfirmDialog title="Testni yakunlash" confirmLabel="Yakunlash" busy={submitting} onClose={() => setConfirm(false)}
          onConfirm={() => { setConfirm(false); submit('manual') }}
          text={unanswered ? `${unanswered} ta savolga javob bermadingiz. Baribir yakunlaysizmi?` : 'Barcha savollarga javob berilgan. Testni yakunlaysizmi?'} />
      )}
    </div>
  )
}
