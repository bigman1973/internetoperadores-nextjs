import type { FinanceConfirmingReadingAccess } from '@/lib/finanzas/finance-confirming-reading-access'
import type { FinanceConfirmingReadingQueueDto, FinanceConfirmingReadingQueueEntry } from '@/lib/finanzas/finance-confirming-reading-contract'

type Props = Readonly<{
  access: FinanceConfirmingReadingAccess
  queue: FinanceConfirmingReadingQueueDto
}>

export type ConfirmingReadingReviewPresentation = Readonly<{
  visible: boolean
  kind: 'EMPTY' | 'UNAVAILABLE' | 'READY'
  allowsConfirmations: false
}>

export const CONFIRMING_READING_UNAVAILABLE_MESSAGE = 'No se ha podido cargar la lista de documentos que requieren revisión. No se muestra como una lista vacía.'

/** Decide sólo la presencia visual de una cola ya autorizada y leída en servidor. */
export function getConfirmingReadingReviewPresentation(queue: Pick<FinanceConfirmingReadingQueueDto, 'state' | 'entries'>): ConfirmingReadingReviewPresentation {
  if (queue.state === 'UNAVAILABLE') return { visible: true, kind: 'UNAVAILABLE', allowsConfirmations: false }
  if (queue.entries.length === 0) return { visible: false, kind: 'EMPTY', allowsConfirmations: false }
  return { visible: true, kind: 'READY', allowsConfirmations: false }
}

function cents(value: number | null): string {
  if (value === null) return 'Sin dato'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value / 100)
}

function pairCopy(value: FinanceConfirmingReadingQueueEntry['pareja']): string {
  if (value === 'NO_CLASIFICADO') return 'No se ha podido identificar el origen del documento'
  if (value === 'NO_REQUIERE_PAREJA') return 'Documento de liquidación disponible'
  if (value === 'PAREJA_DECLARADA_COMPLETA') return 'Están disponibles los documentos complementarios'
  if (value === 'PAREJA_INCOMPLETA') return 'Falta alguno de los documentos complementarios'
  return 'Aún no se han asociado los documentos complementarios'
}

function reasonCopy(value: FinanceConfirmingReadingQueueEntry['motivos'][number]): string {
  if (value === 'ARCHIVO_PRIVADO_NO_CONTROLADO') return 'El documento no está disponible en el registro interno'
  if (value === 'ARCHIVO_PRIVADO_DUPLICADO') return 'Hay más de un documento para esta lectura'
  if (value === 'PAREJA_CAIXA_PDF_XLS_INCOMPLETA') return 'Falta alguno de los documentos complementarios'
  if (value === 'PAREJA_CAIXA_PDF_XLS_NO_DECLARADA') return 'Aún no se han asociado los documentos complementarios'
  if (value === 'EVIDENCIA_C11_INCOMPLETA') return 'Faltan documentos necesarios para completar la revisión'
  if (value === 'CUADRE_C11_NO_EXACTO') return 'Los importes no cuadran'
  if (value === 'MOVIMIENTO_AMBIGUO') return 'Hay más de un movimiento bancario posible'
  if (value === 'CUENTA_DEPOSITARIA_NO_COINCIDE') return 'La cuenta de abono no coincide'
  if (value === 'NETO_BANCARIO_NO_COINCIDE') return 'El importe abonado no coincide'
  if (value === 'MOVIMIENTO_NO_DISPONIBLE') return 'Falta el movimiento bancario relacionado'
  return 'Esta lectura necesita una revisión manual'
}

function entryTitle(entry: FinanceConfirmingReadingQueueEntry): string {
  return entry.kind === 'PROPUESTA_CONFIRMACION_HUMANA' ? 'Liquidación para revisar' : 'Documento pendiente de revisión'
}

