'use client';
import PayrollCandidatesPanel from './PayrollCandidatesPanel';
import PrivateMovementFiles from './PrivateMovementFiles';
import ConfirmingSupportPanel from './ConfirmingSupportPanel';
import HistoricalLinksPanel from './HistoricalLinksPanel';
import HistoricalBulkPanel from './HistoricalBulkPanel';
import HistoricalBlockReceiptsPanel from './HistoricalBlockReceiptsPanel';
import { parseHistoricoB4, prepararRevisionHeredada as validarPreparacionHeredada } from './historical-links-contract';

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  ArrowPathIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DocumentMagnifyingGlassIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { usePermisoArea } from '@/hooks/usePermisoArea';
import ProposalsPanel from './standaloneProposalsPanel';
import CenterChoiceSelector, {
  etiquetaCentro,
  parseCentrosCosteCatalogo,
  problemaSeleccionCentro,
  type CatalogoCentrosEstado,
} from './CenterChoiceSelector';
import type {BorradorPreparadoB6} from './b6-proposal-view';
import { convertirImporteUiACentimos } from '@/lib/finanzas/reconciliation-core';
import type {
  ConfirmarPayloadB4,
  DeshacerPayloadB4,
  DocumentoB4,
  EstadoB4,
  LineaBorradorB4,
  MotivoDiferencia,
  MotivoNoRequiere,
  MovimientoB4,
  ReconciliationReadResponse,
} from './types';
import {
  centimosAImporteUi,
  crearClaveIdempotencia,
  dentroDeDisponibleFirmado,
  documentoPuedeVincularse,
  etiquetaEstado,
  etiquetaMotivo,
  fechaCorta,
  formatCentimos,
  sumarCentimosFirmados,
  textoBusquedaSeguro,
} from './utils';

const PAGE_SIZE = 50;
const MAX_OFFSET = 100_000;
const AREA_B4 = 'admin.finanzas.conciliacion';

type Notice = { kind: 'success' | 'error' | 'info'; text: string } | null;
type FiltroHeredados = 'TODOS' | 'SI' | 'PROPUESTA';
type LineaDocumentoConCentro = Extract<LineaBorradorB4, { tipo: 'DOCUMENTO' }> & { centroCosteFinanzasId?: string | null };
type LineaBorradorConCentro = LineaDocumentoConCentro | Extract<LineaBorradorB4, { tipo: 'DIFERENCIA' }>;
type ConfirmarPayloadConCentro = Omit<ConfirmarPayloadB4, 'borrador'> & {
  borrador: Omit<ConfirmarPayloadB4['borrador'], 'lineas'> & { lineas: LineaBorradorConCentro[] };
};
type PendingConfirmation = { payload: ConfirmarPayloadConCentro; retriable: boolean } | null;
type CentroConfirmadoEnVinculo = Readonly<{ id: string; codigo: string | null; nombre: string | null }>;

const EMPTY_CENTER_CATALOG: CatalogoCentrosEstado = { kind: 'idle', items: [], error: null };

function centroConfirmadoEnVinculo(value: unknown): CentroConfirmadoEnVinculo | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  // Sólo tratamos un centro como histórico si B4 lo envía explícitamente en la línea.
  // Nunca se intenta reconocer o reconstruir un centro heredado desde otro dato.
  if (typeof raw.centroCosteFinanzasId !== 'string' || raw.centroCosteFinanzasId.length === 0) return null;
  return {
    id: raw.centroCosteFinanzasId,
    codigo: typeof raw.centroCosteCodigo === 'string' && raw.centroCosteCodigo.trim() ? raw.centroCosteCodigo.trim() : null,
    nombre: typeof raw.centroCosteNombre === 'string' && raw.centroCosteNombre.trim() ? raw.centroCosteNombre.trim() : null,
  };
}

function lineaDocumentoConCentro(
  documentoConciliableId: string,
  importeCentimos: number,
  centroCosteFinanzasId: string | null | undefined,
): LineaDocumentoConCentro {
  return centroCosteFinanzasId
    ? { tipo: 'DOCUMENTO', documentoConciliableId, importeCentimos, centroCosteFinanzasId }
    : { tipo: 'DOCUMENTO', documentoConciliableId, importeCentimos };
}

function serializarLineasConCentro(lineas: readonly LineaBorradorConCentro[]): LineaBorradorConCentro[] {
  // La ausencia se mantiene como ausencia: no se manda null por una selección vacía.
  return lineas.map((linea) => linea.tipo === 'DOCUMENTO'
    ? lineaDocumentoConCentro(linea.documentoConciliableId, linea.importeCentimos, linea.centroCosteFinanzasId)
    : { tipo: 'DIFERENCIA', motivoDiferencia: linea.motivoDiferencia, importeCentimos: linea.importeCentimos });
}

function centroCatalogoError(response: Response, json: unknown): string {
  return backendMessage(json, response.status === 403 ? 'No tiene permiso de lectura B4 para consultar el catálogo de centros.' : 'No se pudo leer el catálogo de centros de coste.');
}

function asResponse(value: unknown): ReconciliationReadResponse {
  const raw = value && typeof value === 'object' ? value as Partial<ReconciliationReadResponse> : {};
  if (!raw.catalogo || !Array.isArray(raw.movimientos) || !Array.isArray(raw.documentos) || !Array.isArray(raw.cuentas) || !raw.paginacion || !Number.isSafeInteger(raw.paginacion.movimientosTotal) || !Number.isSafeInteger(raw.paginacion.documentosTotal)) throw new Error('La lectura B4 está incompleta; los datos no se sustituyen por ceros.');
  const movimientos = raw.movimientos.map((movement) => {
    const parsedHistorico = parseHistoricoB4((movement as unknown as { historico?: unknown }).historico);
    if ('error' in parsedHistorico) throw new Error(`La evidencia heredada no es verificable: ${parsedHistorico.error}`);
    return parsedHistorico.value === undefined ? movement : { ...movement, historico: parsedHistorico.value };
  });
  return {
    catalogo: raw.catalogo || {
      estados: ['SIN_DOCUMENTO', 'JUSTIFICADO', 'NO_REQUIERE'],
      motivosNoRequiere: [],
      tiposDocumento: [],
      motivosDiferencia: ['COMISION', 'INTERESES', 'REDONDEO'],
    },
    movimientos,
    documentos: Array.isArray(raw.documentos) ? raw.documentos : [],
    sugerencias: [],
    paginacion: raw.paginacion || {
      movimientosTotal: 0,
      documentosTotal: 0,
      movimientosOffset: 0,
      documentosOffset: 0,
    },
    cuentas: Array.isArray(raw.cuentas) ? raw.cuentas : [],
  };
}

function backendMessage(json: unknown, fallback: string): string {
  if (!json || typeof json !== 'object') return fallback;
  const message = (json as { error?: unknown }).error;
  return typeof message === 'string' && message.trim() ? message : fallback;
}

function statusClass(estado: EstadoB4): string {
  if (estado === 'JUSTIFICADO') return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (estado === 'NO_REQUIERE') return 'bg-orange-50 text-orange-800 ring-orange-200';
  return 'bg-slate-100 text-slate-700 ring-slate-200';
}

