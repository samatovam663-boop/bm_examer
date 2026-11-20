import { useState } from 'react'
import toast from 'react-hot-toast'
import { FiEdit2, FiPlus, FiTrash2 } from 'react-icons/fi'
import { api, errorMessage, fieldErrors } from '../../api'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import { Button, Card, ConfirmDialog, EmptyState, Input, Loader, Modal, PageHead, Pager, Textarea } from '../../components/common/ui'

/** Fanlar: admin va teacher ko'radi/tahrirlaydi, o'chirish faqat admin. */
export default function Subjects() {
  const { data, loading, error, reload } = useAsync(() => api.listSubjects())
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const pg = usePaged(data || [], 9)

  const remove = async () => {
    try {
      await api.deleteSubject(del.id)
      toast.success('Fan o\'chirildi')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setDel(null)
  }

  return (
    <div className="stack">
      <PageHead title="Fanlar" text="Testlar shu fanlar bo'yicha guruhlanadi"
        actions={<Button variant="primary" onClick={() => setEdit({})}><FiPlus /> Fan qo'shish</Button>} />
      {loading ? <Loader /> : error ? <div className="notice bad">{error}</div> : data.length === 0 ? (
        <Card><EmptyState title="Fanlar hali yo'q" text="Birinchi fanni qo'shing." /></Card>
      ) : (
        <>
        <div className="grid cols-3">
          {pg.items.map((s) => (
            <Card key={s.id}>
              <div className="stack tight">
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <span className="stat-icon" style={{ width: 40, height: 40, fontSize: '1.1rem', fontWeight: 700 }}>{s.icon || s.name[0]}</span>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Button size="sm" icon aria-label="Tahrirlash" onClick={() => setEdit(s)}><FiEdit2 /></Button>
                    <Button size="sm" icon variant="danger" aria-label="O'chirish" onClick={() => setDel(s)}><FiTrash2 /></Button>
                  </div>
                </div>
                <h3>{s.name}</h3>
                <p className="muted small">{s.description || 'Tavsif yo\'q'}</p>
              </div>
            </Card>
          ))}
        </div>
        <Pager page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
        </>
      )}
      {edit && <SubjectForm subject={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {del && (
        <ConfirmDialog danger title="Fanni o'chirish" confirmLabel="O'chirish" onClose={() => setDel(null)} onConfirm={remove}
          text={`"${del.name}" fani o'chiriladi. Unga biriktirilgan testlar fansiz qoladi.`} />
      )}
    </div>
  )
}

function SubjectForm({ subject, onClose, onSaved }) {
  const [form, setForm] = useState({ id: subject.id, name: subject.name || '', description: subject.description || '', icon: subject.icon || '' })
  const [errors, setErrors] = useState({})

  const save = async () => {
    try {
      await api.saveSubject(form)
      toast.success('Saqlandi')
      onSaved()
    } catch (err) {
      setErrors(fieldErrors(err))
    }
  }

  return (
    <Modal title={subject.id ? 'Fanni tahrirlash' : 'Yangi fan'} onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save}>Saqlash</Button></>
    )}>
      <Input label="Nomi" value={form.name} error={errors.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
      <Input label="Belgi (1-2 ta harf yoki simvol)" maxLength={3} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} />
      <Textarea label="Tavsif" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
    </Modal>
  )
}
