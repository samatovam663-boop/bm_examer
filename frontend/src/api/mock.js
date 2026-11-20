// Demo backend: Django API bilan bir xil ma'lumot shakllari, lekin hammasi brauzerda (localStorage).
// Haqiqiy backend ulanganda faqat src/api/index.js almashtiriladi, sahifalar o'zgarmaydi.

const KEY = 'bm_examer_demo_v3'
let mem = null

export class ApiError extends Error {
  constructor(status, data) {
    super(typeof data === 'string' ? data : data?.detail || 'Xatolik')
    this.status = status
    this.data = typeof data === 'string' ? { detail: data } : data
  }
}

const now = () => new Date().toISOString()
const clone = (v) => JSON.parse(JSON.stringify(v))
const wait = () => new Promise((r) => setTimeout(r, 60))

// ---------- seed ----------

function Q(text, type, points, choices, difficulty = 'medium') {
  return { text, type, points, difficulty, choices }
}

const SEED_TESTS = [
  {
    title: 'Kvadrat tenglamalar', subject: 'Matematika', owner: 'nilufar', status: 'active', duration: 15,
    difficulty: 'medium', attempts: 2, show: 'detailed', shuffleQ: true, shuffleC: true, code: 'BM-K7Q2XA',
    topics: ['Viyet teoremasi', 'Diskriminant', 'Tenglama ildizlari', 'Diskriminant', 'Tenglama ildizlari', 'Viyet teoremasi'],
    description: 'Diskriminant, Viyet teoremasi va oddiy kvadrat tenglamalar.',
    questions: [
      Q('$x^2 - 5x + 6 = 0$ tenglamaning ildizlari yig\'indisi nechaga teng?', 'single', 2, [['5', 1], ['6', 0], ['-5', 0], ['1', 0]]),
      Q('$D = b^2 - 4ac$ ifoda nima deb ataladi?', 'single', 1, [['Diskriminant', 1], ['Determinant', 0], ['Differensial', 0]], 'easy'),
      Q('Quyidagilardan qaysilari $x^2 - 9 = 0$ tenglamaning ildizlari?', 'multiple', 3, [['3', 1], ['-3', 1], ['9', 0], ['0', 0]]),
      Q('$D < 0$ bo\'lsa, kvadrat tenglama haqiqiy ildizga ega emas.', 'true_false', 1, [['True', 1], ['False', 0]], 'easy'),
      Q('$x^2 + 4x + 4 = 0$ tenglama nechta turli ildizga ega?', 'single', 2, [['1', 1], ['2', 0], ['0', 0]]),
      Q('Viyet teoremasiga ko\'ra $x_1 \\cdot x_2$ nimaga teng ($ax^2+bx+c=0$)?', 'single', 2, [['$c/a$', 1], ['$-b/a$', 0], ['$b/a$', 0], ['$a/c$', 0]], 'hard'),
    ],
  },
  {
    title: 'Geometriya asoslari', subject: 'Matematika', owner: 'nilufar', status: 'draft', duration: 20,
    difficulty: 'easy', attempts: 1, show: 'score_only', shuffleQ: false, shuffleC: false, code: 'BM-G3M9TP',
    topics: ['Uchburchak', 'To\'rtburchak', 'Aylana'],
    description: 'Uchburchak, to\'rtburchak va aylana.',
    questions: [
      Q('Uchburchak ichki burchaklari yig\'indisi necha gradus?', 'single', 1, [['180', 1], ['360', 0], ['90', 0]], 'easy'),
      Q('Kvadratning diagonallari o\'zaro perpendikulyar.', 'true_false', 1, [['True', 1], ['False', 0]], 'easy'),
      Q('Aylana yuzi formulasi qaysi?', 'single', 2, [['$\\pi r^2$', 1], ['$2\\pi r$', 0], ['$\\pi d$', 0]]),
    ],
  },
  {
    title: 'Tub va murakkab sonlar', subject: 'Matematika', owner: 'nilufar', status: 'completed', duration: 10,
    difficulty: 'easy', attempts: 0, show: 'detailed', shuffleQ: false, shuffleC: false, code: 'BM-S5N1ZD',
    topics: ['Tub sonlar', 'Tub sonlar', 'Bo\'luvchilar', 'Tub sonlar'],
    description: 'Sonlar nazariyasi bo\'yicha qisqa nazorat.',
    questions: [
      Q('Quyidagilardan qaysilari tub sonlar?', 'multiple', 3, [['2', 1], ['9', 0], ['11', 1], ['15', 0]]),
      Q('1 soni tub son hisoblanadi.', 'true_false', 1, [['True', 0], ['False', 1]], 'easy'),
      Q('36 sonining nechta natural bo\'luvchisi bor?', 'single', 2, [['9', 1], ['8', 0], ['12', 0]], 'hard'),
      Q('Eng kichik tub son qaysi?', 'single', 1, [['2', 1], ['1', 0], ['3', 0]], 'easy'),
    ],
  },
  {
    title: 'Kinematika: to\'g\'ri chiziqli harakat', subject: 'Fizika', owner: 'jasur', status: 'active', duration: 20,
    difficulty: 'medium', attempts: 3, show: 'correct_answers', shuffleQ: true, shuffleC: false, code: 'BM-F8V4LR',
    topics: ['Tekis harakat', 'Birliklar', 'Vektor kattaliklar', 'Erkin tushish', 'Tezlanish'],
    description: 'Tezlik, tezlanish va yo\'l formulalari.',
    questions: [
      Q('Tekis harakatda yo\'l formulasi qaysi?', 'single', 2, [['$s = vt$', 1], ['$s = at^2$', 0], ['$s = v/t$', 0]]),
      Q('Tezlanish birligi SI da nima?', 'single', 1, [['m/s²', 1], ['m/s', 0], ['km/h', 0]], 'easy'),
      Q('Quyidagilardan qaysilari vektor kattaliklar?', 'multiple', 3, [['Tezlik', 1], ['Massa', 0], ['Kuch', 1], ['Vaqt', 0]]),
      Q('Erkin tushish tezlanishi taxminan $9.8\\ m/s^2$ ga teng.', 'true_false', 1, [['True', 1], ['False', 0]], 'easy'),
      Q('$v_0 = 0$, $a = 2\\ m/s^2$ bo\'lsa, 3 s dan keyin tezlik qancha?', 'single', 3, [['6 m/s', 1], ['3 m/s', 0], ['12 m/s', 0]], 'hard'),
    ],
  },
  {
    title: 'Python asoslari', subject: 'Informatika', owner: 'jasur', status: 'active', duration: 25,
    difficulty: 'easy', attempts: 0, show: 'detailed', shuffleQ: true, shuffleC: true, code: 'BM-P2Y6HN',
    topics: ['Ma\'lumot turlari', 'Funksiyalar', 'Ma\'lumot turlari', 'Asoslar', 'Sikllar', 'Sikllar'],
    description: 'O\'zgaruvchilar, sikllar va funksiyalar. Cheksiz urinish.',
    questions: [
      Q('Python da ro\'yxat qaysi qavs bilan yoziladi?', 'single', 1, [['[ ]', 1], ['{ }', 0], ['( )', 0]], 'easy'),
      Q('`len("salom")` natijasi nechaga teng?', 'single', 1, [['5', 1], ['4', 0], ['6', 0]], 'easy'),
      Q('Quyidagilardan qaysilari Python\'ning o\'zgarmas (immutable) turlari?', 'multiple', 3, [['tuple', 1], ['str', 1], ['list', 0], ['dict', 0]]),
      Q('Python kompilyatsiya qilinadigan til emas, interpretatsiya qilinadi.', 'true_false', 1, [['True', 1], ['False', 0]]),
      Q('`range(3)` qanday qiymatlar beradi?', 'single', 2, [['0, 1, 2', 1], ['1, 2, 3', 0], ['0, 1, 2, 3', 0]]),
      Q('`for` sikli nima uchun ishlatiladi?', 'single', 1, [['Takrorlash uchun', 1], ['Shart tekshirish uchun', 0]], 'easy'),
    ],
  },
]

const FIRST = ['Aziz', 'Madina', 'Sardor', 'Dilnoza', 'Bobur', 'Malika']
const LAST = ['Yusupov', 'Karimova', 'Toshpulatov', 'Abdullayeva', 'Ergashev', 'Nazarova']

