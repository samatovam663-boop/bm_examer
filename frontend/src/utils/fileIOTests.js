// O'qituvchi uchun fayllar: savollarni import/eksport, natijalarni eksport. fileIO.js dagi o'qish funksiyalaridan foydalanadi.
import { readRows, useUnicodeFont } from './fileIO'
import { DIFFICULTY, QTYPE, fmtDateTime } from './format'

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s.'’ʻʼ`_\-/()]+/g, '')

// ---------- umumiy jadval -> fayl ----------

async function tableExcel(head, rows, widths) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const header = head.map((value) => ({ value, fontWeight: 'bold' }))
  const body = rows.map((r) => r.map((value) => (typeof value === 'number' ? { type: Number, value } : { type: String, value: String(value ?? '') })))
  return writeExcelFile([header, ...body], { columns: widths.map((width) => ({ width })) }).toBlob()
}

async function tableWord(title, head, rows, landscape = true) {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, HeadingLevel } = await import('docx')
  const cell = (text, bold) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text ?? ''), bold, size: 18 })] })] })
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((v) => cell(v, false)) })),
    ],
  })
  const doc = new Document({
    sections: [{
      properties: landscape ? { page: { size: { orientation: 'landscape' } } } : {},
      children: [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }), table],
    }],
  })
  return Packer.toBlob(doc)
}

