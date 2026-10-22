'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  formatCentsEs,
  humanDifferenceReason,
  humanProposalClass,
  humanProposalReason,
  parseProposalResponse,
  prepareDraftFromProposal,
  type BorradorPreparadoB6,
  type PropuestaVistaB6,
  type RespuestaVistaB6,
  type SnapshotB4Actual,
  verifyFingerprintB4,
} from './b6-proposal-view';

/**
 * Contrato de borde B6 → B4. Esta función sólo prepara el borrador local: no
 * hace POST, no confirma y no modifica líneas del padre.
 */
export type ProposalsPanelProps = Readonly<{
  movimientoId: string;
  estadoB4: string;
  versionMovimiento: number;
  importeMovimientoCentimos: number | null;
  canWrite: boolean;
  onPrepararBorrador: (draft: BorradorPreparadoB6) => void;
}>;

type PanelStatus = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

type Notice = Readonly<{ kind: 'error' | 'info'; text: string }> | null;

function snapshotFromProps(props: ProposalsPanelProps): SnapshotB4Actual {
  return {
    movimientoId: props.movimientoId,
    estadoB4: props.estadoB4,
    versionMovimiento: props.versionMovimiento,
    importeMovimientoCentimos: props.importeMovimientoCentimos,
  };
}

function snapshotKey(snapshot: SnapshotB4Actual): string {
  return `${snapshot.movimientoId}\u0000${snapshot.estadoB4}\u0000${snapshot.versionMovimiento}\u0000${String(snapshot.importeMovimientoCentimos)}`;
}

function responseErrorText(raw: unknown): string {
  if (raw && typeof raw === 'object' && typeof (raw as { error?: unknown }).error === 'string') {
    const text = (raw as { error: string }).error.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return text ? text.slice(0, 240) : 'No se pudo leer la propuesta B6.';
  }
  return 'No se pudo leer la propuesta B6.';
}

function statusPresentation(proposal: PropuestaVistaB6): Readonly<{ title: string; className: string; text: string }> {
  if (proposal.estado === 'LISTA_PARA_CONFIRMACION_B4') {
    return {
      title: 'Propuesta lista para revisión B4',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      text: 'Las líneas cierran el movimiento de forma exacta. Sigue siendo un borrador: B4 volverá a validar la versión y la capacidad al confirmar.',
    };
  }
  if (proposal.estado === 'PROPUESTA_TRASPASO_PAREADO') {
    return {
      title: 'Traspaso pareado pendiente de revisión',
      className: 'border-amber-200 bg-amber-50 text-amber-950',
      text: 'La pareja se muestra para revisar catálogo B3 y confirmar después en el flujo B4. No se crea un traspaso ni se marca «No requiere documento».',
    };
  }
  if (proposal.estado === 'SIN_PROPUESTA') {
    return {
      title: 'Sin propuesta automática',
      className: 'border-slate-200 bg-slate-50 text-slate-900',
      text: 'No hay un cierre documental verificable. No se convierte la ausencia de datos en un importe cero.',
    };
  }
  return {
    title: 'Se necesita evidencia manual',
    className: 'border-amber-200 bg-amber-50 text-amber-950',
    text: 'Debe aportar o revisar evidencia explícita antes de solicitar otra propuesta. No se absorbe el desfase como comisión, interés o redondeo por defecto.',
  };
}

/**
 * Panel B6 para incrustar dentro del detalle del movimiento B4.
 *
 * - No consulta nada al montar ni itera una lista de movimientos.
 * - Sólo permite GET explícito para el movimiento abierto SIN_DOCUMENTO.
 * - Nunca ejecuta una escritura; entrega un borrador inmutable al padre.
 */
