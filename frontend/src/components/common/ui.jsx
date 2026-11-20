import { useEffect, useId, useRef } from 'react'
import { FiAlertTriangle, FiInbox, FiX } from 'react-icons/fi'

export function Button({ variant = '', size = '', block, icon, children, className = '', type = 'button', ...rest }) {
  const cls = ['btn', variant, size, block && 'block', icon && 'icon', className].filter(Boolean).join(' ')
  return <button type={type} className={cls} {...rest}>{children}</button>
}

export function Field({ label, error, help, children, className = '' }) {
  const id = useId()
  return (
    <div className={`field ${className}`}>
      {label && <label htmlFor={id}>{label}</label>}
      {typeof children === 'function' ? children(id) : children}
      {error ? <span className="err" role="alert">{error}</span> : help ? <span className="help">{help}</span> : null}
    </div>
  )
}

export function Input({ label, error, help, className = '', ...rest }) {
  return (
    <Field label={label} error={error} help={help} className={className}>
      {(id) => <input id={id} className={`input ${error ? 'invalid' : ''}`} {...rest} />}
    </Field>
  )
}

export function Textarea({ label, error, help, ...rest }) {
  return (
    <Field label={label} error={error} help={help}>
      {(id) => <textarea id={id} className={`textarea ${error ? 'invalid' : ''}`} {...rest} />}
    </Field>
  )
}

export function Select({ label, error, help, children, className = '', ...rest }) {
  return (
    <Field label={label} error={error} help={help} className={className}>
      {(id) => <select id={id} className="select" {...rest}>{children}</select>}
    </Field>
  )
}

export function Checkbox({ label, ...rest }) {
  return (
    <label className="check">
      <input type="checkbox" {...rest} />
      <span>{label}</span>
    </label>
  )
}

export function Card({ title, actions, children, className = '', flat, pad0, ...rest }) {
  return (
    <section className={`card ${flat ? 'flat' : ''} ${pad0 ? 'pad-0' : ''} ${className}`} {...rest}>
      {(title || actions) && (
        <div className="card-head" style={pad0 ? { padding: '18px 20px 0' } : undefined}>
          {title && <h2>{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ icon, label, value, hint }) {
  return (
    <div className="card stat">
      <div className="label">{icon && <span className="stat-icon">{icon}</span>}{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Badge({ tone = '', dot, children }) {
  return <span className={`badge ${tone}`}>{dot && <i className="dot" />}{children}</span>
}

export function Loader() {
  return <div className="loader" role="status" aria-label="Yuklanmoqda"><div className="spinner" /></div>
}

export function Skeleton({ h = 18, w = '100%' }) {
  return <div className="skeleton" style={{ height: h, width: w }} />
}

export function EmptyState({ icon, title, text, action }) {
  return (
    <div className="empty">
      {icon || <FiInbox />}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  )
}

export function Tabs({ value, onChange, items }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((it) => (
        <button key={it.value} role="tab" aria-selected={value === it.value} type="button"
          className={`tab ${value === it.value ? 'active' : ''}`} onClick={() => onChange(it.value)}>
          {it.label}
        </button>
      ))}
    </div>
  )
}

export function Progress({ value, tone = '' }) {
  return <div className={`progress ${tone}`}><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

export function Avatar({ user, size = '' }) {
  const initials = ((user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')) || (user?.username?.[0] || '?')
  return (
    <span className={`avatar ${size}`}>
      {user?.avatar ? <img src={user.avatar} alt="" /> : initials.toUpperCase()}
    </span>
  )
}

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null)
  // onClose ko'pincha har render'da yangi funksiya bo'ladi. Effect unga bog'liq bo'lsa, har bir harf yozilganda qayta ishga tushib,
  // fokusni oynaning o'ziga qaytarib yuborardi (matn maydoniga yozib bo'lmasdi). Shuning uchun oxirgi qiymat ref'da saqlanadi.
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && closeRef.current?.()
    document.addEventListener('keydown', onKey)
    // fokus faqat ochilganda va ichida allaqachon fokuslangan element (autoFocus) bo'lmasa oynaga beriladi
    if (ref.current && !ref.current.contains(document.activeElement)) ref.current.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Button variant="ghost" icon size="sm" onClick={onClose} aria-label="Yopish"><FiX /></Button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

/** confirm() artifaktda ishlamaydi, shuning uchun o'z dialogimiz. */
export function ConfirmDialog({ title, text, confirmLabel = 'Tasdiqlash', danger, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose} footer={(
      <>
        <Button onClick={onClose}>Bekor qilish</Button>
        <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>{confirmLabel}</Button>
      </>
    )}>
      <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        {danger && <FiAlertTriangle style={{ color: 'var(--bad)', fontSize: 22, flex: 'none' }} />}
        <p className="muted">{text}</p>
      </div>
    </Modal>
  )
}

export function Pagination({ page, pageSize, count, onChange }) {
  const pages = Math.max(1, Math.ceil(count / pageSize))
  if (count <= pageSize) return null
  return (
    <div className="pager">
      <span className="muted small">{(page - 1) * pageSize + 1}–{Math.min(count, page * pageSize)} / {count}</span>
      <div className="row">
        <Button size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Oldingi</Button>
        <span className="small num">{page} / {pages}</span>
        <Button size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Keyingi</Button>
      </div>
    </div>
  )
}

/** Kartochkalar/ro'yxatlar ostidagi alohida paginator (kerak bo'lmasa hech narsa chizmaydi). */
export function Pager({ page, pageSize, count, onChange }) {
  if (count <= pageSize) return null
  return (
    <div className="card pad-0">
      <Pagination page={page} pageSize={pageSize} count={count} onChange={onChange} />
    </div>
  )
}

export function PageHead({ title, text, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {text && <p>{text}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  )
}