async function tablePdf(title, head, rows) {
  const [{ jsPDF }, { default: autoTable }, { default: fontUrl }] = await Promise.all([
    import('jspdf'), import('jspdf-autotable'), import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?inline'),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  await useUnicodeFont(doc, fontUrl)
  doc.setFontSize(16)
  doc.text(title, 40, 40)
  autoTable(doc, {
    startY: 56, head: [head], body: rows.map((r) => r.map((v) => String(v ?? ''))),
    styles: { font: 'DejaVu', fontSize: 9, cellPadding: 5 },
    headStyles: { font: 'DejaVu', fontStyle: 'normal', fillColor: [93, 53, 87], textColor: 255 },
    alternateRowStyles: { fillColor: [243, 234, 248] },
  })
  return doc.output('blob')
}

// ---------- natijalar eksporti ----------

const RESULT_HEAD = ['№', 'O\'quvchi', 'Urinish', 'Ball', 'To\'g\'ri / jami', 'Foiz', 'Vaqt (daq)', 'Tab almashtirish', 'Holat', 'Sana']

function resultRows(attempts) {
  return [...attempts].sort((a, b) => b.percentage - a.percentage).map((a, i) => [
    String(i + 1), a.student_name, `#${a.attempt_number}`, a.score, `${a.correct_answers}/${a.total_questions}`, `${a.percentage}%`,
    a.duration_seconds == null ? '' : String(Math.round((a.duration_seconds / 60) * 10) / 10), a.tab_switches,
    a.violation ? 'Bloklangan (boshqa oynaga o\'tgan)' : 'Normal', fmtDateTime(a.finished_at),
  ])
}

export const exportResults = {
  excel: (test, attempts) => tableExcel(RESULT_HEAD, resultRows(attempts), [5, 24, 9, 8, 14, 9, 11, 16, 30, 18]),
  word: (test, attempts) => tableWord(`Natijalar: ${test.title} (${test.test_code})`, RESULT_HEAD, resultRows(attempts)),
  pdf: (test, attempts) => tablePdf(`Natijalar: ${test.title} (${test.test_code})`, RESULT_HEAD, resultRows(attempts)),
}

// ---------- savollar eksporti va shablon ----------

const Q_HEAD = ['Savol', 'Tur', 'Ball', 'Qiyinlik', 'Mavzu', 'To\'g\'ri javob', 'Variant 1', 'Variant 2', 'Variant 3', 'Variant 4', 'Variant 5']

function questionRows(questions) {
  return questions.map((q) => {
    const correct = q.question_type === 'true_false'
      ? (q.choices.find((c) => c.is_correct)?.text.toLowerCase() === 'true' ? 'true' : 'false')
      : q.choices.map((c, i) => (c.is_correct ? i + 1 : null)).filter(Boolean).join(',')
    const choices = q.question_type === 'true_false' ? [] : q.choices.map((c) => c.text)
    return [q.text, q.question_type, q.points, q.difficulty, q.topic || '', correct, ...choices]
  })
}

export const exportQuestions = {
  excel: (questions) => tableExcel(Q_HEAD, questionRows(questions), [50, 12, 7, 10, 18, 14, 22, 22, 22, 22, 22]),
  word: (test, questions) => tableWord(`${test.title}: savollar`, Q_HEAD, questionRows(questions)),
}

/** Import uchun namunali fayl: tuzilish tushunarli bo'lishi uchun 3 xil savol. */
export function questionTemplateExcel() {
  return tableExcel(Q_HEAD, [
    ['$x^2 - 5x + 6 = 0$ tenglamaning ildizlari yig\'indisi?', 'single', 2, 'medium', 'Viyet teoremasi', 1, '5', '6', '-5', '1'],
    ['Tub sonlarni belgilang', 'multiple', 3, 'easy', 'Tub sonlar', '1,3', '2', '9', '11', '15'],
    ['Yer Quyosh atrofida aylanadi', 'true_false', 1, 'easy', 'Astronomiya', 'true'],
  ], [50, 12, 7, 10, 18, 14, 22, 22, 22, 22, 22])
}

// ---------- savollar importi ----------

const COL = {
  savol: 'text', savolmatni: 'text', question: 'text', text: 'text',
  tur: 'type', turi: 'type', savolturi: 'type', type: 'type',
  ball: 'points', points: 'points',
  qiyinlik: 'difficulty', daraja: 'difficulty', difficulty: 'difficulty',
  mavzu: 'topic', topic: 'topic',
  togrijavob: 'correct', togrijavoblar: 'correct', correct: 'correct', javob: 'correct',
}
const TYPES = {
  single: 'single', bitta: 'single', bittajavob: 'single', bittajavobli: 'single',
  multiple: 'multiple', kop: 'multiple', kopjavob: 'multiple', kopjavobli: 'multiple',
  truefalse: 'true_false', tf: 'true_false', rostyolgon: 'true_false', rost: 'true_false',
}
const LEVELS = { easy: 'easy', oson: 'easy', medium: 'medium', orta: 'medium', ortacha: 'medium', hard: 'hard', qiyin: 'hard' }
const TRUE = new Set(['true', 'rost', 'ha', 'yes', '1'])
const FALSE = new Set(['false', 'yolgon', 'yoq', 'no', '0'])

/** Qatorlar -> [{ line, data } | { line, error }]. Tekshiruv backend qoidalariga mos. */
export function rowsToQuestions(rows) {
  const clean = rows.map((r, i) => ({ line: i + 1, cells: r.map((c) => String(c ?? '').trim()) })).filter((r) => r.cells.some(Boolean))
  if (!clean.length) return []
  const isHead = (cells) => cells.filter((c) => COL[norm(c)]).length >= 2
  const headAt = clean.slice(0, 5).findIndex((r) => isHead(r.cells))
  let map = null
  if (headAt >= 0) map = clean[headAt].cells.map((c) => COL[norm(c)] || null)
  const body = clean.slice(headAt >= 0 ? headAt + 1 : 0)

  // sarlavhasiz bo'lsa backend formati: A savol | B tur | C ball | D qiyinlik | E to'g'ri javob | F... variantlar
  const positional = ['text', 'type', 'points', 'difficulty', 'correct']

  return body.map(({ line, cells }) => {
    try {
      const v = { choices: [] }
      cells.forEach((c, i) => {
        const key = map ? map[i] : positional[i]
        if (key) v[key] = c
        else if (c && (map ? true : i >= positional.length)) v.choices.push(c)
      })
      if (!v.text) throw new Error('savol matni bo\'sh')
      const type = TYPES[norm(v.type || 'single')]
      if (!type) throw new Error(`noma'lum savol turi: "${v.type}"`)
      const level = LEVELS[norm(v.difficulty || 'medium')]
      if (!level) throw new Error(`noma'lum qiyinlik: "${v.difficulty}"`)
      const points = v.points ? Number(String(v.points).replace(',', '.')) : 1
      if (!(points >= 1)) throw new Error('ball kamida 1 bo\'lishi kerak')
      const data = { question_type: type, text: v.text, points: Math.round(points), difficulty: level, topic: v.topic || '' }
      if (type === 'true_false') {
        const ans = norm(v.correct)
        if (!TRUE.has(ans) && !FALSE.has(ans)) throw new Error('true/false savolda to\'g\'ri javob "true" yoki "false" bo\'lishi kerak')
        data.choices = [{ text: 'True', is_correct: TRUE.has(ans) }, { text: 'False', is_correct: FALSE.has(ans) }]
      } else {
        if (v.choices.length < 2) throw new Error('kamida 2 ta variant kerak')
        const picked = new Set(String(v.correct || '').split(/[,;\s]+/).filter(Boolean).map((p) => {
          if (/^\d+$/.test(p)) return Number(p)
          const letter = p.toUpperCase().charCodeAt(0) - 64 // A=1
          return p.length === 1 && letter >= 1 && letter <= 26 ? letter : NaN
        }))
        if (!picked.size || [...picked].some((n) => !(n >= 1 && n <= v.choices.length))) throw new Error('to\'g\'ri javob raqami variantlarga mos emas')
        if (type === 'single' && picked.size !== 1) throw new Error('bitta javobli savolda faqat bitta to\'g\'ri javob bo\'lsin')
        data.choices = v.choices.map((text, i) => ({ text, is_correct: picked.has(i + 1) }))
      }
      return { line, data }
    } catch (err) {
      return { line, error: err.message }
    }
  })
}

export async function parseQuestionsFile(file) {
  const items = rowsToQuestions(await readRows(file))
  if (!items.length) throw new Error('Fayldan savol topilmadi. Namuna faylni yuklab olib, shu tuzilishda to\'ldiring.')
  return items
}

export const LABELS = { QTYPE, DIFFICULTY }
