'use client';

import type { DocumentoB4, LineaBorradorB4, MovimientoB4 } from './types';
import { prepararRevisionHeredada } from './historical-links-contract';
import { fechaCorta, formatCentimos } from './utils';

type HistoricalLinksPanelProps = {
  movimiento: MovimientoB4;
  canWrite: boolean;
  busy: boolean;
  onPrepare: (docs: DocumentoB4[], lines: LineaBorradorB4[]) => void;
};

function etiquetaClasificacion(value: string): string {
  switch (value) {
    case 'PROPUESTA': return 'Propuesta histórica pendiente de revisión';
    case 'JUSTIFICADO': return 'Justificación histórica acreditada en B4';
    case 'YA_B4': return 'Ya resuelto en B4';
    default: return 'Evidencia histórica registrada';
  }
}

function etiquetaProcedencia(value: string): string {
  switch (value) {
    case 'MANUAL': return 'Registro manual histórico';
    case 'AUTOMATICO_TOLERANCIAS': return 'Registro automático histórico por tolerancias';
    case 'DESCONOCIDO': return 'Procedencia histórica no disponible';
    default: return 'Procedencia histórica no disponible';
  }
}

function etiquetaTipoDocumento(value: string): string {
  return value
    .replaceAll('_', ' ')
    .toLocaleLowerCase('es-ES')
    .replace(/(^|\s)\S/gu, (letter) => letter.toLocaleUpperCase('es-ES'));
}

/** Nunca presenta un código aislado como explicación operativa. */
function etiquetaMotivo(value: string): string {
  const normalized = value.trim();
  const known: Record<string, string> = {
    FK_CONCILIACION_HISTORICA: 'Se conservó una relación histórica con un documento.',
    SIN_ARCHIVO_HISTORICO: 'El registro heredado no conserva un archivo disponible.',
    TOLERANCIA_HISTORICA: 'El registro se clasificó antes con una regla de tolerancia histórica.',
    YA_CONCILIADO_B4: 'La conciliación ya estaba registrada por B4.',
    PROCEDENCIA_DESCONOCIDA: 'No existe prueba de si el enlace antiguo fue manual o automático. Necesita confirmación humana.',
    YA_B4_JUSTIFICADO: 'El movimiento ya estaba justificado en B4; no se ha vuelto a conciliar.',
    YA_B4_NO_REQUIERE: 'El movimiento ya estaba marcado en B4 como no requiere documento; se conserva ese estado.',
    SIN_DOCUMENTO_HISTORICO: 'Estaba marcado como conciliado, pero no conserva una referencia documental.',
    MULTIPLES_FKS_LEGACY: 'Conserva varias referencias antiguas; no se escoge una sin revisión.',
    TRASPASO_LEGACY_SIN_DOCUMENTO: 'Existe una referencia a un traspaso, pero no constituye por sí sola un justificante documental.',
    ENTREGA_A_CUENTA_EMPLEADO_NO_ES_DOCUMENTO: 'La entrega a cuenta identifica al empleado, no un documento justificativo.',
    IMPORTE_BANCO_NO_CONVERTIBLE_A_CENTIMOS: 'El importe bancario no puede verificarse en céntimos exactos.',
    IMPORTE_BANCO_CERO: 'El movimiento tiene importe cero y no se justifica mediante esta preparación.',
  };
  if (known[normalized]) return known[normalized];
  const prefixes: Array<[string, string]> = [
    ['ACTUAL_WRAPPER_AUSENTE_', 'El documento aún no tiene ficha conciliable B4. Debe revisarse y prepararse manualmente.'],
    ['ACTUAL_WRAPPER_AMBIGUO_O_INACTIVO_', 'No existe una ficha conciliable B4 única y vigente.'],
    ['LEGACY_FK_SIN_SOURCE_', 'La referencia antigua no permite recuperar su documento de origen.'],
    ['LEGACY_COPIA_CUARENTENA_', 'La referencia corresponde a una copia o a un documento en cuarentena.'],
    ['MISSING_FILE_', 'No se ha acreditado un archivo descargable controlado del documento.'],
    ['IMPORTE_OBJETIVO_DESCONOCIDO_', 'No hay un importe documental exacto verificable.'],
    ['AMOUNT_MISMATCH_FIRMADO_EXACTO_', 'El importe documental y el bancario no coinciden exactamente.'],
    ['WRAPPER_SOURCE_AMOUNT_MISMATCH_', 'La ficha B4 y el documento de origen no conservan el mismo importe exacto.'],
  ];
  return prefixes.find(([prefix]) => normalized.startsWith(prefix))?.[1]
    ?? 'Existe una incidencia histórica adicional que requiere revisión manual.';
}

function mensajeSinPreparacion(movimiento: MovimientoB4, reason: string): string {
  if (movimiento.estado === 'JUSTIFICADO') return 'Este movimiento ya está JUSTIFICADO en B4. La evidencia se conserva sólo para consulta.';
  return reason;
}

