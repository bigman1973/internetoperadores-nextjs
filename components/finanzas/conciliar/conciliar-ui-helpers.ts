import type { ConciliarColor, ConciliarRow, ConciliarSortDirection, ConciliarSortField } from './conciliar-contract';

export type ConciliarSelection = ReadonlyMap<string, string>;

export type SelectionReview = Readonly<{
  confirmableRows: readonly ConciliarRow[];
  hiddenCount: number;
  changedCount: number;
  unavailableCount: number;
}>;

export function groupExplanation(group: string | null): string | null {
  if (!group) return null;
  const normalized = group.toLocaleLowerCase('es-ES');
  if (normalized.includes('banco') || normalized.includes('comisi')) return 'Comisiones, cuotas y gastos que aplica el banco.';
  if (normalized.includes('traspas')) return 'El mismo importe debe aparecer en otra cuenta propia dentro de tres días.';
  if (normalized.includes('nómina') || normalized.includes('nomina')) return 'Se compara con la nómina del empleado y del mes correspondiente.';
  if (normalized.includes('confirm') || normalized.includes('cesión') || normalized.includes('cesion')) return 'El documento de confirming indica las facturas y, si procede, los intereses.';
  if (normalized.includes('remesa')) return 'La suma de recibos se compara con cada ingreso y muestra lo que queda pendiente.';
  return null;
}

export function humanGroup(group: string | null): string {
  if (!group) return 'Sin grupo';
  const key = group.toLocaleLowerCase('es-ES');
  if (/banco|comisi/.test(key)) return 'Gastos del banco';
  if (/traspas/.test(key)) return 'Traspasos entre cuentas propias';
  if (/n[oó]mina/.test(key)) return 'Nóminas';
  if (/confirm|cesi[oó]n/.test(key)) return 'Confirming y cesiones de crédito';
  if (/remesa/.test(key)) return 'Remesas';
  if (/emitida/.test(key)) return 'Facturas de clientes';
  if (/recibida|proveedor/.test(key)) return 'Facturas de proveedores';
  if (/tarjeta/.test(key)) return 'Tarjeta · ticket o factura';
  if (/impuesto|aeat|seguridad/.test(key)) return 'Impuestos y Seguridad Social';
  if (/pr[eé]stamo/.test(key)) return 'Préstamos';
  if (/devoluci/.test(key)) return 'Devoluciones de recibos';
  return group.replace(/_/g, ' ').toLocaleLowerCase('es-ES');
}

/** Las remesas tienen una segunda comprobación humana y nunca se incluyen en el gesto masivo. */
export function requiresSeparateRemesaConfirmation(row: Pick<ConciliarRow, 'grupo' | 'documento'>): boolean {
  return /remesa/i.test(`${row.grupo ?? ''} ${row.documento?.referencia ?? ''}`);
}

export function setRowSelected(selection: ConciliarSelection, row: Pick<ConciliarRow, 'id' | 'decisionHash'>, checked: boolean): ConciliarSelection {
  const next = new Map(selection);
  if (checked) next.set(row.id, row.decisionHash);
  else next.delete(row.id);
  return next;
}

/** Añade sólo verdes actualmente visibles. Desmarcar este gesto borra sólo los visibles; los otros siguen explícitos. */
export function setVisibleGreenSelected(selection: ConciliarSelection, rows: readonly ConciliarRow[], checked: boolean): ConciliarSelection {
  const next = new Map(selection);
  for (const row of rows) {
    if (row.color !== 'VERDE' || !row.seleccionable || requiresSeparateRemesaConfirmation(row)) continue;
    // Una marca previa con otro hash representa una decisión que cambió. El
    // gesto masivo no puede convertirla sin revisión en una autorización nueva.
    if (checked) {
      if (!next.has(row.id)) next.set(row.id, row.decisionHash);
    } else next.delete(row.id);
  }
  return next;
}

export function areAllVisibleGreensSelected(selection: ConciliarSelection, rows: readonly ConciliarRow[]): boolean {
  const candidates = rows.filter((row) => row.color === 'VERDE' && row.seleccionable && !requiresSeparateRemesaConfirmation(row));
  return candidates.length > 0 && candidates.every((row) => selection.get(row.id) === row.decisionHash);
}

/**
 * Nunca reconstruye la selección: al refrescar, las filas no visibles siguen
 * elegidas. Sólo devuelve las filas que continúan visibles, verdes y con la
 * misma decisión sellada por el servidor para que la confirmación pueda volver
 * a validarlas sin arrastrar datos ocultos o modificados.
 */
export function reviewSelectionForCurrentRows(selection: ConciliarSelection, currentRows: readonly ConciliarRow[]): SelectionReview {
  const visible = new Map(currentRows.map((row) => [row.id, row]));
  let hiddenCount = 0;
  let changedCount = 0;
  let unavailableCount = 0;
  const confirmableRows: ConciliarRow[] = [];
  for (const [id, selectedHash] of selection) {
    const row = visible.get(id);
    if (!row) {
      hiddenCount += 1;
      continue;
    }
    if (row.decisionHash !== selectedHash) {
      changedCount += 1;
      continue;
    }
    if (row.color !== 'VERDE' || !row.seleccionable) {
      unavailableCount += 1;
      continue;
    }
    confirmableRows.push(row);
  }
  return { confirmableRows, hiddenCount, changedCount, unavailableCount };
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-ES');
}

/** Espejo puro del orden que el servidor solicita antes de LIMIT/OFFSET. */
export function compareConciliarRowsForOrder(left: ConciliarRow, right: ConciliarRow, field: ConciliarSortField, direction: ConciliarSortDirection): number {
  const factor = direction === 'ASC' ? 1 : -1;
  const leftValue = field === 'FECHA'
    ? left.fecha
    : field === 'IMPORTE'
      ? Math.abs(left.importeCentimos)
      : normalizedText(left.documento?.tercero || left.concepto);
  const rightValue = field === 'FECHA'
    ? right.fecha
    : field === 'IMPORTE'
      ? Math.abs(right.importeCentimos)
      : normalizedText(right.documento?.tercero || right.concepto);
  const compared = typeof leftValue === 'number' && typeof rightValue === 'number'
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue), 'es-ES');
  return compared === 0 ? left.id.localeCompare(right.id) : compared * factor;
}

export function sortConciliarRowsForFixture(rows: readonly ConciliarRow[], field: ConciliarSortField, direction: ConciliarSortDirection): readonly ConciliarRow[] {
  return rows.slice().sort((left, right) => compareConciliarRowsForOrder(left, right, field, direction));
}

export function colorLabel(color: ConciliarColor): string {
  return color === 'VERDE' ? 'Verde' : color === 'AMBAR' ? 'Ámbar' : 'Rojo';
}
