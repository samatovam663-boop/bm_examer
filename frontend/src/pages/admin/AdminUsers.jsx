import { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import {
  FiCheckCircle, FiCopy, FiDownload, FiEdit2, FiFileText, FiGrid, FiKey, FiSearch, FiTrash2, FiUpload, FiUserPlus, FiUsers,
} from 'react-icons/fi'
import { exportExcel, exportPdf, exportWord, parseStudentFile, saveFile, usersToTsv } from '../../utils/fileIO'
import { api, errorMessage, fieldErrors } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { useAsync, useDebounced } from '../../hooks/useAsync'
import {
  Avatar, Badge, Button, Card, Checkbox, ConfirmDialog, EmptyState, Input, Loader, Modal, PageHead, Pagination, Select,
} from '../../components/common/ui'
import { ROLE, copyText, fmtDate, fullName } from '../../utils/format'

const SIZE = 8

export default function AdminUsers() {
  const { user: me } = useAuth()
  const [search, setSearch] = useState('')
  const [role, setRole] = useState('')
  const [active, setActive] = useState('')
  const [page, setPage] = useState(1)
  const [edit, setEdit] = useState(null)
  const [del, setDel] = useState(null)
  const [creating, setCreating] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [reset, setReset] = useState(null)
  const [exporting, setExporting] = useState(false)
  const q = useDebounced(search)

  const { data, loading, error, reload } = useAsync(
    () => api.listUsers({ search: q, role, is_active: active, page, page_size: SIZE }), [q, role, active, page])

  const remove = async () => {
    try {
      await api.deleteUser(del.id)
      toast.success('Foydalanuvchi o\'chirildi')
      setDel(null)
      reload()
    } catch (err) {
      toast.error(errorMessage(err))
      setDel(null)
    }
  }

  return (
    <div className="stack">
      <PageHead title="Foydalanuvchilar" text="Rollarni o'zgartirish, tahrirlash va o'chirish"
        actions={(
          <>
            <Button variant="primary" onClick={() => setCreating(true)}><FiUserPlus /> O'quvchi qo'shish</Button>
            <Button onClick={() => setBulk(true)}><FiUsers /> Ko'plab qo'shish</Button>
            <Button onClick={() => setExporting(true)}><FiDownload /> Yuklab olish</Button>
          </>
        )} />
      <div className="toolbar">
        <div className="search">
          <FiSearch />
          <input className="input" placeholder="Ism, login yoki email" aria-label="Qidirish" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="select" aria-label="Rol" value={role} onChange={(e) => { setRole(e.target.value); setPage(1) }}>
          <option value="">Barcha rollar</option>
          {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="select" aria-label="Holat" value={active} onChange={(e) => { setActive(e.target.value); setPage(1) }}>
          <option value="">Har qanday holat</option>
          <option value="true">Faol</option>
          <option value="false">Faol emas</option>
        </select>
      </div>

      <Card pad0>
        {loading && !data ? <Loader /> : error ? <div className="notice bad" style={{ margin: 16 }}>{error}</div> : data.results.length === 0 ? (
          <EmptyState title="Foydalanuvchi topilmadi" text="Qidiruv yoki filtrni o'zgartirib ko'ring." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Foydalanuvchi</th><th>Rol</th><th>Telefon</th><th>Holat</th><th>Qo'shilgan</th><th /></tr></thead>
                <tbody>
                  {data.results.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="cell-user">
                          <Avatar user={u} />
                          <div><b>{fullName(u)}</b><div className="muted small">@{u.username} · {u.email}</div></div>
                        </div>
                      </td>
                      <td><Badge tone={u.role === 'admin' ? 'accent' : u.role === 'teacher' ? 'warn' : ''}>{ROLE[u.role]}</Badge></td>
                      <td className="muted">{u.phone || '—'}</td>
                      <td><Badge tone={u.is_active ? 'good' : 'bad'} dot>{u.is_active ? 'Faol' : 'Bloklangan'}</Badge></td>
                      <td className="muted num">{fmtDate(u.created_at)}</td>
                      <td>
                        <div className="actions">
                          <Button size="sm" icon aria-label="Yangi parol berish" title="Yangi parol berish" onClick={() => setReset(u)}><FiKey /></Button>
                          <Button size="sm" icon aria-label="Tahrirlash" onClick={() => setEdit(u)}><FiEdit2 /></Button>
                          <Button size="sm" icon variant="danger" aria-label="O'chirish" disabled={u.id === me.id} onClick={() => setDel(u)}><FiTrash2 /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={SIZE} count={data.count} onChange={setPage} />
          </>
        )}
      </Card>

      {creating && <StudentCreator onClose={() => setCreating(false)} onSaved={() => { setCreating(false); setPage(1); reload() }} />}
      {exporting && <ExportDialog filter={{ search: q, role, is_active: active }} onClose={() => setExporting(false)} />}
      {reset && <PasswordReset user={reset} onClose={() => setReset(null)} />}
      {bulk && <BulkCreator onClose={() => setBulk(false)} onDone={() => { setPage(1); reload() }} />}
      {edit && <UserEditor user={edit} isSelf={edit.id === me.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
      {del && (
        <ConfirmDialog danger title="Foydalanuvchini o'chirish" confirmLabel="O'chirish" onClose={() => setDel(null)} onConfirm={remove}
          text={`${fullName(del)} (@${del.username}) va uning barcha natijalari o'chiriladi. Bu amalni qaytarib bo'lmaydi.`} />
      )}
    </div>
  )
}

function StudentCreator({ onClose, onSaved }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      await api.createUser(form)
      toast.success('O\'quvchi qo\'shildi')
      onSaved()
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (!Object.keys(fe).length) toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Yangi o'quvchi" onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save} disabled={busy}>Qo'shish</Button></>
    )}>
      <div className="form-grid">
        <Input label="Ism" value={form.first_name} onChange={set('first_name')} autoFocus />
        <Input label="Familiya" value={form.last_name} onChange={set('last_name')} />
        <Input label="Login" value={form.username} onChange={set('username')} error={errors.username} autoComplete="off" />
        <Input label="Email" type="email" value={form.email} onChange={set('email')} error={errors.email} />
        <Input label="Telefon" value={form.phone} onChange={set('phone')} />
        <Input label="Boshlang'ich parol" type="password" value={form.password} onChange={set('password')} error={errors.password}
          help="Kamida 8 ta belgi. O'quvchi keyin profilida o'zgartira oladi." autoComplete="new-password" />
      </div>
    </Modal>
  )
}

const SCOPES = {
  students: { label: 'Faqat o\'quvchilar', params: { role: 'student' }, title: 'O\'quvchilar ro\'yxati', file: 'oquvchilar' },
  all: { label: 'Barcha foydalanuvchilar', params: {}, title: 'Foydalanuvchilar ro\'yxati', file: 'foydalanuvchilar' },
  filter: { label: 'Jadvaldagi filtr natijalari', params: null, title: 'Foydalanuvchilar (filtr)', file: 'filtr' },
}

/** Ro'yxatni Excel / Word / PDF ga yuklab olish yoki nusxalash (parollar hech qachon kiritilmaydi). */
function ExportDialog({ filter, onClose }) {
  const [scope, setScope] = useState('students')
  const [busy, setBusy] = useState('')

  const load = async () => {
    const s = SCOPES[scope]
    const params = s.params ?? filter
    const data = await api.listUsers({ ...params, page: 1, page_size: 100000 })
    if (!data.results.length) throw new Error('Yuklab olish uchun foydalanuvchi topilmadi.')
    return data.results
  }

  const run = async (kind) => {
    setBusy(kind)
    try {
      const users = await load()
      const s = SCOPES[scope]
      if (kind === 'copy') {
        const ok = await copyText(usersToTsv(users))
        if (ok) toast.success(`${users.length} ta qator nusxalandi (Excel'ga qo'yish mumkin)`)
        else toast.error('Nusxalab bo\'lmadi')
        return
      }
      const make = { excel: () => exportExcel(users), word: () => exportWord(users, s.title), pdf: () => exportPdf(users, s.title) }[kind]
      const ext = { excel: 'xlsx', word: 'docx', pdf: 'pdf' }[kind]
      await saveFile(`${s.file}.${ext}`, await make())
      toast.success('Fayl tayyor')
    } catch (err) {
      if (err?.code === 'declined') toast('Saqlash bekor qilindi', { icon: 'ℹ️' })
      else toast.error(err?.message || 'Faylni yaratib bo\'lmadi')
    } finally {
      setBusy('')
    }
  }

  return (
    <Modal title="Ro'yxatni yuklab olish" onClose={onClose} footer={<Button onClick={onClose}>Yopish</Button>}>
      <Select label="Kimlar ro'yxati" value={scope} onChange={(e) => setScope(e.target.value)}>
        {Object.entries(SCOPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
      </Select>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <Button disabled={!!busy} onClick={() => run('excel')}><FiGrid /> {busy === 'excel' ? 'Tayyorlanmoqda…' : 'Excel'}</Button>
        <Button disabled={!!busy} onClick={() => run('word')}><FiFileText /> {busy === 'word' ? 'Tayyorlanmoqda…' : 'Word'}</Button>
        <Button disabled={!!busy} onClick={() => run('pdf')}><FiDownload /> {busy === 'pdf' ? 'Tayyorlanmoqda…' : 'PDF'}</Button>
      </div>
      <div><Button size="sm" disabled={!!busy} onClick={() => run('copy')}><FiCopy /> Jadvalni nusxalash</Button></div>
      <p className="muted small">
        Fayllarda ism, login, rol, telefon, email va holat bo'ladi. Parollar kiritilmaydi: ular saqlanmaydi va ko'rib bo'lmaydi.
        Parol kerak bo'lsa, qatorda "Yangi parol berish" tugmasidan foydalaning.
      </p>
    </Modal>
  )
}

/** Parol esdan chiqqanda admin yangisini beradi. Eski parol hech qachon ko'rsatilmaydi. */
function PasswordReset({ user, onClose }) {
  const [custom, setCustom] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      setDone(await api.resetPassword(user.id, { password: custom }))
      toast.success('Yangi parol berildi')
    } catch (err) {
      setError(fieldErrors(err).password || errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    const ok = await copyText(`Login: ${done.username}\nParol: ${done.password}`)
    if (ok) toast.success('Nusxalandi')
    else toast.error('Nusxalab bo\'lmadi, qo\'lda belgilang')
  }

  if (done) {
    return (
      <Modal title="Yangi parol tayyor" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Tayyor</Button>}>
        <p className="muted">{fullName(user)} uchun yangi kirish ma'lumotlari:</p>
        <div className="card flat" style={{ padding: 14 }}>
          <div className="row between"><span className="muted small">Login</span><b className="mono">{done.username}</b></div>
          <div className="row between" style={{ marginTop: 8 }}><span className="muted small">Yangi parol</span><b className="mono" style={{ fontSize: '1.15rem' }}>{done.password}</b></div>
        </div>
        <div className="notice"><span>Parol faqat hozir ko'rinadi. Uni o'quvchiga yetkazing, u keyin Profil bo'limida o'zgartira oladi.</span></div>
        <div><Button size="sm" onClick={copy}><FiCopy /> Nusxalash</Button></div>
      </Modal>
    )
  }

  return (
    <Modal title="Yangi parol berish" onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" disabled={busy} onClick={submit}><FiKey /> Parol berish</Button></>
    )}>
      <p className="muted">
        <b style={{ color: 'var(--fg)' }}>{fullName(user)}</b> (@{user.username}) eski parolini ko'rib bo'lmaydi, chunki u xavfsizlik uchun saqlanmaydi.
        Yangi parol berilgach, eskisi ishlamay qoladi.
      </p>
      <Input label="Yangi parol (ixtiyoriy)" value={custom} onChange={(e) => setCustom(e.target.value)} error={error}
        help="Bo'sh qoldirsangiz, tasodifiy parol yaratiladi. O'zingiz yozsangiz kamida 8 ta belgi." autoComplete="off" />
    </Modal>
  )
}

const EXAMPLE = `Aziz Yusupov
Madina Karimova, madina.k, Parol2026, +998 90 123 45 67
Bobur Ergashev`

/** Qatorlarni o'qiydi: "Ism Familiya[, login[, parol[, telefon]]]" (vergul, nuqtali vergul yoki Excel'dan tab bilan). */
function parseLines(text) {
  return text.split(/\r?\n/).map((raw, i) => ({ raw, line: i + 1 })).filter((x) => x.raw.trim()).map(({ raw, line }) => {
    const [name = '', username = '', password = '', phone = ''] = raw.split(/\t|;|,/).map((s) => s.trim())
    const parts = name.split(/\s+/).filter(Boolean)
    return { line, first_name: parts[0] || '', last_name: parts.slice(1).join(' '), username, password, phone }
  })
}

function BulkCreator({ onClose, onDone }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [reading, setReading] = useState(false)
  const fileRef = useRef(null)
  const rows = parseLines(text)

  const pickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setReading(true)
    try {
      const { text: imported, count } = await parseStudentFile(file)
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${imported}` : imported))
      toast.success(`${count} ta qator o'qildi. Tekshirib, "Qo'shish" ni bosing.`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setReading(false)
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      const r = await api.createUsersBulk(rows)
      setResult(r)
      if (r.created.length) onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    const lines = result.created.map((u) => `${fullName(u)}\t${u.username}\t${u.password}`).join('\n')
    const ok = await copyText(`Ism\tLogin\tParol\n${lines}`)
    if (ok) toast.success('Ro\'yxat nusxalandi (Excel\'ga qo\'yish mumkin)')
    else toast.error('Nusxalab bo\'lmadi, jadvaldan qo\'lda belgilang')
  }

  if (result) {
    return (
      <Modal wide title="Natija" onClose={onClose} footer={<Button variant="primary" onClick={onClose}>Tayyor</Button>}>
        <div className="row" style={{ gap: 10 }}>
          <Badge tone="good"><FiCheckCircle /> {result.created.length} ta qo'shildi</Badge>
          {result.errors.length > 0 && <Badge tone="bad">{result.errors.length} ta xato</Badge>}
        </div>
        {result.created.length > 0 && (
          <>
            <div className="notice"><span>Parollar faqat hozir ko'rinadi. Ularni nusxalab, o'quvchilarga yetkazing: keyin ko'rib bo'lmaydi.</span></div>
            <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="table">
                <thead><tr><th>Ism</th><th>Login</th><th>Parol</th></tr></thead>
                <tbody>
                  {result.created.map((u) => (
                    <tr key={u.id}><td>{fullName(u)}</td><td className="mono">{u.username}</td><td className="mono">{u.password}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div><Button size="sm" onClick={copy}><FiCopy /> Hammasini nusxalash</Button></div>
          </>
        )}
        {result.errors.length > 0 && (
          <div className="stack tight">
            <span className="label">Qo'shilmagan qatorlar</span>
            {result.errors.map((e) => (
              <div key={e.line} className="notice bad small"><span><b>{e.line}-qator:</b> {e.error}</span></div>
            ))}
          </div>
        )}
      </Modal>
    )
  }

  return (
    <Modal wide title="Ko'plab o'quvchi qo'shish" onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button>
        <Button variant="primary" disabled={!rows.length || busy} onClick={submit}>{busy ? 'Qo\'shilmoqda…' : `${rows.length || ''} ta o'quvchini qo'shish`}</Button></>
    )}>
      <p className="muted small">
        Har bir qatorga bitta o'quvchi yozing: <b>Ism Familiya</b>. Xohlasangiz vergul bilan <b>login</b>, <b>parol</b>, <b>telefon</b> ham qo'shing.
        Login va parol berilmasa, avtomatik yaratiladi. Excel'dan ustunlarni nusxalab qo'yish ham mumkin.
      </p>
      <div className="row">
        <input ref={fileRef} id="bulk-file" type="file" hidden accept=".xlsx,.docx,.pdf,.csv,.txt" onChange={pickFile} />
        <Button size="sm" disabled={reading} onClick={() => fileRef.current?.click()}><FiUpload /> {reading ? 'O\'qilmoqda…' : 'Fayldan yuklash'}</Button>
        <span className="muted small">Excel (.xlsx), Word (.docx), PDF, CSV yoki TXT. Ustunlar: Ism, Familiya, Login, Parol, Telefon.</span>
      </div>
      <label className="field">
        <span className="label">O'quvchilar ro'yxati</span>
        <textarea id="bulk-text" className="textarea" rows={10} value={text} placeholder={EXAMPLE} spellCheck={false}
          onChange={(e) => setText(e.target.value)} />
      </label>
      <span className="muted small">{rows.length ? `${rows.length} ta qator tanildi` : 'Hali qator kiritilmagan'} (ko'pi bilan 200 ta)</span>
    </Modal>
  )
}

function UserEditor({ user, isSelf, onClose, onSaved }) {
  const [form, setForm] = useState({ ...user })
  const [errors, setErrors] = useState({})
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const save = async () => {
    try {
      await api.updateUser(user.id, form)
      toast.success('Saqlandi')
      onSaved()
    } catch (err) {
      const fe = fieldErrors(err)
      setErrors(fe)
      if (fe.detail) toast.error(fe.detail)
    }
  }

  return (
    <Modal title={`@${user.username}`} onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" onClick={save}>Saqlash</Button></>
    )}>
      <div className="form-grid">
        <Input label="Ism" value={form.first_name} onChange={set('first_name')} />
        <Input label="Familiya" value={form.last_name} onChange={set('last_name')} />
        <Input label="Email" value={form.email} onChange={set('email')} />
        <Input label="Telefon" value={form.phone} onChange={set('phone')} />
        <Select label="Rol" value={form.role} onChange={set('role')} disabled={isSelf}>
          {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </div>
      <Checkbox label="Hisob faol" checked={form.is_active} disabled={isSelf}
        onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
      {errors.detail && <div className="notice bad">{errors.detail}</div>}
    </Modal>
  )
}