export default function ProposalsPanel(props: ProposalsPanelProps) {
  const snapshot = snapshotFromProps(props);
  const key = snapshotKey(snapshot);
  const snapshotRef = useRef(snapshot);
  const requestIdRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  snapshotRef.current = snapshot;

  const [status, setStatus] = useState<PanelStatus>('IDLE');
  const [notice, setNotice] = useState<Notice>(null);
  const [response, setResponse] = useState<RespuestaVistaB6 | null>(null);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);

  // Cambiar de movimiento, versión, estado o importe invalida toda lectura B6.
  // También aborta la solicitud anterior antes de que pueda aplicar una respuesta.
  useEffect(() => {
    requestIdRef.current += 1;
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStatus('IDLE');
    setNotice(null);
    setResponse(null);
    setEvidenceExpanded(false);
    return () => {
      controllerRef.current?.abort();
    };
  }, [key]);

  const canSearch = props.estadoB4 === 'SIN_DOCUMENTO'
    && Number.isSafeInteger(props.importeMovimientoCentimos)
    && props.importeMovimientoCentimos !== 0
    && props.movimientoId.trim().length > 0
    && props.movimientoId.length <= 160;

  const buscarPropuesta = useCallback(async () => {
    if (!canSearch || status === 'LOADING') return;
    const captured = snapshotFromProps(props);
    const capturedKey = snapshotKey(captured);
    const requestId = ++requestIdRef.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('LOADING');
    setNotice(null);
    setResponse(null);
    setEvidenceExpanded(false);

    try {
      const requestUrl = `/api/admin/finanzas/conciliacion-propuestas?movimientoId=${encodeURIComponent(captured.movimientoId)}`;
      const http = await fetch(requestUrl, { method: 'GET', cache: 'no-store', signal: controller.signal });
      const raw: unknown = await http.json().catch(() => null);
      // No se aplica nunca una respuesta que haya llegado tras cambiar banco, versión,
      // estado, importe o tras cerrar el panel. Esta comprobación no usa valores del GET.
      if (controller.signal.aborted || requestId !== requestIdRef.current || snapshotKey(snapshotRef.current) !== capturedKey) return;
      if (!http.ok) throw new Error(responseErrorText(raw));

      const parsed = parseProposalResponse(raw, captured);
      if (!parsed.ok) throw new Error(parsed.error);
      const fingerprintIsCurrent = await verifyFingerprintB4(parsed.value);
      if (controller.signal.aborted || requestId !== requestIdRef.current || snapshotKey(snapshotRef.current) !== capturedKey) return;
      if (!fingerprintIsCurrent) throw new Error('La huella SHA-256 de la instantánea B4 no coincide. La propuesta se ha descartado sin preparar ningún borrador.');
      setResponse(parsed.value);
      setStatus('READY');
    } catch (error) {
      if (controller.signal.aborted || requestId !== requestIdRef.current || snapshotKey(snapshotRef.current) !== capturedKey) return;
      setStatus('ERROR');
      setResponse(null);
      setNotice({
        kind: 'error',
        text: error instanceof Error && error.message.trim() ? error.message.slice(0, 360) : 'No se pudo leer la propuesta B6.',
      });
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current && snapshotKey(snapshotRef.current) === capturedKey) {
        controllerRef.current = null;
      }
    }
  }, [canSearch, props, status]);

  const proposal = response?.propuesta ?? null;
  const presentation = proposal ? statusPresentation(proposal) : null;
  const currentReady = Boolean(
    response
    && response.propuesta.estado === 'LISTA_PARA_CONFIRMACION_B4'
    && response.movimientoId === props.movimientoId
    && response.b4.estado === 'SIN_DOCUMENTO'
    && response.b4.version === props.versionMovimiento
    && response.propuesta.importeMovimientoCentimos === props.importeMovimientoCentimos
    && props.estadoB4 === 'SIN_DOCUMENTO',
  );

  const preparar = useCallback(() => {
    if (!response || !currentReady || !props.canWrite) return;
    const prepared = prepareDraftFromProposal(response, snapshotFromProps(props));
    if (!prepared.ok) {
      setNotice({ kind: 'error', text: prepared.error });
      return;
    }
    // `prepared.value` es una instantánea congelada nueva. El callback no recibe
    // el JSON de red ni puede modificar líneas que esta vista conserve.
    props.onPrepararBorrador(prepared.value);
    setNotice({ kind: 'info', text: 'Borrador — revise y confirme en B4.' });
  }, [currentReady, props, response]);

  const documentsById = useMemo(() => new Map((response?.documentos ?? []).map((document) => [document.id, document] as const)), [response]);

  return (
    <section aria-labelledby="b6-proposals-title" className="min-w-0 rounded-xl border border-orange-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-orange-100 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-700">B6 · sólo propuesta</p>
          <h3 id="b6-proposals-title" className="mt-1 text-base font-bold text-slate-950">Propuesta documental asistida</h3>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">Busca una propuesta sólo para este movimiento abierto. No aplica vínculos, no confirma y no modifica documentos.</p>
        </div>
        <button
          type="button"
          data-testid="b6-search-proposal"
          onClick={() => { void buscarPropuesta(); }}
          disabled={!canSearch || status === 'LOADING'}
          aria-describedby="b6-search-help"
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'LOADING' ? 'Buscando propuesta…' : 'Buscar propuesta'}
        </button>
      </header>

      <div className="space-y-4 px-4 py-4 sm:px-5">
        <p id="b6-search-help" className="text-xs text-slate-600">
          {props.estadoB4 !== 'SIN_DOCUMENTO'
            ? 'Sólo se puede buscar mientras B4 esté en «Sin documento». Una propuesta no se consulta ni se aplica sobre un movimiento ya cerrado.'
            : props.importeMovimientoCentimos === null
              ? 'El importe bancario es desconocido; no se sustituye por cero ni se puede buscar una propuesta.'
              : props.importeMovimientoCentimos === 0
                ? 'Un movimiento de 0 céntimos no admite una propuesta B6.'
                : 'La búsqueda es una lectura GET explícita del movimiento abierto; no se busca automáticamente al abrir ni en el listado.'}
        </p>

        {!props.canWrite && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950"><strong>Modo consulta.</strong> Puede revisar una propuesta, pero no preparar un borrador para B4.</div>}
        {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-3 py-3 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>{notice.text}</div>}

        {status === 'LOADING' && <div role="status" aria-live="polite" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">Validando una instantánea B6 para este movimiento…</div>}

        {proposal && presentation && <>
          <section className={`rounded-lg border p-3 ${presentation.className}`} aria-live="polite">
            <p className="font-bold">{presentation.title}</p>
            <p className="mt-1 text-sm">{presentation.text}</p>
            <p className="mt-2 text-xs font-semibold">Clase: {humanProposalClass(proposal)} · Confianza: {proposal.confianza}</p>
          </section>

          <section aria-label="Motivos de la propuesta" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <h4 className="text-sm font-bold text-slate-950">Comprobaciones y límites</h4>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {proposal.razones.map((reason, index) => <li key={`${reason}-${index}`} className="flex gap-2"><span aria-hidden="true" className="text-orange-700">•</span><span>{humanProposalReason(reason)}</span></li>)}
            </ul>
            {(response?.advertencias.length ?? 0) > 0 && <ul className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-600">
              {response?.advertencias.map((warning, index) => <li key={`${warning}-${index}`}>Advertencia: {humanProposalReason(warning)}</li>)}
            </ul>}
          </section>

          {proposal.estado === 'LISTA_PARA_CONFIRMACION_B4' && <ReadyLines proposal={proposal} documentsById={documentsById} evidenceExpanded={evidenceExpanded} onToggleEvidence={() => setEvidenceExpanded((current) => !current)} />}

          {(proposal.estado === 'NECESITA_EVIDENCIA_MANUAL' || proposal.estado === 'SIN_PROPUESTA') && <ManualGap proposal={proposal} />}

          {proposal.estado === 'PROPUESTA_TRASPASO_PAREADO' && <TransferReview proposal={proposal} />}

          {proposal.estado === 'LISTA_PARA_CONFIRMACION_B4' && <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-600">La preparación no confirma nada. B4 revalidará versión, cierre exacto y capacidad firmada antes de su confirmación explícita.</p>
            <button
              type="button"
              data-testid="b6-prepare-draft"
              onClick={preparar}
              disabled={!props.canWrite || !currentReady}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Preparar borrador B4
            </button>
          </div>}
        </>}
      </div>
    </section>
  );
}