function estadoVisible(estado: EstadoB4, motivo: MotivoNoRequiere | null): string {
  return motivo ? `${etiquetaEstado(estado)} · ${etiquetaMotivo(motivo)}` : etiquetaEstado(estado);
}

function isNetworkFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof Error && /network|fetch/i.test(error.message));
}

export default function ReconciliationWorkspace() {
  const { canRead, canWrite } = usePermisoArea(AREA_B4);
  const [data, setData] = useState<ReconciliationReadResponse | null>(null);
  const [centerCatalog, setCenterCatalog] = useState<CatalogoCentrosEstado>(EMPTY_CENTER_CATALOG);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [movementQuery, setMovementQuery] = useState('');
  const [movementSearch, setMovementSearch] = useState('');
  const [accountId, setAccountId] = useState('');
  const [heredadosFilter, setHeredadosFilter] = useState<FiltroHeredados>('TODOS');
  const [movementsOffset, setMovementsOffset] = useState(0);
  const [documentsOffset, setDocumentsOffset] = useState(0);
  const [selected, setSelected] = useState<MovimientoB4 | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentResults, setDocumentResults] = useState<DocumentoB4[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [draftState, setDraftState] = useState<'JUSTIFICADO' | 'NO_REQUIERE'>('JUSTIFICADO');
  const [reason, setReason] = useState<MotivoNoRequiere | ''>('');
  const [proposalReferences,setProposalReferences]=useState<Record<string,string>>({});
  const [lines, setLines] = useState<LineaBorradorConCentro[]>([]);
  const [documentId, setDocumentId] = useState('');
  const [documentAmount, setDocumentAmount] = useState('');
  const [differenceReason, setDifferenceReason] = useState<MotivoDiferencia>('COMISION');
  const [differenceAmount, setDifferenceAmount] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation>(null);
  const inFlight = useRef(false);
  const selectionSequence = useRef(0);
  const centerCatalogSequence = useRef(0);
  const dialogConfirmButton = useRef<HTMLButtonElement>(null);
  const initialMovementOpened = useRef(false);

  const buildReadUrl = useCallback((options?: {
    onlyDocuments?: boolean;
    movementId?: string;
    q?: string;
  }) => {
    const params = new URLSearchParams({
      movimientosLimit: String(PAGE_SIZE),
      documentosLimit: String(PAGE_SIZE),
      movimientosOffset: String(Math.max(0, Math.min(MAX_OFFSET, movementsOffset))),
      documentosOffset: String(Math.max(0, Math.min(MAX_OFFSET, documentsOffset))),
    });
    const query = textoBusquedaSeguro(options?.q ?? movementSearch);
    if (query) params.set('q', query);
    if (accountId) params.set('cuentaId', accountId);
    // El filtro pertenece exclusivamente al listado de movimientos: no altera
    // búsquedas documentales ni lecturas exactas por movimientoId.
    if (!options?.onlyDocuments && !options?.movementId && heredadosFilter !== 'TODOS') params.set('heredados', heredadosFilter);
    if (options?.movementId) params.set('movimientoId', options.movementId);
    return `/api/admin/finanzas/conciliacion-v2?${params.toString()}`;
  }, [accountId, documentsOffset, heredadosFilter, movementSearch, movementsOffset]);

  const loadLists = useCallback(async (options?: { silent?: boolean }) => {
    if (options?.silent) setRefreshing(true); else setLoading(true);
    try {
      const response = await fetch(buildReadUrl(), { cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(backendMessage(json, 'No se pudo leer la conciliación B4.'));
      const next = asResponse(json);
      setData(next);
      if (!options?.silent) setNotice(null);
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo leer la conciliación B4.' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [buildReadUrl]);

  useEffect(() => { void loadLists(); }, [loadLists]);

  const loadCenterCatalog = useCallback(async () => {
    const sequence = ++centerCatalogSequence.current;
    if (!canRead) {
      setCenterCatalog({ kind: 'forbidden', items: [], error: 'Su permiso B4 actual no permite leer el catálogo de centros.' });
      return;
    }
    setCenterCatalog((current) => ({ kind: 'loading', items: current.items, error: null }));
    try {
      const response = await fetch('/api/admin/finanzas/centros-coste?recurso=centros', { cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(centroCatalogoError(response, json));
      const parsed = parseCentrosCosteCatalogo(json);
      if ('error' in parsed) throw new Error(parsed.error);
      if (sequence === centerCatalogSequence.current) setCenterCatalog({ kind: 'ready', items: parsed.items, error: null });
    } catch (error) {
      if (sequence === centerCatalogSequence.current) {
        setCenterCatalog({ kind: 'error', items: [], error: error instanceof Error ? error.message : 'No se pudo leer el catálogo de centros de coste.' });
      }
    }
  }, [canRead]);

  useEffect(() => { void loadCenterCatalog(); }, [loadCenterCatalog]);

  // El buscador documental es deliberadamente una lectura independiente. Su
  // respuesta sólo actualiza documentos, nunca sustituye la lista de movimientos.
  useEffect(() => {
    const timer = window.setTimeout(async () => {
      if (!data) return;
      if (!documentSearch.trim()) {
        setDocumentResults(data.documentos);
        return;
      }
      setDocumentsLoading(true);
      try {
        const response = await fetch(buildReadUrl({ onlyDocuments: true, q: documentSearch }), { cache: 'no-store' });
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(backendMessage(json, 'No se pudieron buscar documentos.'));
        setDocumentResults(asResponse(json).documentos);
      } catch (error) {
        setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudieron buscar documentos.' });
      } finally {
        setDocumentsLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [buildReadUrl, data, documentSearch]);

  const resetDraft = useCallback((movement: MovimientoB4 | null) => {
    setProposalReferences({});
    setLines(movement?.operacionAplicada ? movement.vinculos.map((v) => {
      if (v.tipo === 'DOCUMENTO') {
        const centro = centroConfirmadoEnVinculo(v);
        return lineaDocumentoConCentro(v.documentoConciliableId!, v.importeCentimos, centro?.id);
      }
      return { tipo: 'DIFERENCIA' as const, motivoDiferencia: v.motivoDiferencia!, importeCentimos: v.importeCentimos };
    }) : []);
    setReason(movement?.motivoNoRequiere || '');
    setDocumentId('');
    setDocumentAmount('');
    setDifferenceAmount('');
    setPendingConfirmation(null);
    setShowReview(false);
    setDraftState(movement?.estado === 'NO_REQUIERE' ? 'NO_REQUIERE' : 'JUSTIFICADO');
  }, []);

  const selectMovement = useCallback(async (movement: MovimientoB4) => {
    const sequence = ++selectionSequence.current;
    // Un cambio de movimiento descarta el borrador local anterior; no hay updates optimistas.
    resetDraft(movement);
    setSelected(movement);
    setSelectedLoading(true);
    try {
      const response = await fetch(buildReadUrl({ movementId: movement.id }), { cache: 'no-store' });
      const json = await response.json().catch(() => null);
      if (!response.ok) throw new Error(backendMessage(json, 'No se pudo cargar el detalle del movimiento.'));
      const detail = asResponse(json).movimientos.find((item) => item.id === movement.id);
      if (sequence !== selectionSequence.current) return;
      if (detail) { setSelected(detail); resetDraft(detail); }
      else {setSelected(null);resetDraft(null);throw new Error('El movimiento no está disponible en la lectura autorizada.');}
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo cargar el detalle del movimiento.' });
    } finally {
      if (sequence === selectionSequence.current) setSelectedLoading(false);
    }
  }, [buildReadUrl, resetDraft]);

  // B5 abre por ID bancario exacto; nunca se selecciona una factura ni se aplica una propuesta.
  useEffect(() => {
    if (!data || initialMovementOpened.current) return
    const id = new URLSearchParams(window.location.search).get('movimientoId')
    initialMovementOpened.current = true
    if (!id || id.length > 160) return
    const controller = new AbortController()
    const sequence = ++selectionSequence.current
    setSelectedLoading(true)
    void fetch(buildReadUrl({movementId:id}),{cache:'no-store',signal:controller.signal}).then(async response=>{
      const json=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(backendMessage(json,'No se pudo leer el movimiento solicitado.'))
      const detail=asResponse(json).movimientos.find(item=>item.id===id)
      if(!detail)throw new Error('El movimiento solicitado no está disponible en la lectura autorizada.')
      if(sequence===selectionSequence.current){setSelected(detail);resetDraft(detail)}
    }).catch(error=>{if(!controller.signal.aborted)setNotice({kind:'error',text:error instanceof Error?error.message:'No se pudo abrir el movimiento.'})}).finally(()=>{if(sequence===selectionSequence.current)setSelectedLoading(false)})
    return()=>controller.abort()
  },[data,buildReadUrl,resetDraft])

  const effectiveDocuments = documentSearch ? documentResults : (data?.documentos || documentResults);
  const selectedDocument = useMemo(
    () => effectiveDocuments.find((document) => document.id === documentId) || null,
    [documentId, effectiveDocuments],
  );
  const documentLinesCents = useMemo(() => sumarCentimosFirmados(lines, 'DOCUMENTO'), [lines]);
  const differenceLinesCents = useMemo(() => sumarCentimosFirmados(lines, 'DIFERENCIA'), [lines]);
  const lineCents = documentLinesCents + differenceLinesCents;
  const bankCents = selected?.importeCentimos ?? null;
  const remainingCents = bankCents === null ? null : bankCents - lineCents;
  const hasDocumentLine = lines.some((line) => line.tipo === 'DOCUMENTO');
  const changingAppliedOperation = Boolean(selected?.operacionAplicada);
  const bankKnown = bankCents !== null && Number.isSafeInteger(bankCents);
  const exactClose = draftState === 'JUSTIFICADO' && bankKnown && bankCents !== 0 && hasDocumentLine && remainingCents === 0;
  const noRequireReady = draftState === 'NO_REQUIERE' && bankKnown && Boolean(reason);
  const canReviewBase = Boolean(selected) && !selectedLoading && canWrite && !changingAppliedOperation && (exactClose || noRequireReady);

  const prepararBorradorB6=useCallback((draft:BorradorPreparadoB6)=>{
    if(!canWrite||selectedLoading||inFlight.current||!selected||selected.operacionAplicada)return;
    if(selected.id!==draft.movimientoId||selected.estado!=='SIN_DOCUMENTO'||selected.version!==draft.version||selected.importeCentimos===null||selected.importeCentimos!==draft.importeCentimos)return;
    setDraftState('JUSTIFICADO');setReason('');setLines(draft.lineas.map((line) => line.tipo === 'DOCUMENTO' ? lineaDocumentoConCentro(line.documentoConciliableId, line.importeCentimos, undefined) : ({ ...line })));
    setProposalReferences(Object.fromEntries(draft.documentos.filter(doc=>doc.referencia!==null).map(doc=>[doc.id,doc.referencia!])));
    setPendingConfirmation(null);setShowReview(false);setNotice({kind:'info',text:'Borrador preparado: revise y confirme explícitamente en B4. No se ha guardado ningún vínculo.'});
  },[canWrite,selected,selectedLoading]);

  const prepararRevisionHeredada = useCallback((docs: DocumentoB4[], draftLines: LineaBorradorB4[]) => {
    if (!canWrite || selectedLoading || inFlight.current || !selected || selected.operacionAplicada) return;
    // No se confía en la acción visual: se vuelve a comprobar el único wrapper,
    // metadatos exactos y capacidad completa antes de tocar el borrador local.
    const prepared = validarPreparacionHeredada(selected, docs);
    if ('reason' in prepared) {
      setNotice({ kind: 'error', text: `No se puede preparar la revisión heredada: ${prepared.reason}` });
      return;
    }
    const sameLines = draftLines.length === prepared.lineas.length && draftLines.every((line, index) => {
      const expected = prepared.lineas[index];
      return line.tipo === expected.tipo
        && line.importeCentimos === expected.importeCentimos
        && line.tipo === 'DOCUMENTO'
        && expected.tipo === 'DOCUMENTO'
        && line.documentoConciliableId === expected.documentoConciliableId;
    });
    if (!sameLines) {
      setNotice({ kind: 'error', text: 'La preparación heredada dejó de coincidir con la evidencia documental exacta.' });
      return;
    }
    const refs = new Map(docs.map((document) => [document.id, document.referencia] as const));
    const reference = refs.get(prepared.documento.id);
    if (!reference) {
      setNotice({ kind: 'error', text: 'El wrapper documental no conserva una referencia verificable.' });
      return;
    }
    setDraftState('JUSTIFICADO');
    setReason('');
    setLines(prepared.lineas.map((line) => line.tipo === 'DOCUMENTO'
      ? lineaDocumentoConCentro(line.documentoConciliableId, line.importeCentimos, undefined)
      : { tipo: 'DIFERENCIA', motivoDiferencia: line.motivoDiferencia, importeCentimos: line.importeCentimos }));
    setProposalReferences({ [prepared.documento.id]: reference });
    setPendingConfirmation(null);
    setShowReview(false);
    setNotice({ kind: 'info', text: 'Borrador heredado preparado: revise el descuadre, si existe, y confirme explícitamente en B4. No se ha guardado ningún vínculo.' });
  }, [canWrite, selected, selectedLoading]);

  const addDocumentLine = () => {
    if (!selectedDocument) {
      setNotice({ kind: 'error', text: 'Seleccione un documento conciliable antes de añadir una línea.' });
      return;
    }
    if (!documentoPuedeVincularse(selectedDocument)) {
      setNotice({ kind: 'error', text: 'Ese documento tiene importe o capacidad desconocidos, está agotado o requiere revisión.' });
      return;
    }
    const result = convertirImporteUiACentimos(documentAmount);
    if ('errors' in result) {
      setNotice({ kind: 'error', text: result.errors[0]?.mensaje || 'El importe de la línea no es válido.' });
      return;
    }
    if (!dentroDeDisponibleFirmado(result.value, selectedDocument.disponibleCentimos, selectedDocument)) {
      setNotice({ kind: 'error', text: 'El importe debe conservar el signo y mantenerse dentro de la capacidad disponible exacta.' });
      return;
    }
    if (lines.some((line) => line.tipo === 'DOCUMENTO' && line.documentoConciliableId === selectedDocument.id)) {
      setNotice({ kind: 'error', text: 'Un documento sólo puede aparecer una vez en el borrador.' });
      return;
    }
    // Una línea nueva empieza sin centro: nunca se deriva de su documento, categoría o proveedor.
    setLines((current) => [...current, lineaDocumentoConCentro(selectedDocument.id, result.value, undefined)]);
    setDocumentId('');
    setDocumentAmount('');
    setNotice(null);
  };

  const addDifferenceLine = () => {
    const result = convertirImporteUiACentimos(differenceAmount);
    if ('errors' in result) {
      setNotice({ kind: 'error', text: result.errors[0]?.mensaje || 'El importe de la diferencia no es válido.' });
      return;
    }
    setLines((current) => [...current, {
      tipo: 'DIFERENCIA',
      motivoDiferencia: differenceReason,
      importeCentimos: result.value,
    }]);
    setDifferenceAmount('');
    setNotice(null);
  };

  const removeLine = (index: number) => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  const setLineCenter = useCallback((index: number, centroCosteFinanzasId: string | undefined) => {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index && line.tipo === 'DOCUMENTO'
      ? lineaDocumentoConCentro(line.documentoConciliableId, line.importeCentimos, centroCosteFinanzasId)
      : line));
    setPendingConfirmation(null);
    setShowReview(false);
  }, []);

  const centerSelectionProblems = useMemo(() => lines.flatMap((line, index) => {
    if (line.tipo !== 'DOCUMENTO') return [];
    const problem = problemaSeleccionCentro(line.centroCosteFinanzasId, centerCatalog);
    return problem ? [`Línea documental ${index + 1}: ${problem}`] : [];
  }), [centerCatalog, lines]);
  const centersReadyForReview = centerSelectionProblems.length === 0;
  const canReview = canReviewBase && centersReadyForReview;

  const createConfirmPayload = useCallback((idempotencyKey: string): ConfirmarPayloadConCentro | null => {
    if (!selected || bankCents === null || !bankKnown) return null;
    if (draftState === 'NO_REQUIERE') {
      if (!reason) return null;
      return {
        action: 'confirmar',
        confirmacion: true,
        idempotencyKey,
        version: selected.version,
        borrador: {
          movimientoId: selected.id,
          importeMovimientoCentimos: bankCents,
          estado: 'NO_REQUIERE',
          motivoNoRequiere: reason,
          lineas: [],
        },
      };
    }
    if (!exactClose) return null;
    return {
      action: 'confirmar',
      confirmacion: true,
      idempotencyKey,
      version: selected.version,
      borrador: {
        movimientoId: selected.id,
        importeMovimientoCentimos: bankCents,
        estado: 'JUSTIFICADO',
        lineas: serializarLineasConCentro(lines),
      },
    };
  }, [bankCents, bankKnown, draftState, exactClose, lines, reason, selected]);

  const openReview = () => {
    if (!canReview) return;
    const payload = pendingConfirmation?.payload || createConfirmPayload(crearClaveIdempotencia());
    if (!payload) return;
    // La clave queda establecida una vez para que cualquier reintento de red sea idéntico.
    setPendingConfirmation((current) => current || { payload, retriable: false });
    setShowReview(true);
  };

  useEffect(() => {
    if (showReview) window.setTimeout(() => dialogConfirmButton.current?.focus(), 0);
  }, [showReview]);

  const submitConfirmation = async () => {
    const pending = pendingConfirmation;
    if (!pending || inFlight.current) return;
    if (centerSelectionProblems.length > 0) {
      setNotice({ kind: 'error', text: 'La selección de centro cambió o no puede verificarse. Corrija las líneas antes de confirmar.' });
      return;
    }
    inFlight.current = true;
    setConfirming(true);
    try {
      const response = await fetch('/api/admin/finanzas/conciliacion-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const message = backendMessage(json, 'No se pudo confirmar el borrador B4.');
        if (response.status === 400 || response.status === 409) {
          setNotice({ kind: 'error', text: message });
          setShowReview(false);
          setPendingConfirmation(null);
          setSelected(null);
          resetDraft(null);
          await Promise.all([loadLists({ silent: true }), loadCenterCatalog()]);
        } else {
          setNotice({ kind: 'error', text: message });
        }
        return;
      }
      setNotice({ kind: 'success', text: json?.idempotente ? 'La confirmación ya estaba registrada.' : 'Conciliación B4 confirmada y registrada.' });
      setShowReview(false);
      setPendingConfirmation(null);
      setSelected(null);
      resetDraft(null);
      await loadLists({ silent: true });
    } catch (error) {
      // La misma clave y el mismo cuerpo permanecen en memoria para no duplicar una escritura incierta.
      const message = isNetworkFailure(error)
        ? 'No se pudo verificar la respuesta de red. Reintente con la misma confirmación.'
        : (error instanceof Error ? error.message : 'No se pudo confirmar el borrador B4.');
      setPendingConfirmation({ payload: pending.payload, retriable: true });
      setNotice({ kind: 'error', text: message });
    } finally {
      inFlight.current = false;
      setConfirming(false);
    }
  };

  const undoApplied = async () => {
    if (!selected?.operacionAplicada || !canWrite || undoing) return;
    const payload: DeshacerPayloadB4 = {
      action: 'deshacer',
      confirmacion: true,
      idempotencyKey: crearClaveIdempotencia(),
      version: selected.version,
      operacionId: selected.operacionAplicada.id,
      lineas: selected.operacionAplicada.lineas.map((line) => ({ id: line.id, importeCentimos: line.importeCentimos })),
    };
    setUndoing(true);
    try {
      const response = await fetch('/api/admin/finanzas/conciliacion-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok) {
        const message = backendMessage(json, 'No se pudo deshacer la operación B4.');
        setNotice({ kind: 'error', text: message });
        if (response.status === 400 || response.status === 409) {
          setSelected(null);
          resetDraft(null);
          await loadLists({ silent: true });
        }
        return;
      }
      setNotice({ kind: 'success', text: 'Reversión total registrada. La operación y su auditoría se conservan; no se ha borrado ningún registro.' });
      setSelected(null);
      resetDraft(null);
      await loadLists({ silent: true });
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo deshacer la operación B4.' });
    } finally {
      setUndoing(false);
    }
  };

  const changePage = (kind: 'movements' | 'documents', next: number) => {
    const offset = Math.max(0, Math.min(MAX_OFFSET, next));
    if (kind === 'movements') setMovementsOffset(offset); else setDocumentsOffset(offset);
  };

  const accounts = data?.cuentas || [];
  const movements = data?.movimientos || [];
  const pagination = data?.paginacion;

  return (
    <section className="mx-auto max-w-[1600px] space-y-5 text-slate-900">
      <header className="flex flex-col gap-4 border-b border-orange-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
            <ShieldCheckIcon className="h-4 w-4" aria-hidden="true" /> B4 · revisión manual
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Conciliación bancaria</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">El banco manda: construya un cierre firmado exacto o documente un motivo cerrado. Esta pantalla no aplica sugerencias automáticas.</p>
        </div>
        <button type="button" onClick={() => void loadLists({ silent: true })} disabled={loading || refreshing} className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-300 bg-white px-3 py-2 text-sm font-semibold text-orange-800 shadow-sm transition hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60">
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" /> Actualizar
        </button>
      </header>

      {!canWrite && <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"><strong>Modo consulta.</strong> Su permiso actual no permite confirmar ni deshacer operaciones.</div>}
      {notice && <div role={notice.kind === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-lg border px-4 py-3 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-900' : notice.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-blue-200 bg-blue-50 text-blue-900'}`}><span>{notice.text}</span></div>}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <form onSubmit={(event) => { event.preventDefault(); setMovementsOffset(0); setMovementSearch(textoBusquedaSeguro(movementQuery)); }} className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px_auto] lg:items-end">
          <label className="block text-sm font-semibold text-slate-800">Buscar movimientos
            <span className="relative mt-1 block"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" /><input value={movementQuery} onChange={(event) => setMovementQuery(event.target.value.slice(0, 120))} maxLength={120} placeholder="Concepto, referencia o importe" className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100" /></span>
          </label>
          <label className="block text-sm font-semibold text-slate-800">Cuenta
            <select value={accountId} onChange={(event) => { setAccountId(event.target.value); setMovementsOffset(0); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
              <option value="">Todas las cuentas</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.banco} · {account.alias}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-slate-800">Heredados
            <select aria-label="Heredados" value={heredadosFilter} onChange={(event) => { setHeredadosFilter(event.target.value as FiltroHeredados); setMovementsOffset(0); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
              <option value="TODOS">Todos los movimientos</option>
              <option value="SI">Con referencia heredada</option>
              <option value="PROPUESTA">Propuestas heredadas</option>
            </select>
          </label>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" /> Buscar</button>
        </form>
      </div>

      {heredadosFilter !== 'TODOS' && <HistoricalBlockReceiptsPanel
        canWrite={canWrite}
        onChanged={() => { void loadLists({ silent: true }); }}
      />}

      {heredadosFilter !== 'TODOS' && <HistoricalBulkPanel
        canWrite={canWrite}
        cuentaId={accountId || undefined}
        q={movementSearch || undefined}
        onChanged={() => { void loadLists({ silent: true }); }}
        onOpenMovimiento={(id) => {
          const movement = movements.find((item) => item.id === id);
          if (movement) { void selectMovement(movement); return; }
          const sequence=++selectionSequence.current;setSelectedLoading(true);
          void fetch(buildReadUrl({movementId:id}),{cache:'no-store'}).then(async response=>{
            const json=await response.json().catch(()=>null);if(!response.ok)throw new Error(backendMessage(json,'No se pudo abrir el movimiento heredado.'));
            const detail=asResponse(json).movimientos.find(item=>item.id===id);if(!detail)throw new Error('El movimiento no está disponible en la lectura autorizada.');
            if(sequence===selectionSequence.current){setSelected(detail);resetDraft(detail);}
          }).catch(error=>setNotice({kind:'error',text:error instanceof Error?error.message:'No se pudo abrir el movimiento heredado.'})).finally(()=>{if(sequence===selectionSequence.current)setSelectedLoading(false);});
        }}
      />}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 sm:px-5"><h2 className="font-bold text-slate-950">Movimientos bancarios</h2><p className="mt-0.5 text-xs text-slate-500">Seleccione un movimiento para abrir el borrador manual.</p></div>
        {loading ? <LoadingRows /> : movements.length === 0 ? <EmptyState title="No hay movimientos" text="Pruebe a cambiar la búsqueda o la cuenta seleccionada." /> : <>
          <div className="divide-y divide-slate-100">
            {movements.map((movement) => <button key={movement.id} type="button" data-testid="b4-movement" onClick={() => void selectMovement(movement)} className="grid w-full gap-1 px-4 py-3 text-left transition hover:bg-orange-50/70 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-500 sm:grid-cols-[120px_minmax(0,1fr)_150px_200px] sm:items-center sm:gap-3 sm:px-5">
              <span className="text-sm font-medium text-slate-700">{fechaCorta(movement.fechaOperacion)}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-950">{movement.concepto || 'Sin concepto'}</span><span className="block truncate text-xs text-slate-500">{movement.cuenta?.banco || 'Banco'} · {movement.cuenta?.alias || 'Cuenta sin alias'}</span></span>
              <span className="font-mono text-sm font-bold text-slate-900">{formatCentimos(movement.importeCentimos)}</span>
              <span className="flex w-fit flex-wrap items-center gap-1.5"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClass(movement.estado)}`}>{estadoVisible(movement.estado, movement.motivoNoRequiere)}</span>{movement.historico && <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-900 ring-1 ring-violet-200">Heredado</span>}</span>
            </button>)}
          </div>
          <Pagination current={pagination?.movimientosOffset ?? movementsOffset} total={pagination?.movimientosTotal ?? 0} onPage={(offset) => changePage('movements', offset)} />
        </>}
      </div>

      {selected && <MovementDrawer
        onPrepararBorradorB6={prepararBorradorB6}
        onPrepararRevisionHeredada={prepararRevisionHeredada}
        proposalReferences={proposalReferences}
        centerCatalog={centerCatalog}
        onReloadCenterCatalog={loadCenterCatalog}
        centerSelectionProblems={centerSelectionProblems}
        reviewing={showReview}
        movement={selected}
        selectedLoading={selectedLoading}
        errorText={notice?.kind === 'error' ? notice.text : null}
        canWrite={canWrite}
        documents={effectiveDocuments}
        documentSearch={documentSearch}
        onDocumentSearch={setDocumentSearch}
        documentsLoading={documentsLoading}
        documentId={documentId}
        onDocumentId={(next) => { setDocumentId(next); const doc = effectiveDocuments.find((item) => item.id === next); setDocumentAmount(doc && documentoPuedeVincularse(doc) && doc.disponibleCentimos !== null && doc.disponibleCentimos !== 0 ? centimosAImporteUi(doc.disponibleCentimos) : ''); }}
        documentAmount={documentAmount}
        onDocumentAmount={setDocumentAmount}
        onAddDocument={addDocumentLine}
        differenceReason={differenceReason}
        onDifferenceReason={setDifferenceReason}
        differenceAmount={differenceAmount}
        onDifferenceAmount={setDifferenceAmount}
        onAddDifference={addDifferenceLine}
        lines={lines}
        onLineCenter={setLineCenter}
        onRemoveLine={removeLine}
        draftState={draftState}
        onDraftState={(next) => { setDraftState(next); if (next === 'NO_REQUIERE') setLines([]); setPendingConfirmation(null); }}
        reason={reason}
        onReason={setReason}
        bankCents={bankCents}
        documentsCents={documentLinesCents}
        differencesCents={differenceLinesCents}
        linesCents={lineCents}
        remainingCents={remainingCents}
        exactClose={exactClose}
        changingAppliedOperation={changingAppliedOperation}
        canReview={canReview}
        onReview={openReview}
        onUndo={() => void undoApplied()}
        undoing={undoing}
        onClose={() => { selectionSequence.current++; setSelected(null); resetDraft(null); }}
      />}

      {showReview && pendingConfirmation && <ReviewDialog
        payload={pendingConfirmation.payload}
        movement={selected}
        centerCatalog={centerCatalog}
        centerSelectionProblems={centerSelectionProblems}
        documentLines={documentLinesCents}
        differenceLines={differenceLinesCents}
        remaining={remainingCents}
        confirming={confirming}
        retry={pendingConfirmation.retriable}
        confirmRef={dialogConfirmButton}
        onCancel={() => { if (!confirming) { setShowReview(false); if (!pendingConfirmation.retriable) setPendingConfirmation(null); } }}
        onConfirm={() => void submitConfirmation()}
      />}
    </section>
  );
}

function MovementDrawer(props: {
  onPrepararBorradorB6:(draft:BorradorPreparadoB6)=>void;
  onPrepararRevisionHeredada:(docs:DocumentoB4[],lines:LineaBorradorB4[])=>void;
  proposalReferences:Record<string,string>;
  centerCatalog: CatalogoCentrosEstado;
  onReloadCenterCatalog: () => void;
  centerSelectionProblems: readonly string[];
  reviewing: boolean;
  movement: MovimientoB4;
  selectedLoading: boolean;
  errorText: string | null;
  canWrite: boolean;
  documents: DocumentoB4[];
  documentSearch: string;
  onDocumentSearch: (value: string) => void;
  documentsLoading: boolean;
  documentId: string;
  onDocumentId: (value: string) => void;
  documentAmount: string;
  onDocumentAmount: (value: string) => void;
  onAddDocument: () => void;
  differenceReason: MotivoDiferencia;
  onDifferenceReason: (value: MotivoDiferencia) => void;
  differenceAmount: string;
  onDifferenceAmount: (value: string) => void;
  onAddDifference: () => void;
  lines: LineaBorradorConCentro[];
  onLineCenter: (index: number, centroCosteFinanzasId: string | undefined) => void;
  onRemoveLine: (index: number) => void;
  draftState: 'JUSTIFICADO' | 'NO_REQUIERE';
  onDraftState: (value: 'JUSTIFICADO' | 'NO_REQUIERE') => void;
  reason: MotivoNoRequiere | '';
  onReason: (value: MotivoNoRequiere | '') => void;
  bankCents: number | null;
  documentsCents: number;
  differencesCents: number;
  linesCents: number;
  remainingCents: number | null;
  exactClose: boolean;
  changingAppliedOperation: boolean;
  canReview: boolean;
  onReview: () => void;
  onUndo: () => void;
  undoing: boolean;
  onClose: () => void;
}) {
  const {
    movement, selectedLoading, canWrite, documents, documentSearch, onDocumentSearch, documentsLoading,
    documentId, onDocumentId, documentAmount, onDocumentAmount, onAddDocument, differenceReason,
    onDifferenceReason, differenceAmount, onDifferenceAmount, onAddDifference, lines, onLineCenter, onRemoveLine,
    draftState, onDraftState, reason, onReason, bankCents, documentsCents, differencesCents, linesCents,
    remainingCents, exactClose, changingAppliedOperation, canReview, onReview, onUndo, undoing, onClose,
  } = props;
  const disabled = props.reviewing || selectedLoading || !canWrite || changingAppliedOperation || bankCents === null || (bankCents === 0 && draftState === 'JUSTIFICADO');
  const reasonOptions: MotivoNoRequiere[] = [
    'COMISION_BANCARIA', 'INTERES_BANCARIO', 'REDONDEO_BANCARIO', 'TRASPASO_INTERNO_SIN_DOCUMENTO', 'MOVIMIENTO_TECNICO_BANCO', 'CORRECCION_BANCARIA',
  ];

  return <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside role="dialog" aria-modal="true" aria-label="Detalle de conciliación B4" onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }} className="flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-700">Movimiento bancario</p><h2 className="mt-1 truncate text-lg font-bold text-slate-950">{movement.concepto || 'Sin concepto'}</h2><p className="mt-1 text-sm text-slate-600">{fechaCorta(movement.fechaOperacion)} · {movement.cuenta?.banco || 'Banco'} · {movement.cuenta?.alias || 'Sin alias'}</p></div>
        <button type="button" onClick={onClose} aria-label="Cerrar detalle" className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"><XMarkIcon className="h-5 w-5" aria-hidden="true" /></button>
      </header>

      <div className="space-y-5 p-4 sm:p-6">
        {props.errorText && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-950">{props.errorText}</p>}
        {selectedLoading && <p role="status" className="text-sm text-slate-500">Actualizando detalle…</p>}
        {changingAppliedOperation && <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-950"><p className="font-bold">Operación aplicada con auditoría visible</p><p className="mt-1">Para cambiar este movimiento debe deshacer primero la operación completa. La reversión conserva las líneas y el historial; no realiza un borrado.</p><button type="button" data-testid="b4-undo" onClick={onUndo} disabled={!canWrite || undoing} className="mt-3 inline-flex items-center rounded-lg border border-orange-400 bg-white px-3 py-2 text-sm font-bold text-orange-900 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60">{undoing ? 'Deshaciendo…' : 'Deshacer operación completa'}</button></div>}
        {bankCents === null && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Importe bancario desconocido.</strong> No se pueden crear líneas ni confirmar, y no se sustituye por cero.</div>}
        {bankCents === 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Movimiento de cero céntimos.</strong> No admite líneas documentales. Puede permanecer sin documento o marcarse No requiere con un motivo cerrado.</div>}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`cursor-pointer rounded-lg border p-3 ${draftState === 'JUSTIFICADO' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}><input data-testid="b4-state" className="sr-only" type="radio" checked={draftState === 'JUSTIFICADO'} onChange={() => onDraftState('JUSTIFICADO')} disabled={disabled} /><span className="block text-sm font-bold text-slate-950">Justificado</span><span className="mt-0.5 block text-xs text-slate-600">Exige al menos un documento y cierre exacto.</span></label>
          <label className={`cursor-pointer rounded-lg border p-3 ${draftState === 'NO_REQUIERE' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}><input data-testid="b4-state" className="sr-only" type="radio" checked={draftState === 'NO_REQUIERE'} onChange={() => onDraftState('NO_REQUIERE')} disabled={selectedLoading || !canWrite || changingAppliedOperation || bankCents === null} /><span className="block text-sm font-bold text-slate-950">No requiere documento</span><span className="mt-0.5 block text-xs text-slate-600">Motivo cerrado; no admite líneas.</span></label>
        </div>

        {draftState === 'NO_REQUIERE' ? <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-slate-950">Motivo cerrado</h3><label className="mt-3 block text-sm font-semibold text-slate-800">Motivo<select data-testid="b4-reason" value={reason} onChange={(event) => onReason(event.target.value as MotivoNoRequiere | '')} disabled={disabled} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed"><option value="">Seleccione un motivo</option>{reasonOptions.map((item) => <option key={item} value={item}>{etiquetaMotivo(item)}</option>)}</select></label><p className="mt-2 text-xs text-slate-600">No existe «Otro» ni texto libre. Las líneas permanecen vacías.</p></section> : <>
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-slate-950">Añadir documento</h3><p className="mt-0.5 text-xs text-slate-600">Sólo documentos con objetivo y capacidad conocidos; se respeta el signo.</p></div><DocumentMagnifyingGlassIcon className="h-5 w-5 text-orange-600" aria-hidden="true" /></div>
            <label className="mt-3 block text-sm font-semibold text-slate-800">Buscar documento<input value={documentSearch} onChange={(event) => onDocumentSearch(event.target.value.slice(0, 120))} disabled={disabled} maxLength={120} placeholder="Referencia o tercero" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed" /></label>
            <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end"><label className="block text-sm font-semibold text-slate-800">Documento<select value={documentId} onChange={(event) => onDocumentId(event.target.value)} disabled={disabled || documentsLoading} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed"><option value="">{documentsLoading ? 'Buscando…' : 'Seleccione un documento'}</option>{documents.map((document) => <option key={document.id} value={document.id} disabled={!documentoPuedeVincularse(document)}>{document.referencia || document.id} · {formatCentimos(document.disponibleCentimos)}{document.stale ? ' · revisar' : ''}</option>)}</select></label><label className="block text-sm font-semibold text-slate-800">Importe<input value={documentAmount} onChange={(event) => onDocumentAmount(event.target.value)} disabled={disabled} inputMode="decimal" placeholder="-123,45" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed" /></label><button type="button" data-testid="b4-add-document" onClick={onAddDocument} disabled={disabled} className="inline-flex items-center justify-center gap-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"><PlusIcon className="h-4 w-4" aria-hidden="true" /> Añadir</button></div>
          </section>

          <section className="rounded-xl border border-slate-200 p-4"><h3 className="font-bold text-slate-950">Añadir diferencia</h3><p className="mt-0.5 text-xs text-slate-600">Sólo comisión, intereses o redondeo; no existe «Otro».</p><div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px_auto] sm:items-end"><label className="block text-sm font-semibold text-slate-800">Tipo<select value={differenceReason} onChange={(event) => onDifferenceReason(event.target.value as MotivoDiferencia)} disabled={disabled} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed"><option value="COMISION">Comisión</option><option value="INTERESES">Intereses</option><option value="REDONDEO">Redondeo</option></select></label><label className="block text-sm font-semibold text-slate-800">Importe<input value={differenceAmount} onChange={(event) => onDifferenceAmount(event.target.value)} disabled={disabled} inputMode="decimal" placeholder="-1,25" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed" /></label><button type="button" data-testid="b4-add-difference" onClick={onAddDifference} disabled={disabled} className="inline-flex items-center justify-center gap-1 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-bold text-orange-900 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-60"><PlusIcon className="h-4 w-4" aria-hidden="true" /> Añadir</button></div></section>
        </>}

        <section aria-label="Líneas del borrador" className="rounded-xl border border-slate-200"><div className="border-b border-slate-200 px-4 py-3"><h3 className="font-bold text-slate-950">Líneas del borrador</h3><p className="mt-0.5 text-xs text-slate-600">La imputación es opcional y se decide por cada línea DOCUMENTO.</p></div>{props.centerSelectionProblems.length > 0 && <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"><p className="font-bold">Revise la selección de centro antes de confirmar.</p><ul className="mt-1 list-disc pl-5">{props.centerSelectionProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}{lines.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">No hay líneas. Un borrador JUSTIFICADO necesita al menos un documento.</p> : <ul className="divide-y divide-slate-100">{lines.map((line, index) => <li key={`${line.tipo}-${index}`} className="min-w-0 space-y-3 px-4 py-3"><div className="flex min-w-0 items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold text-slate-900">{line.tipo === 'DOCUMENTO' ? (movement.vinculos.find(v => v.documentoConciliableId === line.documentoConciliableId)?.referencia || documents.find((document) => document.id === line.documentoConciliableId)?.referencia || props.proposalReferences[line.documentoConciliableId] || `Documento ${line.documentoConciliableId}`) : etiquetaMotivo(line.motivoDiferencia)}</p><p className="truncate text-xs text-slate-500">{line.tipo === 'DOCUMENTO' ? 'Documento conciliable' : 'Diferencia explícita'}</p></div><div className="flex shrink-0 items-center gap-2"><span className="font-mono text-sm font-bold text-slate-950">{formatCentimos(line.importeCentimos)}</span><button type="button" onClick={() => onRemoveLine(index)} disabled={disabled} aria-label="Eliminar línea" className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed"><TrashIcon className="h-4 w-4" aria-hidden="true" /></button></div></div>{line.tipo === 'DOCUMENTO' && !changingAppliedOperation && <CenterChoiceSelector inputId={`b4-center-${index}`} value={line.centroCosteFinanzasId} catalogo={props.centerCatalog} disabled={disabled} onChange={(centerId) => onLineCenter(index, centerId)} onReload={props.onReloadCenterCatalog} />}{line.tipo === 'DOCUMENTO' && changingAppliedOperation && (() => { const confirmed = centroConfirmadoEnVinculo(movement.vinculos.find((v) => v.documentoConciliableId === line.documentoConciliableId)); return confirmed ? <p className="text-xs text-slate-600">Centro confirmado histórico: <strong>{confirmed.codigo && confirmed.nombre ? `${confirmed.codigo} · ${confirmed.nombre}` : confirmed.id}</strong></p> : null; })()}</li>)}</ul>}</section>

        <ProposalsPanel movimientoId={movement.id} estadoB4={movement.estado} versionMovimiento={movement.version} importeMovimientoCentimos={bankCents} canWrite={canWrite&&!selectedLoading&&!changingAppliedOperation} onPrepararBorrador={props.onPrepararBorradorB6}/>
        <HistoricalLinksPanel
          movimiento={{ ...movement, documentosHistoricosDisponibles: documents }}
          canWrite={canWrite}
          busy={selectedLoading || props.reviewing || changingAppliedOperation}
          onPrepare={props.onPrepararRevisionHeredada}
        />
        {bankCents !== null && bankCents < 0 && <PayrollCandidatesPanel movimientoId={movement.id} fechaOperacion={movement.fechaOperacion} importeMovimientoCentimos={bankCents} estadoB4={movement.estado} versionMovimiento={movement.version} canWrite={canWrite && !selectedLoading && !changingAppliedOperation} disabled={selectedLoading || changingAppliedOperation || props.reviewing} onPrepararBorrador={props.onPrepararBorradorB6} />}
        {bankCents !== null && bankCents > 0 && <ConfirmingSupportPanel movimientoId={movement.id} importeCentimos={bankCents} disabled={selectedLoading || props.reviewing} canWrite={canWrite && !selectedLoading && !props.reviewing} />}
        <PrivateMovementFiles key={`${movement.id}-${movement.version}`} movimientoId={movement.id} compact />

        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-bold text-slate-950">Cierre exacto</h3><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><SummaryRow label="Banco" value={formatCentimos(bankCents)} testId="b4-bank-cents" /><SummaryRow label="Documentos" value={formatCentimos(documentsCents)} /><SummaryRow label="Diferencias" value={formatCentimos(differencesCents)} /><SummaryRow label="Total líneas" value={formatCentimos(linesCents)} testId="b4-lines-cents" /><SummaryRow label="Resto" value={remainingCents === null ? 'No calculable' : formatCentimos(remainingCents)} testId="b4-remaining-cents" emphasis={draftState === 'JUSTIFICADO' && remainingCents !== 0} /></dl>{draftState === 'JUSTIFICADO' && <p className={`mt-3 text-xs font-semibold ${exactClose ? 'text-emerald-700' : 'text-red-700'}`}>{exactClose ? 'Cierre exacto: puede revisar el borrador.' : 'El resto debe ser exactamente 0,00 € y debe existir una línea documental para confirmar.'}</p>}{draftState === 'NO_REQUIERE' && <p className="mt-3 text-xs font-semibold text-orange-800">El motivo cerrado no usa líneas: el resto se muestra como referencia y no se trata como una diferencia documental.</p>}</section>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500">Cancelar</button><button type="button" data-testid="b4-review" onClick={onReview} disabled={!canReview} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Revisar y confirmar</button></div>
      </div>
    </aside>
  </div>;
}

function SummaryRow({ label, value, testId, emphasis }: { label: string; value: string; testId?: string; emphasis?: boolean }) {
  return <><dt className="text-slate-600">{label}</dt><dd data-testid={testId} className={`text-right font-mono font-bold ${emphasis ? 'text-red-700' : 'text-slate-950'}`}>{value}</dd></>;
}

function ReviewDialog({ payload, movement, centerCatalog, centerSelectionProblems, documentLines, differenceLines, remaining, confirming, retry, confirmRef, onCancel, onConfirm }: {
  payload: ConfirmarPayloadConCentro;
  movement: MovimientoB4 | null;
  centerCatalog: CatalogoCentrosEstado;
  centerSelectionProblems: readonly string[];
  documentLines: number;
  differenceLines: number;
  remaining: number | null;
  confirming: boolean;
  retry: boolean;
  confirmRef: RefObject<HTMLButtonElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation"><div role="dialog" aria-modal="true" aria-labelledby="b4-dialog-title" onKeyDown={(event) => { if (event.key === 'Escape' && !confirming) onCancel(); }} className="w-full max-w-lg rounded-xl bg-white shadow-2xl"><div className="border-b border-slate-200 px-5 py-4"><div className="flex items-start gap-3"><div className="rounded-full bg-orange-100 p-2 text-orange-700"><ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" /></div><div><h2 id="b4-dialog-title" className="font-bold text-slate-950">Confirmar conciliación B4</h2><p className="mt-1 text-sm text-slate-600">Revise el cierre antes de registrar la operación.</p></div></div></div><div className="space-y-3 px-5 py-4 text-sm"><p><strong>Movimiento:</strong> {movement?.concepto || 'Sin concepto'}</p><p><strong>Estado:</strong> {etiquetaEstado(payload.borrador.estado)}</p>{centerSelectionProblems.length > 0 && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-950"><strong>No se puede confirmar todavía.</strong><ul className="mt-1 list-disc pl-5">{centerSelectionProblems.map((problem) => <li key={problem}>{problem}</li>)}</ul></div>}{payload.borrador.estado === 'JUSTIFICADO' && <ReviewCenterChoices lines={payload.borrador.lineas} catalogo={centerCatalog} />}{payload.borrador.estado === 'NO_REQUIERE' ? <p><strong>Motivo:</strong> {etiquetaMotivo(payload.borrador.motivoNoRequiere || '')}. No se enviarán líneas.</p> : <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3"><SummaryRow label="Documentos" value={formatCentimos(documentLines)} /><SummaryRow label="Diferencias" value={formatCentimos(differenceLines)} /><SummaryRow label="Resto" value={remaining === null ? 'No calculable' : formatCentimos(remaining)} emphasis={remaining !== 0} /></dl>}{retry && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">Se reintentará exactamente la misma solicitud, con la misma clave de idempotencia.</p>}<p className="text-xs text-slate-500">Esta acción crea una operación auditable. No se realizan sugerencias ni actualizaciones optimistas.</p></div><div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={onCancel} disabled={confirming} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50">Cancelar</button><button ref={confirmRef} data-testid="b4-confirm" type="button" onClick={onConfirm} disabled={confirming || centerSelectionProblems.length > 0} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60">{confirming ? 'Confirmando…' : retry ? 'Reintentar confirmación' : 'Confirmar definitivamente'}</button></div></div></div>;
}

function ReviewCenterChoices({ lines, catalogo }: { lines: readonly LineaBorradorConCentro[]; catalogo: CatalogoCentrosEstado }) {
  const documents = lines.filter((line): line is LineaDocumentoConCentro => line.tipo === 'DOCUMENTO');
  const withCenter = documents.flatMap((line, index) => {
    if (!line.centroCosteFinanzasId) return [];
    const center = catalogo.items.find((item) => item.id === line.centroCosteFinanzasId);
    // El diálogo se abre sólo con catálogo verificable; no se inventa etiqueta de un UUID.
    return center ? [{ index: index + 1, center }] : [];
  });
  const withoutCenter = documents.map((line, index) => ({ line, index: index + 1 })).filter(({ line }) => !line.centroCosteFinanzasId);
  return <section className="rounded-lg border border-slate-200 bg-slate-50 p-3"><h3 className="font-bold text-slate-950">Imputación por centro de coste</h3>{withCenter.length > 0 ? <ul className="mt-2 space-y-1 text-sm text-slate-800">{withCenter.map(({ index, center }) => <li key={`${index}-${center.id}`}><strong>Línea documental {index}:</strong> {etiquetaCentro(center)}</li>)}</ul> : null}{withoutCenter.length > 0 ? <p className="mt-2 text-sm text-slate-700"><strong>Sin centro de coste:</strong> línea{withoutCenter.length === 1 ? '' : 's'} documental{withoutCenter.length === 1 ? '' : 'es'} {withoutCenter.map(({ index }) => index).join(', ')}.</p> : null}{withCenter.length === 0 && withoutCenter.length === 0 ? <p className="mt-2 text-sm text-slate-600">No hay líneas DOCUMENTO.</p> : null}</section>;
}

function Pagination({ current, total, onPage }: { current: number; total: number; onPage: (offset: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const from = total === 0 ? 0 : current + 1;
  const to = Math.min(current + PAGE_SIZE, total);
  return <nav aria-label="Paginación de movimientos" className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-5"><p className="text-slate-600">Mostrando {from}–{to} de {total}</p><div className="flex gap-2"><button type="button" onClick={() => onPage(current - PAGE_SIZE)} disabled={current <= 0} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50"><ChevronLeftIcon className="h-4 w-4" aria-hidden="true" /> Anterior</button><button type="button" onClick={() => onPage(current + PAGE_SIZE)} disabled={current + PAGE_SIZE >= total} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50">Siguiente <ChevronRightIcon className="h-4 w-4" aria-hidden="true" /></button></div></nav>;
}

function LoadingRows() { return <div className="animate-pulse divide-y divide-slate-100">{Array.from({ length: 5 }, (_, index) => <div key={index} className="grid gap-3 px-4 py-4 sm:grid-cols-[120px_minmax(0,1fr)_150px_180px] sm:px-5"><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /><span className="h-4 rounded bg-slate-100" /></div>)}</div>; }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="px-5 py-12 text-center"><h3 className="font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-600">{text}</p></div>; }
