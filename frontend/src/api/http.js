// Haqiqiy Django backend bilan ishlovchi API (mock.js bilan bir xil metod nomlari va javob shakllari).
// Yoqish: `npm run dev:http` yoki VITE_API_MODE=http bilan build.
import axios from 'axios'
import { ApiError } from './mock'

// Token sxemasi (nega: XSS bo'lsa ham refresh token o'g'irlanmasligi uchun):
//  - refresh token httpOnly cookie `bm_refresh` (Path=/api/auth/) da turadi: JS uni o'qiy olmaydi, shuning uchun XSS uni o'qib ketolmaydi.
//  - access token faqat shu modulning xotirasida (o'zgaruvchi) saqlanadi, diskka (localStorage) yozilmaydi; qisqa muddatli.
//  - sahifa yangilansa xotira bo'shaydi, access cookie orqali /auth/refresh/ dan qayta olinadi (me() ichida).
//  - auth so'rovlari `X-Requested-With` sarlavhasi (CSRF himoyasi, backend talab qiladi) va withCredentials bilan yuboriladi.
let accessToken = null

// Eski versiyadan qolgan tokenlar diskda qolmasligi uchun bir marta tozalaymiz.
try {
  localStorage.removeItem('bm_access')
  localStorage.removeItem('bm_refresh')
} catch { /* ignore */ }

const AUTH_OPTS = { headers: { 'X-Requested-With': 'XMLHttpRequest' }, withCredentials: true }

const client = axios.create({ baseURL: '/api', timeout: 30000 })