function seed() {
  const db = { seq: {}, session: { userId: null }, users: [], subjects: [], tests: [], questions: [], attempts: [], banks: [], goals: [], practice: {}, groups: [] }
  const id = (n) => (db.seq[n] = (db.seq[n] || 0) + 1)
  const mkUser = (username, first_name, last_name, role, phone = '') => {
    const u = {
      id: id('user'), username, email: `${username}@bm-examer.uz`, first_name, last_name, role, avatar: null,
      phone, is_active: true, created_at: new Date(Date.now() - (30 - db.users.length * 2) * 864e5).toISOString(),
      password: 'demo1234',
    }
    db.users.push(u)
    return u
  }
  mkUser('admin', 'Admin', 'Boshqaruvchi', 'admin', '+998 90 100 00 01')
  mkUser('nilufar', 'Nilufar', 'Karimova', 'teacher', '+998 90 100 00 02')
  mkUser('jasur', 'Jasur', 'Rahimov', 'teacher', '+998 90 100 00 03')
  FIRST.forEach((f, i) => mkUser(f.toLowerCase(), f, LAST[i], 'student', `+998 91 200 00 0${i + 1}`))

  ;['Matematika', 'Fizika', 'Informatika', 'Ona tili', 'Tarix'].forEach((name, i) => {
    db.subjects.push({
      id: id('subject'), name, icon: ['∑', '⚛', '</>', 'Aa', '⌛'][i], created_at: now(),
      description: ['Algebra va geometriya', 'Mexanika, elektr, optika', 'Dasturlash va algoritmlar',
        'Grammatika va imlo', 'Jahon va O\'zbekiston tarixi'][i],
    })
  })

  SEED_TESTS.forEach((t, ti) => {
    const owner = db.users.find((u) => u.username === t.owner)
    const subject = db.subjects.find((s) => s.name === t.subject)
    const test = {
      id: id('test'), title: t.title, description: t.description, subject: subject.id, created_by: owner.id,
      test_code: t.code, duration_minutes: t.duration, difficulty: t.difficulty, status: t.status,
      shuffle_questions: t.shuffleQ, shuffle_choices: t.shuffleC, max_attempts: t.attempts, show_results: t.show,
      groups: [], starts_at: null, ends_at: null,
      created_at: new Date(Date.now() - (12 - ti * 2) * 864e5).toISOString(), updated_at: now(),
    }
    db.tests.push(test)
    t.questions.forEach((q, qi) => {
      db.questions.push({
        id: id('question'), test: test.id, bank: null, question_type: q.type, text: q.text, image: null,
        topic: t.topics?.[qi] || '',
        has_formula: q.text.includes('$') || q.choices.some((c) => c[0].includes('$')),
        difficulty: q.difficulty, points: q.points, order: qi,
        choices: q.choices.map((c, ci) => ({ id: id('choice'), text: c[0], is_correct: !!c[1], order: ci })),
      })
    })
  })

  // namunaviy guruhlar (o'qituvchi nilufar)
  const nilufar = db.users.find((u) => u.username === 'nilufar')
  const byName = (n) => db.users.find((u) => u.username === n).id
  db.groups.push(
    { id: id('group'), name: '9-A', teacher: nilufar.id, students: ['aziz', 'madina', 'sardor'].map(byName), created_at: now() },
    { id: id('group'), name: '9-B', teacher: nilufar.id, students: ['dilnoza', 'bobur', 'malika'].map(byName), created_at: now() },
  )

  db.banks.push({ id: id('bank'), name: 'Algebra savollari', subject: 1, created_by: 2, created_at: now() })
  const bankQs = [
    Q('$2x + 3 = 11$ bo\'lsa, $x$ nechaga teng?', 'single', 1, [['4', 1], ['3', 0], ['5', 0]], 'easy'),
    Q('$(a+b)^2$ ning yoyilmasi qaysi?', 'single', 2, [['$a^2 + 2ab + b^2$', 1], ['$a^2 + b^2$', 0], ['$a^2 - 2ab + b^2$', 0]]),
  ]
  bankQs.forEach((q, qi) => {
    db.questions.push({
      id: id('question'), test: null, bank: 1, question_type: q.type, text: q.text, image: null, has_formula: true,
      topic: qi ? 'Qisqa ko\'paytirish' : 'Tenglamalar',
      difficulty: q.difficulty, points: q.points, order: qi,
      choices: q.choices.map((c, ci) => ({ id: id('choice'), text: c[0], is_correct: !!c[1], order: ci })),
    })
  })

  // namunaviy urinishlar (o'quvchilar natijalari)
  const students = db.users.filter((u) => u.role === 'student')
  const skill = [0.9, 0.75, 0.6, 0.85, 0.45, 0.7]
  let rnd = 7
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280)
  ;[1, 3, 4, 5].forEach((testId) => {
    const test = db.tests.find((t) => t.id === testId)
    const qs = db.questions.filter((q) => q.test === testId)
    students.forEach((st, si) => {
      if (rand() < 0.15) return
      const started = new Date(Date.now() - (1 + rand() * 9) * 864e5)
      const answers = {}
      qs.forEach((q) => {
        const correct = q.choices.filter((c) => c.is_correct).map((c) => c.id)
        if (rand() < skill[si]) answers[q.id] = correct
        else {
          const wrong = q.choices.filter((c) => !c.is_correct).map((c) => c.id)
          if (wrong.length && rand() < 0.85) answers[q.id] = [wrong[Math.floor(rand() * wrong.length)]]
        }
      })
      const att = {
        id: id('attempt'), test: test.id, student: st.id, attempt_number: 1, started_at: started.toISOString(),
        finished_at: null, score: 0, total_questions: 0, correct_answers: 0, percentage: 0, is_completed: false,
        tab_switches: rand() < 0.3 ? Math.floor(rand() * 4) : 0, answers,
      }
      db.attempts.push(att)
      gradeAttempt(db, att, new Date(started.getTime() + (test.duration_minutes * 0.4 + rand() * test.duration_minutes * 0.5) * 60000))
    })
  })
  return db
}

// ---------- storage ----------

function db() {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      mem = JSON.parse(raw)
      return mem
    }
  } catch { /* localStorage ishlamasa xotirada davom etamiz */ }
  mem = seed()
  save()
  return mem
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)) } catch { /* kvota yoki bloklangan */ }
}

export function resetDemo() {
  mem = seed()
  save()
}

const nextId = (name) => {
  const d = db()
  d.seq[name] = (d.seq[name] || 0) + 1
  return d.seq[name]
}

// ---------- helpers ----------

function currentUser(roles) {
  const d = db()
  const u = d.users.find((x) => x.id === d.session.userId)
  if (!u) throw new ApiError(401, 'Tizimga kiring.')
  if (roles && !roles.includes(u.role)) throw new ApiError(403, 'Bu amal uchun ruxsat yo\'q.')
  return u
}

const publicUser = (u) => {
  const { password, ...rest } = u
  return rest
}

function paginate(list, params = {}) {
  const size = Number(params.page_size) || 20
  const page = Math.max(1, Number(params.page) || 1)
  return { count: list.length, results: list.slice((page - 1) * size, page * size) }
}

function matches(text, q) {
  return !q || String(text || '').toLowerCase().includes(String(q).toLowerCase())
}

function seededRandom(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled(arr, seed) {
  const rand = seededRandom(seed)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const CYR = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '',
  ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
}

// "Aziz Yusupov" -> "aziz.yusupov"; o', g' va kirill harflari lotinga o'giriladi
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[ʻʼ'`’‘]/g, '')
    .replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.]+/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '')
}

function randomPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return Array.from(bytes, (b) => chars[b % chars.length]).join('')
}

const userName = (u) => (u ? `${u.first_name} ${u.last_name}`.trim() || u.username : '')

// Rejalashtirilgan testlar: starts_at kelganda draft -> active (savollari bo'lsa), ends_at o'tganda active -> completed.
// Backend'dagi sync_schedule bilan bir xil; har so'rovda chaqiriladi.
const personOf = (u) => ({ id: u.id, username: u.username, first_name: u.first_name, last_name: u.last_name, name: userName(u) || u.username })

function serGroup(d, g) {
  return {
    id: g.id, name: g.name, teacher: g.teacher, teacher_name: userName(d.users.find((u) => u.id === g.teacher)),
    students: g.students.map((sid) => d.users.find((u) => u.id === sid)).filter(Boolean).map(personOf),
    student_count: g.students.length, created_at: g.created_at,
  }
}

function syncSchedule(d) {
  const nowMs = Date.now()
  let changed = false
  d.tests.forEach((t) => {
    const starts = t.starts_at ? new Date(t.starts_at).getTime() : null
    const ends = t.ends_at ? new Date(t.ends_at).getTime() : null
    if (t.status === 'draft' && starts !== null && starts <= nowMs && !(ends !== null && ends <= nowMs) && d.questions.some((q) => q.test === t.id)) {
      t.status = 'active'
      changed = true
    } else if (t.status === 'active' && ends !== null && ends <= nowMs) {
      t.status = 'completed'
      d.attempts.filter((a) => a.test === t.id && !a.is_completed).forEach((a) => gradeAttempt(d, a))
      changed = true
    }
  })
  if (changed) save()
}

// guruhga tayinlangan test faqat shu guruh o'quvchilariga ko'rinadi; guruhsiz test hammaga
function studentCanSee(d, t, user) {
  if (!t.groups?.length) return true
  return d.groups.some((g) => t.groups.includes(g.id) && g.students.includes(user.id))
}

function serTest(t, user) {
  const d = db()
  const subject = d.subjects.find((s) => s.id === t.subject)
  const out = {
    ...t,
    groups: t.groups || [],
    groups_names: (t.groups || []).map((id) => d.groups.find((g) => g.id === id)?.name).filter(Boolean),
    subject_name: subject ? subject.name : null,
    created_by_name: userName(d.users.find((u) => u.id === t.created_by)),
    questions_count: d.questions.filter((q) => q.test === t.id).length,
  }
  if (user.role === 'student') {
    out.my_attempts = d.attempts.filter((a) => a.test === t.id && a.student === user.id && a.is_completed).length
    // o'qituvchi bergan qo'shimcha urinishlar bilan jami ruxsat etilgan soni (0 = cheksiz)
    out.attempts_allowed = t.max_attempts ? t.max_attempts + (d.extra_attempts?.[`${t.id}:${user.id}`] || 0) : 0
  }
  return out
}

const ownsTest = (user, t) => user.role === 'admin' || t.created_by === user.id

