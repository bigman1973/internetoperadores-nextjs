import { IdentificationIcon, DocumentCheckIcon } from '@heroicons/react/24/outline';
import { formatCentsText, type PasosModoFacil } from './easy-contract';

type CounterProps = Readonly<{ label: string; count: number; amount?: string; description: string }>;

function Counter({ label, count, amount, description }: CounterProps) {
  return <article className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-950">{count.toLocaleString('es-ES')}</p>{amount !== undefined && <p className="mt-1 text-sm font-bold tabular-nums text-slate-800">{formatCentsText(amount)}</p>}<p className="mt-1 text-xs leading-5 text-slate-600">{description}</p></article>;
}

/** Resumen de trabajo: identificar a quién corresponde y reunir el papel son tareas separadas. */
export default function NewTwoStepSummary({ pasos }: Readonly<{ pasos: PasosModoFacil | undefined }>) {
  if (!pasos) return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="two-step-summary-title"><h2 id="two-step-summary-title" className="text-lg font-extrabold text-slate-950">Resumen de pendientes</h2><p className="mt-1 text-sm leading-6 text-slate-700">Puedes revisar qué papel justifica cada movimiento. El resumen de quién es aparecerá cuando esté disponible, sin mostrar cifras incompletas.</p></section>;

  const p1 = pasos.paso1;
  const p2 = pasos.paso2;
  const pendientesQuienEs = p1.propuestosTexto + p1.sinIdentificar;

  return <section className="space-y-3" aria-labelledby="two-step-summary-title">
    <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><h2 id="two-step-summary-title" className="text-lg font-extrabold text-slate-950">Dos revisiones sencillas</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-700">Primero confirma <strong>quién es</strong>. Después revisa <strong>qué papel lo justifica</strong>. Una tarea no sustituye a la otra.</p></header>
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4" aria-labelledby="who-summary-title"><div className="flex gap-2"><IdentificationIcon className="h-6 w-6 shrink-0 text-blue-800" aria-hidden="true" /><div><h3 id="who-summary-title" className="font-extrabold text-slate-950">Quién es</h3><p className="mt-1 text-sm text-slate-700">Identifica la persona o empresa del movimiento.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><Counter label="Movimientos" count={p1.totalMovimientos} description="Movimientos incluidos en la consulta actual." /><Counter label="Hecho" count={p1.identificados} description="Con persona o empresa confirmada." /><Counter label="Pendiente" count={pendientesQuienEs} description="Aún por confirmar." /><Counter label="Cargos" count={p1.cargos.movimientos} amount={p1.cargos.importeCentimos} description="Movimientos de salida." /><Counter label="Cobros" count={p1.cobros.movimientos} amount={p1.cobros.importeCentimos} description="Movimientos de entrada." /></div></section>
      <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4" aria-labelledby="document-summary-title"><div className="flex gap-2"><DocumentCheckIcon className="h-6 w-6 shrink-0 text-orange-800" aria-hidden="true" /><div><h3 id="document-summary-title" className="font-extrabold text-slate-950">Qué papel lo justifica</h3><p className="mt-1 text-sm text-slate-700">Reúne o confirma el documento de cada movimiento.</p></div></div><div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3"><Counter label="Pendiente" count={p2.totalMovimientos} description="Movimientos que aún necesitan revisión documental." /><Counter label="Cargos pendientes" count={p2.cargos.movimientos} amount={p2.cargos.importeCentimos} description="Salidas que siguen pendientes." /><Counter label="Cobros pendientes" count={p2.cobros.movimientos} amount={p2.cobros.importeCentimos} description="Entradas que siguen pendientes." /></div></section>
    </div>
  </section>;
}
