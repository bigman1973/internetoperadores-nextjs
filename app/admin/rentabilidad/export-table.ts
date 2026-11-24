import { cleanExcelText, display, numeric, type Column, type Row } from './view-model';
/** Imported only by an explicit export click; neither xlsx nor zip code ships in the initial panel chunk. */
export async function exportTable(title: string, columns: Column[], rows: Row[], period: string) {
  const [XLSX, zip] = await Promise.all([import('xlsx'), import('fflate')]);
  const values = rows.map(row => columns.map(column => {
    const value = column.value ? column.value(row) : row[column.key];
    if (value === null || value === undefined || value === '') return cleanExcelText('—');
    if (column.kind === 'money' || column.kind === 'number' || column.kind === 'percent') {
      const n = numeric(value); return n === null ? cleanExcelText('—') : column.kind === 'percent' ? n / 100 : n;
    }
    return cleanExcelText(display(value));
  }));
  const sheet = XLSX.utils.aoa_to_sheet([columns.map(column => cleanExcelText(column.label)), ...values]);
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: Math.max(0, columns.length - 1) } }) };
  sheet['!cols'] = columns.map(column => ({ wch: column.kind ? 22 : 34 }));
  for (let r = 1; r <= rows.length; r++) columns.forEach((column, c) => {
    const cell = sheet[XLSX.utils.encode_cell({ r, c })];
    if (cell?.t === 'n') cell.z = column.kind === 'percent' ? '0.00%' : column.kind === 'money' ? '#,##0.00;[Red]-#,##0.00' : '#,##0';
  });
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Rentabilidad');
  const file = new Uint8Array(XLSX.write(book, { bookType: 'xlsx', type: 'array' }));
  // SheetJS CE does not serialize frozen panes: add the standard OOXML view to the generated sheet.
  const files = zip.unzipSync(file); const path = 'xl/worksheets/sheet1.xml'; let xml = zip.strFromU8(files[path]);
  const views = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>';
  if (/<sheetViews(?:\s[^>]*)?>[\s\S]*?<\/sheetViews>/.test(xml)) xml = xml.replace(/<sheetViews(?:\s[^>]*)?>[\s\S]*?<\/sheetViews>/, views);
  else xml = xml.replace(/(<(?:sheetFormatPr|cols|sheetData)\b)/, `${views}$1`);
  files[path] = zip.strToU8(xml);
  const packed = zip.zipSync(files); const blob = new Blob([packed.slice().buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `rentabilidad-${period}-${title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}.xlsx`;
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
