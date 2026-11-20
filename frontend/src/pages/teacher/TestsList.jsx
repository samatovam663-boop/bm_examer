import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { FiBarChart2, FiClock, FiCopy, FiHelpCircle, FiPlus, FiRepeat, FiSearch, FiUser } from 'react-icons/fi'
import { api, errorMessage } from '../../api'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { useAsync, useDebounced } from '../../hooks/useAsync'
import { Badge, Button, Card, EmptyState, Loader, PageHead, Pagination } from '../../components/common/ui'
import { DIFFICULTY, STATUS, copyText } from '../../utils/format'

const SIZE = 9

/** O'qituvchi: o'z testlari. Admin: barcha testlar (monitoring). */
export default function TestsList() {
  const { user } = useAuth()
  const base = HOME_BY_ROLE[user.role]
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [subject, setSubject] = useState('')
  const [page, setPage] = useState(1)
  const q = useDebounced(search)
  const subjects = useAsync(() => api.listSubjects())
  const { data, loading, error } = useAsync(
    () => api.listTests({ search: q, status, subject, page, page_size: SIZE }), [q, status, subject, page])

  const copy = async (code) => {
    const ok = await copyText(code)
    if (ok) toast.success(`${code} nusxalandi`)
    else toast.error('Nusxalab bo\'lmadi')
  }

  return (
    <div className="stack">
      <PageHead
        title={user.role === 'admin' ? 'Testlar monitoringi' : 'Testlarim'}
        text={user.role === 'admin' ? 'Barcha o\'qituvchilarning testlari' : 'Test yarating, aktivlashtiring va natijalarni kuzating'}
        actions={user.role !== 'admin' && <Button variant="primary" onClick={() => navigate(`${base}/tests/new`)}><FiPlus /> Yangi test</Button>}
      />
      <div className="toolbar">
        <div className="search">
          <FiSearch />
          <input className="input" aria-label="Qidirish" placeholder="Test nomi yoki kodi" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="select" aria-label="Holat" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Barcha holatlar</option>
          {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select className="select" aria-label="Fan" value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1) }}>
          <option value="">Barcha fanlar</option>
          {(subjects.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {loading && !data ? <Loader /> : error ? <div className="notice bad">{error}</div> : data.results.length === 0 ? (
        <Card><EmptyState title="Test topilmadi" text="Filtrni o'zgartiring yoki yangi test yarating."
          action={user.role !== 'admin' && <Button variant="primary" onClick={() => navigate(`${base}/tests/new`)}><FiPlus /> Test yaratish</Button>} /></Card>
      ) : (
        <>
          <div className="grid cols-3">
            {data.results.map((t) => (
              <Card key={t.id} className="test-card">
                <div className="row between" style={{ flexWrap: 'nowrap' }}>
                  <Badge tone={STATUS[t.status].tone} dot>{STATUS[t.status].label}</Badge>
                  <button className="code-chip" style={{ cursor: 'pointer' }} onClick={() => copy(t.test_code)} title="Nusxalash">{t.test_code}</button>
                </div>
                <div className="grow">
                  <h3><Link to={`${base}/tests/${t.id}`} style={{ color: 'inherit' }}>{t.title}</Link></h3>
                  <p className="muted small" style={{ marginTop: 4 }}>{t.subject_name || 'Fansiz'} · {DIFFICULTY[t.difficulty]}</p>
                </div>
                <div className="meta">
                  <span><FiHelpCircle /> {t.questions_count} savol</span>
                  <span><FiClock /> {t.duration_minutes} daq</span>
                  <span><FiRepeat /> {t.max_attempts || '∞'}</span>
                  {user.role === 'admin' && <span><FiUser /> {t.created_by_name}</span>}
                </div>
                <div className="row">
                  <Button size="sm" onClick={() => navigate(`${base}/tests/${t.id}`)}>Ochish</Button>
                  <Button size="sm" variant="ghost" onClick={() => navigate(`${base}/results/${t.id}`)}><FiBarChart2 /> Natijalar</Button>
                  <Button size="sm" variant="ghost" icon aria-label="Nusxa olish" title="Testdan nusxa olish"
                    onClick={async () => {
                      try {
                        const c = await api.duplicateTest(t.id)
                        toast.success('Nusxa yaratildi (qoralama)')
                        navigate(`${base}/tests/${c.id}`)
                      } catch (err) { toast.error(errorMessage(err)) }
                    }}><FiCopy /></Button>
                </div>
              </Card>
            ))}
          </div>
          <Card pad0 flat style={{ border: 0, background: 'transparent' }}>
            <Pagination page={page} pageSize={SIZE} count={data.count} onChange={setPage} />
          </Card>
        </>
      )}
    </div>
  )
}
