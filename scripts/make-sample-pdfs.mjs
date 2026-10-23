// Generates the two small sample PDFs bundled with the demo library.
import { writeFileSync } from 'node:fs'

function pdf(lines) {
  const esc = (s) => s.replace(/[()\\]/g, (m) => String.fromCharCode(92) + m)
  const content = ['BT', '/F1 20 Tf', '72 760 Td', `(${esc(lines[0])}) Tj`, '/F1 11 Tf', '0 -28 Td',
    ...lines.slice(1).flatMap((l) => [`(${esc(l)}) Tj`, '0 -18 Td']), 'ET'].join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offs = []
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return out
}

writeFileSync('public/samples/noorani-qaida-sample.pdf', pdf([
  'Noorani Qaida - Practice Workbook (Sample)',
  'Al Farooquia demo resource. Fictional sample content for demonstration only.',
  '',
  'Lesson 1: Single letters (Huroof Mufradat)',
  '  - Recite each letter with its correct point of articulation (makhraj).',
  '  - Practise heavy letters (kha, sad, dad, ta, za, ghayn, qaf) separately.',
  'Lesson 2: Compound letters (Murakkabat)',
  '  - Identify the beginning, middle and end forms of joined letters.',
  'Lesson 4: Harakat - Fatha, Kasra, Damma',
  '  - Read short vowels clearly without stretching.',
  '',
  'Mentor initials: ________    Date: ________',
]))
writeFileSync('public/samples/tajweed-noon-sakinah-sample.pdf', pdf([
  'Tajweed Essentials: Noon Sakinah & Tanween (Sample)',
  'Al Farooquia demo resource. Fictional sample content for demonstration only.',
  '',
  '1. Izhar - pronounce clearly before the throat letters.',
  '2. Idgham - merge into the following letter (with or without ghunnah).',
  '3. Iqlab - change to a meem sound before the letter ba.',
  '4. Ikhfa - hide the sound with ghunnah before the remaining 15 letters.',
  '',
  'Self-check: find one example of each rule in Surah Al-Mulk.',
]))
console.log('Sample PDFs written')
