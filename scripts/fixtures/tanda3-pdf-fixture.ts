/** Synthetic one-page PDF for native-parser tests. Node only; never user data. */
export function createTanda3PdfFixture(rows: readonly Readonly<{ text: string; x: number; y: number; size?: number }>[], width = 620, height = 800): Buffer<ArrayBuffer> {
  const literal = (text: string) => {
    if ([...text].some(char => char.charCodeAt(0) > 255)) throw new Error('FIXTURE_TEXT_MUST_BE_LATIN1')
    return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[\r\n]/g, ' ')
  }
  const stream = rows.length ? rows.map(row => `BT /F1 ${row.size ?? 10} Tf 1 0 0 1 ${row.x} ${row.y} Tm (${literal(row.text)}) Tj ET`).join('\n') + '\n' : 'q Q\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`,
  ]
  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')]
  const offsets = [0]
  let position = chunks[0].length
  for (let index = 0; index < objects.length; index++) {
    offsets.push(position)
    const chunk = Buffer.from(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`, 'latin1')
    chunks.push(chunk); position += chunk.length
  }
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`, 'latin1'))
  return Buffer.concat(chunks)
}
