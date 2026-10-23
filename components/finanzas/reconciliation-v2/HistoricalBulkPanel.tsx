'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, EyeIcon } from '@heroicons/react/24/outline';
import { crearClaveIdempotencia, fechaCorta, formatCentimos } from './utils';
import {
  HISTORICAL_BULK_LIMIT,
  buildConfirmarExactasPayload,
  buildDeshacerBloquePayload,
  mensajeHumanoDelError,
  parseHistoricalBulkConfirmation,
  parseHistoricalBulkPreview,
  parseHistoricalBulkUndo,
  puedeEnviarConfirmacion,
  puedeEnviarDeshacer,
  type ConfirmarExactasPayload,
  type DeshacerBloquePayload,
  type HistoricalBulkConfirmation,
  type HistoricalBulkItem,
  type HistoricalBulkPreview,
} from './historical-bulk-contract';

class RechazoBulkSeguro extends Error {}

const BULK_ENDPOINT = '/api/admin/finanzas/conciliacion-v2/heredados-bloque';

type HistoricalBulkPanelProps = Readonly<{
  canWrite: boolean;
  cuentaId?: string;
  q?: string;
  onChanged: () => void;
  onOpenMovimiento: (id: string) => void;
}>;

type PendingConfirmation = Readonly<{
  payload: ConfirmarExactasPayload;
  items: readonly HistoricalBulkItem[];
  uncertain: boolean;
}>;

type PendingUndo = Readonly<{
  payload: DeshacerBloquePayload;
  uncertain: boolean;
}>;

type Receipt = Readonly<{
  response: HistoricalBulkConfirmation;
  reverted: boolean;
  revertedCount: number | null;
}>;

function formatCentsText(value: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const normalized = digits.padStart(3, '0');
  const integerPart = normalized.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimals = normalized.slice(-2);
  return `${negative ? '-' : value === '0' ? '' : '+'}${integerPart},${decimals} €`;
}

function totalsFor(items: readonly HistoricalBulkItem[]): Readonly<{ cargos: string; cobros: string }> {
  let cargos = BigInt(0);
  let cobros = BigInt(0);
  for (const item of items) {
    const amount = BigInt(item.importeMovimientoCentimos);
    if (amount < BigInt(0)) cargos += amount;
    else if (amount > BigInt(0)) cobros += amount;
  }
  return Object.freeze({ cargos: cargos.toString(), cobros: cobros.toString() });
}