function ReadyLines({ proposal, documentsById, evidenceExpanded, onToggleEvidence }: Readonly<{
  proposal: Extract<PropuestaVistaB6, { estado: 'LISTA_PARA_CONFIRMACION_B4' }>;
  documentsById: ReadonlyMap<string, NonNullable<RespuestaVistaB6['documentos']>[number]>;
  evidenceExpanded: boolean;
  onToggleEvidence: () => void;
}>) {
  const documentCount = proposal.lineas.filter((line) => line.tipo === 'DOCUMENTO').length;
  const differenceCount = proposal.lineas.length - documentCount;
  return <section aria-labelledby="b6-lines-title" className="overflow-hidden rounded-lg border border-slate-200">
    <div className="border-b border-slate-200 px-3 py-3">
      <h4 id="b6-lines-title" className="text-sm font-bold text-slate-950">Líneas propuestas de sólo lectura</h4>
      <p className="mt-1 text-xs text-slate-600">{documentCount} documento(s) y {differenceCount} diferencia(s). No puede editarse ni añadirse una comisión por defecto desde B6.</p>
    </div>
    <ol className="divide-y divide-slate-100">
      {proposal.lineas.map((line, index) => {
        const document = line.tipo === 'DOCUMENTO' ? documentsById.get(line.documentoConciliableId) ?? null : null;
        return <li key={line.tipo === 'DOCUMENTO' ? line.documentoConciliableId : `${line.tipo}-${line.motivoDiferencia}-${index}`} className="min-w-0 px-3 py-3">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <p className="min-w-0 text-sm font-bold text-slate-950">{line.tipo === 'DOCUMENTO' ? 'Documento seleccionado' : humanDifferenceReason(line.motivoDiferencia)}</p>
            <p className="shrink-0 font-mono text-sm font-bold text-slate-950">{formatCentsEs(line.importeCentimos)}</p>
          </div>
          <div id={`b6-private-line-${index}`} className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
            {line.tipo === 'DOCUMENTO' ? <>
              <p><strong>Referencia:</strong> {document?.referencia ?? 'Referencia no disponible'}</p>
              <p className="mt-1"><strong>Tercero:</strong> {document?.tercero ?? 'No informado'}</p>
              <p className="mt-1"><strong>Fecha:</strong> {document?.fecha ?? 'No informada'}</p>
              <p className="mt-1"><strong>Objetivo B4:</strong> {formatCentsEs(document?.objetivoCentimos ?? null)} · <strong>Asignado actual:</strong> {formatCentsEs(document?.asignadoCentimos ?? null)}</p>
            </> : <>
              <p><strong>{line.evidenciaEtiqueta}</strong></p>
              {line.evidenciaQuote && <p className="mt-1"><strong>Cita de evidencia:</strong> {line.evidenciaQuote}</p>}
              {line.bankSnippet && <p className="mt-1"><strong>Fragmento bancario:</strong> {line.bankSnippet}</p>}
              {!line.evidenciaQuote && !line.bankSnippet && <p className="mt-1">La evidencia está registrada para revisión privada; B6 no añade texto ni importe inferido.</p>}
            </>}
          </div>
        </li>;
      })}
    </ol>
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-3">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <dt className="text-slate-600">Banco</dt><dd className="text-right font-mono font-bold text-slate-950">{formatCentsEs(proposal.importeMovimientoCentimos)}</dd>
        <dt className="text-slate-600">Total líneas</dt><dd className="text-right font-mono font-bold text-emerald-800">{formatCentsEs(proposal.totalLineasCentimos)}</dd>
        <dt className="text-slate-600">Resto</dt><dd className="text-right font-mono font-bold text-emerald-800">+0,00 €</dd>
      </dl>
      <button type="button" onClick={onToggleEvidence} aria-expanded={evidenceExpanded} aria-controls="b6-proposal-source" className="mt-3 inline-flex min-h-9 items-center rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-bold text-orange-900 hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500">
        {evidenceExpanded ? 'Ocultar procedencia de lectura' : 'Mostrar procedencia de lectura'}
      </button>
      {evidenceExpanded && <p id="b6-proposal-source" className="mt-2 text-xs text-slate-600">Sugerencia B6 de sólo lectura. La evidencia se muestra arriba cuando una diferencia tiene prueba explícita; B4 vuelve a leer y valida la fuente antes de confirmar.</p>}
    </div>
  </section>;
}

