export const fullName = (u) => (u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username : '')

export const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

export const fmtDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'

export const fmtDuration = (sec) => {
  if (sec == null) return '—'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export const pctTone = (p) => (p >= 70 ? 'good' : p >= 50 ? 'warn' : 'bad')

export const STATUS = {
  draft: { label: 'Draft', tone: '' },
  active: { label: 'Faol', tone: 'good' },
  completed: { label: 'Yakunlangan', tone: 'accent' },
}
export const DIFFICULTY = { easy: 'Oson', medium: 'O\'rta', hard: 'Qiyin' }
export const ROLE = { admin: 'Admin', teacher: 'O\'qituvchi', student: 'O\'quvchi' }
export const QTYPE = { single: 'Bitta javob', multiple: 'Ko\'p javob', true_false: 'True/False' }
export const SHOW = {
  score_only: 'Faqat ball va foiz',
  correct_answers: 'To\'g\'ri javoblar bilan',
  detailed: 'Batafsil tahlil',
}

/** Rasmni brauzerda kichraytirib data URL qiladi (demo rejimda localStorage kvotasi uchun). */
export function fileToDataUrl(file, maxSide = 900, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Faylni o\'qib bo\'lmadi.'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('Bu rasm fayli emas.'))
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * k)
        canvas.height = Math.round(img.height * k)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
