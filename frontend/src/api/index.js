// Sahifalar faqat shu moduldan foydalanadi.
// Rejim: demo (brauzerda, artifakt) yoki http (haqiqiy Django). `VITE_API_MODE=http` bilan http yoqiladi (`npm run dev:http`).
import { ApiError, mock, resetDemo } from './mock'
import { http } from './http'

export { ApiError, resetDemo }

const HTTP = import.meta.env.VITE_API_MODE === 'http'

export const api = HTTP ? http : mock
export const IS_DEMO = !HTTP

/** Bo'limlarni yoqish/o'chirish bayrog'i. Hozir demo ham, backend ham hammasini qo'llaydi.
 *  Yangi imkoniyat avval faqat demo'da yozilsa, http rejimida `false` qilib turish mumkin. */
export const FEATURES = {
  analytics: true, // mavzu/savol turi tahlili
  mistakes: true, // "Xatolarim" va mashq
  goals: true,
  questionAnalysis: true, // savollar tahlili, tuzatish/bekor qilish
  grantAttempt: true, // qo'shimcha urinish
  students: true, // o'quvchilar ro'yxati va profili
}

/** Server xatosidan o'qiladigan matn: {field: [msg]} yoki {detail}. */
export function errorMessage(err) {
  const data = err?.data
  if (!data) return err?.message || 'Xatolik yuz berdi.'
  if (data.detail) return data.detail
  const first = Object.entries(data)[0]
  if (!first) return 'Xatolik yuz berdi.'
  const [key, val] = first
  return `${key}: ${Array.isArray(val) ? val[0] : typeof val === 'object' ? JSON.stringify(val) : val}`
}

/** Maydon xatolari: {field: "msg"} */
export function fieldErrors(err) {
  const out = {}
  const data = err?.data
  if (data && typeof data === 'object') {
    Object.entries(data).forEach(([k, v]) => {
      out[k] = Array.isArray(v) ? v[0] : String(v)
    })
  }
  return out
}
