import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
  FiArrowDown, FiArrowUp, FiBarChart2, FiCheckCircle, FiClock, FiCopy, FiDatabase, FiEdit2, FiLock, FiPlay, FiPlus,
  FiRepeat, FiTrash2, FiUpload, FiZap,
} from 'react-icons/fi'
import { api, errorMessage, FEATURES } from '../../api'
import { HOME_BY_ROLE, useAuth } from '../../context/AuthContext'
import { useAsync } from '../../hooks/useAsync'
import { usePaged } from '../../hooks/usePaged'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Loader, Modal, PageHead, Pager, Select,
} from '../../components/common/ui'
import MathRenderer from '../../components/common/MathRenderer'
import QuestionEditor from './QuestionEditor'
import { AiGenerateDialog, QuestionFileDialog } from './QuestionTools'
import { DIFFICULTY, QTYPE, SHOW, STATUS, copyText, fmtDateTime } from '../../utils/format'

export default function TestDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const base = HOME_BY_ROLE[user.role]
  const navigate = useNavigate()
  const test = useAsync(() => api.getTest(id), [id])
  const questions = useAsync(() => api.listQuestions(id), [id])
  const results = useAsync(() => api.testResults(id), [id])
  const [editor, setEditor] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [bankOpen, setBankOpen] = useState(false)
  const [fileOpen, setFileOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const pg = usePaged(questions.data || [], 10)

  const reloadAll = () => { test.reload(); questions.reload(); results.reload() }

  if (test.loading && !test.data) return <Loader />
  if (test.error) return <div className="notice bad">{test.error}</div>
  const t = test.data
  const locked = (results.data?.stats.attempts_count ?? 0) > 0 || results.data?.attempts.length > 0

  const run = async (fn, okMsg) => {
    setBusy(true)
    try {
      await fn()
      if (okMsg) toast.success(okMsg)
      reloadAll()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
      setConfirm(null)
    }
  }

  const copy = async () => {
    const ok = await copyText(t.test_code)
    if (ok) toast.success('Test kodi nusxalandi')
    else toast.error('Nusxalab bo\'lmadi, kodni qo\'lda belgilang')
  }

  const duplicate = async () => {
    setBusy(true)
    try {
      const copyOf = await api.duplicateTest(t.id)
      toast.success('Nusxa yaratildi (qoralama). Savollar ko\'chirildi.')
      navigate(`${base}/tests/${copyOf.id}`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  // savol tartibini o'zgartirish: butun ro'yxat bo'yicha qo'shni bilan almashtiriladi (sahifalashga bog'liq emas)
  const move = async (index, delta) => {
    const ids = questions.data.map((q) => q.id)
    const j = index + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[index], ids[j]] = [ids[j], ids[index]]
    try {
      await api.reorderQuestions(t.id, ids)
      questions.reload()
    } catch (err) {
      toast.error(errorMessage(err))
    }
  }

  return (
    <div className="stack">
      <PageHead
        title={t.title}
        text={t.description || 'Tavsif yo\'q'}
        actions={(
          <>
            <Button onClick={() => navigate(`${base}/results/${t.id}`)}><FiBarChart2 /> Natijalar</Button>
            <Button onClick={() => navigate(`${base}/tests/${t.id}/edit`)}><FiEdit2 /> Tahrirlash</Button>
            <Button disabled={busy} onClick={duplicate}><FiCopy /> Nusxa olish</Button>
            {t.status === 'draft' && (
              <Button variant="primary" disabled={busy || !questions.data?.length}
                onClick={() => setConfirm({ kind: 'activate' })}><FiPlay /> Aktivlashtirish</Button>
            )}
            {t.status === 'active' && (
              <Button variant="primary" disabled={busy} onClick={() => setConfirm({ kind: 'complete' })}><FiCheckCircle /> Yakunlash</Button>
            )}
            <Button variant="danger" icon aria-label="Testni o'chirish" onClick={() => setConfirm({ kind: 'delete' })}><FiTrash2 /></Button>
          </>
        )}
      />

      <div className="grid cols-2">
        <Card title="Test kodi">
          <div className="row">
            <span className="code-chip" style={{ fontSize: '1.3rem', padding: '8px 16px' }}>{t.test_code}</span>
            <Button size="sm" onClick={copy}><FiCopy /> Nusxalash</Button>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            {t.status === 'active' ? 'O\'quvchilar shu kod bilan testga kira oladi.' : 'Test aktivlashtirilgach o\'quvchilar kod bilan kira oladi.'}
          </p>
        </Card>
        <Card title="Sozlamalar">
          <div className="row" style={{ gap: 8 }}>
            <Badge tone={STATUS[t.status].tone} dot>{STATUS[t.status].label}</Badge>
            <Badge>{t.subject_name || 'Fansiz'}</Badge>
            <Badge>{DIFFICULTY[t.difficulty]}</Badge>
          </div>
          <div className="meta" style={{ marginTop: 12 }}>
            <span><FiClock /> {t.duration_minutes} daqiqa</span>
            <span><FiRepeat /> {t.max_attempts || 'Cheksiz'} urinish</span>
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>
            Natija: {SHOW[t.show_results]}. {t.shuffle_questions ? 'Savollar aralashadi. ' : ''}{t.shuffle_choices ? 'Variantlar aralashadi.' : ''}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            {t.groups_names?.length ? t.groups_names.map((n) => <Badge key={n} tone="accent">Guruh: {n}</Badge>) : <Badge>Barcha o'quvchilar</Badge>}
            {t.starts_at && <Badge tone="warn">Boshlanadi: {fmtDateTime(t.starts_at)}</Badge>}
            {t.ends_at && <Badge tone="warn">Yopiladi: {fmtDateTime(t.ends_at)}</Badge>}
          </div>
        </Card>
      </div>

      {locked && (
        <div className="notice">
          <FiLock />
          <span>Bu testda yakunlangan urinishlar bor, shuning uchun savollarni oddiy tahrirlab bo'lmaydi (natijalar buzilmasligi uchun).
            {FEATURES.questionAnalysis && (
              <> Savolda xato topilsa:{' '}
                <a href="/" onClick={(e) => { e.preventDefault(); navigate(`${base}/results/${t.id}`) }}>Natijalar, "Savollar tahlili"</a>{' '}
                bo'limida to'g'ri javobni o'zgartiring yoki savolni bekor qiling, natijalar avtomatik qayta baholanadi.</>
            )}</span>
        </div>
      )}

      <Card title={`Savollar (${questions.data?.length ?? 0})`} actions={(
        <div className="row">
          <Button size="sm" onClick={() => setAiOpen(true)}
            title={locked ? 'Urinishlar bor: yaratilgan savollar savol bankiga saqlanadi' : undefined}><FiZap /> Claude bilan yaratish</Button>
          <Button size="sm" onClick={() => setFileOpen(true)}><FiUpload /> Fayl: import / eksport</Button>
          <Button size="sm" disabled={locked} title={locked ? 'Urinishlar bor: savollarni o\'zgartirib bo\'lmaydi' : undefined} onClick={() => setBankOpen(true)}><FiDatabase /> Bankdan qo'shish</Button>
          <Button size="sm" variant="primary" disabled={locked} title={locked ? 'Urinishlar bor: savollarni o\'zgartirib bo\'lmaydi' : undefined} onClick={() => setEditor({})}><FiPlus /> Savol qo'shish</Button>
        </div>
      )}>
        {questions.loading && !questions.data ? <Loader /> : questions.data?.length === 0 ? (
          <EmptyState title="Savollar hali yo'q" text="Testni aktivlashtirish uchun kamida bitta savol kerak."
            action={<Button variant="primary" onClick={() => setEditor({})}><FiPlus /> Birinchi savolni qo'shish</Button>} />
        ) : (
          <div className="stack">
            {pg.items.map((q, i) => (
              <div className="q-item" key={q.id}>
                <div className="row between" style={{ flexWrap: 'nowrap', alignItems: 'flex-start' }}>
                  <div className="grow">
                    <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                      <b className="num">{pg.offset + i + 1}.</b>
                      <Badge tone="accent">{QTYPE[q.question_type]}</Badge>
                      <Badge>{q.points} ball</Badge>
                      <Badge>{DIFFICULTY[q.difficulty]}</Badge>
                      {q.topic && <Badge tone="warn">{q.topic}</Badge>}
                    </div>
                    <MathRenderer text={q.text} as="div" />
                  </div>
                  <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                    <Button size="sm" icon variant="ghost" disabled={pg.offset + i === 0} aria-label="Yuqoriga" title="Yuqoriga" onClick={() => move(pg.offset + i, -1)}><FiArrowUp /></Button>
                    <Button size="sm" icon variant="ghost" disabled={pg.offset + i === pg.count - 1} aria-label="Pastga" title="Pastga" onClick={() => move(pg.offset + i, 1)}><FiArrowDown /></Button>
                    <Button size="sm" icon disabled={locked} aria-label="Savolni tahrirlash" onClick={() => setEditor({ question: q })}><FiEdit2 /></Button>
                    <Button size="sm" icon variant="danger" disabled={locked} aria-label="Savolni o'chirish" onClick={() => setConfirm({ kind: 'deleteQ', q })}><FiTrash2 /></Button>
                  </div>
                </div>
                {q.image && <img className="q-img" src={q.image} alt="Savol rasmi" />}
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

      {editor && (
        <QuestionEditor target={{ testId: t.id }} question={editor.question} onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); reloadAll() }} />
      )}
      {fileOpen && (
        <QuestionFileDialog target={{ testId: t.id }} test={t} questions={questions.data || []} onClose={() => setFileOpen(false)}
          onImported={() => { setFileOpen(false); reloadAll() }} />
      )}
      {aiOpen && (
        <AiGenerateDialog target={{ testId: t.id }} testTitle={t.title} locked={locked} existing={(questions.data || []).map((q) => q.text)}
          onClose={() => setAiOpen(false)} onAdded={() => { setAiOpen(false); reloadAll() }} />
      )}
      {bankOpen && <BankPicker testId={t.id} onClose={() => setBankOpen(false)} onDone={() => { setBankOpen(false); reloadAll() }} />}
      {confirm?.kind === 'activate' && (
        <ConfirmDialog title="Testni aktivlashtirish" confirmLabel="Aktivlashtirish" busy={busy}
          text="Aktivlashgach o'quvchilar testni yecha oladi va savollarni o'zgartirib bo'lmaydi (birinchi urinishdan keyin)."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.activateTest(t.id), 'Test faol')} />
      )}
      {confirm?.kind === 'complete' && (
        <ConfirmDialog title="Testni yakunlash" confirmLabel="Yakunlash" busy={busy}
          text="Yakunlangach yangi urinishlar qabul qilinmaydi. Tugallanmagan urinishlar avtomatik baholanadi."
          onClose={() => setConfirm(null)} onConfirm={() => run(() => api.completeTest(t.id), 'Test yakunlandi')} />
      )}
      {confirm?.kind === 'deleteQ' && (
        <ConfirmDialog danger title="Savolni o'chirish" confirmLabel="O'chirish" busy={busy}
          text="Bu savol va uning variantlari o'chiriladi." onClose={() => setConfirm(null)}
          onConfirm={() => run(() => api.deleteQuestion(confirm.q.id), 'Savol o\'chirildi')} />
      )}
      {confirm?.kind === 'delete' && (
        <ConfirmDialog danger title="Testni o'chirish" confirmLabel="O'chirish" busy={busy}
          text={locked ? 'Testda natijalar bor. O\'chirsangiz barcha natijalar ham o\'chadi. Bu amalni qaytarib bo\'lmaydi.' : 'Test va uning savollari o\'chiriladi.'}
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            try {
              await api.deleteTest(t.id, true)
              toast.success('Test o\'chirildi')
              navigate(`${base}/tests`, { replace: true })
            } catch (err) {
              toast.error(errorMessage(err))
              setConfirm(null)
            }
          }} />
      )}
    </div>
  )
}

function BankPicker({ testId, onClose, onDone }) {
  const banks = useAsync(() => api.listBanks())
  const [bankId, setBankId] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    setBusy(true)
    try {
      const r = await api.addBankToTest(bankId, { test_id: testId })
      toast.success(`${r.added} ta savol qo'shildi`)
      onDone()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Bankdan savol qo'shish" onClose={onClose} footer={(
      <><Button onClick={onClose}>Bekor qilish</Button><Button variant="primary" disabled={!bankId || busy} onClick={add}>Qo'shish</Button></>
    )}>
      {banks.loading ? <Loader /> : banks.data?.length === 0 ? (
        <p className="muted">Savol banki yo'q. Avval "Savol banki" bo'limida bank yarating.</p>
      ) : (
        <Select label="Savol banki" value={bankId} onChange={(e) => setBankId(e.target.value)}>
          <option value="">Tanlang</option>
          {banks.data?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.questions_count} savol)</option>)}
        </Select>
      )}
      <p className="muted small">Bankdagi barcha savollar testga nusxalanadi. Bank keyin o'zgarsa, test o'zgarmaydi.</p>
    </Modal>
  )
}
