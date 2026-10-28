import { escapeSpreadsheet } from '@/components/finanzas/conciliar/conciliar-contract';
import { freezeFirstRowXlsx } from '@/components/finanzas/conciliar/conciliar-xlsx';
import type { ParaPedirMovimiento } from '@/lib/finanzas/para-pedir-contract';

export const PARA_PEDIR_XLSX_HEADERS = [
  'Fecha', 'Estado de pedido', 'Pedido registrado el', 'Registrado por', 'Proveedor / tercero',
  'Referencia documental', 'Concepto bancario', 'Cuenta', 'Importe pendiente', 'Motivo de revisión',
] as const;

type SheetJs = typeof import('xlsx');
type Sheet = Record<string, unknown>;

function estadoPedidoLabel(value: ParaPedirMovimiento['estadoPedido']): string {
  if (value === 'PEDIDO') return 'Pedido';
  if (value === 'PEDIDO_SIN_AUDITORIA') return 'Pedido sin auditoría verificable';
  if (value === 'RECIBIDO') return 'Recibido; revisar en Conciliar';
  return 'Sin pedir';
}

/** Valores exactos de una solicitud manual: no añade referencia, fecha ni actor que no existan en la API. */
export function paraPedirExportValues(rows: readonly ParaPedirMovimiento[]): readonly (readonly (string | number)[])[] {
  return rows.map((row) => [
    escapeSpreadsheet(row.fecha),
    escapeSpreadsheet(estadoPedidoLabel(row.estadoPedido)),
    escapeSpreadsheet(row.pedido?.dia ?? ''),
    escapeSpreadsheet(row.pedido?.actorNombre ?? ''),
    escapeSpreadsheet(row.tercero ?? ''),
    escapeSpreadsheet(row.referenciaDocumento ?? ''),
    escapeSpreadsheet(row.concepto),
    escapeSpreadsheet([row.banco, row.cuenta].filter(Boolean).join(' · ')),
    row.pendienteCentimos / 100,
    escapeSpreadsheet(row.motivo),
  ]);
}

export async function createParaPedirXlsx(XLSX: SheetJs, sheetName: string, rows: readonly ParaPedirMovimiento[]): Promise<Uint8Array> {
  const values = [[...PARA_PEDIR_XLSX_HEADERS], ...paraPedirExportValues(rows).map((row) => [...row])];
  const sheet = XLSX.utils.aoa_to_sheet(values) as Sheet;
  const lastRow = Math.max(1, rows.length + 1);
  sheet['!autofilter'] = { ref: `A1:J${lastRow}` };
  sheet['!cols'] = [12, 28, 18, 28, 32, 24, 46, 28, 16, 56].map((wch) => ({ wch }));
  for (let row = 2; row <= lastRow; row += 1) {
    const amount = sheet[`I${row}`] as { z?: string } | undefined;
    if (amount) amount.z = '#,##0.00;[Red]-#,##0.00';
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet as import('xlsx').WorkSheet, sheetName.slice(0, 31) || 'Para pedir');
  return freezeFirstRowXlsx(new Uint8Array(XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer));
}

export function downloadParaPedirXlsx(bytes: Uint8Array, filename: string): void {
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
