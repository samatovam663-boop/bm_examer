import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { FiImage, FiPlus, FiTrash2 } from 'react-icons/fi'
import { api, errorMessage, fieldErrors } from '../../api'
import { Button, Field, Input, Modal, Select } from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import { DIFFICULTY, QTYPE, fileToDataUrl } from '../../utils/format'

const TF = [{ text: 'True', is_correct: true }, { text: 'False', is_correct: false }]
const blank = () => [{ text: '', is_correct: true }, { text: '', is_correct: false }]

/** target: { testId } | { bankId }; question: tahrirlanayotgan savol (yoki bo'sh). */
export default function QuestionEditor({ target, question, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    question_type: question?.question_type || 'single',
    text: question?.text || '',
    image: question?.image || null,
    points: question?.points ?? 1,
    topic: question?.topic || '',
    difficulty: question?.difficulty || 'medium',
    choices: question?.choices?.map(({ text, is_correct }) => ({ text, is_correct })) || blank(),
  }))
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const setType = (type) => {
    let choices = form.choices
    if (type === 'true_false') choices = TF.map((c) => ({ ...c }))
    else if (form.question_type === 'true_false') choices = blank()
    else if (type === 'single') {
      const first = choices.findIndex((c) => c.is_correct)
      choices = choices.map((c, i) => ({ ...c, is_correct: i === (first < 0 ? 0 : first) }))
    }
    setForm({ ...form, question_type: type, choices })
  }

  const setChoice = (i, patch) => {
    const choices = form.choices.map((c, idx) => {
      if (idx === i) return { ...c, ...patch }
      // bitta javobli savolda faqat bittasi to'g'ri
      if (patch.is_correct && form.question_type !== 'multiple') return { ...c, is_correct: false }
      return c
    })
    setForm({ ...form, choices })
  }

  const addChoice = () => setForm({ ...form, choices: [...form.choices, { text: '', is_correct: false }] })
  const removeChoice = (i) => setForm({ ...form, choices: form.choices.filter((_, idx) => idx !== i) })

  const pickImage = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setForm({ ...form, image: await fileToDataUrl(file) })
    } catch (err) {
      toast.error(err.message)
    }
    e.target.value = ''
  }

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const payload = { ...form, points: Number(form.points) }
      if (question) await api.updateQuestion(question.id, payload)
      else if (target.bankId) await api.addBankQuestion(target.bankId, payload)
      else await api.addQuestion(target.testId, payload)
      toast.success(question ? 'Savol yangilandi' : 'Savol qo\'shildi')
      onSaved()
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (fe.detail || !Object.keys(fe).length) toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const isMulti = form.question_type === 'multiple'
  const isTF = form.question_type === 'true_false'

  return (
    <Modal wide title={question ? 'Savolni tahrirlash' : 'Yangi savol'} onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save} disabled={busy}>Saqlash</Button></>
    )}>
      <div className="form-grid">
        <Select label="Savol turi" value={form.question_type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(QTYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Input label="Ball" type="number" min="1" value={form.points} error={errors.points} onChange={(e) => setForm({ ...form, points: e.target.value })} />
        <Select label="Qiyinlik" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
          {Object.entries(DIFFICULTY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>

      <Input label="Mavzu (ixtiyoriy)" value={form.topic} maxLength={60} placeholder="Masalan: Diskriminant"
        help="O'quvchilar va siz mavzular bo'yicha tahlilni ko'rasiz: qaysi mavzu yaxshi, qaysi biri zaif."
        onChange={(e) => setForm({ ...form, topic: e.target.value })} />

      <Field label="Savol matni" error={errors.text} help="Formulalar $...$ ichida yoziladi, masalan $x^2 + 1$ yoki $\frac{a}{b}$">
        {(id) => <textarea id={id} className={`textarea ${errors.text ? 'invalid' : ''}`} value={form.text} rows={3}
          onChange={(e) => setForm({ ...form, text: e.target.value })} />}
      </Field>
      {form.text.includes('$') && (
        <div className="card flat" style={{ padding: 12 }}>
          <span className="label">Ko'rinishi</span>
          <div><MathRenderer text={form.text} /></div>
        </div>
      )}

      <div className="stack tight">
        <input ref={fileRef} id="q-image" type="file" accept="image/*" hidden onChange={pickImage} />
        <div className="row">
          <Button size="sm" onClick={() => fileRef.current?.click()}><FiImage /> {form.image ? 'Rasmni almashtirish' : 'Rasm qo\'shish'}</Button>
          {form.image && <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, image: null })}>Rasmni olib tashlash</Button>}
        </div>
        {form.image && <img className="q-img" src={form.image} alt="Savol rasmi" />}
      </div>

      <div className="stack tight">
        <span className="label">Variantlar {isMulti ? '(to\'g\'ri javoblarni belgilang)' : '(to\'g\'ri javobni tanlang)'}</span>
        {form.choices.map((c, i) => (
          <div className="choice-edit" key={i}>
            <input type={isMulti ? 'checkbox' : 'radio'} name="correct" checked={c.is_correct} aria-label={`${i + 1}-variant to'g'ri`}
              style={{ width: 18, height: 18, accentColor: 'var(--accent)', flex: 'none' }}
              onChange={(e) => setChoice(i, { is_correct: isMulti ? e.target.checked : true })} />
            <input className="input" value={c.text} readOnly={isTF} placeholder={`${i + 1}-variant`} aria-label={`${i + 1}-variant matni`}
              onChange={(e) => setChoice(i, { text: e.target.value })} />
            {!isTF && form.choices.length > 2 && (
              <Button size="sm" icon variant="ghost" aria-label="Variantni o'chirish" onClick={() => removeChoice(i)}><FiTrash2 /></Button>
            )}
          </div>
        ))}
        {errors.choices && <span className="err" style={{ color: 'var(--bad)', fontSize: '0.82rem' }}>{errors.choices}</span>}
        {!isTF && form.choices.length < 8 && <div><Button size="sm" onClick={addChoice}><FiPlus /> Variant qo'shish</Button></div>}
      </div>
    </Modal>
  )
}
