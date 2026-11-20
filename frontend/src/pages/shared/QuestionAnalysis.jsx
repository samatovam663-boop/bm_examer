import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiCheckCircle, FiEdit2, FiSlash } from 'react-icons/fi'
import { api, errorMessage } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Badge, Button, Card, ConfirmDialog, Loader, Modal, Pager } from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import { QTYPE, pctTone } from '../../utils/format'

function verdict(q) {
  if (q.voided) return { tone: 'accent', label: 'Bekor qilingan' }
  if (q.correct_percent == null) return { tone: '', label: '—' }
  if (q.correct_percent < 25) return { tone: 'bad', label: 'Shubhali: tekshiring' }
  if (q.correct_percent < 50) return { tone: 'warn', label: 'Qiyin' }
  if (q.correct_percent > 85) return { tone: 'good', label: 'Oson' }
  return { tone: '', label: 'O\'rtacha' }
}

function CorrectionDialog({ q, onClose, onDone }) {
  const multi = q.question_type === 'multiple'
  const [picked, setPicked] = useState(q.choices.filter((c) => c.is_correct).map((c) => c.id))
  const [busy, setBusy] = useState(false)

  const toggle = (id) => setPicked((p) => (multi ? (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]) : [id]))

  const save = async () => {
    setBusy(true)
    try {
      const r = await api.correctQuestion(q.question_id, { correct_choice_ids: picked })
      toast.success(`To'g'ri javob o'zgartirildi, ${r.regraded} ta urinish qayta baholandi`)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={`${q.number}-savol: to'g'ri javobni o'zgartirish`} onClose={onClose}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" disabled={!picked.length || busy} onClick={save}>Saqlash va qayta baholash</Button></>}>
      <MathRenderer text={q.text} as="div" />
      <div className="stack tight">
        {q.choices.map((c) => (
          <label key={c.id} className="check answer" style={{ cursor: 'pointer' }}>
            <input type={multi ? 'checkbox' : 'radio'} name="fix" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} />
            <MathRenderer text={c.text} />
          </label>
        ))}
      </div>
      <div className="notice"><FiAlertTriangle /><span>Barcha yakunlangan urinishlar yangi javob bo'yicha qayta baholanadi va reyting o'zgaradi. Bu amalni keyin yana o'zgartirish mumkin.</span></div>
    </Modal>
  )
}

/** Har bir savol bo'yicha: necha foiz o'quvchi to'g'ri javob bergan, variantlar taqsimoti, xato savollarni tuzatish. */
export default function QuestionAnalysis({ testId, onRegraded }) {
  const { data, loading, error, reload } = useAsync(() => api.questionAnalysis(testId), [testId])
  const [fix, setFix] = useState(null)
  const [cancel, setCancel] = useState(null)
  const [open, setOpen] = useState(null)
  const [sort, setSort] = useState('order')
  const list = (data?.questions || []).slice().sort((a, b) =>
    sort === 'hard' ? (a.correct_percent ?? 101) - (b.correct_percent ?? 101) : a.number - b.number)
  const pg = usePaged(list, 8)

  if (loading && !data) return <Loader />
  if (error) return <div className="notice bad">{error}</div>

  const done = () => { setFix(null); setCancel(null); reload(); onRegraded?.() }
  const suspicious = data.questions.filter((q) => !q.voided && q.correct_percent != null && q.correct_percent < 25)

  const doCancel = async () => {
    try {
      const r = await api.correctQuestion(cancel.question_id, { cancel: true })
      toast.success(`Savol bekor qilindi, ${r.regraded} ta urinish qayta baholandi`)
      done()
    } catch (err) {
      toast.error(errorMessage(err))
      setCancel(null)
    }
  }

  return (
    <div className="stack">
      {suspicious.length > 0 && (
        <div className="notice bad">
          <FiAlertTriangle />
          <span><b>{suspicious.map((q) => q.number).join(', ')}-savol</b> bo'yicha o'quvchilarning 25% dan kami to'g'ri javob bergan. Savol yoki to'g'ri javob noto'g'ri belgilangan bo'lishi mumkin: variantlar taqsimotini ko'ring.</span>
        </div>
      )}

      <Card pad0 title="Savollar bo'yicha natija" actions={(
        <select className="select" aria-label="Tartib" value={sort} onChange={(e) => setSort(e.target.value)} style={{ width: 'auto' }}>
          <option value="order">Test tartibida</option>
          <option value="hard">Eng qiyini birinchi</option>
        </select>
      )}>
        <div className="stack" style={{ padding: '0 20px 8px' }}>
          {pg.items.map((q) => {
            const v = verdict(q)
            const isOpen = open === q.question_id
            return (
              <div className="q-item" key={q.question_id}>
                <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <b className="num">{q.number}.</b>
                      <Badge tone="accent">{QTYPE[q.question_type]}</Badge>
                      {q.topic && <Badge tone="warn">{q.topic}</Badge>}
                      <Badge tone={v.tone}>{v.label}</Badge>
                      {q.corrected_at && !q.voided && <Badge tone="good"><FiCheckCircle /> Tuzatilgan</Badge>}
                    </div>
                    <MathRenderer text={q.text} as="div" />
                  </div>
                  <div style={{ textAlign: 'right', flex: 'none' }}>
                    <b className="num" style={{ fontSize: '1.5rem', fontFamily: 'var(--font-display)', color: q.correct_percent == null ? undefined : `var(--${pctTone(q.correct_percent) === 'good' ? 'good' : pctTone(q.correct_percent) === 'warn' ? 'warn' : 'bad'})` }}>
                      {q.voided ? '100%' : q.correct_percent == null ? '—' : `${q.correct_percent}%`}
                    </b>
                    <div className="muted small">to'g'ri javob</div>
                  </div>
                </div>
                <div className="row">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(isOpen ? null : q.question_id)}>{isOpen ? 'Variantlarni yashirish' : 'Variantlar taqsimoti'}</Button>
                  <Button size="sm" onClick={() => setFix(q)}><FiEdit2 /> To'g'ri javobni o'zgartirish</Button>
                  {!q.voided && <Button size="sm" variant="danger" onClick={() => setCancel(q)}><FiSlash /> Savolni bekor qilish</Button>}
                </div>
                {isOpen && (
                  <div className="stack tight">
                    {q.choices.map((c) => (
                      <div key={c.id} className={`choice-view ${c.is_correct ? 'correct' : ''}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 110px 86px', gap: 10 }}>
                        <span style={{ minWidth: 0 }}>{c.is_correct && <FiCheckCircle style={{ color: 'var(--good)', marginRight: 6 }} />}<MathRenderer text={c.text} /></span>
                        <div className="progress"><i style={{ width: `${c.percent}%` }} /></div>
                        <span className="num muted small" style={{ textAlign: 'right' }}>{c.percent}% ({c.selected})</span>
                      </div>
                    ))}
                    <span className="muted small">Javob bermaganlar: {q.blank} ta. Jami {q.answered} ta urinish asosida.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <Pager page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
      </Card>

      {fix && <CorrectionDialog q={fix} onClose={() => setFix(null)} onDone={done} />}
      {cancel && (
        <ConfirmDialog danger title="Savolni bekor qilish" confirmLabel="Bekor qilish va qayta baholash" onClose={() => setCancel(null)} onConfirm={doCancel}
          text={`${cancel.number}-savol hamma o'quvchi uchun to'g'ri deb hisoblanadi (savol ballari hammaga beriladi). Barcha natijalar qayta hisoblanadi. Savol xato yozilgan bo'lsa, shu to'g'ri yo'l.`} />
      )}
    </div>
  )
}
