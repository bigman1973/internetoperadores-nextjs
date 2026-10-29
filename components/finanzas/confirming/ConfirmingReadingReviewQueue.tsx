import type { FinanceConfirmingReadingAccess } from '@/lib/finanzas/finance-confirming-reading-access'
import type { FinanceConfirmingReadingQueueDto, FinanceConfirmingReadingQueueEntry } from '@/lib/finanzas/finance-confirming-reading-contract'

type Props = Readonly<{
  access: FinanceConfirmingReadingAccess
  queue: FinanceConfirmingReadingQueueDto
}>

function cents(value: number | null): string {
  if (value === null) return 'Sin dato'
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value / 100)
}

function pairCopy(value: FinanceConfirmingReadingQueueEntry['pareja']): string {
  if (value === 'NO_CLASIFICADO') return 'Origen y pareja documental sin clasificar'
  if (value === 'NO_REQUIERE_PAREJA') return 'BBVA · PDF de liquidación'
  if (value === 'PAREJA_DECLARADA_COMPLETA') return 'CaixaBank · pareja PDF + XLS declarada'
  if (value === 'PAREJA_INCOMPLETA') return 'CaixaBank · pareja PDF + XLS incompleta'
  return 'CaixaBank · pareja PDF + XLS sin declarar'
}

function mismatch(entry: FinanceConfirmingReadingQueueEntry): boolean {
  const values = [entry.resumen.nominalCentimos, entry.resumen.interesesCentimos, entry.resumen.comisionCentimos, entry.resumen.ivaComisionCentimos, entry.resumen.netoBancarioCentimos]
  if (!values.every((value): value is number => value !== null)) return true
  return values[0] !== values[1] + values[2] + values[3] + values[4]
}

function ReasonList({ entry }: { entry: FinanceConfirmingReadingQueueEntry }) {
  return <p className="mt-2 text-xs text-amber-950 panel-dark:text-amber-100">{entry.motivos.map((reason) => reason.replaceAll('_', ' ').toLocaleLowerCase('es-ES')).join(' · ')}.</p>
}

function ReadingAmounts({ entry }: { entry: FinanceConfirmingReadingQueueEntry }) {
  const incomplete = mismatch(entry)
  return <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-3 text-xs panel-dark:border-amber-900 panel-dark:bg-amber-950/25">
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Nominal requerido por C11</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.nominalCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Facturas documentales</dt><dd className="font-bold tabular-nums">{entry.resumen.facturasDocumentales ?? 'Sin dato'}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Interés</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.interesesCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Comisión</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.comisionCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">IVA comisión</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.ivaComisionCentimos)}</dd></div>
    <div><dt className="text-slate-600 panel-dark:text-slate-300">Neto bancario</dt><dd className="font-bold tabular-nums">{cents(entry.resumen.netoBancarioCentimos)}</dd></div>
    <div className="col-span-2 border-t border-amber-200 pt-2 panel-dark:border-amber-900"><dt className="text-slate-600 panel-dark:text-slate-300">Cuenta origen BBVA/CaixaBank en C11</dt><dd className="font-bold">{entry.resumen.cuentaDepositariaDeclarada ? 'Declarada y pendiente de revalidación humana' : 'Sin cuenta depositaria C11 declarada'}</dd></div>
    {incomplete ? <p className="col-span-2 rounded bg-amber-100 px-2 py-1 font-semibold text-amber-950 panel-dark:bg-amber-900/50 panel-dark:text-amber-100">Ámbar: falta un campo C11 o nominal − interés − comisión − IVA − neto no suma exactamente cero.</p> : null}
  </dl>
}

/**
 * Bandeja embebida y exclusivamente de lectura. Recibe sólo el DTO persistido
 * preparado en servidor: no consulta Graph, no abre archivos, no llama a OCR,
 * no crea propuestas B4 y no ofrece acciones de confirmar ni pedir.
 */
export function ConfirmingReadingReviewQueue({ access, queue }: Props) {
  if (!access.puedeVer || access.seccion !== 'CONCILIAR_REVISAR_LECTURA') return null
  return <section aria-labelledby="revisar-lectura-confirming" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-slate-900 panel-dark:border-amber-800 panel-dark:bg-amber-950/30 panel-dark:text-slate-100">
    <header className="mb-3">
      <h2 id="revisar-lectura-confirming" className="text-base font-semibold">Revisar lectura pendiente</h2>
      <p className="text-sm">Confirming sólo aporta una lectura documental. Ningún cobro se confirma, no se modifica el banco y la validación C11/B4 sigue siendo humana.</p>
    </header>
    {queue.state === 'UNAVAILABLE' ? <p role="status" className="rounded border border-amber-300 bg-white p-3 text-sm panel-dark:border-amber-900 panel-dark:bg-slate-900">La bandeja persistida todavía no está disponible: falta aprobar y aplicar su DDL aditivo. No se interpreta como que no haya lecturas pendientes.</p> : null}
    {queue.state === 'AVAILABLE' && queue.entries.length === 0 ? <p className="rounded border border-slate-200 bg-white p-3 text-sm panel-dark:border-slate-700 panel-dark:bg-slate-900">No hay lecturas confirming persistidas pendientes de revisión.</p> : null}
    {queue.state === 'AVAILABLE' ? <div className="space-y-3">
      {queue.entries.map((entry) => <article key={entry.id} className="rounded-lg border border-amber-300 bg-white p-3 panel-dark:border-amber-900 panel-dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">Lectura pendiente · {entry.bancoOrigen === 'BBVA' ? 'BBVA' : entry.bancoOrigen === 'CAIXABANK' ? 'CaixaBank' : 'Origen sin clasificar'}</p><span className="rounded-full border border-amber-400 bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-950 panel-dark:bg-amber-900/50 panel-dark:text-amber-100">Ámbar · revisar</span></div>
        <p className="mt-1 text-sm">{pairCopy(entry.pareja)} · versión documental {entry.fuenteVersion}.</p>
        <ReadingAmounts entry={entry} />
        <ReasonList entry={entry} />
        <p className="mt-2 text-xs text-slate-600 panel-dark:text-slate-300">Sin propuesta confirmable mientras no exista evidencia C11 completa, cuenta depositaria explícita y revisión humana de la capacidad B4.</p>
      </article>)}
    </div> : null}
  </section>
}
