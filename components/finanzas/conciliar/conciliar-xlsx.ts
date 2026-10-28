import { escapeSpreadsheet, type ConciliarRow } from './conciliar-contract';
import { colorLabel, humanGroup } from './conciliar-ui-helpers';

export const CONCILIAR_XLSX_HEADERS = [
  'Fecha', 'Estado', 'Grupo / tipo', 'Tercero / proveedor', 'Concepto', 'Cuenta', 'Documento', 'Importe', 'Nota',
] as const;

type SheetJs = typeof import('xlsx');
type Sheet = Record<string, unknown>;

export function conciliarExportValues(rows: readonly ConciliarRow[]): readonly (readonly (string | number)[])[] {
  return rows.map((row) => [
    escapeSpreadsheet(row.fecha),
    escapeSpreadsheet(colorLabel(row.color)),
    escapeSpreadsheet(humanGroup(row.grupo)),
    escapeSpreadsheet(row.documento?.tercero ?? ''),
    escapeSpreadsheet(row.concepto),
    escapeSpreadsheet([row.banco, row.cuenta].filter(Boolean).join(' · ')),
    escapeSpreadsheet(row.documento?.referencia ?? ''),
    row.importeCentimos / 100,
    escapeSpreadsheet(row.motivo),
  ]);
}

/** SheetJS 0.18 no serializa !freeze; se completa el OOXML con un pane estándar. */
export async function freezeFirstRowXlsx(bytes: Uint8Array): Promise<Uint8Array> {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate');
  const files = unzipSync(bytes);
  const path = 'xl/worksheets/sheet1.xml';
  const source = files[path];
  if (!source) throw new Error('El libro exportado no contiene la hoja de conciliación.');
  const xml = strFromU8(source);
  const pane = '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
  const frozen = /<pane\b[^>]*state="frozen"/.test(xml)
    ? xml
    : /<sheetView\b[^>]*\/>/.test(xml)
      ? xml.replace(/<sheetView\b([^>]*)\/>/, '<sheetView$1>' + pane + '</sheetView>')
      : xml.replace(/<sheetView\b([^>]*)>/, '<sheetView$1>' + pane);
  if (frozen === xml || !/<pane\b[^>]*state="frozen"/.test(frozen)) {
    throw new Error('No se pudo congelar la fila de cabecera del archivo.');
  }
  files[path] = strToU8(frozen);
  return zipSync(files, { level: 6 });
}

export async function createConciliarXlsx(XLSX: SheetJs, sheetName: string, rows: readonly ConciliarRow[]): Promise<Uint8Array> {
  const values = [[...CONCILIAR_XLSX_HEADERS], ...conciliarExportValues(rows).map((row) => [...row])];
  const sheet = XLSX.utils.aoa_to_sheet(values) as Sheet;
  const lastRow = Math.max(1, rows.length + 1);
  sheet['!autofilter'] = { ref: `A1:I${lastRow}` };
  sheet['!cols'] = [12, 12, 28, 30, 42, 28, 22, 14, 48].map((wch) => ({ wch }));
  for (let row = 2; row <= lastRow; row += 1) {
    const amount = sheet[`H${row}`] as { z?: string } | undefined;
    if (amount) amount.z = '#,##0.00;[Red]-#,##0.00';
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet as import('xlsx').WorkSheet, sheetName.slice(0, 31) || 'Conciliar');
  return freezeFirstRowXlsx(new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer));
}

export function downloadConciliarXlsx(bytes: Uint8Array, filename: string): void {
  const payload = new Uint8Array(bytes.length);
  payload.set(bytes);
  const url = URL.createObjectURL(new Blob([payload.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
