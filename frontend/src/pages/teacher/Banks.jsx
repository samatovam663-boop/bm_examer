import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiArrowLeft, FiCheckCircle, FiDatabase, FiEdit2, FiPlus, FiTrash2, FiUpload, FiZap } from 'react-icons/fi'
import { api, errorMessage, fieldErrors } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loader, Modal, PageHead, Pager, Select,
} from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import QuestionEditor from './QuestionEditor'
import { AiGenerateDialog, QuestionFileDialog } from './QuestionTools'
import { DIFFICULTY, QTYPE } from '../../utils/format'

export function BanksList() {
  const navigate = useNavigate()
  const banks = useAsync(() => api.listBanks())
  const subjects = useAsync(() => api.listSubjects())
  const [creating, setCreating] = useState(false)
  const [del, setDel] = useState(null)
  const pg = usePaged(banks.data || [], 9)

  const remove = async () => {
    try {
      await api.deleteBank(del.id)
      toast.success('Bank o\'chirildi')
      banks.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setDel(null)
  }

  return (
    <div className="stack">
      <PageHead title="Savol banki" text="Savollarni saqlang va testlarga qayta ishlating"
        actions={<Button variant="primary" onClick={() => setCreating(true)}><FiPlus /> Yangi bank</Button>} />
      {banks.loading ? <Loader /> : banks.error ? <div className="notice bad">{banks.error}</div> : banks.data.length === 0 ? (
        <Card><EmptyState icon={<FiDatabase />} title="Bank hali yo'q" text="Bank yarating va savollarni to'plang." /></Card>
      ) : (
        <>
        <div className="grid cols-3">
          {pg.items.map((b) => (
            <Card key={b.id} className="test-card">
              <div className="row between" style={{ flexWrap: 'nowrap' }}>
                <span className="stat-icon"><FiDatabase /></span>
                <Button size="sm" icon variant="danger" aria-label="Bankni o'chirish" onClick={() => setDel(b)}><FiTrash2 /></Button>
              </div>
              <div className="grow">
                <h3>{b.name}</h3>
                <p className="muted small">{b.subject_name || 'Fansiz'} · {b.questions_count} savol</p>
              </div>
              <div><Button size="sm" onClick={() => navigate(`/teacher/banks/${b.id}`)}>Ochish</Button></div>
            </Card>
          ))}
        </div>
        <Pager page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
        </>
      )}
      {creating && <BankForm subjects={subjects.data || []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); banks.reload() }} />}
      {del && (
        <ConfirmDialog danger title="Bankni o'chirish" confirmLabel="O'chirish" onClose={() => setDel(null)} onConfirm={remove}
          text={`"${del.name}" va undagi ${del.questions_count} ta savol o'chiriladi. Testlarga nusxalangan savollar saqlanib qoladi.`} />
      )}
    </div>
  )
}

function BankForm({ subjects, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', subject: '' })
  const [errors, setErrors] = useState({})
  const save = async () => {
    try {
      await api.saveBank(form)
      toast.success('Bank yaratildi')
      onSaved()
    } catch (err) {
      setErrors(fieldErrors(err))
    }
  }
  return (
    <Modal title="Yangi bank" onClose={onClose} footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save}>Yaratish</Button></>}>
      <Input label="Nomi" value={form.name} error={errors.name} autoFocus onChange={(e) => setForm({ ...form, name: e.target.value })} />
      <Select label="Fan" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
        <option value="">Fan tanlanmagan</option>
        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </Select>
    </Modal>
  )
}

export function BankDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const banks = useAsync(() => api.listBanks())
  const qs = useAsync(() => api.listBankQuestions(id), [id])
  const [editor, setEditor] = useState(null)
  const [del, setDel] = useState(null)
  const [fileOpen, setFileOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const pg = usePaged(qs.data || [], 10)
  const bank = banks.data?.find((b) => b.id === Number(id))

  const remove = async () => {
    try {
      await api.deleteQuestion(del.id)
      toast.success('Savol o\'chirildi')
      qs.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setDel(null)
  }

  if (qs.loading && !qs.data) return <Loader />

  return (
    <div className="stack">
      <PageHead title={bank?.name || 'Bank'} text={`${qs.data?.length ?? 0} ta savol`} actions={(
        <>
          <Button onClick={() => navigate('/teacher/banks')}><FiArrowLeft /> Orqaga</Button>
          <Button onClick={() => setAiOpen(true)}><FiZap /> Claude bilan yaratish</Button>
          <Button onClick={() => setFileOpen(true)}><FiUpload /> Fayl: import / eksport</Button>
          <Button variant="primary" onClick={() => setEditor({})}><FiPlus /> Savol qo'shish</Button>
        </>
      )} />
      <Card>
        {qs.data?.length === 0 ? <EmptyState title="Bank bo'sh" text="Birinchi savolni qo'shing." /> : (
          <div className="stack">
            {pg.items.map((q, i) => (
              <div className="q-item" key={q.id}>
                <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <b className="num">{pg.offset + i + 1}.</b><Badge tone="accent">{QTYPE[q.question_type]}</Badge>
                      <Badge>{q.points} ball</Badge><Badge>{DIFFICULTY[q.difficulty]}</Badge>{q.topic && <Badge tone="warn">{q.topic}</Badge>}
                    </div>
                    <MathRenderer text={q.text} as="div" />
                    {q.image && <img className="q-img" src={q.image} alt="Savol rasmi" />}
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Button size="sm" icon aria-label="Tahrirlash" onClick={() => setEditor({ question: q })}><FiEdit2 /></Button>
                    <Button size="sm" icon variant="danger" aria-label="O'chirish" onClick={() => setDel(q)}><FiTrash2 /></Button>
                  </div>
                </div>
                <div className="choices">
                  {q.choices.map((c) => (
                    <div key={c.id} className={`choice-view ${c.is_correct ? 'correct' : ''}`}>
                      {c.is_correct ? <FiCheckCircle style={{ color: 'var(--good)' }} /> : <span style={{ width: 16 }} />}
                      <MathRenderer text={c.text} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Pager page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
      {fileOpen && <QuestionFileDialog target={{ bankId: Number(id) }} questions={qs.data || []} onClose={() => setFileOpen(false)}
        onImported={() => { setFileOpen(false); qs.reload(); banks.reload() }} />}
      {aiOpen && <AiGenerateDialog target={{ bankId: Number(id) }} testTitle={bank?.name} existing={(qs.data || []).map((q) => q.text)}
        onClose={() => setAiOpen(false)} onAdded={() => { setAiOpen(false); qs.reload(); banks.reload() }} />}
      {editor && <QuestionEditor target={{ bankId: Number(id) }} question={editor.question} onClose={() => setEditor(null)}
        onSaved={() => { setEditor(null); qs.reload(); banks.reload() }} />}
      {del && <ConfirmDialog danger title="Savolni o'chirish" confirmLabel="O'chirish" text="Savol bankdan o'chiriladi." onClose={() => setDel(null)} onConfirm={remove} />}
    </div>
  )
}
