// Foydalanuvchilar ro'yxatini Excel / Word / PDF ga eksport qilish va shu formatlardan import qilish.
// Hammasi brauzerda ishlaydi (backend kerak emas). Og'ir kutubxonalar faqat kerak bo'lganda yuklanadi.
import { fmtDate } from './format'

// ---------- saqlash ----------

/** Artifaktda fayl faqat `downloads` imkoniyati orqali (foydalanuvchi tasdiqlaydi) saqlanadi; oddiy saytda oddiy yuklab olish. */
export async function saveFile(filename, blob) {
  const dl = typeof window !== 'undefined' && typeof window.claude?.use === 'function'
    ? await window.claude.use('downloads')
    : null
  if (dl) {
    await dl.save({ filename, data: blob })
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ---------- eksport ----------

const ROLE_LABEL = { admin: 'Admin', teacher: 'O\'qituvchi', student: 'O\'quvchi' }
export const EXPORT_HEAD = ['№', 'Ism', 'Familiya', 'Login', 'Rol', 'Telefon', 'Email', 'Holat', 'Qo\'shilgan']

export function usersToRows(users) {
  return users.map((u, i) => [
    String(i + 1), u.first_name || '', u.last_name || '', u.username, ROLE_LABEL[u.role] || u.role, u.phone || '',
    u.email || '', u.is_active ? 'Faol' : 'Bloklangan', fmtDate(u.created_at),
  ])
}

/** Excel'ga qo'yish mumkin bo'lgan matn (tab bilan ajratilgan). */
export const usersToTsv = (users) => [EXPORT_HEAD, ...usersToRows(users)].map((r) => r.join('\t')).join('\n')

export async function exportExcel(users) {
  const { default: writeExcelFile } = await import('write-excel-file/universal')
  const head = EXPORT_HEAD.map((value) => ({ value, fontWeight: 'bold' }))
  const body = usersToRows(users).map((row) => row.map((value) => ({ type: String, value })))
  const widths = [6, 16, 18, 20, 14, 18, 28, 12, 14]
  return writeExcelFile([head, ...body], { columns: widths.map((width) => ({ width })) }).toBlob()
}

export async function exportWord(users, title) {
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType, HeadingLevel } = await import('docx')
  const cell = (text, bold) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text), bold, size: 18 })] })] })
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: EXPORT_HEAD.map((h) => cell(h, true)) }),
      ...usersToRows(users).map((r) => new TableRow({ children: r.map((v) => cell(v, false)) })),
    ],
  })
  const doc = new Document({
    sections: [{
      properties: { page: { size: { orientation: 'landscape' } } },
      children: [
        new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ children: [new TextRun({ text: `Jami: ${users.length} ta`, size: 20 })] }),
        table,
      ],
    }],
  })
  return Packer.toBlob(doc)
}

/** ?inline shrift data-URL bo'ladi; artifakt build'ida u CDN havolasi bilan almashtiriladi, shuning uchun ikkalasini ham qo'llaymiz. */
export async function fontBase64(src) {
  if (src.startsWith('data:')) return src.split(',')[1]
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** DejaVu bilan kirill/lotin harflari to'g'ri chiqadi. Artifakt CSP si yuklashga yo'l qo'ymasa, standart shriftga qaytamiz. */
export async function useUnicodeFont(doc, fontSrc) {
  try {
    doc.addFileToVFS('DejaVuSans.ttf', await fontBase64(fontSrc))
    doc.addFont('DejaVuSans.ttf', 'DejaVu', 'normal')
    doc.setFont('DejaVu')
  } catch {
    doc.setFont('helvetica')
  }
}

export async function exportPdf(users, title) {
  const [{ jsPDF }, { default: autoTable }, { default: fontUrl }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
    // DejaVu Sans (erkin litsenziya): o'zbek lotin va kirill harflari uchun
    import('dejavu-fonts-ttf/ttf/DejaVuSans.ttf?inline'),
  ])
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  await useUnicodeFont(doc, fontUrl)
  doc.setFontSize(16)
  doc.text(title, 40, 40)
  autoTable(doc, {
    startY: 56,
    head: [EXPORT_HEAD],
    body: usersToRows(users),
    styles: { font: 'DejaVu', fontSize: 9, cellPadding: 5 },
    headStyles: { font: 'DejaVu', fontStyle: 'normal', fillColor: [93, 53, 87], textColor: 255 },
    alternateRowStyles: { fillColor: [243, 234, 248] },
  })
  return doc.output('blob')
}

// ---------- import ----------

export const MAX_FILE_BYTES_EXPORT = 10 * 1024 * 1024
const MAX_FILE_BYTES = 10 * 1024 * 1024

const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s.'’ʻʼ`_\-/]+/g, '')
const HEADER_KEYS = {
  ism: 'first', ismi: 'first', familiya: 'last', familiyasi: 'last',
  ismfamiliya: 'full', familiyaism: 'full', fish: 'full', fio: 'full', oquvchi: 'full', toliqism: 'full', name: 'full', fullname: 'full',
  login: 'username', username: 'username', foydalanuvchi: 'username',
  parol: 'password', password: 'password',
  telefon: 'phone', tel: 'phone', phone: 'phone', telefonraqam: 'phone',
}

