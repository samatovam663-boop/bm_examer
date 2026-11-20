import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FiBarChart2, FiEdit2, FiPlus, FiTrash2, FiUserMinus, FiUserPlus, FiUsers } from 'react-icons/fi'
import { api, errorMessage, fieldErrors } from '../../api'
import { useAsync, useDebounced } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import {
  Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loader, Modal, PageHead, Pager,
} from '../../components/common/ui'
import { pctTone } from '../../utils/format'

function GroupForm({ group, onClose, onSaved }) {
  const [name, setName] = useState(group?.name || '')
  const [error, setError] = useState('')
  const save = async () => {
    try {
      await api.saveGroup({ id: group?.id, name })
      toast.success('Saqlandi')
      onSaved()
    } catch (err) {
      setError(fieldErrors(err).name || errorMessage(err))
    }
  }
  return (
    <Modal title={group ? 'Guruh nomini o\'zgartirish' : 'Yangi guruh'} onClose={onClose}
      footer={<><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save}>Saqlash</Button></>}>
      <Input label="Guruh nomi" value={name} error={error} autoFocus placeholder="Masalan: 9-A" maxLength={100}
        onChange={(e) => { setName(e.target.value); setError('') }} />
    </Modal>
  )
}

/** A'zolarni boshqarish: ro'yxatdan o'chirish va qidiruv orqali o'quvchi qo'shish. */
function MembersDialog({ groupId, onClose, onChanged }) {
  const [group, setGroup] = useState(null)
  const [search, setSearch] = useState('')
  const q = useDebounced(search, 250)
  const [pool, setPool] = useState([])
  const [busy, setBusy] = useState(false)

  const loadGroup = async () => setGroup((await api.listGroups()).find((g) => g.id === groupId))
  useEffect(() => { loadGroup() }, [groupId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let alive = true
    api.groupPool({ search: q, exclude_group: groupId }).then((p) => alive && setPool(p)).catch(() => alive && setPool([]))
    return () => { alive = false }
  }, [q, groupId, group?.student_count])

  const change = async (payload) => {
    setBusy(true)
    try {
      setGroup(await api.groupMembers(groupId, payload))
      onChanged()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal wide title={group ? `${group.name}: a'zolar` : 'A\'zolar'} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Tayyor</Button>}>
      {!group ? <Loader /> : (
        <div className="grid cols-2">
          <div className="stack tight">
            <span className="label">Guruhda ({group.student_count})</span>
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {group.students.length === 0 && <p className="muted small">Hali o'quvchi yo'q. O'ng tomondan qo'shing.</p>}
              {group.students.map((s) => (
                <div className="list-row" key={s.id}>
                  <Avatar user={s} />
                  <div className="grow"><b>{s.name}</b><div className="muted small">@{s.username}</div></div>
                  <Button size="sm" variant="ghost" icon aria-label={`${s.name}ni chiqarish`} disabled={busy} onClick={() => change({ remove: [s.id] })}><FiUserMinus /></Button>
                </div>
              ))}
            </div>
          </div>
          <div className="stack tight">
            <span className="label">O'quvchi qo'shish</span>
            <input className="input" aria-label="O'quvchi qidirish" placeholder="Ism yoki login" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {pool.length === 0 && <p className="muted small">Mos o'quvchi topilmadi yoki hammasi guruhda.</p>}
              {pool.map((s) => (
                <div className="list-row" key={s.id}>
                  <Avatar user={s} />
                  <div className="grow"><b>{s.name}</b><div className="muted small">@{s.username}</div></div>
                  <Button size="sm" disabled={busy} onClick={() => change({ add: [s.id] })}><FiUserPlus /> Qo'shish</Button>
                </div>
              ))}
            </div>
            {pool.length > 1 && (
              <Button size="sm" disabled={busy} onClick={() => change({ add: pool.map((s) => s.id) })}>Ko'rsatilganlarning hammasini qo'shish ({pool.length})</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function StatsDialog({ group, onClose }) {
  const { data, loading, error } = useAsync(() => api.groupStats(group.id), [group.id])
  return (
    <Modal wide title={`${group.name}: natijalar`} onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Yopish</Button>}>
      {loading ? <Loader /> : error ? <div className="notice bad">{error}</div> : (
        <div className="stack">
          <div className="row" style={{ gap: 12 }}>
            <Badge tone={data.average == null ? '' : pctTone(data.average)}>O'rtacha: {data.average == null ? '—' : `${data.average}%`}</Badge>
            <Badge>{data.attempts} ta urinish</Badge>
          </div>
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>O'quvchi</th><th>Urinishlar</th><th>O'rtacha</th><th>Eng yaxshi</th><th>Bloklangan</th></tr></thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.name}</b></td>
                    <td className="num">{m.attempts}</td>
                    <td>{m.average == null ? <span className="muted">—</span> : <Badge tone={pctTone(m.average)}>{m.average}%</Badge>}</td>
                    <td className="num">{m.best == null ? '—' : `${m.best}%`}</td>
                    <td>{m.blocked ? <Badge tone="bad">{m.blocked}</Badge> : <span className="muted">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.members.length === 0 && <p className="muted">Guruh bo'sh.</p>}
        </div>
      )}
    </Modal>
  )
}

export default function Groups() {
  const { data, loading, error, reload } = useAsync(() => api.listGroups())
  const [form, setForm] = useState(null)
  const [members, setMembers] = useState(null)
  const [stats, setStats] = useState(null)
  const [del, setDel] = useState(null)
  const pg = usePaged(data || [], 9)

  const remove = async () => {
    try {
      await api.deleteGroup(del.id)
      toast.success('Guruh o\'chirildi')
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
    setDel(null)
  }

  return (
    <div className="stack">
      <PageHead title="Guruhlar" text="O'quvchilarni sinflarga bo'ling va testni faqat tanlangan guruhga tayinlang"
        actions={<Button variant="primary" onClick={() => setForm({})}><FiPlus /> Yangi guruh</Button>} />
      {loading && !data ? <Loader /> : error ? <div className="notice bad">{error}</div> : data.length === 0 ? (
        <Card><EmptyState icon={<FiUsers />} title="Guruhlar hali yo'q"
          text="Guruh yarating, o'quvchilarni qo'shing, keyin test yaratishda shu guruhni tanlang: test faqat ularga ko'rinadi." /></Card>
      ) : (
        <>
          <div className="grid cols-3">
            {pg.items.map((g) => (
              <Card key={g.id} className="test-card">
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <span className="stat-icon"><FiUsers /></span>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Button size="sm" icon aria-label="Nomini o'zgartirish" onClick={() => setForm(g)}><FiEdit2 /></Button>
                    <Button size="sm" icon variant="danger" aria-label="Guruhni o'chirish" onClick={() => setDel(g)}><FiTrash2 /></Button>
                  </div>
                </div>
                <div className="grow">
                  <h3>{g.name}</h3>
                  <p className="muted small">{g.student_count} ta o'quvchi</p>
                </div>
                <div className="row">
                  <Button size="sm" variant="primary" onClick={() => setMembers(g)}><FiUserPlus /> A'zolar</Button>
                  <Button size="sm" onClick={() => setStats(g)}><FiBarChart2 /> Natijalar</Button>
                </div>
              </Card>
            ))}
          </div>
          <Pager page={pg.page} pageSize={pg.pageSize} count={pg.count} onChange={pg.setPage} />
        </>
      )}
      {form && <GroupForm group={form.id ? form : null} onClose={() => setForm(null)} onSaved={() => { setForm(null); reload() }} />}
      {members && <MembersDialog groupId={members.id} onClose={() => setMembers(null)} onChanged={reload} />}
      {stats && <StatsDialog group={stats} onClose={() => setStats(null)} />}
      {del && (
        <ConfirmDialog danger title="Guruhni o'chirish" confirmLabel="O'chirish" onClose={() => setDel(null)} onConfirm={remove}
          text={`"${del.name}" guruhi o'chiriladi. O'quvchilar tizimda qoladi. Shu guruhga tayinlangan testlar guruhdan chiqariladi (guruhsiz qolsa, hamma o'quvchiga ko'rinadi).`} />
      )}
    </div>
  )
}
