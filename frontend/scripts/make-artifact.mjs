// dist/index.html (vite-plugin-singlefile natijasi) -> dist/artifact.html
// Artifakt platformasi <html>/<head>/<body> ni o'zi qo'shadi, shuning uchun faqat kontent qoldiriladi.
// Eslatma: bundlelangan kutubxonalar ichida "<script>" / "<style" matnlari uchraydi, shuning uchun regex o'rniga
// haqiqiy teg chegaralari qidiriladi (JS: birinchi module-script ochilishidan oxirgi </script> gacha).
import { readFileSync, writeFileSync } from 'node:fs'

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8')

const scriptOpen = html.indexOf('<script type="module"')
const scriptBodyStart = html.indexOf('>', scriptOpen) + 1
const scriptEnd = html.lastIndexOf('</script>')
if (scriptOpen < 0 || scriptEnd < scriptBodyStart) throw new Error('Inline JS topilmadi. Avval `npm run build`.')
const js = html.slice(scriptBodyStart, scriptEnd)

let styleOpen = -1
for (let i = html.indexOf('<style'); i >= 0; i = html.indexOf('<style', i + 1)) {
  if (i < scriptOpen || i > scriptEnd) { styleOpen = i; break }
}
const styleEnd = html.indexOf('</style>', styleOpen)
if (styleOpen < 0 || styleEnd < 0) throw new Error('Inline CSS topilmadi.')
const css = html.slice(html.indexOf('>', styleOpen) + 1, styleEnd)

const fonts = html.match(/<link[^>]+fonts\.googleapis\.com\/css2[^>]*>/)?.[0] ?? ''

// Artifaktni "Anyone with the link" qilish uchun sahifada font fayllari (data:font/...) bo'lmasligi kerak: platforma ularni
// ommaviy ulashish uchun tekshira olmaydi. Shuning uchun KaTeX fontlari CDN dan, DejaVu (PDF) esa ishga tushganda yuklanadi.
// Viewer CSP faqat Google Fonts ga ruxsat beradi, shuning uchun KaTeX fontlari o'rniga Google'dagi "STIX Two Text" ishlatiladi.
const MATH_FONT_LINK = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:ital,wght@0,400;0,700;1,400;1,700&display=swap">'
const cssNoFonts = css
  .replace(/@font-face\{[^}]*?font-family:KaTeX_\w+;[^}]*\}/g, '')
  .replace(/KaTeX_\w+/g, '"STIX Two Text"')
const jsNoFonts = js.replace(/data:font\/ttf;base64,[A-Za-z0-9+/=]{200000,}/g, 'https://cdn.jsdelivr.net/npm/dejavu-fonts-ttf@2.37.3/ttf/DejaVuSans.ttf')
// Kutubxonalar (pdf.js, jsPDF) ichidagi qolgan data: MIME satrlari ham "ko'rib chiqib bo'lmaydigan fayl" deb o'qilmasin.
// Bu yo'llar bizning funksiyalarimizda ishlatilmaydi (SVG/PDF rasmga aylantirish, CSS orqali font yuklash).
const jsSafe = jsNoFonts
  .replace(/data:image\/svg\+xml/g, 'data:image/svg-x')
  .replace(/data:application\/pdf/g, 'data:application/x-pdf')
  .replace(/data:font\/opentype/g, 'data:font/x-opentype')
if (/data:font\/[a-z0-9]+;base64,[A-Za-z0-9+/=]{200}/.test(cssNoFonts + jsNoFonts)) throw new Error('Artifaktda hali ham data:font qolgan.')

const out = `<title>BM_examer</title>
<meta name="claude:viewport-fit-sides" content="cover">
${fonts}
${MATH_FONT_LINK}
<style>${cssNoFonts}</style>
<div id="root"></div>
<script type="module">${jsSafe.replace(/<\/script/gi, '<\\/script').replace(/\uFFFD/g, '\\uFFFD')}</script>
`
writeFileSync(new URL('../dist/artifact.html', import.meta.url), out)
console.log(`dist/artifact.html: ${(out.length / 1024).toFixed(0)} KB (index.html: ${(html.length / 1024).toFixed(0)} KB)`)