/** Jadval qatorlari -> "Ism Familiya, login, parol, telefon" matn qatorlari. Sarlavha bo'lsa ustunlar nomidan taniladi. */
export function rowsToStudentText(rows) {
  const clean = rows.map((r) => r.map((c) => String(c ?? '').trim())).filter((r) => r.some(Boolean))
  if (!clean.length) return { text: '', count: 0 }

  // sarlavha qatori birinchi qatorlar orasida bo'lishi mumkin (masalan PDF/Word'da avval sarlavha matni turadi)
  const isHeader = (r) => r.map((c) => HEADER_KEYS[norm(c)]).filter((k) => k).length >= 2
  const headerAt = clean.slice(0, 6).findIndex(isHeader)
  const hasHeader = headerAt >= 0
  const mapped = hasHeader ? clean[headerAt].map((c) => HEADER_KEYS[norm(c)]) : []
  const out = []

  if (hasHeader) {
    clean.slice(headerAt + 1).filter((r) => !isHeader(r)).forEach((r) => { // PDF'da sarlavha har sahifada takrorlanadi
      const v = {}
      mapped.forEach((k, i) => { if (k && r[i]) v[k] = r[i] })
      const name = v.full || [v.first, v.last].filter(Boolean).join(' ')
      out.push([name, v.username, v.password, v.phone])
    })
  } else {
    clean.forEach((r) => {
      // tartib raqami alohida katakda ("1") yoki ism oldida ("1. Ali Valiyev") bo'lishi mumkin
      const cells = /^\d+[.)]?$/.test(r[0]) && r.length > 1 ? r.slice(1) : [...r]
      cells[0] = String(cells[0] ?? '').replace(/^\d+[.)]\s+/, '')
      out.push([cells[0], cells[1], cells[2], cells[3]])
    })
  }

  const lines = out
    .filter((cells) => cells.some(Boolean))
    .map((cells) => {
      const parts = cells.map((c) => String(c ?? '').replace(/[,;\t]+/g, ' ').trim())
      while (parts.length > 1 && !parts[parts.length - 1]) parts.pop()
      return parts.join(', ')
    })
  return { text: lines.join('\n'), count: lines.length }
}

function splitFlatLines(text) {
  return text.split(/\r?\n/).map((l) => l.split(/\t|;|,/).map((c) => c.trim())).filter((r) => r.some(Boolean))
}

async function excelRows(file) {
  const { readSheet } = await import('read-excel-file/universal')
  return readSheet(file)
}

async function wordRows(file) {
  const { default: mammoth } = await import('mammoth/mammoth.browser.js')
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const tableRows = [...dom.querySelectorAll('tr')].map((tr) => [...tr.children].map((td) => td.textContent.trim()))
  if (tableRows.length) return tableRows
  return splitFlatLines([...dom.querySelectorAll('p')].map((p) => p.textContent).join('\n'))
}

async function pdfRows(file) {
  const pdfjs = await import('pdfjs-dist/build/pdf.mjs')
  // worker alohida fayl sifatida mavjud emas: asosiy oqimda ishlatamiz
  globalThis.pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.mjs')
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const rows = []
  let columns = null // sarlavha ustunlarining x koordinatalari: bo'sh kataklar ustunlarni siljitmasligi uchun
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent()
    const lines = new Map()
    content.items.filter((it) => it.str && it.str.trim()).forEach((it) => {
      const key = Math.round(it.transform[5] / 3)
      if (!lines.has(key)) lines.set(key, [])
      lines.get(key).push({ x: it.transform[4], end: it.transform[4] + (it.width || 0), str: it.str })
    })
    ;[...lines.entries()].sort((a, b) => b[0] - a[0]).forEach(([, items]) => {
      items.sort((a, b) => a.x - b.x)
      const cells = []
      let prevEnd = null
      items.forEach((it) => {
        if (prevEnd !== null && it.x - prevEnd < 1.5 && cells.length) cells[cells.length - 1].str += it.str
        else cells.push({ x: it.x, str: it.str })
        prevEnd = it.end
      })
      if (cells.filter((c) => HEADER_KEYS[norm(c.str)]).length >= 2) {
        columns = cells.map((c) => c.x)
        rows.push(cells.map((c) => c.str.trim()))
      } else if (columns) {
        const aligned = Array(columns.length).fill('')
        cells.forEach((c) => {
          let idx = 0
          columns.forEach((cx, i) => { if (c.x >= cx - 3) idx = i })
          aligned[idx] = `${aligned[idx]} ${c.str}`.trim()
        })
        rows.push(aligned)
      } else {
        rows.push(cells.map((c) => c.str.trim()))
      }
    })
  }
  return rows
}

/** Fayl (.xlsx, .docx, .pdf, .csv, .txt) -> jadval qatorlari [[katak, ...], ...] */
export async function readRows(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Fayl hajmi 10 MB dan oshmasligi kerak.')
  const ext = file.name.split('.').pop().toLowerCase()
  try {
    if (ext === 'xlsx') return await excelRows(file)
    if (ext === 'docx') return await wordRows(file)
    if (ext === 'pdf') return await pdfRows(file)
    if (ext === 'csv' || ext === 'txt') return splitFlatLines(await file.text())
  } catch {
    throw new Error('Faylni o\'qib bo\'lmadi. U buzilgan yoki parol bilan himoyalangan bo\'lishi mumkin.')
  }
  throw new Error(`.${ext} formati qo'llab-quvvatlanmaydi. Excel (.xlsx), Word (.docx), PDF, CSV yoki TXT yuklang.`)
}

/** Fayl (.xlsx, .docx, .pdf, .csv, .txt) -> { text, count } */
export async function parseStudentFile(file) {
  const rows = await readRows(file)
  const result = rowsToStudentText(rows)
  if (!result.count) throw new Error('Fayldan o\'quvchi topilmadi. Ustunlar: Ism, Familiya (yoki Ism Familiya), Login, Parol, Telefon.')
  return result
}
