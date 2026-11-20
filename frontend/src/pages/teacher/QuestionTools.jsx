import { useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiAlertTriangle, FiCheckCircle, FiDownload, FiFileText, FiGrid, FiStar, FiUpload, FiZap } from 'react-icons/fi'
import { api, errorMessage, IS_DEMO } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { Badge, Button, Checkbox, Input, Modal, Select, Textarea } from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import { saveFile } from '../../utils/fileIO'
import { exportQuestions, parseQuestionsFile, questionTemplateExcel } from '../../utils/fileIOTests'
import { DIFFICULTY, QTYPE } from '../../utils/format'

const handleSaveError = (err) => {
  if (err?.code === 'declined') toast('Saqlash bekor qilindi', { icon: 'ℹ️' })
  else toast.error(err?.message || 'Faylni yaratib bo\'lmadi')
}

/** Savollarni fayldan import qilish (Excel/Word/PDF/CSV), namuna olish va mavjud savollarni eksport qilish. */
export function QuestionFileDialog({ target, test, questions, onClose, onImported }) {
  const [items, setItems] = useState(null)
  const [reading, setReading] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)
  const valid = (items || []).filter((i) => i.data)
  const bad = (items || []).filter((i) => i.error)

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReading(true)
    try {
      setItems(await parseQuestionsFile(file))
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReading(false)
    }
  }

  const doImport = async () => {
    setBusy(true)
    try {
      const r = await api.addQuestionsBulk(target, valid.map((i) => i.data))
      toast.success(`${r.added} ta savol qo'shildi`)
      onImported()
    } catch (err) {
      toast.error(errorMessage(err))
      setBusy(false)
    }
  }

  const save = async (name, make) => {
    try {
      await saveFile(name, await make())
    } catch (err) {
      handleSaveError(err)
    }
  }

  return (
    <Modal wide title="Savollar: import va eksport" onClose={onClose}
      footer={items ? (
        <><Button onClick={() => setItems(null)}>Boshqa fayl</Button>
          <Button variant="primary" disabled={!valid.length || busy} onClick={doImport}>{valid.length} ta savolni import qilish</Button></>
      ) : <Button onClick={onClose}>Yopish</Button>}>
      {!items ? (
        <div className="stack">
          <div className="stack tight">
            <b>Fayldan yuklash</b>
            <p className="muted small">Excel (.xlsx), Word (.docx), PDF, CSV yoki TXT. Ustunlar: Savol, Tur, Ball, Qiyinlik, Mavzu, To'g'ri javob, Variant 1, Variant 2... Namuna faylda 3 xil savol turi bor.</p>
            <div className="row">
              <input ref={fileRef} id="q-file" type="file" hidden accept=".xlsx,.docx,.pdf,.csv,.txt" onChange={pick} />
              <Button variant="primary" disabled={reading} onClick={() => fileRef.current?.click()}><FiUpload /> {reading ? 'O\'qilmoqda…' : 'Fayl tanlash'}</Button>
              <Button onClick={() => save('savollar_namuna.xlsx', questionTemplateExcel)}><FiDownload /> Namuna fayl (Excel)</Button>
            </div>
          </div>
          {questions && (
            <div className="stack tight">
              <hr className="divider" />
              <b>Mavjud savollarni yuklab olish</b>
              <div className="row">
                <Button disabled={!questions.length} onClick={() => save(`savollar_${test?.test_code || 'bank'}.xlsx`, () => exportQuestions.excel(questions))}><FiGrid /> Excel</Button>
                {test && <Button disabled={!questions.length} onClick={() => save(`savollar_${test.test_code}.docx`, () => exportQuestions.word(test, questions))}><FiFileText /> Word</Button>}
              </div>
              <span className="muted small">Yuklab olingan Excel faylni tahrirlab, qayta import qilish mumkin.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="stack">
          <div className="row" style={{ gap: 10 }}>
            <Badge tone="good"><FiCheckCircle /> {valid.length} ta to'g'ri</Badge>
            {bad.length > 0 && <Badge tone="bad"><FiAlertTriangle /> {bad.length} ta xato (import qilinmaydi)</Badge>}
          </div>
          <div className="table-wrap" style={{ maxHeight: 340, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>Qator</th><th>Savol</th><th>Tur</th><th>Holat</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.line}>
                    <td className="num">{i.line}</td>
                    <td style={{ maxWidth: 320 }}>{i.data ? <MathRenderer text={i.data.text.slice(0, 120)} /> : <span className="muted">—</span>}</td>
                    <td>{i.data ? <Badge>{QTYPE[i.data.question_type]}</Badge> : ''}</td>
                    <td>{i.data ? <Badge tone="good">Tayyor</Badge> : <span style={{ color: 'var(--bad)' }}>{i.error}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  )
}

// ---------- Claude bilan savol yaratish ----------

const AI_TYPES = ['single', 'multiple', 'true_false']

function normalizeAi(list) {
  const out = []
  let dropped = 0
  ;(Array.isArray(list) ? list : []).forEach((q) => {
    try {
      const type = AI_TYPES.includes(q.question_type) ? q.question_type : null
      const text = String(q.text || '').trim()
      const choices = (Array.isArray(q.choices) ? q.choices : []).map((c) => ({ text: String(c.text || '').trim(), is_correct: !!c.is_correct })).filter((c) => c.text)
      const correct = choices.filter((c) => c.is_correct).length
      const ok = type && text.length > 3 && (type === 'true_false' ? choices.length === 2 && correct === 1
        : type === 'single' ? choices.length >= 2 && choices.length <= 6 && correct === 1 : choices.length >= 2 && choices.length <= 6 && correct >= 1)
      if (!ok) throw new Error('invalid')
      out.push({
        question_type: type, text, choices, points: Math.max(1, Math.min(10, Math.round(Number(q.points) || 1))),
        difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium', topic: String(q.topic || '').trim().slice(0, 60),
      })
    } catch { dropped += 1 }
  })
  return { questions: out, dropped }
}

/** Javob matnidan JSON massivni oladi (kod bloki yoki atrofida matn bo'lsa ham). Eski viewerda sample.json bo'lmasa kerak bo'ladi. */
function parseAiText(text) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start < 0 || end <= start) throw { code: 'invalid_json' }
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw { code: 'invalid_json' }
  }
}

/** sample.json bor bo'lsa shuni, yo'q yoki eski viewerda ishlamasa oddiy sample() + o'zimiz tahlil qilamiz. */
async function askClaude(sample, prompt, signal) {
  const opts = { signal, cache: false }
  if (typeof sample.json === 'function') {
    try {
      return await sample.json(prompt, opts)
    } catch (err) {
      if (err?.code !== 'capability_removed') throw err
    }
  }
  const { text } = await sample(prompt, opts)
  return parseAiText(text)
}

const AI_ERRORS = {
  capability_removed: 'Claude ilovangiz eski versiyada, bu imkoniyatni qo\'llamaydi. Claude ilovasini yangilang.',
  capability_disabled: 'Bu ko\'rinishda Claude\'dan foydalanib bo\'lmaydi. Artifaktni Claude ilovasida yoki claude.ai da oching.',
  not_declared: 'Artifakt Claude imkoniyatini e\'lon qilmagan. Artifaktni qayta yuklang.',
  not_granted: 'Claude ishlatishga ruxsat berilmadi. Bu funksiyadan foydalanish uchun ruxsat bering.',
  sampling_disabled: 'Sizning hisobingizda Claude mavjud emas.',
  rate_limited: 'So\'rovlar limitiga yetdingiz. Birozdan keyin qayta urinib ko\'ring.',
  invalid_json: 'Claude javobi o\'qib bo\'lmadi. Soni kamroq yoki mavzuni aniqroq yozib, qayta urinib ko\'ring.',
  empty_completion: 'Claude javob bermadi. Mavzuni aniqroq yozing.',
  refused: 'Claude bu mavzu bo\'yicha savol yaratmadi. So\'rovni o\'zgartiring.',
  session_expired: 'Sessiya tugagan, Claude\'ga qayta kiring.',
  prompt_too_large: 'So\'rov juda uzun.',
}

/** Mavzu bo'yicha savollarni Claude yozadi, o'qituvchi tekshirib, keraklarini qo'shadi. */
export function AiGenerateDialog({ target, testTitle, existing = [], locked = false, onClose, onAdded }) {
  const [sample, setSample] = useState(undefined) // undefined: tekshirilmoqda, null: mavjud emas
  // Urinishlari bor testga savol qo'shib bo'lmaydi (natijalar buzilmasin), shuning uchun savollar savol bankiga saqlanadi
  const banks = useAsync(() => (locked ? api.listBanks() : Promise.resolve([])), [locked])
  const [bankId, setBankId] = useState('new')
  const [form, setForm] = useState({ topic: '', count: 5, difficulty: 'mixed', types: ['single'], notes: '', points: 1 })
  const [phase, setPhase] = useState('form')
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState('')
  const ctl = useRef(null)

  useEffect(() => {
    let alive = true
    // haqiqiy rejimda server o'zi Claude'ga murojaat qiladi, brauzerda sample kerak emas
    const probe = IS_DEMO && typeof window !== 'undefined' && typeof window.claude?.use === 'function' ? window.claude.use('sample') : Promise.resolve(null)
    // `sample` o'zi funksiya: setState'ga to'g'ridan-to'g'ri bersak React uni "yangilovchi" deb chaqirib yuboradi
    probe.then((s) => alive && setSample(() => s)).catch(() => alive && setSample(() => null))
    return () => { alive = false }
  }, [])

  const toggleType = (t) => setForm((f) => ({ ...f, types: f.types.includes(t) ? f.types.filter((x) => x !== t) : [...f.types, t] }))
  const ready = form.topic.trim().length >= 3 && form.types.length > 0 && Number(form.count) >= 1 && Number(form.count) <= 10

  const prompt = useMemo(() => `Sen tajribali o'qituvchi uchun test savollari tuzuvchi yordamchisan. Quyidagi talablar bo'yicha ${form.count} ta savol yoz.

Mavzu: ${form.topic.trim()}
${testTitle ? `Test nomi: ${testTitle}\n` : ''}Til: o'zbek tili (lotin yozuvi).
Qiyinlik: ${form.difficulty === 'mixed' ? 'aralash (oson, o\'rta, qiyin)' : DIFFICULTY[form.difficulty]}
Savol turlari: ${form.types.map((t) => ({ single: 'single (bitta to\'g\'ri javob)', multiple: 'multiple (bir nechta to\'g\'ri javob)', true_false: 'true_false' }[t])).join(', ')}
${form.notes.trim() ? `Qo'shimcha talab: ${form.notes.trim()}\n` : ''}${existing.length ? `Quyidagi savollarga o'xshash savol yozma:\n${existing.slice(0, 15).map((t) => `- ${String(t).slice(0, 120)}`).join('\n')}\n` : ''}
Qoidalar:
- Formulalarni LaTeX bilan $...$ ichida yoz (masalan $x^2 + 1$).
- single savolda 3-5 ta variant va aynan 1 ta to'g'ri javob.
- multiple savolda 4-5 ta variant va 2 ta yoki undan ko'p to'g'ri javob.
- true_false savolda choices aynan [{"text":"True"},{"text":"False"}] va bittasi is_correct.
- Variantlar bir-biridan aniq farq qilsin, to'g'ri javob har doim birinchi bo'lmasin.
- Har bir savolga qisqa "topic" (mavzu ichidagi kichik bo'lim) yoz.

Faqat JSON massiv qaytar, boshqa matn yozma. Format:
[{"question_type":"single","text":"...","difficulty":"easy|medium|hard","topic":"...","choices":[{"text":"...","is_correct":true},{"text":"...","is_correct":false}]}]`, [form, testTitle, existing])

  const run = async () => {
    setError('')
    setPhase('loading')
    ctl.current = new AbortController()
    try {
      let questions, dropped
      if (IS_DEMO) {
        // artifakt: Claude foydalanuvchining o'z hisobidan (sample imkoniyati)
        const raw = await askClaude(sample, prompt, ctl.current.signal)
        ;({ questions, dropped } = normalizeAi(raw))
      } else {
        // haqiqiy sayt: server Claude'ga so'rov yuboradi (API kalit serverda)
        const res = await api.generateQuestions({
          topic: form.topic.trim(), count: Number(form.count), difficulty: form.difficulty, types: form.types, notes: form.notes.trim(),
          points: Number(form.points) || 1, test_title: testTitle || '', existing: existing.slice(0, 15).map((t) => String(t).slice(0, 200)),
        })
        ;({ questions, dropped } = res)
      }
      if (!questions.length) throw { code: 'invalid_json' }
      const withPoints = questions.map((q) => ({ ...q, points: Number(form.points) || 1 }))
      setResult({ questions: withPoints, dropped })
      setSelected(new Set(withPoints.map((_, i) => i)))
      setPhase('review')
    } catch (err) {
      if (err?.code === 'cancelled') setPhase('form')
      else {
        if (!err?.code && !err?.status) console.error('Claude savol yaratish xatosi:', err)
        // server xabari (kalit sozlanmagan, limit, noto'g'ri javob) o'zi tushunarli matn bilan keladi
        const generic = `Claude bilan bog'lanib bo'lmadi. Keyinroq qayta urinib ko'ring.${err?.code ? ` (kod: ${err.code})` : ''}`
        setError(AI_ERRORS[err?.code] || (err?.status ? errorMessage(err) : generic))
        setPhase('form')
      }
    }
  }

  const add = async () => {
    setPhase('saving')
    try {
      const picked = result.questions.filter((_, i) => selected.has(i))
      let dest = target
      let bankName = ''
      if (locked) {
        if (bankId === 'new') {
          const created = await api.saveBank({ name: `${testTitle || 'Test'}: Claude savollari`.slice(0, 190), subject: '' })
          dest = { bankId: created.id }
          bankName = created.name
        } else {
          dest = { bankId: Number(bankId) }
          bankName = banks.data?.find((b) => b.id === Number(bankId))?.name || ''
        }
      }
      const r = await api.addQuestionsBulk(dest, picked)
      toast.success(locked ? `${r.added} ta savol "${bankName}" bankiga saqlandi` : `${r.added} ta savol qo'shildi`)
      onAdded()
    } catch (err) {
      toast.error(errorMessage(err))
      setPhase('review')
    }
  }

  const close = () => { ctl.current?.abort(); onClose() }

  return (
    <Modal wide title="Claude bilan savol yaratish" onClose={close} footer={(
      phase === 'review' ? (
        <><Button onClick={() => setPhase('form')}>Qayta yaratish</Button>
          <Button variant="primary" disabled={!selected.size} onClick={add}>{selected.size} ta savolni {locked ? 'bankka saqlash' : 'qo\'shish'}</Button></>
      ) : phase === 'loading' ? <Button onClick={() => ctl.current?.abort()}>To'xtatish</Button> : (
        <><Button onClick={close}>Yopish</Button>
          <Button variant="primary" disabled={!ready || (IS_DEMO && !sample) || phase === 'saving'} onClick={run}><FiZap /> Savollarni yaratish</Button></>
      )
    )}>
      {IS_DEMO && sample === undefined && (
        <div className="notice info"><FiZap /><span>Claude bilan ulanish tekshirilmoqda… (10 soniyagacha)</span></div>
      )}
      {IS_DEMO && sample === null && (
        <div className="notice"><FiAlertTriangle /><span>Bu ko'rinishda Claude bilan ulanib bo'lmadi. Funksiya artifaktni Claude ilovasida yoki claude.ai da ochganda ishlaydi (boshqa joyda, masalan ulashilgan havola orqali tashqaridan ochilganda, yo'q). Haqiqiy saytda server Claude API kaliti bilan ishlaydi.</span></div>
      )}

      {locked && (
        <div className="notice info">
          <FiAlertTriangle />
          <span>Bu testda urinishlar bor, shuning uchun savollar testga qo'shilmaydi (natijalar buzilmasligi uchun). Yaratilgan savollar
            <b> savol bankiga</b> saqlanadi, keyin yangi testga "Bankdan qo'shish" orqali olasiz.</span>
        </div>
      )}

      {(phase === 'form' || phase === 'saving') && (
        <div className="stack">
          <Input label="Mavzu" value={form.topic} placeholder="Masalan: kvadrat tenglamalar, diskriminant" maxLength={120}
            onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          <div className="form-grid">
            <Input label="Savollar soni (1-10)" type="number" min="1" max="10" value={form.count} onChange={(e) => setForm({ ...form, count: e.target.value })} />
            <Select label="Qiyinlik" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
              <option value="mixed">Aralash</option>
              {Object.entries(DIFFICULTY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
            <Input label="Har bir savol bali" type="number" min="1" max="10" value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
          </div>
          <div className="stack tight">
            <span className="label">Savol turlari</span>
            <div className="row" style={{ gap: 18 }}>
              {AI_TYPES.map((t) => <Checkbox key={t} label={QTYPE[t]} checked={form.types.includes(t)} onChange={() => toggleType(t)} />)}
            </div>
          </div>
          <Textarea label="Qo'shimcha talab (ixtiyoriy)" value={form.notes} rows={2} placeholder="Masalan: 9-sinf darajasida, hayotiy misollar bilan"
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          {error && <div className="notice bad"><FiAlertTriangle /><span>{error}</span></div>}
          <p className="muted small">So'rov sizning Claude hisobingiz hisobidan yuboriladi va birinchi marta ruxsat so'raydi. Claude xato qilishi mumkin: qo'shishdan oldin har bir savolni tekshiring.</p>
        </div>
      )}

      {phase === 'loading' && (
        <div className="loader" role="status"><div className="spinner" /><p className="muted" style={{ marginTop: 14 }}>Claude savollarni yozmoqda… Bu bir daqiqagacha vaqt olishi mumkin.</p></div>
      )}

      {phase === 'review' && result && (
        <div className="stack">
          <div className="row" style={{ gap: 10 }}>
            <Badge tone="good"><FiStar /> {result.questions.length} ta savol tayyor</Badge>
            {result.dropped > 0 && <Badge tone="warn">{result.dropped} tasi yaroqsiz bo'lgani uchun tashlandi</Badge>}
          </div>
          {locked && (
            <Select label="Qaysi bankka saqlansin" value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="new">Yangi bank: "{`${testTitle || 'Test'}: Claude savollari`}"</option>
              {(banks.data || []).map((b) => <option key={b.id} value={b.id}>{b.name} ({b.questions_count} savol)</option>)}
            </Select>
          )}
          <div className="stack" style={{ maxHeight: 420, overflowY: 'auto' }}>
            {result.questions.map((q, i) => (
              <div key={i} className="q-item">
                <label className="check" style={{ alignItems: 'flex-start' }}>
                  <input type="checkbox" checked={selected.has(i)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })} />
                  <div className="stack tight" style={{ minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}>
                      <Badge tone="accent">{QTYPE[q.question_type]}</Badge><Badge>{DIFFICULTY[q.difficulty]}</Badge>{q.topic && <Badge tone="warn">{q.topic}</Badge>}
                    </div>
                    <MathRenderer text={q.text} as="div" />
                    {q.choices.map((c, ci) => (
                      <div key={ci} className={`choice-view ${c.is_correct ? 'correct' : ''}`}>
                        {c.is_correct ? <FiCheckCircle style={{ color: 'var(--good)' }} /> : <span style={{ width: 16 }} />}<MathRenderer text={c.text} />
                      </div>
                    ))}
                  </div>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
