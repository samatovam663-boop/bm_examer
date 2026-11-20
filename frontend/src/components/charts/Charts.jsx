// Yengil SVG grafiklar (kutubxonasiz): mavzu o'zgaruvchilaridan foydalanadi, shuning uchun dark/light ikkalasida ishlaydi.

export function BarList({ items, max = 100, unit = '%', tone }) {
  if (!items.length) return null
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="bar-row" key={it.label}>
          <span className="name" title={it.label}>{it.label}</span>
          <div className={`progress ${it.tone || tone || ''}`}><i style={{ width: `${Math.min(100, (it.value / max) * 100)}%` }} /></div>
          <span className="val">{it.value}{unit}</span>
        </div>
      ))}
    </div>
  )
}

// ketma-ketlik palitraga mos: avval bordo tonlari, yashil/sariq oxirida (ular holat ranglari)
const PALETTE = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-5)', 'var(--chart-6)', 'var(--chart-4)', 'var(--chart-3)']

export function Donut({ items, size = 150, thickness = 22, centerLabel, centerValue }) {
  const total = items.reduce((s, i) => s + i.value, 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="row" style={{ gap: 20, flexWrap: 'wrap' }}>
      <svg className="chart" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={items.map((i) => `${i.label}: ${i.value}`).join(', ')}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-2)" strokeWidth={thickness} />
        {items.map((it, idx) => {
          const len = (it.value / total) * c
          const el = (
            <circle key={it.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={it.color || PALETTE[idx % PALETTE.length]}
              strokeWidth={thickness} strokeDasharray={`${Math.max(0, len - 2)} ${c - Math.max(0, len - 2)}`}
              strokeDashoffset={-offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
          )
          offset += len
          return el
        })}
        {centerValue !== undefined && (
          <>
            <text x="50%" y="48%" textAnchor="middle" style={{ fill: 'var(--fg)', fontSize: 24, fontWeight: 700 }}>{centerValue}</text>
            <text x="50%" y="62%" textAnchor="middle">{centerLabel}</text>
          </>
        )}
      </svg>
      <div className="stack tight small">
        {items.map((it, idx) => (
          <span key={it.label} className="row" style={{ gap: 8 }}>
            <i style={{ width: 10, height: 10, borderRadius: 3, background: it.color || PALETTE[idx % PALETTE.length], display: 'inline-block' }} />
            {it.label} <b className="num">{it.value}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Foiz (0-100) ko'rsatuvchi doira. */
export function ScoreRing({ value, size = 150, tone }) {
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const color = tone || (value >= 70 ? 'var(--good)' : value >= 50 ? 'var(--warn)' : 'var(--bad)')
  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="chart" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--card-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="center"><div><b className="num">{Math.round(value)}%</b></div></div>
    </div>
  )
}

/** Vaqt bo'yicha chiziqli grafik: items = [{label, value, hint?}] (qiymat 0-100 %), avg = o'rtacha chiziq. */
export function LineChart({ items, avg, height = 230, threshold, colorize, valueLabels }) {
  if (!items.length) return null
  // nuqta rangi natijaga qarab: >=70 yaxshi, 50-69 o'rta, <50 past
  const dotColor = (v) => (!colorize ? 'var(--chart-1)' : v >= 70 ? 'var(--good)' : v >= 50 ? 'var(--warn)' : 'var(--bad)')
  const w = 680
  const pad = { l: 36, r: 16, t: 30, b: 32 }
  const cw = w - pad.l - pad.r
  const ch = height - pad.t - pad.b
  const x = (i) => pad.l + (items.length === 1 ? cw / 2 : (i * cw) / (items.length - 1))
  const y = (v) => pad.t + ch - (Math.max(0, Math.min(100, v)) / 100) * ch
  const pts = items.map((it, i) => [x(i), y(it.value)])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${pad.t + ch} L${pts[0][0].toFixed(1)},${pad.t + ch} Z`
  const step = Math.max(1, Math.ceil(items.length / 6))
  return (
    <svg className="chart" width="100%" viewBox={`0 0 ${w} ${height}`} role="img"
      aria-label={`Natijalar dinamikasi: ${items.map((i) => `${i.label} ${i.value}%`).join(', ')}`}>
      <defs>
        <linearGradient id="lc-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--chart-1)" stopOpacity="0.38" />
          <stop offset="1" stopColor="var(--chart-1)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray={t === 0 ? undefined : '3 5'} />
          <text x={pad.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
        </g>
      ))}
      {avg != null && (
        <g>
          <line x1={pad.l} x2={w - pad.r} y1={y(avg)} y2={y(avg)} stroke="var(--warn)" strokeDasharray="6 5" strokeWidth="1.5" />
          <text x={pad.l + 6} y={y(avg) - 6} textAnchor="start" style={{ fill: 'var(--warn)' }}>o'rtacha {Math.round(avg)}%</text>
        </g>
      )}
      {threshold != null && (
        <g>
          <line x1={pad.l} x2={w - pad.r} y1={y(threshold)} y2={y(threshold)} stroke="var(--good)" strokeDasharray="2 5" strokeWidth="1.5" opacity="0.8" />
          <text x={w - pad.r} y={y(threshold) + 15} textAnchor="end" style={{ fill: 'var(--good)' }}>yaxshi natija {threshold}%</text>
        </g>
      )}
      <path d={area} fill="url(#lc-area)" />
      <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => {
        const last = i === pts.length - 1
        const col = dotColor(items[i].value)
        return (
          <g key={i}>
            {last && <circle cx={p[0]} cy={p[1]} r="11" fill={col} opacity="0.2" />}
            <circle cx={p[0]} cy={p[1]} r={last ? 6 : 4.5} fill={last || colorize ? col : 'var(--card-solid)'} stroke={colorize ? 'var(--card-solid)' : col} strokeWidth="2">
              <title>{items[i].hint || `${items[i].label}: ${items[i].value}%`}</title>
            </circle>
            {(last || (valueLabels && items.length <= 12)) && (
              <text x={p[0]} y={p[1] - 12} textAnchor="middle" style={{ fill: 'var(--fg)', fontWeight: last ? 700 : 500, fontSize: last ? 12 : 10.5 }}>{Math.round(items[i].value)}%</text>
            )}
          </g>
        )
      })}
      {items.map((it, i) => (i % step === 0 || i === items.length - 1) && (
        <text key={`l${i}`} x={x(i)} y={height - 10} textAnchor="middle">{it.label}</text>
      ))}
    </svg>
  )
}

/** Radar: kamida 3 ta o'q kerak. items = [{label, value}] (0-100). */
export function Radar({ items, size = 300 }) {
  if (items.length < 3) return null
  // yon tomonlarda yorliqlar sig'ishi uchun kenglik balandlikdan katta
  const W = size + 150
  const c = size / 2
  const cx = W / 2
  const r = size / 2 - 46
  const n = items.length
  const pt = (i, k) => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2
    return [cx + Math.cos(a) * r * k, c + Math.sin(a) * r * k]
  }
  const poly = (k) => items.map((_, i) => pt(i, k).map((v) => v.toFixed(1)).join(',')).join(' ')
  const data = items.map((it, i) => pt(i, Math.max(0.02, it.value / 100)))
  return (
    <svg className="chart" width="100%" viewBox={`0 0 ${W} ${size}`} style={{ maxWidth: 460 }} role="img"
      aria-label={`Fanlar bo'yicha: ${items.map((i) => `${i.label} ${i.value}%`).join(', ')}`}>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={poly(k)} fill="none" stroke="var(--border)" />)}
      {items.map((_, i) => {
        const [px, py] = pt(i, 1)
        return <line key={i} x1={cx} y1={c} x2={px} y2={py} stroke="var(--border)" />
      })}
      <polygon points={data.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')} fill="var(--chart-1)" fillOpacity="0.28" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" />
      {data.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="var(--chart-1)"><title>{`${items[i].label}: ${items[i].value}%`}</title></circle>)}
      {items.map((it, i) => {
        const [px, py] = pt(i, 1.16)
        const anchor = px < cx - 6 ? 'end' : px > cx + 6 ? 'start' : 'middle'
        const label = it.label.length > 14 ? `${it.label.slice(0, 13)}…` : it.label
        return <text key={it.label} x={px} y={py + 4} textAnchor={anchor}>{label} <tspan style={{ fill: 'var(--fg)', fontWeight: 600 }}>{it.value}%</tspan></text>
      })}
    </svg>
  )
}

/** Oddiy ustunli grafik: values = [{label, value}]. Standart 0-100 (%), `max` va `unit` bilan sanoq ham ko'rsatish mumkin. */
export function Columns({ items, height = 160, max = 100, unit = '%' }) {
  if (!items.length) return null
  const w = Math.max(items.length * 56, 280)
  const pad = { l: 30, r: 8, t: 10, b: 28 }
  const ch = height - pad.t - pad.b
  const bw = (w - pad.l - pad.r) / items.length
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg className="chart" width="100%" viewBox={`0 0 ${w} ${height}`} style={{ minWidth: Math.min(w, 280) }} role="img"
        aria-label={items.map((i) => `${i.label}: ${i.value}${unit}`).join(', ')}>
        {[0, max / 2, max].map((t) => {
          const y = pad.t + ch - (t / max) * ch
          return (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 4" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
            </g>
          )
        })}
        {items.map((it, i) => {
          const h = (it.value / max) * ch
          const x = pad.l + i * bw + bw * 0.2
          return (
            <g key={it.label}>
              <rect x={x} y={pad.t + ch - h} width={bw * 0.6} height={Math.max(h, 1)} rx="6" fill="url(#bmgrad)">
                <title>{`${it.label}: ${it.value}${unit}`}</title>
              </rect>
              <text x={x + bw * 0.3} y={height - 10} textAnchor="middle">{it.label.length > 9 ? it.label.slice(0, 8) + '…' : it.label}</text>
            </g>
          )
        })}
        <defs>
          <linearGradient id="bmgrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--chart-1)" />
            <stop offset="1" stopColor="var(--chart-2)" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  )
}