function getTestFor(user, id) {
  syncSchedule(db())
  const t = db().tests.find((x) => x.id === Number(id))
  if (!t) throw new ApiError(404, 'Test topilmadi.')
  if (user.role === 'student' && (t.status !== 'active' || !studentCanSee(db(), t, user))) throw new ApiError(404, 'Test topilmadi.')
  if (user.role === 'teacher' && t.created_by !== user.id) throw new ApiError(404, 'Test topilmadi.')
  return t
}

function validateQuestion(data, partialType) {
  const type = data.question_type || partialType || 'single'
  let choices = data.choices
  if (type === 'true_false' && !choices && typeof data.correct_answer === 'boolean') {
    choices = [{ text: 'True', is_correct: data.correct_answer }, { text: 'False', is_correct: !data.correct_answer }]
  }
  if (!String(data.text || '').trim()) throw new ApiError(400, { text: ['Savol matni kerak.'] })
  if (!choices) throw new ApiError(400, { choices: ['Variantlar kerak.'] })
  const correct = choices.filter((c) => c.is_correct).length
  if (type === 'true_false' && (choices.length !== 2 || correct !== 1)) {
    throw new ApiError(400, { choices: ['True/False savolda 2 ta variant va 1 ta to\'g\'ri javob bo\'lishi kerak.'] })
  }
  if (type === 'single' && (choices.length < 2 || correct !== 1)) {
    throw new ApiError(400, { choices: ['Kamida 2 ta variant va aynan 1 ta to\'g\'ri javob bo\'lishi kerak.'] })
  }
  if (type === 'multiple' && (choices.length < 2 || correct < 1)) {
    throw new ApiError(400, { choices: ['Kamida 2 ta variant va kamida 1 ta to\'g\'ri javob bo\'lishi kerak.'] })
  }
  if (choices.some((c) => !String(c.text || '').trim())) throw new ApiError(400, { choices: ['Variant matni bo\'sh bo\'lmasin.'] })
  const points = Number(data.points ?? 1)
  if (!(points >= 1)) throw new ApiError(400, { points: ['Ball kamida 1 bo\'lishi kerak.'] })
  return { type, choices, points }
}

function buildQuestion(data, extra) {
  const { type, choices, points } = validateQuestion(data)
  return {
    id: nextId('question'), test: null, bank: null, ...extra, question_type: type, text: data.text.trim(),
    image: data.image || null, topic: (data.topic || '').trim().slice(0, 60),
    has_formula: /\$[^$]+\$/.test(data.text), difficulty: data.difficulty || 'medium',
    points, order: data.order ?? 0,
    choices: choices.map((c, i) => ({ id: nextId('choice'), text: c.text.trim(), is_correct: !!c.is_correct, order: i })),
  }
}

function ensureEditable(testId) {
  if (testId && db().attempts.some((a) => a.test === testId)) {
    throw new ApiError(400, 'Bu testda urinishlar mavjud, savollarni o\'zgartirib bo\'lmaydi.')
  }
}

// ---------- baholash ----------

// savol ketma-ket shuncha marta to'g'ri mashq qilinsa, "o'zlashtirildi" hisoblanadi
const MASTER_STREAK = 2

function questionOk(att, q) {
  if (q.voided) return true // bekor qilingan savol: hammaga to'g'ri hisoblanadi
  const sel = att.answers[q.id] || []
  const corr = q.choices.filter((c) => c.is_correct).map((c) => c.id)
  return sel.length > 0 && sel.length === corr.length && sel.every((x) => corr.includes(x))
}

// urinish tugashi: davomiylikdan keyin, lekin test ends_at (bo'lsa) dan keyin emas
const expiresAt = (d, att) => {
  const t = d.tests.find((x) => x.id === att.test)
  const start = new Date(att.started_at).getTime()
  let end = start + t.duration_minutes * 60000
  if (t.ends_at) end = Math.min(end, Math.max(new Date(t.ends_at).getTime(), start))
  return new Date(end)
}

// ballni javoblar va savollarning HOZIRGI holatiga qarab hisoblaydi (savol tuzatilganda qayta ishlatiladi)
function scoreAttempt(d, att) {
  const qs = d.questions.filter((q) => q.test === att.test)
  let total = 0, score = 0, ok = 0
  qs.forEach((q) => {
    total += q.points
    if (questionOk(att, q)) {
      score += q.points
      ok += 1
    }
  })
  att.score = score
  att.total_questions = qs.length
  att.correct_answers = ok
  att.percentage = total ? Math.round((score / total) * 10000) / 100 : 0
}

function gradeAttempt(d, att, finishedAt) {
  if (att.is_completed) return att
  scoreAttempt(d, att)
  const cap = expiresAt(d, att)
  const fin = finishedAt || new Date()
  att.finished_at = (fin < cap ? fin : cap).toISOString()
  att.is_completed = true
  return att
}

function openAttempt(d, testId, studentId) {
  const att = d.attempts.find((a) => a.test === testId && a.student === studentId && !a.is_completed)
  if (att && Date.now() > expiresAt(d, att).getTime() + 10000) {
    gradeAttempt(d, att)
    save()
    return null
  }
  return att || null
}

function serAttempt(a) {
  const d = db()
  const test = d.tests.find((t) => t.id === a.test)
  const st = d.users.find((u) => u.id === a.student)
  const { answers, ...rest } = a
  return {
    ...rest,
    test_title: test?.title,
    subject: test?.subject ?? null,
    subject_name: d.subjects.find((s) => s.id === test?.subject)?.name || null,
    test_duration_minutes: test?.duration_minutes,
    student_name: userName(st) || st?.username,
    duration_seconds: a.finished_at ? Math.round((new Date(a.finished_at) - new Date(a.started_at)) / 1000) : null,
  }
}

function attemptDetail(a, viewer) {
  const d = db()
  const test = d.tests.find((t) => t.id === a.test)
  const out = serAttempt(a)
  const level = viewer.role === 'student' ? test.show_results : 'detailed'
  out.visibility = level
  if (level === 'score_only') return out
  out.questions = d.questions.filter((q) => q.test === a.test).sort((x, y) => x.order - y.order).map((q) => {
    const item = {
      question_id: q.id, text: q.text, question_type: q.question_type, points: q.points, image: q.image, topic: q.topic || '',
      choices: q.choices.map((c) => ({ id: c.id, text: c.text, is_correct: c.is_correct })),
      correct_choice_ids: q.choices.filter((c) => c.is_correct).map((c) => c.id),
    }
    if (q.voided) item.voided = true
    if (level === 'detailed') {
      const ok = questionOk(a, q)
      item.selected_choice_ids = a.answers[q.id] || []
      item.is_correct = ok
      item.points_earned = ok ? q.points : 0
    }
    return item
  })
  return out
}

function leaderboardOf(testId) {
  const d = db()
  const best = {}
  const counts = {}
  d.attempts.filter((a) => a.test === testId && a.is_completed).forEach((a) => {
    counts[a.student] = (counts[a.student] || 0) + 1
    const dur = (new Date(a.finished_at) - new Date(a.started_at)) / 1000
    const key = [-a.percentage, dur]
    const cur = best[a.student]
    if (!cur || key[0] < cur.key[0] || (key[0] === cur.key[0] && key[1] < cur.key[1])) best[a.student] = { key, a, dur }
  })
  return Object.values(best)
    .sort((x, y) => x.key[0] - y.key[0] || x.key[1] - y.key[1])
    .map((b, i) => ({
      rank: i + 1, student: b.a.student, student_name: userName(d.users.find((u) => u.id === b.a.student)),
      best_percentage: b.a.percentage, best_score: b.a.score, duration_seconds: Math.round(b.dur),
      attempts: counts[b.a.student], attempt_id: b.a.id,
    }))
}

// ---------- API ----------

const wrap = (fn) => async (...args) => {
  await wait()
  const result = fn(...args)
  return clone(result)
}

