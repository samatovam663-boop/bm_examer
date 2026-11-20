import { useEffect, useRef, useState } from 'react'
import { FiClock } from 'react-icons/fi'

export function formatSeconds(total) {
  const s = Math.max(0, Math.floor(total))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

/** Tugash vaqtigacha ortga hisob. Soat noto'g'ri yurmasligi uchun har tikda qolgan vaqt expiresAt dan hisoblanadi. */
export default function Timer({ expiresAt, onExpire, warnAt = 60 }) {
  const end = new Date(expiresAt).getTime()
  const [left, setLeft] = useState(() => (end - Date.now()) / 1000)
  const fired = useRef(false)

  useEffect(() => {
    const tick = () => {
      const remaining = (end - Date.now()) / 1000
      setLeft(remaining)
      if (remaining <= 0 && !fired.current) {
        fired.current = true
        onExpire?.()
      }
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [end, onExpire])

  return (
    <span className={`timer ${left <= warnAt ? 'low' : ''}`} role="timer" aria-label="Qolgan vaqt">
      <FiClock /> {formatSeconds(left)}
    </span>
  )
}
