import { cleanExcelText, display, numeric, type Column, type Row } from './view-model';
export type ExportOptions = { missingText?: string; source?: string; metadata?: { label: string; value: string | number }[] };
/** Imported only by an explicit export click; neither xlsx nor zip code ships in the initial panel chunk. */
export async function exportTable(title: string, columns: Column[], rows: Row[], period: string, options: ExportOptions = {}) {
  const [XLSX, zip] = await Promise.all([import('xlsx'), import('fflate')]);
  const missing = cleanExcelText(options.missingText ?? '—');
  const values = rows.map(row => columns.map(column => {
    const value = column.value ? column.value(row) : row[column.key];
    if (value === null || value === undefined || value === '') return missing;
    if (column.kind === 'money' || column.kind === 'number' || column.kind === 'percent') {
      const n = numeric(value); return n === null ? missing : column.kind === 'percent' ? n / 100 : n;
    }
    return cleanExcelText(display(value));
  }));
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(column => cleanExcelText(column.label)), ...values]);
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(0, columns.length - 1) } }) };
  sheet['!cols'] = columns.map((column, i) => ({ wch: Math.min(70, values.reduce((width, row) => Math.max(width, String(row[i] ?? '').length + 2), Math.max(16, column.label.length + 2))) }));
  for (let r = 1; r <= rows.length; r++) columns.forEach((column, c) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (cell?.t === 'n') cell.z = column.kind === 'percent' ? '0.00%' : column.kind === 'money' ? '#,##0.00;[Red]-#,##0.00' : '#,##0';
    if (cell && options.source) {
      const row = rows[r - 1];
      cell.c = [{ a: 'Internet Operadores', t: `${options.source}\nFuente de la fila: ${row.factura ?? row.contrato ?? row.origen ?? 'sin dato'}; fecha ${row.fecha ?? row.fechaFactura ?? 'sin dato'}. Campo: ${column.label}.` }];
    }
  });
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Rentabilidad');
  if (options.metadata) {
    const context = XLSX.utils.aoa_to_sheet([['Dato', 'Valor'], ...options.metadata.map(row => [cleanExcelText(row.label), typeof row.value === 'number' ? row.value : cleanExcelText(row.value)])]);
    context['!cols'] = [{ wch: 30 }, { wch: 80 }];
    if (options.source) for (let r = 1; r <= options.metadata.length; r++) for (let c = 0; c < 2; c++) {
      const cell = context[XLSX.utils.encode_cell({ r, c })];
      if (cell) cell.c = [{ a: 'Internet Operadores', t: options.source }];
    }
    XLSX.utils.book_append_sheet(book, context, 'Foto y notas');
  }
  const file = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }));
  // SheetJS CE does not serialize frozen panes: preserve the existing single-sheet export convention.
  const files = zip.unzipSync(file); const path = 'xl/worksheets/sheet1.xml'; let xml = zip.strFromU8(files[path]);
  const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
  if (/<sheetViews(?:\s[^>]*)?>[\s\S]*?<\/sheetViews>/.test(xml)) xml = xml.replace(/<sheetViews(?:\s[^>]*)?>[\s\S]*?<\/sheetViews>/, views);
  else xml = xml.replace(/(<(?:sheetFormatPr|cols|sheetData)\b)/, `${views}$1`);
  files[path] = zip.strToU8(xml);
  // These are exported source values, not workbook formulas. CE ignores font styles,
  // so retain number formats and add the conventional blue input font in OOXML.
  if (options.source) {
    let styles = zip.strFromU8(files['xl/styles.xml']);
    const fonts = styles.match(/<fonts\b[^>]*count="(\d+)"[^>]*>/);
    const xfs = styles.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/);
    if (!fonts || !xfs) throw new Error('No se pudo conservar el formato del Excel.');
    const fontId = Number(fonts[1]);
    styles = styles.replace(/<fonts\b([^>]*)>([\s\S]*?)<\/fonts>/, (_, attrs, body) => `<fonts${attrs.replace(/count="\d+"/, `count="${fontId + 1}"`)}>${body}<font><sz val="11"/><color rgb="FF0000FF"/><name val="Calibri"/></font></fonts>`);
    const originals = xfs[1].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
    if (!originals.length) throw new Error('No se pudo conservar el formato numérico.');
    const inputStyles = originals.map(style => style.replace(/fontId="\d+"/, `fontId="${fontId}"`).replace(/<xf\b/, '<xf applyFont="1"'));
    styles = styles.replace(/<cellXfs\b[^>]*>[\s\S]*?<\/cellXfs>/, `<cellXfs count="${originals.length + inputStyles.length}">${originals.join('')}${inputStyles.join('')}</cellXfs>`);
    files['xl/styles.xml'] = zip.strToU8(styles);
    for (const name of Object.keys(files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
      const sheetXml = zip.strFromU8(files[name]).replace(/<row\b([^>]*)>([\s\S]*?)<\/row>/g, (row, attrs, cells) => {
        if (Number(attrs.match(/\br="(\d+)"/)?.[1]) <= 1) return row;
        return `<row${attrs}>${cells.replace(/<c\b([^>]*)>/g, (_: string, cellAttrs: string) => {
          const oldStyle = Number(cellAttrs.match(/\bs="(\d+)"/)?.[1] ?? 0);
          const next = originals.length + oldStyle;
          return `<c${/\bs="\d+"/.test(cellAttrs) ? cellAttrs.replace(/\bs="\d+"/, `s="${next}"`) : `${cellAttrs} s="${next}"`}>`;
        })}</row>`;
      });
      files[name] = zip.strToU8(sheetXml);
    }
  }
  const packed = zip.zipSync(files); const blob = new Blob([packed.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `rentabilidad-${period}-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