function mismatch(entry: FinanceConfirmingReadingQueueEntry): boolean {
  const values = [entry.resumen.nominalCentimos, entry.resumen.interesesCentimos, entry.resumen.comisionCentimos, entry.resumen.ivaComisionCentimos, entry.resumen.netoBancarioCentimos]
  if (!values.every((value): value is number => value !== null)) return true
  return values[0] !== values[1] + values[2] + values[3] + values[4]
}

function ReasonList({ entry }: { entry: FinanceConfirmingReadingQueueEntry }) {
  if (entry.motivos.length === 0) return null
  return <p className="mt-2 text-xs text-amber-950 panel-dark:text-amber-100">{entry.motivos.map(reasonCopy).join(' · ')}.</p>
}

function ReadingAmounts({ entry }: { entry: FinanceConfirmingReadingQueueEntry }) {
  const incomplete = mismatch(entry)
  return <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs panel-dark:border-amber-900 panel-dark:bg-amber-950/25">
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Importe principal</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.nominalCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Facturas incluidas</dt><dd className="font-bold tabular-nums">{entry.resumen.facturasDocumentales ?? 'Sin dato'}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Intereses</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.interesesCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Comisión</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.comisionCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">IVA de la comisión</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.ivaComisionCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Importe abonado por el banco</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.netoBancarioCentimos)}</dd></div>
    <div className="col-span-2 border-t border-amber-200 pt-2 panel-dark:border-amber-900"><dt className="text-slate-600 panel-dark:text-slate-300">Cuenta de abono</dt><dd className="font-bold">{entry.resumen.cuentaDepositariaDeclarada ? 'Indicada; debe revisarse' : 'No se ha indicado'}</dd></div>
    {incomplete ? <p className="col-span-2 rounded bg-amber-100 px-2 py-1 font-semibold text-amber-950 panel-dark:bg-amber-900/50 panel-dark:text-amber-100">Faltan datos o los importes no cuadran.</p> : null}
  </dl>
}

/**
 * Bandeja embebida y exclusivamente de lectura. Recibe una lista preparada en
 * servidor y no ofrece acciones que modifiquen cobros, documentos o el banco.
 */
export function ConfirmingReadingReviewQueue({ access, queue }: Props) {
  const presentation = getConfirmingReadingReviewPresentation(queue)
  if (!access.puedeVer || access.seccion !== 'CONCILIAR_REVISAR_LECTURA' || !presentation.visible) return null

  return <section aria-labelledby="revisar-lectura-confirming" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900 panel-dark:border-amber-800 panel-dark:bg-amber-950/30 panel-dark:text-slate-100">
    <header className="mb-3">
      <h2 id="revisar-lectura-confirming" className="text-base font-semibold">Documentos pendientes de revisión</h2>
      <p className="text-sm">Esta sección sirve para revisar documentos. No confirma cobros ni modifica los datos bancarios.</p>
    </header>
    {presentation.kind === 'UNAVAILABLE' ? <p role="alert" className="rounded border border-amber-300 bg-white p-3 text-sm panel-dark:border-amber-900 panel-dark:bg-slate-900">{CONFIRMING_READING_UNAVAILABLE_MESSAGE}</p> : null}
    {presentation.kind === 'READY' ? <div className="space-y-3">
      {queue.entries.map((entry) => <article key={entry.id} className="rounded-lg border border-amber-300 bg-white p-3 panel-dark:border-amber-900 panel-dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{entryTitle(entry)} · {entry.bancoOrigen === 'BBVA' ? 'BBVA' : entry.bancoOrigen === 'CAIXABANK' ? 'CaixaBank' : 'Origen sin clasificar'}</p><span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 panel-dark:bg-amber-900/50 panel-dark:text-amber-100">Revisar</span></div>
        <p className="mt-1 text-sm">{pairCopy(entry.pareja)}.</p>
        <ReadingAmounts entry={entry} />
        <ReasonList entry={entry} />
        <p className="mt-2 text-xs text-slate-600 panel-dark:text-slate-300">Revise los documentos y los importes antes de continuar en el proceso habitual.</p>
      </article>)}
    </div> : null}
  </section>
}