export const mock = {
  // --- auth ---
  login: wrap(({ username, password }) => {
    const d = db()
    const u = d.users.find((x) => x.username.toLowerCase() === String(username).trim().toLowerCase())
    if (!u || u.password !== password) throw new ApiError(401, 'Login yoki parol noto\'g\'ri.')
    if (!u.is_active) throw new ApiError(403, 'Hisob faol emas.')
    d.session.userId = u.id
    save()
    return { access: 'demo-access', refresh: 'demo-refresh', user: publicUser(u) }
  }),
  register: wrap((data) => {
    const d = db()
    const errors = {}
    if (!data.username?.trim()) errors.username = ['Login kerak.']
    else if (d.users.some((u) => u.username.toLowerCase() === data.username.trim().toLowerCase())) errors.username = ['Bu login band.']
    if (!/^\S+@\S+\.\S+$/.test(data.email || '')) errors.email = ['To\'g\'ri email kiriting.']
    if (!data.password || data.password.length < 8) errors.password = ['Parol kamida 8 ta belgidan iborat bo\'lsin.']
    if (!['student', 'teacher'].includes(data.role || 'student')) errors.role = ['Noto\'g\'ri rol.']
    if (Object.keys(errors).length) throw new ApiError(400, errors)
    const u = {
      id: nextId('user'), username: data.username.trim(), email: data.email, first_name: data.first_name || '',
      last_name: data.last_name || '', role: data.role || 'student', avatar: null, phone: data.phone || '',
      is_active: true, created_at: now(), password: data.password,
    }
    d.users.push(u)
    save()
    return publicUser(u)
  }),
  logout: wrap(() => {
    db().session.userId = null
    save()
    return {}
  }),
  me: wrap(() => publicUser(currentUser())),
  updateProfile: wrap((data) => {
    const u = currentUser()
    ;['first_name', 'last_name', 'email', 'phone', 'avatar'].forEach((k) => {
      if (k in data) u[k] = data[k]
    })
    save()
    return publicUser(u)
  }),
  changePassword: wrap(({ old_password, new_password }) => {
    const u = currentUser()
    if (u.password !== old_password) throw new ApiError(400, { old_password: ['Eski parol noto\'g\'ri.'] })
    if (!new_password || new_password.length < 8) throw new ApiError(400, { new_password: ['Parol kamida 8 ta belgidan iborat bo\'lsin.'] })
    u.password = new_password
    save()
    return { detail: 'Parol o\'zgartirildi.' }
  }),

  // --- users (admin) ---
  listUsers: wrap((p = {}) => {
    currentUser(['admin'])
    let list = db().users.filter((u) => (!p.role || u.role === p.role) &&
      (p.is_active === undefined || p.is_active === '' || String(u.is_active) === String(p.is_active)) &&
      (matches(u.username, p.search) || matches(u.email, p.search) || matches(userName(u), p.search)))
    list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const page = paginate(list, p)
    page.results = page.results.map(publicUser)
    return page
  }),
  createUser: wrap((data) => {
    currentUser(['admin'])
    const d = db()
    const errors = {}
    if (!data.username?.trim()) errors.username = ['Login kerak.']
    else if (d.users.some((u) => u.username.toLowerCase() === data.username.trim().toLowerCase())) errors.username = ['Bu login band.']
    if (!/^\S+@\S+\.\S+$/.test(data.email || '')) errors.email = ['To\'g\'ri email kiriting.']
    if (!data.password || data.password.length < 8) errors.password = ['Parol kamida 8 ta belgidan iborat bo\'lsin.']
    if (Object.keys(errors).length) throw new ApiError(400, errors)
    const u = {
      id: nextId('user'), username: data.username.trim(), email: data.email, first_name: data.first_name || '',
      last_name: data.last_name || '', role: 'student', avatar: null, phone: data.phone || '',
      is_active: true, created_at: now(), password: data.password,
    }
    d.users.push(u)
    save()
    return publicUser(u)
  }),
  // Ko'plab o'quvchi qo'shish: har bir qator alohida tekshiriladi, to'g'rilari saqlanadi, xatolari qaytariladi.
  // login/parol berilmasa avtomatik yaratiladi; parollar faqat shu javobda qaytadi.
  createUsersBulk: wrap((rows) => {
    currentUser(['admin'])
    if (!Array.isArray(rows) || !rows.length) throw new ApiError(400, 'Ro\'yxat bo\'sh.')
    if (rows.length > 200) throw new ApiError(400, 'Bir martada ko\'pi bilan 200 ta o\'quvchi qo\'shiladi.')
    const d = db()
    const taken = new Set(d.users.map((u) => u.username.toLowerCase()))
    const created = []
    const errors = []
    rows.forEach((row, i) => {
      const line = row.line ?? i + 1
      const first = (row.first_name || '').trim()
      const last = (row.last_name || '').trim()
      let username = (row.username || '').trim().toLowerCase()
      if (!username) {
        const base = slug([first, last].filter(Boolean).join('.')) || 'oquvchi'
        username = base
        for (let n = 2; taken.has(username); n++) username = `${base}${n}`
      }
      if (!first && !last && !row.username) return errors.push({ line, error: 'Ism yoki login kerak.' })
      if (!/^[a-z0-9._-]{3,30}$/.test(username)) return errors.push({ line, error: `"${username}" login yaroqsiz (3-30 ta lotin harf, raqam, nuqta).` })
      if (taken.has(username)) return errors.push({ line, error: `"${username}" logini band.` })
      const password = (row.password || '').trim() || randomPassword()
      if (password.length < 8) return errors.push({ line, error: 'Parol kamida 8 ta belgidan iborat bo\'lsin.' })
      const u = {
        id: nextId('user'), username, email: `${username}@bm-examer.uz`, first_name: first, last_name: last,
        role: 'student', avatar: null, phone: (row.phone || '').trim(), is_active: true, created_at: now(), password,
      }
      d.users.push(u)
      taken.add(username)
      created.push({ ...publicUser(u), password })
    })
    save()
    return { created, errors }
  }),
  // Parol esdan chiqsa: eski parolni ko'rib bo'lmaydi, admin yangisini beradi (bo'sh qoldirilsa tasodifiy yaratiladi).
  resetPassword: wrap((id, { password } = {}) => {
    currentUser(['admin'])
    const u = db().users.find((x) => x.id === Number(id))
    if (!u) throw new ApiError(404, 'Foydalanuvchi topilmadi.')
    const next = (password || '').trim() || randomPassword()
    if (next.length < 8) throw new ApiError(400, { password: ['Parol kamida 8 ta belgidan iborat bo\'lsin.'] })
    u.password = next
    save()
    return { password: next, username: u.username }
  }),
  updateUser: wrap((id, data) => {
    const me = currentUser(['admin'])
    const u = db().users.find((x) => x.id === Number(id))
    if (!u) throw new ApiError(404, 'Foydalanuvchi topilmadi.')
    if (u.id === me.id && ((data.role && data.role !== 'admin') || data.is_active === false)) {
      throw new ApiError(400, 'O\'zingizning admin rolingiz yoki faolligingizni o\'zgartira olmaysiz.')
    }
    ;['first_name', 'last_name', 'email', 'phone', 'role', 'is_active'].forEach((k) => {
      if (k in data) u[k] = data[k]
    })
    save()
    return publicUser(u)
  }),
  deleteUser: wrap((id) => {
    const me = currentUser(['admin'])
    const d = db()
    if (Number(id) === me.id) throw new ApiError(400, 'O\'zingizni o\'chira olmaysiz.')
    d.users = d.users.filter((u) => u.id !== Number(id))
    d.attempts = d.attempts.filter((a) => a.student !== Number(id))
    save()
    return {}
  }),
  userStats: wrap(() => {
    currentUser(['admin'])
    const users = db().users
    const week = Date.now() - 7 * 864e5
    return {
      total: users.length, active: users.filter((u) => u.is_active).length,
      by_role: ['admin', 'teacher', 'student'].reduce((o, r) => ({ ...o, [r]: users.filter((u) => u.role === r).length }), {}),
      new_last_7_days: users.filter((u) => new Date(u.created_at) > week).length,
    }
  }),

  // --- subjects ---
  listSubjects: wrap(() => {
    currentUser()
    return db().subjects
  }),
  saveSubject: wrap((data) => {
    currentUser(['admin', 'teacher'])
    const d = db()
    if (!data.name?.trim()) throw new ApiError(400, { name: ['Nom kerak.'] })
    if (d.subjects.some((s) => s.id !== data.id && s.name.toLowerCase() === data.name.trim().toLowerCase())) {
      throw new ApiError(400, { name: ['Bunday fan allaqachon bor.'] })
    }
    if (data.id) {
      const s = d.subjects.find((x) => x.id === data.id)
      Object.assign(s, { name: data.name.trim(), description: data.description || '', icon: data.icon || '' })
      save()
      return s
    }
    const s = { id: nextId('subject'), name: data.name.trim(), description: data.description || '', icon: data.icon || '', created_at: now() }
    d.subjects.push(s)
    save()
    return s
  }),
  deleteSubject: wrap((id) => {
    currentUser(['admin', 'teacher'])
    const d = db()
    d.subjects = d.subjects.filter((s) => s.id !== Number(id))
    d.tests.forEach((t) => { if (t.subject === Number(id)) t.subject = null })
    save()
    return {}
  }),

  // --- tests ---
  listTests: wrap((p = {}) => {
    const user = currentUser()
    const d = db()
    syncSchedule(d)
    let list = d.tests.filter((t) => {
      if (user.role === 'teacher' && t.created_by !== user.id) return false
      if (user.role === 'student' && (t.status !== 'active' || !studentCanSee(d, t, user))) return false
      return (!p.status || t.status === p.status) && (!p.subject || t.subject === Number(p.subject)) &&
        (!p.difficulty || t.difficulty === p.difficulty) &&
        (matches(t.title, p.search) || matches(t.test_code, p.search))
    })
    list = [...list].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    const page = paginate(list, p)
    page.results = page.results.map((t) => serTest(t, user))
    return page
  }),
  getTest: wrap((id) => {
    const user = currentUser()
    return serTest(getTestFor(user, id), user)
  }),
  testByCode: wrap((code) => {
    const user = currentUser()
    syncSchedule(db())
    const t = db().tests.find((x) => x.test_code === String(code).trim().toUpperCase())
    if (!t || (user.role === 'student' && (t.status !== 'active' || !studentCanSee(db(), t, user))) || (user.role === 'teacher' && t.created_by !== user.id)) {
      throw new ApiError(404, 'Bunday kodli faol test topilmadi.')
    }
    return serTest(t, user)
  }),
  saveTest: wrap((data) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const errors = {}
    if (!data.title?.trim()) errors.title = ['Test nomi kerak.']
    if (!(Number(data.duration_minutes) >= 1)) errors.duration_minutes = ['Davomiylik kamida 1 daqiqa.']
    const groups = (data.groups || []).map(Number)
    if (user.role !== 'admin' && groups.some((gid) => d.groups.find((g) => g.id === gid)?.teacher !== user.id)) {
      errors.groups = ['Faqat o\'zingizning guruhlaringizni tanlay olasiz.']
    }
    const starts = data.starts_at || null
    const ends = data.ends_at || null
    if (starts && ends && new Date(ends) <= new Date(starts)) errors.ends_at = ['Tugash vaqti boshlanishdan keyin bo\'lishi kerak.']
    if (Object.keys(errors).length) throw new ApiError(400, errors)
    const fields = {
      groups, starts_at: starts ? new Date(starts).toISOString() : null, ends_at: ends ? new Date(ends).toISOString() : null,
      title: data.title.trim(), description: data.description || '', subject: data.subject ? Number(data.subject) : null,
      duration_minutes: Number(data.duration_minutes), difficulty: data.difficulty || 'medium',
      shuffle_questions: !!data.shuffle_questions, shuffle_choices: !!data.shuffle_choices,
      max_attempts: Number(data.max_attempts) || 0, show_results: data.show_results || 'score_only',
    }
    if (data.id) {
      const t = getTestFor(user, data.id)
      Object.assign(t, fields, { updated_at: now() })
      save()
      return serTest(t, user)
    }
    let code
    do {
      code = 'BM-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
    } while (d.tests.some((t) => t.test_code === code))
    const t = { id: nextId('test'), ...fields, created_by: user.id, test_code: code, status: 'draft', created_at: now(), updated_at: now() }
    d.tests.push(t)
    save()
    return serTest(t, user)
  }),
  deleteTest: wrap((id, force) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, id)
    if (d.attempts.some((a) => a.test === t.id) && !force) {
      throw new ApiError(409, 'Testda natijalar bor. O\'chirish natijalarni ham o\'chiradi.')
    }
    d.tests = d.tests.filter((x) => x.id !== t.id)
    d.questions = d.questions.filter((q) => q.test !== t.id)
    d.attempts = d.attempts.filter((a) => a.test !== t.id)
    save()
    return {}
  }),
  activateTest: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const t = getTestFor(user, id)
    if (t.status !== 'draft') throw new ApiError(400, 'Faqat draft holatdagi testni aktivlashtirish mumkin.')
    if (!db().questions.some((q) => q.test === t.id)) throw new ApiError(400, 'Savollarsiz testni aktivlashtirib bo\'lmaydi.')
    t.status = 'active'
    t.updated_at = now()
    save()
    return serTest(t, user)
  }),
  completeTest: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, id)
    if (t.status !== 'active') throw new ApiError(400, 'Faqat faol testni yakunlash mumkin.')
    t.status = 'completed'
    t.updated_at = now()
    d.attempts.filter((a) => a.test === t.id && !a.is_completed).forEach((a) => gradeAttempt(d, a))
    save()
    return serTest(t, user)
  }),

  // --- questions ---
  listQuestions: wrap((testId) => {
    const user = currentUser()
    const d = db()
    const t = getTestFor(user, testId)
    if (user.role === 'student') {
      const att = openAttempt(d, t.id, user.id)
      if (!att) throw new ApiError(403, 'Savollarni ko\'rish uchun testni boshlang.')
      return studentQuestions(d, t, att)
    }
    return d.questions.filter((q) => q.test === t.id).sort((a, b) => a.order - b.order)
  }),
  addQuestion: wrap((testId, data) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, testId)
    ensureEditable(t.id)
    const q = buildQuestion(data, { test: t.id, order: d.questions.filter((x) => x.test === t.id).length })
    d.questions.push(q)
    save()
    return q
  }),
  updateQuestion: wrap((id, data) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const q = d.questions.find((x) => x.id === Number(id))
    if (!q) throw new ApiError(404, 'Savol topilmadi.')
    const owner = q.test ? d.tests.find((t) => t.id === q.test)?.created_by : d.banks.find((b) => b.id === q.bank)?.created_by
    if (user.role !== 'admin' && owner !== user.id) throw new ApiError(404, 'Savol topilmadi.')
    ensureEditable(q.test)
    const fresh = buildQuestion({ ...data, order: q.order }, { test: q.test, bank: q.bank })
    Object.assign(q, { ...fresh, id: q.id })
    save()
    return q
  }),
  deleteQuestion: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const q = d.questions.find((x) => x.id === Number(id))
    if (!q) throw new ApiError(404, 'Savol topilmadi.')
    const owner = q.test ? d.tests.find((t) => t.id === q.test)?.created_by : d.banks.find((b) => b.id === q.bank)?.created_by
    if (user.role !== 'admin' && owner !== user.id) throw new ApiError(404, 'Savol topilmadi.')
    ensureEditable(q.test)
    d.questions = d.questions.filter((x) => x.id !== q.id)
    save()
    return {}
  }),

  // --- question banks ---
  listBanks: wrap(() => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    return d.banks.filter((b) => user.role === 'admin' || b.created_by === user.id).map((b) => ({
      ...b, subject_name: d.subjects.find((s) => s.id === b.subject)?.name || null,
      questions_count: d.questions.filter((q) => q.bank === b.id).length,
    }))
  }),
  saveBank: wrap((data) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    if (!data.name?.trim()) throw new ApiError(400, { name: ['Nom kerak.'] })
    const b = { id: nextId('bank'), name: data.name.trim(), subject: data.subject ? Number(data.subject) : null, created_by: user.id, created_at: now() }
    d.banks.push(b)
    save()
    return b
  }),
  deleteBank: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const b = d.banks.find((x) => x.id === Number(id) && (user.role === 'admin' || x.created_by === user.id))
    if (!b) throw new ApiError(404, 'Bank topilmadi.')
    d.banks = d.banks.filter((x) => x.id !== b.id)
    d.questions = d.questions.filter((q) => q.bank !== b.id)
    save()
    return {}
  }),
  listBankQuestions: wrap((bankId) => {
    currentUser(['admin', 'teacher'])
    return db().questions.filter((q) => q.bank === Number(bankId)).sort((a, b) => a.order - b.order)
  }),
  addBankQuestion: wrap((bankId, data) => {
    currentUser(['admin', 'teacher'])
    const d = db()
    const q = buildQuestion(data, { bank: Number(bankId), order: d.questions.filter((x) => x.bank === Number(bankId)).length })
    d.questions.push(q)
    save()
    return q
  }),
  addBankToTest: wrap((bankId, { test_id, question_ids }) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, test_id)
    ensureEditable(t.id)
    let qs = d.questions.filter((q) => q.bank === Number(bankId))
    if (question_ids?.length) qs = qs.filter((q) => question_ids.includes(q.id))
    if (!qs.length) throw new ApiError(400, 'Qo\'shish uchun savollar yo\'q.')
    const start = d.questions.filter((q) => q.test === t.id).length
    qs.forEach((q, i) => {
      d.questions.push({
        ...clone(q), id: nextId('question'), test: t.id, bank: null, order: start + i,
        choices: q.choices.map((c) => ({ ...c, id: nextId('choice') })),
      })
    })
    save()
    return { added: qs.length }
  }),

  // --- student: test yechish ---
  startTest: wrap((testId) => {
    const user = currentUser(['student'])
    const d = db()
    const t = getTestFor(user, testId)
    let att = openAttempt(d, t.id, user.id)
    // ochiq urinish bor (sahifa yangilangan): spec FR-RUN-3 bo'yicha davom ettiriladi, javoblar va vaqt saqlanadi.
    // Faqat boshqa oyna/tabga o'tish urinishni bloklaydi (submit + violation).
    const previousBlocked = false
    if (!att) {
      const done = d.attempts.filter((a) => a.test === t.id && a.student === user.id && a.is_completed).length
      const extra = d.extra_attempts?.[`${t.id}:${user.id}`] || 0
      if (t.max_attempts && done >= t.max_attempts + extra) {
        throw new ApiError(403, previousBlocked
          ? 'Oldingi urinishingiz sahifadan chiqib ketganingiz uchun bloklandi va urinishlar limiti tugagan.'
          : 'Urinishlar limiti tugagan.')
      }
      if (!d.questions.some((q) => q.test === t.id)) throw new ApiError(400, 'Testda savollar yo\'q.')
      const last = Math.max(0, ...d.attempts.filter((a) => a.test === t.id && a.student === user.id).map((a) => a.attempt_number))
      att = {
        id: nextId('attempt'), test: t.id, student: user.id, attempt_number: last + 1, started_at: now(), finished_at: null,
        score: 0, total_questions: 0, correct_answers: 0, percentage: 0, is_completed: false, tab_switches: 0, answers: {},
      }
      d.attempts.push(att)
      save()
    }
    return {
      attempt_id: att.id, attempt_number: att.attempt_number, started_at: att.started_at,
      expires_at: expiresAt(d, att).toISOString(), duration_minutes: t.duration_minutes, tab_switches: att.tab_switches,
      questions: studentQuestions(d, t, att), saved_answers: att.answers, previous_blocked: previousBlocked,
    }
  }),
  saveAnswer: wrap((testId, { question_id, choice_ids, tab_switches }) => {
    const user = currentUser(['student'])
    const d = db()
    const t = getTestFor(user, testId)
    const att = openAttempt(d, t.id, user.id)
    if (!att) throw new ApiError(400, 'Faol urinish yo\'q yoki vaqt tugagan.')
    const q = d.questions.find((x) => x.id === question_id && x.test === t.id)
    if (!q) throw new ApiError(404, 'Savol topilmadi.')
    if (!choice_ids.every((cid) => q.choices.some((c) => c.id === cid))) throw new ApiError(400, 'Variant bu savolga tegishli emas.')
    if (q.question_type !== 'multiple' && choice_ids.length > 1) throw new ApiError(400, 'Bu savolda faqat bitta variant tanlanadi.')
    if (choice_ids.length) att.answers[q.id] = choice_ids
    else delete att.answers[q.id]
    if (typeof tab_switches === 'number') att.tab_switches = Math.max(att.tab_switches, tab_switches)
    save()
    return { saved: true }
  }),
  submitTest: wrap((testId, { tab_switches, violation } = {}) => {
    const user = currentUser(['student'])
    const d = db()
    const t = getTestFor(user, testId)
    const att = d.attempts.find((a) => a.test === t.id && a.student === user.id && !a.is_completed)
    if (!att) throw new ApiError(400, 'Faol urinish yo\'q.')
    if (typeof tab_switches === 'number') att.tab_switches = Math.max(att.tab_switches, tab_switches)
    // boshqa oynaga o'tgani uchun bloklangan urinish: natijada belgi bo'ladi
    if (violation) att.violation = true
    gradeAttempt(d, att)
    save()
    return attemptDetail(att, user)
  }),

  // --- results ---
  myResults: wrap((p = {}) => {
    const user = currentUser(['student'])
    const list = db().attempts.filter((a) => a.student === user.id && a.is_completed)
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
    const page = paginate(list, { page_size: 100, ...p })
    page.results = page.results.map(serAttempt)
    return page
  }),
  testResults: wrap((testId, params = {}) => {
    const user = currentUser(['admin', 'teacher'])
    const t = getTestFor(user, testId)
    const allAttempts = db().attempts.filter((a) => a.test === t.id && a.is_completed)
    // guruh bo'yicha filtr: urinishlar, statistika va reyting faqat shu guruh a'zolari uchun
    const filterGroup = params.group ? db().groups.find((g) => g.id === Number(params.group)) : null
    const attempts = filterGroup ? allAttempts.filter((a) => filterGroup.students.includes(a.student)) : allAttempts
    const pcts = attempts.map((a) => a.percentage)
    // sinf bo'yicha mavzu tahlili: qaysi mavzu eng ko'p xato qilingan
    const d = db()
    const topicMap = {}
    attempts.forEach((a) => {
      d.questions.filter((q) => q.test === t.id).forEach((q) => {
        const k = q.topic || 'Mavzusiz'
        topicMap[k] = topicMap[k] || { name: k, total: 0, correct: 0 }
        topicMap[k].total += 1
        topicMap[k].correct += questionOk(a, q) ? 1 : 0
      })
    })
    const topics = Object.values(topicMap).map((x) => ({ ...x, percent: Math.round((x.correct / x.total) * 1000) / 10 }))
      .sort((a, b) => a.percent - b.percent)
    const testGroups = (t.groups || []).map((gid) => d.groups.find((g) => g.id === gid)).filter(Boolean)
    const ranking = leaderboardOf(t.id).filter((r) => !filterGroup || filterGroup.students.includes(r.student)).map((r, i) => ({ ...r, rank: i + 1 }))
    return {
      test: { id: t.id, title: t.title, test_code: t.test_code, status: t.status },
      groups: testGroups.map((g) => ({ id: g.id, name: g.name })),
      group_stats: testGroups.map((g) => {
        const ga = allAttempts.filter((a) => g.students.includes(a.student))
        return { group: g.id, name: g.name, students: g.students.length, attempts: ga.length,
          average: ga.length ? Math.round((ga.reduce((s, a) => s + a.percentage, 0) / ga.length) * 10) / 10 : null }
      }),
      topics,
      extras: Object.fromEntries(Object.entries(d.extra_attempts || {}).filter(([k]) => k.startsWith(`${t.id}:`)).map(([k, v]) => [k.split(':')[1], v])),
      stats: {
        attempts_count: attempts.length, students_count: new Set(attempts.map((a) => a.student)).size,
        average_percentage: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 100) / 100 : 0,
        highest_percentage: pcts.length ? Math.max(...pcts) : 0, lowest_percentage: pcts.length ? Math.min(...pcts) : 0,
      },
      ranking,
      attempts: attempts.sort((a, b) => b.percentage - a.percentage).map(serAttempt),
    }
  }),
  attemptDetail: wrap((id) => {
    const user = currentUser()
    const d = db()
    const a = d.attempts.find((x) => x.id === Number(id))
    if (!a) throw new ApiError(404, 'Urinish topilmadi.')
    const t = d.tests.find((x) => x.id === a.test)
    const staff = user.role === 'admin' || (user.role === 'teacher' && t.created_by === user.id)
    if (!staff && a.student !== user.id) throw new ApiError(404, 'Urinish topilmadi.')
    if (!staff && !a.is_completed) throw new ApiError(400, 'Urinish hali yakunlanmagan.')
    return attemptDetail(a, user)
  }),
  leaderboard: wrap((testId) => {
    const user = currentUser()
    const d = db()
    const t = d.tests.find((x) => x.id === Number(testId))
    if (!t) throw new ApiError(404, 'Test topilmadi.')
    if (user.role === 'student') {
      if (!d.attempts.some((a) => a.test === t.id && a.student === user.id && a.is_completed)) {
        throw new ApiError(403, 'Reytingni ko\'rish uchun avval testni yakunlang.')
      }
    } else if (user.role === 'teacher' && t.created_by !== user.id) throw new ApiError(404, 'Test topilmadi.')
    return leaderboardOf(t.id)
  }),
  // --- o'qituvchi: savollar tahlili, tuzatish, qo'shimcha urinish, nusxa, tartib, ommaviy qo'shish ---
  questionAnalysis: wrap((testId) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, testId)
    const attempts = d.attempts.filter((a) => a.test === t.id && a.is_completed)
    const items = d.questions.filter((q) => q.test === t.id).sort((a, b) => a.order - b.order).map((q, i) => {
      const counts = Object.fromEntries(q.choices.map((c) => [c.id, 0]))
      let blank = 0, ok = 0
      attempts.forEach((a) => {
        const sel = a.answers[q.id] || []
        if (!sel.length) blank += 1
        sel.forEach((cid) => { if (cid in counts) counts[cid] += 1 })
        if (!q.voided && questionOk(a, q)) ok += 1
      })
      const n = attempts.length
      return {
        question_id: q.id, number: i + 1, text: q.text, question_type: q.question_type, topic: q.topic || '', points: q.points,
        voided: !!q.voided, corrected_at: q.corrected_at || null, answered: n, blank,
        correct_percent: n ? Math.round((ok / n) * 1000) / 10 : null,
        choices: q.choices.map((c) => ({ id: c.id, text: c.text, is_correct: c.is_correct, selected: counts[c.id], percent: n ? Math.round((counts[c.id] / n) * 1000) / 10 : 0 })),
      }
    })
    return { attempts_count: attempts.length, questions: items }
  }),
  // Urinishlar boshlangach savolni oddiy tahrirlab bo'lmaydi; bu yo'l faqat xatoni tuzatish uchun:
  // to'g'ri javobni o'zgartirish yoki savolni bekor qilish (hammaga ball). Barcha urinishlar qayta baholanadi.
  correctQuestion: wrap((questionId, { correct_choice_ids, cancel }) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const q = d.questions.find((x) => x.id === Number(questionId) && x.test)
    if (!q) throw new ApiError(404, 'Savol topilmadi.')
    const t = getTestFor(user, q.test)
    if (cancel) {
      q.voided = true
    } else {
      const ids = correct_choice_ids || []
      if (!ids.length || !ids.every((id) => q.choices.some((c) => c.id === id))) throw new ApiError(400, 'To\'g\'ri javobni tanlang.')
      if (q.question_type !== 'multiple' && ids.length !== 1) throw new ApiError(400, 'Bu savolda aynan bitta to\'g\'ri javob bo\'lishi kerak.')
      q.choices.forEach((c) => { c.is_correct = ids.includes(c.id) })
      q.voided = false
    }
    q.corrected_at = now()
    let regraded = 0
    d.attempts.filter((a) => a.test === t.id && a.is_completed).forEach((a) => { scoreAttempt(d, a); regraded += 1 })
    // mashq/o'zlashtirish natijalari eski javobga bog'liq edi
    Object.keys(d.practice || {}).forEach((k) => { if (k.endsWith(`:${q.id}`)) delete d.practice[k] })
    save()
    return { regraded }
  }),
  grantAttempt: wrap((testId, studentId) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, testId)
    if (!d.users.some((u) => u.id === Number(studentId) && u.role === 'student')) throw new ApiError(404, 'O\'quvchi topilmadi.')
    d.extra_attempts = d.extra_attempts || {}
    const key = `${t.id}:${Number(studentId)}`
    d.extra_attempts[key] = (d.extra_attempts[key] || 0) + 1
    save()
    return { extra: d.extra_attempts[key] }
  }),
  duplicateTest: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const src = getTestFor(user, id)
    let code
    do {
      code = 'BM-' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('')
    } while (d.tests.some((t) => t.test_code === code))
    const copy = { ...clone(src), id: nextId('test'), title: `${src.title} (nusxa)`, test_code: code, status: 'draft', created_by: user.id, created_at: now(), updated_at: now() }
    d.tests.push(copy)
    d.questions.filter((q) => q.test === src.id).forEach((q) => {
      d.questions.push({ ...clone(q), id: nextId('question'), test: copy.id, voided: false, corrected_at: null, choices: q.choices.map((c) => ({ ...c, id: nextId('choice') })) })
    })
    save()
    return serTest(copy, user)
  }),
  reorderQuestions: wrap((testId, orderedIds) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const t = getTestFor(user, testId)
    const mine = d.questions.filter((q) => q.test === t.id)
    if (orderedIds.length !== mine.length || !mine.every((q) => orderedIds.includes(q.id))) throw new ApiError(400, 'Savollar ro\'yxati mos kelmadi.')
    orderedIds.forEach((qid, i) => { mine.find((q) => q.id === qid).order = i })
    save()
    return {}
  }),
  // Savollarni ommaviy qo'shish (fayl import, Claude): hammasi tekshiriladi, xato bo'lsa hech biri saqlanmaydi
  addQuestionsBulk: wrap((target, list) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    if (!Array.isArray(list) || !list.length) throw new ApiError(400, 'Savollar ro\'yxati bo\'sh.')
    if (list.length > 200) throw new ApiError(400, 'Bir martada ko\'pi bilan 200 ta savol.')
    let extra, base
    if (target.testId) {
      const t = getTestFor(user, target.testId)
      ensureEditable(t.id)
      extra = { test: t.id }
      base = d.questions.filter((q) => q.test === t.id).length
    } else {
      const b = d.banks.find((x) => x.id === Number(target.bankId) && (user.role === 'admin' || x.created_by === user.id))
      if (!b) throw new ApiError(404, 'Bank topilmadi.')
      extra = { bank: b.id }
      base = d.questions.filter((q) => q.bank === b.id).length
    }
    const built = []
    const errors = []
    list.forEach((data, i) => {
      try { built.push(buildQuestion({ ...data, order: base + i }, extra)) } catch (e) { errors.push({ index: i + 1, error: e.data?.choices?.[0] || e.data?.text?.[0] || e.data?.points?.[0] || e.message }) }
    })
    if (errors.length) throw new ApiError(400, { detail: 'Ba\'zi savollar yaroqsiz, hech biri saqlanmadi.', errors })
    d.questions.push(...built)
    save()
    return { added: built.length }
  }),
  // --- guruhlar (sinflar) ---
  listGroups: wrap(() => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    return d.groups.filter((g) => user.role === 'admin' || g.teacher === user.id).map((g) => serGroup(d, g))
  }),
  saveGroup: wrap((data) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const name = String(data.name || '').trim()
    if (!name) throw new ApiError(400, { name: ['Guruh nomi kerak.'] })
    const owner = data.id ? d.groups.find((g) => g.id === data.id)?.teacher : user.id
    if (d.groups.some((g) => g.teacher === owner && g.id !== data.id && g.name.toLowerCase() === name.toLowerCase())) {
      throw new ApiError(400, { name: ['Bunday nomli guruh allaqachon bor.'] })
    }
    if (data.id) {
      const g = d.groups.find((x) => x.id === data.id && (user.role === 'admin' || x.teacher === user.id))
      if (!g) throw new ApiError(404, 'Guruh topilmadi.')
      g.name = name
      save()
      return serGroup(d, g)
    }
    const g = { id: nextId('group'), name, teacher: user.id, students: [], created_at: now() }
    d.groups.push(g)
    save()
    return serGroup(d, g)
  }),
  deleteGroup: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const g = d.groups.find((x) => x.id === Number(id) && (user.role === 'admin' || x.teacher === user.id))
    if (!g) throw new ApiError(404, 'Guruh topilmadi.')
    d.groups = d.groups.filter((x) => x.id !== g.id)
    d.tests.forEach((t) => { t.groups = (t.groups || []).filter((gid) => gid !== g.id) })
    save()
    return {}
  }),
  groupMembers: wrap((id, { add = [], remove = [] }) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const g = d.groups.find((x) => x.id === Number(id) && (user.role === 'admin' || x.teacher === user.id))
    if (!g) throw new ApiError(404, 'Guruh topilmadi.')
    if (!add.every((sid) => d.users.some((u) => u.id === sid && u.role === 'student'))) {
      throw new ApiError(400, { add: ['Ba\'zi foydalanuvchilar topilmadi yoki o\'quvchi emas.'] })
    }
    g.students = [...new Set([...g.students, ...add])].filter((sid) => !remove.includes(sid))
    save()
    return serGroup(d, g)
  }),
  groupPool: wrap((p = {}) => {
    currentUser(['admin', 'teacher'])
    const d = db()
    const excluded = p.exclude_group ? d.groups.find((g) => g.id === Number(p.exclude_group))?.students || [] : []
    return d.users.filter((u) => u.role === 'student' && u.is_active && !excluded.includes(u.id) &&
      (!p.search || matches(u.username, p.search) || matches(userName(u), p.search))).slice(0, 50).map(personOf)
  }),
  groupStats: wrap((id) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const g = d.groups.find((x) => x.id === Number(id) && (user.role === 'admin' || x.teacher === user.id))
    if (!g) throw new ApiError(404, 'Guruh topilmadi.')
    const own = new Set(d.tests.filter((t) => user.role === 'admin' || t.created_by === user.id).map((t) => t.id))
    const attempts = d.attempts.filter((a) => a.is_completed && g.students.includes(a.student) && own.has(a.test))
    const avg = (list) => (list.length ? Math.round((list.reduce((s, a) => s + a.percentage, 0) / list.length) * 10) / 10 : null)
    return {
      group: g.id, name: g.name, attempts: attempts.length, average: avg(attempts),
      members: g.students.map((sid) => d.users.find((u) => u.id === sid)).filter(Boolean).map((u) => {
        const mine = attempts.filter((a) => a.student === u.id)
        return { ...personOf(u), attempts: mine.length, average: avg(mine), best: mine.length ? Math.max(...mine.map((a) => a.percentage)) : null,
          blocked: mine.filter((a) => a.violation).length }
      }),
    }
  }),
  // o'qituvchi dashboardi: e'tibor talab qiladigan narsalar
  attention: wrap(() => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    syncSchedule(d)
    const tests = d.tests.filter((t) => user.role === 'admin' || t.created_by === user.id)
    const ids = new Set(tests.map((t) => t.id))
    const attempts = d.attempts.filter((a) => ids.has(a.test) && a.is_completed)
    const byStudent = {}
    attempts.forEach((a) => { (byStudent[a.student] = byStudent[a.student] || []).push(a) })
    const low = Object.entries(byStudent).map(([sid, list]) => {
      const u = d.users.find((x) => x.id === Number(sid))
      return { id: u.id, name: userName(u) || u.username, average: Math.round((list.reduce((s, a) => s + a.percentage, 0) / list.length) * 10) / 10, attempts: list.length }
    }).filter((s) => s.average < 50).sort((a, b) => a.average - b.average).slice(0, 8)
    const week = Date.now() - 7 * 864e5
    const blocked = attempts.filter((a) => a.violation && new Date(a.finished_at).getTime() >= week)
      .sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at)).slice(0, 8).map((a) => ({
        attempt_id: a.id, student: a.student, student_name: userName(d.users.find((u) => u.id === a.student)),
        test: a.test, test_title: d.tests.find((t) => t.id === a.test)?.title, at: a.finished_at,
      }))
    const soon = Date.now() + 72 * 3600 * 1000
    const closing = tests.filter((t) => t.status === 'active' && t.ends_at && new Date(t.ends_at).getTime() <= soon)
      .sort((a, b) => new Date(a.ends_at) - new Date(b.ends_at)).map((t) => ({ id: t.id, title: t.title, test_code: t.test_code, ends_at: t.ends_at }))
    const topicMap = {}
    attempts.forEach((a) => d.questions.filter((q) => q.test === a.test).forEach((q) => {
      const k = q.topic || 'Mavzusiz'
      topicMap[k] = topicMap[k] || { name: k, total: 0, correct: 0 }
      topicMap[k].total += 1
      topicMap[k].correct += questionOk(a, q) ? 1 : 0
    }))
    const weak = Object.values(topicMap).map((x) => ({ ...x, percent: Math.round((x.correct / x.total) * 1000) / 10 }))
      .filter((x) => x.total >= 3 && x.percent < 60).sort((a, b) => a.percent - b.percent).slice(0, 5)
    return { low_students: low, blocked, closing_tests: closing.slice(0, 8), weak_topics: weak }
  }),

  // --- o'qituvchi: o'quvchilar ---
  myStudents: wrap(() => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const tests = new Set(d.tests.filter((t) => user.role === 'admin' || t.created_by === user.id).map((t) => t.id))
    const by = {}
    d.attempts.filter((a) => tests.has(a.test) && a.is_completed).forEach((a) => {
      const s = (by[a.student] = by[a.student] || { list: [] })
      s.list.push(a)
    })
    return Object.entries(by).map(([sid, { list }]) => {
      const u = d.users.find((x) => x.id === Number(sid))
      const pcts = list.map((a) => a.percentage)
      return {
        ...publicUser(u), name: userName(u) || u.username, attempts: list.length,
        average: Math.round((pcts.reduce((s, x) => s + x, 0) / pcts.length) * 10) / 10,
        best: Math.max(...pcts), last_at: list.map((a) => a.finished_at).sort().pop(),
        blocked: list.filter((a) => a.violation).length,
      }
    }).sort((a, b) => new Date(b.last_at) - new Date(a.last_at))
  }),
  studentProfile: wrap((studentId) => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const u = d.users.find((x) => x.id === Number(studentId) && x.role === 'student')
    if (!u) throw new ApiError(404, 'O\'quvchi topilmadi.')
    const tests = d.tests.filter((t) => user.role === 'admin' || t.created_by === user.id)
    const ids = new Set(tests.map((t) => t.id))
    const attempts = d.attempts.filter((a) => a.student === u.id && ids.has(a.test) && a.is_completed)
    if (!attempts.length && user.role !== 'admin') throw new ApiError(404, 'Bu o\'quvchi sizning testlaringizni yechmagan.')
    const topicMap = {}
    attempts.forEach((a) => {
      d.questions.filter((q) => q.test === a.test).forEach((q) => {
        const k = q.topic || 'Mavzusiz'
        topicMap[k] = topicMap[k] || { name: k, total: 0, correct: 0 }
        topicMap[k].total += 1
        topicMap[k].correct += questionOk(a, q) ? 1 : 0
      })
    })
    const extras = d.extra_attempts || {}
    return {
      student: publicUser(u),
      attempts: attempts.sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at)).map(serAttempt),
      topics: Object.values(topicMap).map((x) => ({ ...x, percent: Math.round((x.correct / x.total) * 1000) / 10 })).sort((a, b) => a.percent - b.percent),
      extras: Object.fromEntries(Object.entries(extras).filter(([k]) => Number(k.split(':')[1]) === u.id).map(([k, v]) => [k.split(':')[0], v])),
    }
  }),

  // --- o'quvchi tahlili: mavzular, xatolar, mashq, maqsadlar ---
  // Faqat natijasi "batafsil" ko'rsatiladigan testlar hisobga olinadi: o'qituvchi yashirgan ma'lumot bu orqali sizib chiqmasin.
  myAnalytics: wrap(() => {
    const user = currentUser(['student'])
    const d = db()
    const add = (map, k, ok) => {
      map[k] = map[k] || { name: k, total: 0, correct: 0 }
      map[k].total += 1
      map[k].correct += ok ? 1 : 0
    }
    const topics = {}, types = {}, levels = {}
    let used = 0
    const hiddenTests = new Set()
    d.attempts.filter((a) => a.student === user.id && a.is_completed).forEach((a) => {
      const t = d.tests.find((x) => x.id === a.test)
      if (t.show_results !== 'detailed') { hiddenTests.add(t.id); return }
      used += 1
      d.questions.filter((q) => q.test === a.test).forEach((q) => {
        const ok = questionOk(a, q)
        add(topics, q.topic || 'Mavzusiz', ok)
        add(types, q.question_type, ok)
        add(levels, q.difficulty, ok)
      })
    })
    const fin = (m) => Object.values(m).map((x) => ({ ...x, percent: Math.round((x.correct / x.total) * 1000) / 10 }))
    return { topics: fin(topics), types: fin(types), levels: fin(levels), attempts_used: used, hidden_tests: hiddenTests.size }
  }),
  myMistakes: wrap(() => {
    const user = currentUser(['student'])
    const d = db()
    const streaks = (d.practice ||= {})
    const byQuestion = {}
    d.attempts.filter((a) => a.student === user.id && a.is_completed)
      .sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at))
      .forEach((a) => {
        const t = d.tests.find((x) => x.id === a.test)
        if (t.show_results !== 'detailed') return
        d.questions.filter((q) => q.test === a.test).forEach((q) => {
          const ok = questionOk(a, q)
          const cur = byQuestion[q.id] || { wrong: 0, last: null }
          if (!ok) { cur.wrong += 1; cur.last = a }
          byQuestion[q.id] = cur
        })
      })
    return Object.entries(byQuestion).filter(([, v]) => v.wrong > 0).map(([qid, v]) => {
      const q = d.questions.find((x) => x.id === Number(qid))
      const t = d.tests.find((x) => x.id === q.test)
      const streak = streaks[`${user.id}:${q.id}`] || 0
      return {
        question_id: q.id, test: t.id, test_title: t.title, subject_name: d.subjects.find((s) => s.id === t.subject)?.name || null,
        topic: q.topic || '', text: q.text, question_type: q.question_type, image: q.image, points: q.points,
        choices: q.choices.map((c) => ({ id: c.id, text: c.text, is_correct: c.is_correct })),
        selected_choice_ids: v.last.answers[q.id] || [], wrong_count: v.wrong, last_attempt_at: v.last.finished_at,
        practice_streak: streak, mastered: streak >= MASTER_STREAK,
      }
    }).sort((a, b) => Number(a.mastered) - Number(b.mastered) || new Date(b.last_attempt_at) - new Date(a.last_attempt_at))
  }),
  practiceAnswer: wrap((questionId, choiceIds) => {
    const user = currentUser(['student'])
    const d = db()
    const q = d.questions.find((x) => x.id === Number(questionId))
    const t = q && d.tests.find((x) => x.id === q.test)
    const had = q && t.show_results === 'detailed' &&
      d.attempts.some((a) => a.student === user.id && a.test === q.test && a.is_completed && !questionOk(a, q))
    if (!had) throw new ApiError(404, 'Bu savol mashq ro\'yxatida yo\'q.')
    const correct = q.choices.filter((c) => c.is_correct).map((c) => c.id)
    const ok = choiceIds.length > 0 && choiceIds.length === correct.length && choiceIds.every((x) => correct.includes(x))
    const streaks = (d.practice ||= {})
    const key = `${user.id}:${q.id}`
    streaks[key] = ok ? (streaks[key] || 0) + 1 : 0
    save()
    return { correct: ok, correct_choice_ids: correct, streak: streaks[key], mastered: streaks[key] >= MASTER_STREAK }
  }),
  listGoals: wrap(() => {
    const user = currentUser(['student'])
    const d = db()
    return (d.goals ||= []).filter((g) => g.student === user.id)
  }),
  saveGoal: wrap((data) => {
    const user = currentUser(['student'])
    const d = db()
    const target = Number(data.target)
    if (!(target >= 1 && target <= 100)) throw new ApiError(400, { target: ['Maqsad 1 dan 100 gacha bo\'lsin.'] })
    const subject = data.subject ? Number(data.subject) : null
    const goals = (d.goals ||= [])
    if (goals.some((g) => g.student === user.id && g.subject === subject && g.id !== data.id)) {
      throw new ApiError(400, { subject: ['Bu fan uchun maqsad allaqachon bor. Uni tahrirlang.'] })
    }
    if (data.id) {
      const g = goals.find((x) => x.id === data.id && x.student === user.id)
      if (!g) throw new ApiError(404, 'Maqsad topilmadi.')
      Object.assign(g, { subject, target, deadline: data.deadline || null })
      save()
      return g
    }
    const g = { id: nextId('goal'), student: user.id, subject, target, deadline: data.deadline || null, created_at: now() }
    goals.push(g)
    save()
    return g
  }),
  deleteGoal: wrap((id) => {
    const user = currentUser(['student'])
    const d = db()
    d.goals = (d.goals || []).filter((g) => !(g.id === Number(id) && g.student === user.id))
    save()
    return {}
  }),

  stats: wrap(() => {
    const user = currentUser(['admin', 'teacher'])
    const d = db()
    const tests = d.tests.filter((t) => user.role === 'admin' || t.created_by === user.id)
    const ids = new Set(tests.map((t) => t.id))
    const attempts = d.attempts.filter((a) => ids.has(a.test) && a.is_completed)
    const avg = (list) => (list.length ? Math.round((list.reduce((s, a) => s + a.percentage, 0) / list.length) * 100) / 100 : 0)
    const data = {
      tests_count: tests.length,
      tests_by_status: ['draft', 'active', 'completed'].reduce((o, s) => ({ ...o, [s]: tests.filter((t) => t.status === s).length }), {}),
      attempts_count: attempts.length, students_count: new Set(attempts.map((a) => a.student)).size,
      average_percentage: avg(attempts),
    }
    if (user.role === 'admin') {
      data.users_by_role = ['admin', 'teacher', 'student'].reduce((o, r) => ({ ...o, [r]: d.users.filter((u) => u.role === r).length }), {})
      data.subjects_count = d.subjects.length
      data.by_subject = d.subjects.map((s) => ({
        name: s.name, tests: tests.filter((t) => t.subject === s.id).length,
        average: avg(attempts.filter((a) => d.tests.find((t) => t.id === a.test)?.subject === s.id)),
      }))
    } else {
      data.recent_tests = [...tests].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8).map((t) => {
        const at = attempts.filter((a) => a.test === t.id)
        return { id: t.id, title: t.title, attempts: at.length, average_percentage: avg(at) }
      })
    }
    return data
  }),
}

function studentQuestions(d, test, att) {
  let qs = d.questions.filter((q) => q.test === test.id).sort((a, b) => a.order - b.order)
  if (test.shuffle_questions) qs = shuffled(qs, att.id)
  return qs.map((q) => {
    let choices = q.choices.map(({ id, text, order }) => ({ id, text, order }))
    if (test.shuffle_choices && q.question_type !== 'true_false') choices = shuffled(choices, att.id * 100003 + q.id)
    return { id: q.id, question_type: q.question_type, text: q.text, image: q.image, has_formula: q.has_formula, points: q.points, order: q.order, choices }
  })
}
