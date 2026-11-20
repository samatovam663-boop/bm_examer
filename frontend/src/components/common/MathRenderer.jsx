import { useMemo } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'

// "$...$" (inline) va "$$...$$" (blok) bo'laklarini KaTeX bilan chizadi. Qolgan matn React orqali (xavfsiz) chiqadi.
const PATTERN = /(\$\$[^$]+\$\$|\$[^$\n]+\$|`[^`\n]+`)/g

function render(tex, display) {
  try {
    return katex.renderToString(tex, { displayMode: display, throwOnError: false, trust: false, strict: 'ignore' })
  } catch {
    return null
  }
}

export default function MathRenderer({ text = '', as: Tag = 'span', className = '' }) {
  const parts = useMemo(() => String(text).split(PATTERN), [text])
  return (
    <Tag className={className} style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {parts.map((part, i) => {
        if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
          const html = render(part.slice(2, -2), true)
          return html ? <span key={i} dangerouslySetInnerHTML={{ __html: html }} /> : part
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          const html = render(part.slice(1, -1), false)
          return html ? <span key={i} dangerouslySetInnerHTML={{ __html: html }} /> : part
        }
        if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) {
          return <code key={i} className="mono" style={{ background: 'var(--card-2)', padding: '1px 6px', borderRadius: 6 }}>{part.slice(1, -1)}</code>
        }
        return part
      })}
    </Tag>
  )
}