function etiquetaExclusion(reason: string): string {
  const known: Record<string, string> = {
    YA_RESUELTA_B4: 'Ya resuelta en la conciliación actual',
    IMPORTE_BANCARIO_CAMBIADO_O_NO_EXACTO: 'El importe bancario cambió o no es exacto en céntimos',
    REFERENCIA_NO_DOCUMENTAL_O_AMBIGUA: 'La referencia heredada no identifica un documento único',
    SIN_DOCUMENTO_VERIFICABLE: 'No hay documento verificable',
    DOCUMENTO_DUPLICADO: 'El documento aparece en más de una referencia heredada',
    DOCUMENTO_NO_ECONOMICO_O_CAMBIADO: 'El documento no es económico o ha cambiado',
    IMPORTE_DOCUMENTAL_CAMBIADO_O_NO_EXACTO: 'El importe documental cambió o no es exacto en céntimos',
    SIGNO_DOCUMENTAL_INCOMPATIBLE: 'El signo del documento no coincide con el movimiento bancario',
    DOCUMENTO_YA_ASIGNADO: 'El documento ya tiene importe asignado',
    SIN_ARCHIVO_CONTROLADO: 'No hay archivo documental controlado',
    FECHA_DOCUMENTAL_NO_VERIFICABLE: 'La fecha documental no se puede verificar',
    FECHA_DOCUMENTAL_CAMBIADA: 'La fecha documental ha cambiado',
    FACTURA_POSTERIOR_AL_MOVIMIENTO: 'La factura es posterior al movimiento bancario',
    IMPORTES_NO_COINCIDEN_AL_CENTIMO: 'Los importes no coinciden exactamente al céntimo',
    DOCUMENTO_COMPARTIDO_ENTRE_PROPUESTAS: 'El documento está compartido entre propuestas',
    SIN_ARCHIVO_HISTORICO: 'Sin archivo documental disponible',
    TOLERANCIA_HISTORICA: 'Clasificada antes con una tolerancia histórica',
    PROCEDENCIA_DESCONOCIDA: 'Procedencia heredada no acreditada',
    YA_B4_JUSTIFICADO: 'Ya justificada en conciliación actual',
    YA_B4_NO_REQUIERE: 'Ya marcada como no requiere documento',
    SIN_DOCUMENTO_HISTORICO: 'Sin documento histórico verificable',
    MULTIPLES_FKS_LEGACY: 'Varias referencias históricas',
    TRASPASO_LEGACY_SIN_DOCUMENTO: 'Traspaso sin documento justificativo',
    ENTREGA_A_CUENTA_EMPLEADO_NO_ES_DOCUMENTO: 'Entrega a cuenta sin documento justificativo',
    IMPORTE_BANCO_NO_CONVERTIBLE_A_CENTIMOS: 'Importe bancario no verificable en céntimos',
    IMPORTE_BANCO_CERO: 'Movimiento bancario de importe cero',
  };
  if (known[reason]) return known[reason];
  if (reason.startsWith('ACTUAL_WRAPPER_AUSENTE_')) return 'La ficha conciliable actual no está disponible';
  if (reason.startsWith('ACTUAL_WRAPPER_AMBIGUO_O_INACTIVO_')) return 'La ficha conciliable actual no es única o no está vigente';
  if (reason.startsWith('LEGACY_FK_SIN_SOURCE_')) return 'La referencia heredada no recupera el documento de origen';
  if (reason.startsWith('LEGACY_COPIA_CUARENTENA_')) return 'Documento histórico en copia o cuarentena';
  if (reason.startsWith('MISSING_FILE_')) return 'Falta un archivo documental descargable';
  if (reason.startsWith('IMPORTE_OBJETIVO_DESCONOCIDO_')) return 'Falta un importe documental exacto';
  if (reason.startsWith('AMOUNT_MISMATCH_FIRMADO_EXACTO_')) return 'El importe documental no coincide exactamente con el bancario';
  if (reason.startsWith('WRAPPER_SOURCE_AMOUNT_MISMATCH_')) return 'La ficha y el documento no conservan el mismo importe';
  return 'Otro motivo que requiere revisión manual';
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof TypeError) return 'No se pudo verificar la respuesta. Revise la conexión y reintente sin cambiar la selección.';
  return error instanceof Error && error.message ? error.message : fallback;
}

/**
 * Sólo muestra propuestas exactas ya calculadas por el servidor. La lectura es
 * separada de B4 y no crea wrappers, operaciones ni vínculos. Cualquier POST
 * queda detrás de un modal, una afirmación humana y un segundo clic explícito.
 */