function ManualGap({ proposal }: Readonly<{ proposal: Extract<PropuestaVistaB6, { estado: 'NECESITA_EVIDENCIA_MANUAL' | 'SIN_PROPUESTA' }> }>) {
  return <section aria-label="Acción manual requerida" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <h4 className="font-bold">Siguiente paso: evidencia manual</h4>
    <p className="mt-1">No se prepara ningún borrador ni se añade una línea de diferencia. Revise las pruebas indicadas y vuelva a buscar sólo cuando exista evidencia verificable.</p>
    {proposal.diferenciaPendienteCentimos !== null && <p className="mt-3 rounded-md border border-amber-300 bg-white/70 px-3 py-2"><strong>Desfase firmado pendiente:</strong> <span className="font-mono">{formatCentsEs(proposal.diferenciaPendienteCentimos)}</span>. Es informativo; no se absorbe como comisión, interés ni redondeo.</p>}
  </section>;
}

function TransferReview({ proposal }: Readonly<{ proposal: Extract<PropuestaVistaB6, { estado: 'PROPUESTA_TRASPASO_PAREADO' }> }>) {
  return <section aria-label="Revisión de traspaso pareado" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <h4 className="font-bold">Revisión de pareja y catálogo B3 requerida</h4>
    <p className="mt-1">Hay una pareja explícita, pero esta vista no ofrece aplicar ni preparar un borrador. Revise la clasificación cerrada B3 y continúe después por el flujo B4 correspondiente.</p>
    <div className="mt-3 rounded-md border border-amber-300 bg-white/70 px-3 py-2 text-xs">
      <p><strong>Movimiento pareja:</strong> {proposal.movimientoParejaId}</p>
      <p className="mt-1"><strong>Cuenta origen propia:</strong> {proposal.cuentaOrigenPropiaId}</p>
      <p className="mt-1"><strong>Cuenta destino propia:</strong> {proposal.cuentaDestinoPropiaId}</p>
      <p className="mt-1"><strong>Prueba:</strong> {proposal.evidenciaEtiqueta}</p>
    </div>
  </section>;
}