/**
 * Muestra exclusivamente evidencia normalizada ya incluida en la lectura B4.
 * No abre una petición ni crea un vínculo. La única acción entrega un borrador
 * local al padre para que el usuario lo revise y confirme en B4.
 */
export default function HistoricalLinksPanel({ movimiento, canWrite, busy, onPrepare }: HistoricalLinksPanelProps) {
  const historico = movimiento.historico;
  if (!historico) return null;

  const wrappers = movimiento.documentosHistoricosDisponibles || [];
  const preparation = prepararRevisionHeredada(movimiento, wrappers);
  const canPrepare = !('reason' in preparation) && canWrite && !busy;
  const evidenceOnly = movimiento.estado === 'JUSTIFICADO' || historico.clasificacion !== 'PROPUESTA';

  return <section aria-labelledby="historical-links-title" className="rounded-xl border border-violet-200 bg-violet-50/40">
    <div className="flex flex-col gap-3 border-b border-violet-200 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">Evidencia heredada</p>
        <h3 id="historical-links-title" className="mt-1 font-bold text-slate-950">{etiquetaClasificacion(historico.clasificacion)}</h3>
        <p className="mt-1 text-xs text-slate-700">{etiquetaProcedencia(historico.procedencia)} · registrada {fechaCorta(historico.creadoAt)}</p>
      </div>
      <span className="w-fit rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-900 ring-1 ring-violet-200">Heredado</span>
    </div>

    <div className="space-y-4 px-4 py-4 text-sm">
      <section aria-labelledby="historical-reasons-title">
        <h4 id="historical-reasons-title" className="font-semibold text-slate-950">Motivos operativos</h4>
        {historico.motivos.length === 0
          ? <p className="mt-1 text-slate-600">No se conservaron motivos operativos adicionales.</p>
          : <ul className="mt-2 space-y-1.5 text-slate-700">{historico.motivos.map((motivo, index) => <li key={`${motivo}-${index}`} className="rounded-md bg-white/80 px-3 py-2">{etiquetaMotivo(motivo)}</li>)}</ul>}
      </section>

      <section aria-labelledby="historical-documents-title">
        <h4 id="historical-documents-title" className="font-semibold text-slate-950">Documentos conservados</h4>
        {historico.documentos.length === 0
          ? <p className="mt-1 text-slate-600">No hay metadatos documentales conservados.</p>
          : <div className="mt-2 overflow-x-auto rounded-lg border border-violet-100 bg-white">
            <table className="min-w-full text-left text-xs sm:text-sm">
              <caption className="sr-only">Documentos de evidencia heredada</caption>
              <thead className="border-b border-violet-100 bg-violet-50 text-slate-700">
                <tr><th scope="col" className="px-3 py-2 font-semibold">Documento</th><th scope="col" className="px-3 py-2 font-semibold">Importe documental</th><th scope="col" className="px-3 py-2 font-semibold">Archivo</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historico.documentos.map((document, index) => <tr key={`${document.sourceId}-${index}`}>
                  <td className="px-3 py-2 text-slate-900"><span className="block font-semibold">{document.referencia}</span><span className="block text-slate-500">{etiquetaTipoDocumento(document.tipo)}</span></td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-slate-900">{formatCentimos(document.importeObjetivoCentimos)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-slate-700">{document.archivoDisponible ? 'Disponible' : 'No disponible'}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
      </section>

      {evidenceOnly
        ? <p className="rounded-lg border border-violet-200 bg-white/80 px-3 py-2 text-xs text-slate-700">La información heredada es sólo evidencia: no prepara ni modifica líneas B4.</p>
        : <div className="rounded-lg border border-violet-200 bg-white/80 p-3">
          <p className="font-semibold text-slate-950">Revisión manual requerida</p>
          <p className="mt-1 text-xs text-slate-700">La preparación, si está disponible, usa el importe objetivo exacto del documento histórico. No sustituye ese importe por el bancario: cualquier descuadre seguirá visible en B4 para que usted decida.</p>
          {'reason' in preparation && <p role="status" className="mt-2 text-xs font-semibold text-amber-900">No preparable: {mensajeSinPreparacion(movimiento, preparation.reason)}</p>}
          {!('reason' in preparation) && !canWrite && <p role="status" className="mt-2 text-xs font-semibold text-amber-900">Modo consulta: tiene evidencia disponible, pero no permiso para preparar el borrador.</p>}
          <button
            type="button"
            data-testid="b4-prepare-historical-review"
            onClick={() => { if (!('reason' in preparation)) onPrepare([preparation.documento], [...preparation.lineas]); }}
            disabled={!canPrepare}
            className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-violet-300 bg-white px-3 py-2 text-sm font-bold text-violet-900 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Preparando…' : 'Preparar revisión heredada'}
          </button>
        </div>}
    </div>
  </section>;
}
