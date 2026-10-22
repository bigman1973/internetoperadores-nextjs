'use client';

import { ExclamationTriangleIcon, InformationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

export type ContinuidadSaldo = 'OK' | 'HUECO' | 'SIN_SALDO' | 'ORDEN_AMBIGUO';

export interface AvisoSaldo {
  codigo: string;
  mensaje: string;
  fecha?: string | null;
  esperado?: number | null;
  observado?: number | null;
  diferencia?: number | null;
}

interface BankImportWarningsProps {
  continuidadSaldo?: ContinuidadSaldo | string | null;
  avisosSaldo?: AvisoSaldo[] | null;
  fechaCorteExtracto?: string | null;
  cuenta?: string | null;
  compact?: boolean;
}

const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

function formatDate(value?: string | null) {
  if (!value) return 'Sin fecha de corte verificable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Fecha de corte no disponible'
    : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

function continuityCopy(value?: string | null) {
  switch (value) {
    case 'OK':
      return { label: 'Continuidad de saldo verificada', className: 'border-emerald-300 bg-emerald-50 text-emerald-950', Icon: CheckCircleIcon };
    case 'HUECO':
      return { label: 'Hueco de saldo detectado', className: 'border-red-500 bg-red-50 text-red-950', Icon: ExclamationTriangleIcon };
    case 'SIN_SALDO':
      return { label: 'Sin saldo para verificar la continuidad', className: 'border-amber-400 bg-amber-50 text-amber-950', Icon: InformationCircleIcon };
    case 'ORDEN_AMBIGUO':
      return { label: 'Orden del extracto ambiguo', className: 'border-amber-400 bg-amber-50 text-amber-950', Icon: InformationCircleIcon };
    default:
      return { label: 'Sin datos de continuidad', className: 'border-slate-300 bg-slate-50 text-slate-900', Icon: InformationCircleIcon };
  }
}

export function balanceContinuityLabel(value?: string | null) {
  return continuityCopy(value).label;
}

export default function BankImportWarnings({
  continuidadSaldo,
  avisosSaldo,
  fechaCorteExtracto,
  cuenta,
  compact = false,
}: BankImportWarningsProps) {
  const notices = Array.isArray(avisosSaldo) ? avisosSaldo : [];
  const lacksBridge = notices.some((notice) => notice.codigo === 'COBERTURA_NO_VERIFICADA');
  const state = continuidadSaldo === 'OK' && lacksBridge
    ? { label: 'Cadena interna coherente; saldo anterior sin verificar', className: 'border-amber-400 bg-amber-50 text-amber-950', Icon: InformationCircleIcon }
    : continuityCopy(continuidadSaldo);
  const hasGap = continuidadSaldo === 'HUECO';
  const Icon = state.Icon;

  return (
    <section
      aria-label="Verificación de saldo del extracto"
      data-testid={`b3-continuity-${continuidadSaldo || 'SIN_DATOS'}`}
      className={`rounded-lg border p-3 ${state.className}`}
      role={hasGap ? 'alert' : 'status'}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{state.label}</p>
          {hasGap && (
            <p className="mt-1 text-sm font-semibold">
              Los movimientos importados se conservan, pero este tramo necesita revisión. No se considera cuadrado.
            </p>
          )}
          {!compact && (
            <p className="mt-1 text-xs leading-5">
              {fechaCorteExtracto
                ? <>Cobertura del extracto importado{cuenta ? ` de ${cuenta}` : ''}: <strong>{formatDate(fechaCorteExtracto)}</strong>. La fecha no acredita el encadenado de saldos ni un cierre contable manual.</>
                : 'No hay una fecha de cobertura importada disponible. La ausencia de dato no equivale a saldo cero.'}
            </p>
          )}
        </div>
      </div>

      {notices.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-current/20 pt-3 text-xs" aria-label="Avisos de saldo">
          {notices.map((notice, index) => (
            <li key={`${notice.codigo}-${notice.fecha || index}`} className="rounded bg-white/60 p-2">
              <p className="font-semibold">{notice.codigo}: {notice.mensaje}</p>
              {(notice.fecha || notice.esperado !== undefined || notice.observado !== undefined || notice.diferencia !== undefined) && (
                <p className="mt-1 tabular-nums">
                  {notice.fecha && <>Fecha: {formatDate(notice.fecha)}. </>}
                  {notice.esperado !== undefined && notice.esperado !== null && <>Esperado: {euro.format(notice.esperado)}. </>}
                  {notice.observado !== undefined && notice.observado !== null && <>Observado: {euro.format(notice.observado)}. </>}
                  {notice.diferencia !== undefined && notice.diferencia !== null && <>Diferencia: {euro.format(notice.diferencia)}.</>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