client.interceptors.request.use((config) => {
  if (accessToken && !config.headers.Authorization) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// 401 bo'lsa access token refresh (cookie) orqali yangilanadi (bir vaqtda bitta so'rov), so'rov bir marta takrorlanadi.
let refreshing = null
function refreshAccess() {
  if (!refreshing) {
    refreshing = axios.post('/api/auth/refresh/', null, AUTH_OPTS)
      .then((r) => {
        accessToken = r.data.access
        return accessToken
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

const AUTH_PATHS = ['/auth/login/', '/auth/refresh/', '/auth/logout/']

client.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error
    const isAuthCall = AUTH_PATHS.some((p) => config?.url?.includes(p))
    if (response?.status === 401 && config && !config._retried && !isAuthCall) {
      config._retried = true
      try {
        const token = await refreshAccess()
        config.headers.Authorization = `Bearer ${token}`
        return client(config)
      } catch {
        accessToken = null
        window.dispatchEvent(new Event('auth:logout'))
      }
    }
    return Promise.reject(error)
  },
)

function toApiError(err) {
  if (err instanceof ApiError) return err
  if (err.response) return new ApiError(err.response.status, err.response.data && typeof err.response.data === 'object' ? err.response.data : { detail: 'Server xatosi.' })
  return new ApiError(0, 'Serverga ulanib bo\'lmadi. Internet yoki backend ishlayotganini tekshiring.')
}

const call = (fn) => async (...args) => {
  try {
    return await fn(...args)
  } catch (err) {
    throw toApiError(err)
  }
}

const data = (promise) => promise.then((r) => r.data)
const clean = (params = {}) => Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null))
const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:')

async function dataUrlToFile(url, name = 'image') {
  const blob = await (await fetch(url)).blob()
  return new File([blob], `${name}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`, { type: blob.type })
}

/** Rasm backendda alohida endpoint orqali yuklanadi (savol JSON'ida emas). */
async function syncQuestionImage(question, image) {
  if (isDataUrl(image)) {
    const form = new FormData()
    form.append('image', await dataUrlToFile(image, 'question'))
    return (await client.post(`/questions/${question.id}/image/`, form)).data
  }
  if (image === null && question.image) {
    await client.delete(`/questions/${question.id}/image/`)
    return { ...question, image: null }
  }
  return question
}

const questionPayload = ({ image, ...rest }) => rest // eslint-disable-line no-unused-vars

export const http = {
  // --- auth ---
  login: call(async ({ username, password }) => {
    const d = await data(client.post('/auth/login/', { username, password }, { withCredentials: true }))
    accessToken = d.access // refresh tanada kelmaydi: u httpOnly cookie'da
    return d
  }),
  register: call((payload) => data(client.post('/auth/register/', payload))),
  logout: call(async () => {
    try { await client.post('/auth/logout/', null, AUTH_OPTS) } catch { /* xato bo'lsa ham davom etamiz */ }
    accessToken = null
    return {}
  }),
  me: call(async () => {
    if (!accessToken) {
      // sahifa yangilangan: xotira bo'sh, cookie orqali access olishga urinamiz
      try { await refreshAccess() } catch { throw new ApiError(401, 'Tizimga kiring.') }
    }
    return data(client.get('/auth/profile/'))
  }),
  updateProfile: call(async (payload) => {
    if (isDataUrl(payload.avatar)) {
      const form = new FormData()
      Object.entries(payload).forEach(([k, v]) => { if (k !== 'avatar' && v != null) form.append(k, v) })
      form.append('avatar', await dataUrlToFile(payload.avatar, 'avatar'))
      return data(client.patch('/auth/profile/', form))
    }
    const { avatar, ...rest } = payload // eslint-disable-line no-unused-vars
    return data(client.patch('/auth/profile/', rest))
  }),
  changePassword: call((payload) => data(client.post('/auth/change-password/', payload))),

  // --- users (admin) ---
  listUsers: call((p) => data(client.get('/users/', { params: clean(p) }))),
  createUser: call((payload) => data(client.post('/users/', { ...payload, role: payload.role || 'student' }))),
  createUsersBulk: call((rows) => data(client.post('/users/bulk/', { rows }))),
  // faqat tahrirlanadigan maydonlar yuboriladi (avatar URL, id, created_at va h.k. backendda xato beradi)
  updateUser: call((id, payload) => {
    const { first_name, last_name, email, phone, role, is_active } = payload
    return data(client.patch(`/users/${id}/`, { first_name, last_name, email, phone, role, is_active }))
  }),
  deleteUser: call((id) => data(client.delete(`/users/${id}/`))),
  userStats: call(() => data(client.get('/users/stats/'))),
  resetPassword: call((id, payload) => data(client.post(`/users/${id}/reset-password/`, payload || {}))),

  // --- subjects ---
  listSubjects: call(async () => (await data(client.get('/subjects/', { params: { page_size: 1000 } }))).results),
  saveSubject: call((payload) => data(payload.id ? client.put(`/subjects/${payload.id}/`, payload) : client.post('/subjects/', payload))),
  deleteSubject: call((id) => data(client.delete(`/subjects/${id}/`))),

  // --- tests ---
  listTests: call((p) => data(client.get('/tests/', { params: clean(p) }))),
  getTest: call((id) => data(client.get(`/tests/${id}/`))),
  testByCode: call((code) => data(client.get(`/tests/by-code/${encodeURIComponent(String(code).trim())}/`))),
  saveTest: call((payload) => {
    const body = {
      ...payload, subject: payload.subject === '' ? null : payload.subject,
      groups: payload.groups || [], starts_at: payload.starts_at || null, ends_at: payload.ends_at || null,
    }
    return data(payload.id ? client.put(`/tests/${payload.id}/`, body) : client.post('/tests/', body))
  }),
  deleteTest: call((id, force) => data(client.delete(`/tests/${id}/`, { params: force ? { force: 'true' } : {} }))),
  activateTest: call((id) => data(client.post(`/tests/${id}/activate/`))),
  completeTest: call((id) => data(client.post(`/tests/${id}/complete/`))),
  duplicateTest: call((id) => data(client.post(`/tests/${id}/duplicate/`))),

  // --- questions ---
  listQuestions: call((testId) => data(client.get(`/tests/${testId}/questions/`))),
  addQuestion: call(async (testId, payload) => {
    const q = await data(client.post(`/tests/${testId}/questions/`, questionPayload(payload)))
    return syncQuestionImage(q, payload.image)
  }),
  updateQuestion: call(async (id, payload) => {
    const q = await data(client.put(`/questions/${id}/`, questionPayload(payload)))
    return syncQuestionImage(q, payload.image)
  }),
  deleteQuestion: call((id) => data(client.delete(`/questions/${id}/`))),
  reorderQuestions: call((testId, ids) => data(client.post(`/tests/${testId}/reorder-questions/`, { ids }))),
  addQuestionsBulk: call((target, questions) => data(client.post('/questions/bulk/', {
    ...(target.testId ? { test_id: target.testId } : { bank_id: target.bankId }),
    questions: questions.map(questionPayload),
  }))),

  // --- question banks ---
  listBanks: call(async () => (await data(client.get('/question-banks/', { params: { page_size: 1000 } }))).results),
  saveBank: call((payload) => data(client.post('/question-banks/', { name: payload.name, subject: payload.subject || null }))),
  deleteBank: call((id) => data(client.delete(`/question-banks/${id}/`))),
  listBankQuestions: call((id) => data(client.get(`/question-banks/${id}/questions/`))),
  addBankQuestion: call(async (id, payload) => {
    const q = await data(client.post(`/question-banks/${id}/questions/`, questionPayload(payload)))
    return syncQuestionImage(q, payload.image)
  }),
  addBankToTest: call((bankId, payload) => data(client.post(`/question-banks/${bankId}/add-to-test/`, payload))),

  // --- student: test yechish ---
  startTest: call((id) => data(client.post(`/tests/${id}/start/`))),
  saveAnswer: call((id, payload) => data(client.post(`/tests/${id}/save-answer/`, payload))),
  submitTest: call((id, payload) => data(client.post(`/tests/${id}/submit/`, payload || {}))),

  // --- results ---
  myResults: call((p) => data(client.get('/results/my/', { params: clean(p) }))),
  testResults: call((id, params) => data(client.get(`/results/test/${id}/`, { params: clean(params) }))),
  attemptDetail: call((id) => data(client.get(`/results/attempt/${id}/`))),
  leaderboard: call((id) => data(client.get(`/results/leaderboard/${id}/`))),
  stats: call(() => data(client.get('/results/stats/'))),

  // --- guruhlar, e'tibor, Claude ---
  listGroups: call(async () => (await data(client.get('/groups/', { params: { page_size: 1000 } }))).results),
  saveGroup: call((payload) => data(payload.id ? client.patch(`/groups/${payload.id}/`, { name: payload.name }) : client.post('/groups/', { name: payload.name }))),
  deleteGroup: call((id) => data(client.delete(`/groups/${id}/`))),
  groupMembers: call((id, payload) => data(client.post(`/groups/${id}/members/`, payload))),
  groupPool: call((p) => data(client.get('/groups/pool/', { params: clean(p) }))),
  groupStats: call((id) => data(client.get(`/groups/${id}/stats/`))),
  attention: call(() => data(client.get('/results/attention/'))),
  // Claude bilan savol yaratish serverda bajariladi (API kaliti brauzerga chiqmaydi)
  generateQuestions: call((payload) => data(client.post('/questions/generate/', payload, { timeout: 120000 }))),

  // --- o'quvchi tahlili ---
  myAnalytics: call(() => data(client.get('/results/my-analytics/'))),
  myMistakes: call(() => data(client.get('/results/my-mistakes/'))),
  practiceAnswer: call((questionId, choiceIds) => data(client.post('/results/practice/', { question_id: questionId, choice_ids: choiceIds }))),
  listGoals: call(() => data(client.get('/results/goals/'))),
  saveGoal: call((payload) => {
    const body = { subject: payload.subject === '' ? null : payload.subject, target: payload.target, deadline: payload.deadline || null }
    return data(payload.id ? client.put(`/results/goals/${payload.id}/`, body) : client.post('/results/goals/', body))
  }),
  deleteGoal: call((id) => data(client.delete(`/results/goals/${id}/`))),

  // --- o'qituvchi: tahlil, tuzatish, qo'shimcha urinish, o'quvchilar ---
  questionAnalysis: call((testId) => data(client.get(`/results/test/${testId}/question-analysis/`))),
  correctQuestion: call((questionId, payload) => data(client.post(`/questions/${questionId}/correct/`, payload))),
  grantAttempt: call((testId, studentId) => data(client.post(`/results/test/${testId}/grant-attempt/`, { student: studentId }))),
  myStudents: call(() => data(client.get('/results/students/'))),
  studentProfile: call((id) => data(client.get(`/results/students/${id}/`))),
}