export default function HistoricalBulkPanel({ canWrite, cuentaId, q, onChanged, onOpenMovimiento }: HistoricalBulkPanelProps) {
  const [preview, setPreview] = useState<HistoricalBulkPreview | null>(null);
  const [offset, setOffset] = useState(0);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string>('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [undoDialogOpen, setUndoDialogOpen] = useState(false);
  const [humanChecked, setHumanChecked] = useState(false);
  const [undoChecked, setUndoChecked] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);
  const uncertainMutation = useRef(false);

  const buildPreviewUrl = useCallback((nextOffset: number) => {
    const params = new URLSearchParams({ limit: String(HISTORICAL_BULK_LIMIT), offset: String(nextOffset) });
    const account = typeof cuentaId === 'string' && cuentaId.trim().length <= 160 ? cuentaId.trim() : '';
    const query = typeof q === 'string' ? q.trim().slice(0, 120) : '';
    if (account) params.set('cuentaId', account);
    if (query) params.set('q', query);
    return `${BULK_ENDPOINT}?${params.toString()}`;
  }, [cuentaId, q]);

  const loadPreview = useCallback(async (nextOffset: number) => {
    if (uncertainMutation.current) {
      setNotice('Hay una confirmación o reversión cuya respuesta no pudo verificarse. Reintente la misma acción antes de actualizar o pasar de página.');
      return;
    }
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setNotice('');
    // No se conserva una página que quizá pertenezca a otra cuenta, búsqueda o criterio.
    setPreview(null);
    setSelectedIds([]);
    try {
      const response = await fetch(buildPreviewUrl(nextOffset), { cache: 'no-store', signal: controller.signal });
      const json: unknown = await response.json().catch(() => null);
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(mensajeHumanoDelError(json, 'No se pudieron leer las propuestas exactas heredadas.'));
      const parsed = parseHistoricalBulkPreview(json);
      if ('error' in parsed) throw new Error(`La previsualización no se puede usar de forma segura: ${parsed.error}`);
      setPreview(parsed.value);
      // La selección nunca atraviesa páginas: sólo las exactas de la página leída.
      setSelectedIds(parsed.value.items.map((item) => item.historicoId));
      setOffset(parsed.value.offset);
    } catch (error) {
      if (controller.signal.aborted || sequence !== requestSequence.current) return;
      setNotice(errorText(error, 'No se pudieron leer las propuestas exactas heredadas.'));
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [buildPreviewUrl]);

  useEffect(() => {
    if (uncertainMutation.current) {
      setNotice('Hay una confirmación o reversión cuya respuesta no pudo verificarse. Reintente la misma selección antes de cambiar el filtro, actualizar o pasar de página.');
      return;
    }
    setOffset(0);
    void loadPreview(0);
    return () => controllerRef.current?.abort();
  }, [cuentaId, loadPreview, q]);

  const selectedItems = useMemo(() => {
    if (!preview) return [];
    const selected = new Set(selectedIds);
    return preview.items.filter((item) => selected.has(item.historicoId));
  }, [preview, selectedIds]);
  const selectedTotals = useMemo(() => totalsFor(selectedItems), [selectedItems]);
  const hasUncertainMutation = Boolean(pendingConfirmation?.uncertain || pendingUndo?.uncertain);
  const canOpenConfirmation = canWrite && !loading && selectedItems.length > 0 && selectedItems.length <= HISTORICAL_BULK_LIMIT && !confirming && !pendingUndo?.uncertain;

  const toggle = (historicoId: string) => {
    if (!canWrite || confirming || confirmDialogOpen || hasUncertainMutation) return;
    setSelectedIds((current) => current.includes(historicoId)
      ? current.filter((id) => id !== historicoId)
      : [...current, historicoId]);
    setPendingConfirmation(null);
    setNotice('');
  };

  const openConfirmation = () => {
    if (pendingUndo?.uncertain) {
      setNotice('Hay una reversión pendiente de verificación. Reintente esa misma reversión desde su recibo antes de confirmar otro bloque.');
      return;
    }
    if (!canOpenConfirmation) return;
    if (!preview) return;
    const retry = pendingConfirmation?.uncertain ? pendingConfirmation : null;
    if (retry) {
      setHumanChecked(false);
      setConfirmDialogOpen(true);
      setNotice('');
      return;
    }
    // El HMAC de la lectura pertenece al servidor: sólo se reenvía con esta selección.
    const payload = buildConfirmarExactasPayload(crearClaveIdempotencia(), selectedItems, preview.previewToken);
    if (!payload) {
      setNotice('La selección actual no es verificable para confirmar en bloque. Actualice la previsualización.');
      return;
    }
    setPendingConfirmation(Object.freeze({ payload, items: Object.freeze([...selectedItems]), uncertain: false }));
    setHumanChecked(false);
    setConfirmDialogOpen(true);
    setNotice('');
  };

  const confirm = async () => {
    const pending = pendingConfirmation;
    if (!pending || confirming || !puedeEnviarConfirmacion(canWrite, humanChecked, pending.payload)) return;
    setConfirming(true);
    setNotice('');
    try {
      const response = await fetch(BULK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Este objeto se conserva sin regenerar para cualquier reintento incierto.
        body: JSON.stringify(pending.payload),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {const message=mensajeHumanoDelError(json, 'No se pudo confirmar el bloque de propuestas exactas.');if([400,401,403,409,413,415,422].includes(response.status)&&json!==null)throw new RechazoBulkSeguro(message);throw new Error(message);}
      const parsed = parseHistoricalBulkConfirmation(json);
      if ('error' in parsed) throw new Error(`La respuesta de confirmación no se puede verificar: ${parsed.error}`);
      if (parsed.value.confirmadas !== pending.payload.items.length) throw new Error('El servidor no confirmó exactamente la selección solicitada; no se actualizará la pantalla.');
      const alreadyReverted = (parsed.value.revertidas ?? 0) > 0;
      setReceipt({ response: parsed.value, reverted: alreadyReverted, revertedCount: alreadyReverted ? parsed.value.revertidas! : null });
      setConfirmDialogOpen(false);
      setHumanChecked(false);
      uncertainMutation.current = false;
      setPendingConfirmation(null);
      if (alreadyReverted) setPendingUndo(null);
      onChanged();
      await loadPreview(0);
    } catch (error) {
      if(error instanceof RechazoBulkSeguro){uncertainMutation.current=false;setPendingConfirmation(null);setConfirmDialogOpen(false);setHumanChecked(false);await loadPreview(0);setNotice(error.message);return;}
      // Incluye errores de red y respuestas no verificables: mismo UUID y mismo payload.
      uncertainMutation.current = true;
      setPendingConfirmation({ ...pending, uncertain: true });
      setNotice(errorText(error, 'No se pudo confirmar el bloque de propuestas exactas.'));
    } finally {
      setConfirming(false);
    }
  };

  const openUndo = () => {
    if (!canWrite || !receipt || receipt.reverted || undoing) return;
    const retry = pendingUndo?.uncertain ? pendingUndo : null;
    if (retry) {
      setUndoChecked(false);
      setUndoDialogOpen(true);
      setNotice('');
      return;
    }
    const payload = buildDeshacerBloquePayload(crearClaveIdempotencia(), receipt.response.bloqueId);
    if (!payload) {
      setNotice('El recibo del bloque no es verificable y no se puede deshacer desde esta pantalla.');
      return;
    }
    setPendingUndo(Object.freeze({ payload, uncertain: false }));
    setUndoChecked(false);
    setUndoDialogOpen(true);
    setNotice('');
  };

  const undo = async () => {
    const pending = pendingUndo;
    if (!pending || undoing || !puedeEnviarDeshacer(canWrite, undoChecked, pending.payload)) return;
    setUndoing(true);
    setNotice('');
    try {
      const response = await fetch(BULK_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // La clave y el cuerpo se conservan idénticos si la respuesta es ambigua.
        body: JSON.stringify(pending.payload),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {const message=mensajeHumanoDelError(json, 'No se pudo deshacer el bloque confirmado.');if([400,401,403,409,413,415,422].includes(response.status)&&json!==null)throw new RechazoBulkSeguro(message);throw new Error(message);}
      const parsed = parseHistoricalBulkUndo(json);
      if ('error' in parsed || parsed.value.bloqueId !== pending.payload.bloqueId) throw new Error('La respuesta de reversión no se puede verificar.');
      setReceipt((current) => current ? { ...current, reverted: true, revertedCount: parsed.value.revertidas } : current);
      setUndoDialogOpen(false);
      setUndoChecked(false);
      // Una reversión confirmada cancela todo reintento que aún pudiera estar en memoria.
      uncertainMutation.current = false;
      setPendingConfirmation(null);
      setPendingUndo(null);
      onChanged();
      await loadPreview(0);
    } catch (error) {
      if(error instanceof RechazoBulkSeguro){uncertainMutation.current=false;setPendingUndo(null);setUndoDialogOpen(false);setUndoChecked(false);await loadPreview(0);setNotice(error.message);return;}
      uncertainMutation.current = true;
      setPendingUndo({ ...pending, uncertain: true });
      setNotice(errorText(error, 'No se pudo deshacer el bloque confirmado.'));
    } finally {
      setUndoing(false);
    }
  };

  const pageStart = preview ? preview.offset + 1 : 0;
  const pageEnd = preview ? preview.offset + preview.items.length : 0;

  return <section aria-labelledby="historical-bulk-title" data-historical-bulk-version="2" className="relative min-w-0 max-w-full overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
    <header className="flex flex-col gap-3 border-b border-violet-100 bg-violet-50/60 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">Heredados · sólo previsualización</p>
        <h2 id="historical-bulk-title" className="mt-1 text-lg font-bold text-slate-950">Propuestas exactas para confirmación en bloque</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">Esta lectura sólo muestra coincidencias exactas ya existentes. No crea wrappers, operaciones ni vínculos. Cada bloque admite como máximo {HISTORICAL_BULK_LIMIT} propuestas para mantener la confirmación atómica y en un tiempo acotado.</p>
      </div>
      <button type="button" onClick={() => { void loadPreview(offset); }} disabled={loading || confirming || undoing || hasUncertainMutation} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-violet-300 bg-white px-4 py-2 text-sm font-bold text-violet-900 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-60">
        <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" /> {loading ? 'Leyendo propuestas…' : 'Actualizar previsualización'}
      </button>
    </header>

    <div className="space-y-4 px-4 py-4 sm:px-5">
      {!canWrite && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Modo consulta.</strong> Puede revisar las propuestas exactas, pero su permiso actual no permite confirmarlas ni deshacer un bloque.</p>}
      {notice && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950">{notice}</p>}

      {preview && <>
        <section aria-label="Resumen global de propuestas" className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Propuestas exactas globales" value={String(preview.totalExactas)} />
          <Metric label="Propuestas heredadas globales" value={String(preview.totalPropuestas)} />
          <Metric label="Total de cargos exactos" value={formatCentsText(preview.totalCargosCentimos)} valueClass="text-red-800" />
          <Metric label="Total de cobros exactos" value={formatCentsText(preview.totalCobrosCentimos)} valueClass="text-emerald-800" />
        </section>
        <p className="text-xs text-slate-600"><strong>Criterio:</strong> {preview.criterio} Los cargos y los cobros se muestran por separado, sin netear.</p>
        {Object.keys(preview.excluidasPorMotivo).length > 0 && <section aria-labelledby="historical-bulk-exclusions" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
          <h3 id="historical-bulk-exclusions" className="font-bold">Propuestas que requieren revisión manual</h3>
          <ul className="mt-2 space-y-1 text-xs">{Object.entries(preview.excluidasPorMotivo).map(([reason, count]) => <li key={reason}>{count} · {etiquetaExclusion(reason)}</li>)}</ul>
        </section>}

        <div className="relative min-w-0 max-w-full overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[1040px] w-full text-left text-xs sm:text-sm">
            <caption className="sr-only">Propuestas heredadas exactas de la página actual</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-700"><tr>
              <th scope="col" className="w-11 px-3 py-3"><span className="sr-only">Seleccionar</span></th>
              <th scope="col" className="px-3 py-3 font-semibold">Banco y cuenta</th>
              <th scope="col" className="px-3 py-3 font-semibold">Fecha</th>
              <th scope="col" className="min-w-48 px-3 py-3 font-semibold">Concepto</th>
              <th scope="col" className="px-3 py-3 font-semibold">Importe bancario</th>
              <th scope="col" className="min-w-[330px] px-3 py-3 font-semibold">Documentos y fechas</th>
              <th scope="col" className="px-3 py-3 font-semibold"><span className="sr-only">Abrir movimiento</span></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {preview.items.map((item) => {
                const checked = selectedIds.includes(item.historicoId);
                return <tr key={item.historicoId} className={checked ? 'bg-violet-50/50' : 'bg-white'}>
                  <td className="px-3 py-3 align-top"><input aria-label={`Seleccionar movimiento ${item.concepto || item.movimientoId}`} type="checkbox" checked={checked} disabled={!canWrite || confirming || confirmDialogOpen || hasUncertainMutation} onChange={() => toggle(item.historicoId)} className="mt-0.5 h-4 w-4 rounded border-slate-400 text-violet-700 focus:ring-violet-500" /></td>
                  <td className="px-3 py-3 align-top text-slate-800"><strong className="block text-slate-950">{item.banco}</strong><span>{item.cuentaAlias || 'Cuenta sin alias'}</span></td>
                  <td className="whitespace-nowrap px-3 py-3 align-top text-slate-800">{fechaCorta(item.fechaOperacion)}</td>
                  <td className="px-3 py-3 align-top text-slate-900">{item.concepto || 'Sin concepto bancario'}</td>
                  <td className="whitespace-nowrap px-3 py-3 align-top font-mono font-bold text-slate-950">{formatCentimos(item.importeMovimientoCentimos)}</td>
                  <td className="px-3 py-3 align-top"><DocumentList documents={item.documentos} /></td>
                  <td className="px-3 py-3 align-top"><button type="button" onClick={() => onOpenMovimiento(item.movimientoId)} className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md border border-violet-300 bg-white px-2.5 py-1.5 font-semibold text-violet-900 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-500"><EyeIcon className="h-4 w-4" aria-hidden="true" /> Abrir</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>

        {preview.items.length === 0 && <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">No hay propuestas exactas en esta página. La ausencia no genera ninguna propuesta nueva.</p>}
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-600">Página {preview.totalExactas === 0 ? 0 : `${pageStart}–${pageEnd}`} de {preview.totalExactas} propuestas exactas globales. La selección se limita a esta página y a {preview.maxBloque} propuestas por bloque.</p>
          <div className="flex items-center gap-2"><button type="button" aria-label="Página anterior de propuestas exactas" disabled={loading || hasUncertainMutation || preview.offset === 0} onClick={() => { void loadPreview(Math.max(0, preview.offset - HISTORICAL_BULK_LIMIT)); }} className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" /> Anterior</button><button type="button" aria-label="Página siguiente de propuestas exactas" disabled={loading || hasUncertainMutation || preview.offset + preview.items.length >= preview.totalExactas} onClick={() => { void loadPreview(preview.offset + HISTORICAL_BULK_LIMIT); }} className="inline-flex min-h-9 items-center rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50">Siguiente <ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></div>
        </div>

        <section aria-label="Acción de confirmación en bloque" className="flex flex-col gap-3 rounded-lg border border-violet-200 bg-violet-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-bold text-violet-950">{selectedItems.length} propuestas exactas seleccionadas</p><p className="mt-1 text-xs text-violet-900">Cargos seleccionados: <span className="font-mono font-bold">{formatCentsText(selectedTotals.cargos)}</span> · Cobros seleccionados: <span className="font-mono font-bold">{formatCentsText(selectedTotals.cobros)}</span>. No se netean.</p></div>
          <button type="button" onClick={openConfirmation} disabled={!canOpenConfirmation} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Confirmar en bloque las exactas</button>
        </section>
      </>}

      {loading && !preview && <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">Leyendo únicamente la previsualización de propuestas exactas…</p>}

      {receipt && <section aria-labelledby="historical-bulk-receipt" className={`rounded-lg border p-4 text-sm ${receipt.reverted ? 'border-amber-200 bg-amber-50 text-amber-950' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
        <h3 id="historical-bulk-receipt" className="font-bold">{receipt.reverted ? 'Bloque revertido' : 'Recibo de bloque confirmado'}</h3>
        <p className="mt-1">{receipt.reverted ? `${receipt.revertedCount ?? 0} propuestas se han revertido mediante una acción explícita.` : `${receipt.response.confirmadas} propuestas exactas ${receipt.response.idempotente ? 'ya constaban confirmadas' : 'han quedado confirmadas'}.`}</p>
        {!receipt.reverted && <><p className="mt-1 text-xs">Cargos del recibo: <span className="font-mono font-bold">{formatCentsText(receipt.response.totalCargosCentimos)}</span> · Cobros del recibo: <span className="font-mono font-bold">{formatCentsText(receipt.response.totalCobrosCentimos)}</span>. No se netean.</p><button type="button" onClick={openUndo} disabled={!canWrite || undoing} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm font-bold text-emerald-900 hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50">Deshacer este bloque</button></>}
      </section>}
    </div>

    {confirmDialogOpen && pendingConfirmation && <ConfirmationDialog items={pendingConfirmation.items} totals={totalsFor(pendingConfirmation.items)} humanChecked={humanChecked} busy={confirming} retry={pendingConfirmation.uncertain} onHumanChecked={setHumanChecked} onCancel={() => { if (!confirming) { setConfirmDialogOpen(false); setHumanChecked(false); } }} onConfirm={() => { void confirm(); }} />}
    {undoDialogOpen && pendingUndo && receipt && <UndoDialog bloqueId={pendingUndo.payload.bloqueId} count={receipt.response.confirmadas} humanChecked={undoChecked} busy={undoing} retry={pendingUndo.uncertain} onHumanChecked={setUndoChecked} onCancel={() => { if (!undoing) { setUndoDialogOpen(false); setUndoChecked(false); } }} onConfirm={() => { void undo(); }} />}
  </section>;
}

function Metric({ label, value, valueClass = 'text-slate-950' }: Readonly<{ label: string; value: string; valueClass?: string }>) {
  return <div><dt className="text-xs font-semibold text-slate-600">{label}</dt><dd className={`mt-1 font-mono text-base font-bold ${valueClass}`}>{value}</dd></div>;
}

function DocumentList({ documents }: Readonly<{ documents: readonly HistoricalBulkItem['documentos'][number][] }>) {
  if (documents.length === 0) return <span className="text-slate-600">Sin metadatos documentales conservados</span>;
  return <ul className="space-y-2">{documents.map((document, index) => <li key={`${document.sourceId}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-2 text-slate-800"><strong className="block text-slate-950">{document.referencia}</strong><span className="block">{document.tipo.replaceAll('_', ' ').toLocaleLowerCase('es-ES')} · {formatCentimos(document.importeObjetivoCentimos)}</span><span className="mt-1 block text-slate-600">Emisión: {document.fecha ? fechaCorta(document.fecha) : 'No disponible'} · Vencimiento: {document.fechaVencimiento ? fechaCorta(document.fechaVencimiento) : 'No disponible'}</span>{document.tercero && <span className="mt-1 block text-slate-600">Tercero: {document.tercero}</span>}</li>)}</ul>;
}

function ConfirmationDialog({ items, totals, humanChecked, busy, retry, onHumanChecked, onCancel, onConfirm }: Readonly<{
  items: readonly HistoricalBulkItem[];
  totals: Readonly<{ cargos: string; cobros: string }>;
  humanChecked: boolean;
  busy: boolean;
  retry: boolean;
  onHumanChecked: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return <div role="presentation" className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-4 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" aria-labelledby="historical-bulk-confirm-title" className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl"><header className="border-b border-slate-200 px-5 py-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-800">Confirmación definitiva requerida</p><h2 id="historical-bulk-confirm-title" className="mt-1 text-lg font-bold text-slate-950">Confirmar {items.length} propuestas exactas</h2><p className="mt-1 text-sm text-slate-600">Revise la selección exacta. Esta es la única pantalla desde la que puede enviarse la confirmación.</p></header><div className="space-y-4 px-5 py-4">{retry && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">La respuesta anterior no pudo verificarse. Al reintentar se enviarán exactamente la misma selección y la misma clave de idempotencia.</p>}<ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{items.map((item) => <li key={item.historicoId} className="px-3 py-2 text-sm"><strong className="text-slate-950">{fechaCorta(item.fechaOperacion)} · {item.concepto || 'Sin concepto bancario'}</strong><span className="mt-1 block text-xs text-slate-600">{item.banco} · {item.cuentaAlias || 'Cuenta sin alias'} · <span className="font-mono font-bold text-slate-900">{formatCentimos(item.importeMovimientoCentimos)}</span></span></li>)}</ul><section className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"><p className="font-bold">Total de la selección: {items.length} propuestas exactas</p><p className="mt-1 text-xs">Cargos: <span className="font-mono font-bold">{formatCentsText(totals.cargos)}</span> · Cobros: <span className="font-mono font-bold">{formatCentsText(totals.cobros)}</span>. No se netean.</p></section><label className="flex gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-950"><input type="checkbox" checked={humanChecked} disabled={busy} onChange={(event) => onHumanChecked(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-400 text-violet-700 focus:ring-violet-500" /><span>Reconozco que he revisado la selección exacta y autorizo su confirmación definitiva.</span></label></div><footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50">Cancelar</button><button type="button" disabled={!humanChecked || busy} onClick={onConfirm} className="min-h-10 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Confirmando…' : `Confirmar definitivamente estas ${items.length}`}</button></footer></section></div>;
}

function UndoDialog({ bloqueId: _bloqueId, count, humanChecked, busy, retry, onHumanChecked, onCancel, onConfirm }: Readonly<{
  bloqueId: string;
  count: number;
  humanChecked: boolean;
  busy: boolean;
  retry: boolean;
  onHumanChecked: (checked: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}>) {
  return <div role="presentation" className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-4 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" aria-labelledby="historical-bulk-undo-title" className="w-full max-w-xl rounded-xl bg-white shadow-2xl"><header className="border-b border-slate-200 px-5 py-4"><p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">Reversión explícita requerida</p><h2 id="historical-bulk-undo-title" className="mt-1 text-lg font-bold text-slate-950">Deshacer este bloque</h2><p className="mt-1 text-sm text-slate-600">Se solicitará la reversión del bloque de {count} propuestas. No se ejecuta ninguna reversión al abrir este aviso.</p></header><div className="space-y-4 px-5 py-4">{retry && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">La respuesta anterior no pudo verificarse. Al reintentar se enviarán exactamente la misma reversión y la misma clave de idempotencia.</p>}<label className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><input type="checkbox" checked={humanChecked} disabled={busy} onChange={(event) => onHumanChecked(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-400 text-amber-700 focus:ring-amber-500" /><span>Reconozco que deseo deshacer este bloque confirmado.</span></label></div><footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" disabled={busy} onClick={onCancel} className="min-h-10 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-50">Cancelar</button><button type="button" disabled={!humanChecked || busy} onClick={onConfirm} className="min-h-10 rounded-lg bg-amber-700 px-4 py-2 text-sm font-bold text-white hover:bg-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Deshaciendo…' : 'Deshacer definitivamente este bloque'}</button></footer></section></div>;
}
