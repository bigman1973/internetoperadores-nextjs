"use client"

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline'

type Classification = 'REPARTIBLE' | 'PUNTUAL' | 'ABONO_EXPLICITO'
type Source = {
  rowKey: string; sourceId: string | null; facturaId: string; proveedor: string; numFactura: string | null; fecha: string; base: number; estado: string; version: number; snapshotHash: string
  clasificacionActual: string | null; bloqueada: boolean; motivoBloqueo: string | null; situacion: 'APTA' | 'PENDIENTE_PREPARACION' | 'PENDIENTE_REVISION_FUENTE' | 'RESERVADA_OTRA_FUENTE' | 'ARCHIVADA'; respuestaValida: boolean
}
type SourcesResponse = { stagingOnly: boolean; fuentes: Source[]; page: number; totalPages: number; total: number; canWrite: boolean }
type Contract = {
  clienteId: number | null; clienteNombre: string | null; contratoId: number; contratoTitulo: string; tarifa: string; precio: number | null
  unidadesPeriodoMeses: number | null; seleccionable: boolean; motivoExclusion: string | null
}
type ContractsResponse = { stagingOnly: boolean; periodoServicio: string; periodoActual: string; contratos: Contract[] }
type Preview = {
  fuente: { id: string; proveedor: string; numFactura: string | null; fecha: string; base: number; costeCentimos: string; sourceVersion: number; invoiceSnapshotHash: string }
  clasificacion: Classification; periodoServicio: string
  ventas: Array<{ clienteId: number; clienteNombre: string; contratoId: number; contratoTitulo: string; ventaPeriodoCentimos: string; unidadesPeriodoMeses: number; ventaNormalizadaDoceavosCentimo: string }>
  lineas: Array<{ clienteId: number; clienteNombre: string; ventaNormalizadaDoceavosCentimo: string; costeCentimos: string; restoNumerador: string; ordenResto: number; contratoIds: number[] }>
  pendienteBolsa: boolean; aviso: string | null
}
type HistoryItem = { id: string; version: number; estado: string; clasificacion: Classification; periodoServicio: string; costeCentimos: string; createdAt: string; creadoPor: string; contratos: Array<{ clienteId: number; contratoId: number; clienteNombre: string | null; contratoTitulo: string | null }> }
type ConfirmationResult = { stagingOnly: boolean; idempotente: boolean; reparto: { id: string; version: number; clasificacion: string } }
type HistoryResponse = { stagingOnly: boolean; historial: HistoryItem[] }

const API = '/api/admin/finanzas/reparto-clientes'
const PENDING_CONFIRMATION_STORAGE = 'admin.finanzas.reparto-clientes.pending-confirmation'
const euro = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percentage = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 shadow-sm placeholder:text-slate-500 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700 disabled:cursor-not-allowed disabled:bg-slate-100'
const ZERO = BigInt(0)
const HUNDRED = BigInt(100)
const TEN_THOUSAND = BigInt(10000)
const TWO = BigInt(2)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/i

const datePeriod = () => new Date().toISOString().slice(0, 7)
function cents(value: string | number) { return euro.format(Number(value) / 100) }
function money(value: number) { return euro.format(value) }
function message(error: unknown) { return error instanceof Error ? error.message : 'No se pudo completar la operación.' }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value) }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) > 0 }
function nullableString(value: unknown): string | null { return typeof value === 'string' ? value : value === null ? null : null }

class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
class ConfirmationUncertainError extends Error {
  constructor() { super('No se pudo determinar si la confirmación se guardó. Reintenta exactamente la misma confirmación.') }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try { response = await fetch(url, { cache: 'no-store', ...init }) }
  catch (cause) { throw new ApiError(message(cause), 0) }
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(typeof body?.error === 'string' ? body.error : `Error ${response.status}.`, response.status)
  return body as T
}

function newKey() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}` }
function reason(reason: string | null) {
  const copy: Record<string, string> = {
    PRICE_HISTORY_GAP_PENDING_MANUAL_PROVISIONING: 'No hay histórico de precio contractual: requiere aprovisionamiento manual.',
    CLIENT_MAPPING_NOT_UNIQUE: 'El contrato no tiene una correspondencia única con un cliente.',
    CLIENT_CONTRACT_MISMATCH: 'El cliente y contrato seleccionado no coinciden.',
    CONTRACT_NOT_ACTIVE: 'Contrato no activo.', CONTRACT_NOT_VIGENT_FOR_FULL_SERVICE_PERIOD: 'No está vigente durante todo el mes de servicio.',
    ZERO_SALE_EXCLUDED: 'Venta cero excluida.', NON_POSITIVE_SALE_EXCLUDED: 'Venta no positiva excluida.', PERIODICITY_UNVERIFIED: 'Periodicidad de tarifa no verificada.',
  }
  return reason ? (copy[reason] || reason) : ''
}

/** Serializes the immutable confirmation snapshot. Retries must send this exact string, never rebuild it. */
export function confirmationPayloadJson(payload: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(payload)
}

/** Returns percentage hundredths rounded half-up, without floating-point loss. */
export function roundedWeightPercentageHundredths(weight: string, total: string): string | null {
  try {
    const weightValue = BigInt(weight)
    const totalValue = BigInt(total)
    if (weightValue < ZERO || totalValue <= ZERO) return null
    return ((weightValue * TEN_THOUSAND + totalValue / TWO) / totalValue).toString()
  } catch { return null }
}
function weightPercentage(weight: string, total: bigint): string {
  const rounded = roundedWeightPercentageHundredths(weight, total.toString())
  return rounded === null ? '—' : `${percentage.format(Number(BigInt(rounded)) / Number(HUNDRED))} %`
}

export function sourceFromResponse(value: unknown, index: number): Source {
  const raw = isRecord(value) ? value : {}
  const sourceId = nullableString(raw.sourceId)
  const facturaId = typeof raw.facturaId === 'string' ? raw.facturaId : ''
  const proveedor = typeof raw.proveedor === 'string' ? raw.proveedor : 'Fuente no disponible'
  const numFactura = nullableString(raw.numFactura)
  const fecha = typeof raw.fecha === 'string' ? raw.fecha : ''
  const base = typeof raw.base === 'number' && Number.isFinite(raw.base) ? raw.base : 0
  const estado = typeof raw.estado === 'string' ? raw.estado : 'NO_VALIDADA'
  const version = positiveInteger(raw.version) ? raw.version : 0
  const snapshotHash = typeof raw.snapshotHash === 'string' ? raw.snapshotHash : ''
  const clasificacionActual = nullableString(raw.clasificacionActual)
  const bloqueada = typeof raw.bloqueada === 'boolean' ? raw.bloqueada : true
  const motivoBloqueo = nullableString(raw.motivoBloqueo)
  const situacion = raw.situacion === 'APTA' || raw.situacion === 'PENDIENTE_PREPARACION' || raw.situacion === 'PENDIENTE_REVISION_FUENTE' || raw.situacion === 'RESERVADA_OTRA_FUENTE' || raw.situacion === 'ARCHIVADA' ? raw.situacion : 'ARCHIVADA'
  const respuestaValida = isRecord(value)
    && (raw.sourceId === null || typeof raw.sourceId === 'string' && UUID.test(raw.sourceId))
    && typeof raw.facturaId === 'string' && UUID.test(raw.facturaId)
    && typeof raw.proveedor === 'string' && raw.proveedor.trim().length > 0
    && (typeof raw.numFactura === 'string' || raw.numFactura === null)
    && typeof raw.fecha === 'string' && raw.fecha.length > 0
    && typeof raw.base === 'number' && Number.isFinite(raw.base)
    && typeof raw.estado === 'string' && raw.estado.length > 0
    && (raw.version === 0 || positiveInteger(raw.version))
    && typeof raw.snapshotHash === 'string' && SHA256.test(raw.snapshotHash)
    && (typeof raw.clasificacionActual === 'string' || raw.clasificacionActual === null)
    && typeof raw.bloqueada === 'boolean'
    && (typeof raw.motivoBloqueo === 'string' || raw.motivoBloqueo === null)
    && typeof raw.situacion === 'string'
  return { rowKey: `${facturaId || 'invalida'}-${index}`, sourceId, facturaId, proveedor, numFactura, fecha, base, estado, version, snapshotHash, clasificacionActual, bloqueada, motivoBloqueo, situacion, respuestaValida }
}
function sourcesFromResponse(value: unknown): SourcesResponse {
  if (!isRecord(value) || typeof value.stagingOnly !== 'boolean' || !Array.isArray(value.fuentes) || !positiveInteger(value.page) || !positiveInteger(value.totalPages) || !Number.isSafeInteger(value.total) || Number(value.total) < 0 || typeof value.canWrite !== 'boolean') {
    throw new Error('La respuesta de fuentes no tiene el formato esperado.')
  }
  return { stagingOnly: value.stagingOnly, fuentes: value.fuentes.map(sourceFromResponse), page: Number(value.page), totalPages: Number(value.totalPages), total: Number(value.total), canWrite: value.canWrite }
}
function contractsFromResponse(value: unknown): ContractsResponse {
  if (!isRecord(value) || typeof value.stagingOnly !== 'boolean' || typeof value.periodoServicio !== 'string' || typeof value.periodoActual !== 'string' || !Array.isArray(value.contratos)) throw new Error('La respuesta de contratos no tiene el formato esperado.')
  return { stagingOnly: value.stagingOnly, periodoServicio: value.periodoServicio, periodoActual: value.periodoActual, contratos: value.contratos as Contract[] }
}
function historyFromResponse(value: unknown): HistoryResponse {
  if (!isRecord(value) || typeof value.stagingOnly !== 'boolean' || !Array.isArray(value.historial)) throw new Error('La respuesta de historial no tiene el formato esperado.')
  return { stagingOnly: value.stagingOnly, historial: value.historial as HistoryItem[] }
}
function responseMatchesEnvironment(stagingOnly: boolean, environment: 'staging' | 'production') {
  return stagingOnly === (environment === 'staging')
}
export function canChooseSource(source: Source | null): source is Source {
  return Boolean(source && source.respuestaValida && source.sourceId && source.version > 0 && source.situacion === 'APTA' && source.estado === 'REVISADO' && !source.bloqueada)
}
export function canOpenInvoiceCandidate(source: Source | null): source is Source {
  return Boolean(source && source.respuestaValida && !source.bloqueada && (source.situacion === 'APTA' || source.situacion === 'PENDIENTE_PREPARACION' || source.situacion === 'PENDIENTE_REVISION_FUENTE'))
}
function storedConfirmationIsSafe(payloadJson: string): boolean {
  try {
    const value = JSON.parse(payloadJson)
    return isRecord(value)
      && value.action === 'confirm'
      && typeof value.fuenteId === 'string'
      && typeof value.sourceVersion === 'number'
      && typeof value.invoiceSnapshotHash === 'string'
      && typeof value.periodoServicio === 'string'
      && typeof value.clasificacion === 'string'
      && Array.isArray(value.selecciones)
      && typeof value.idempotencyKey === 'string'
  } catch { return false }
}
function savePendingConfirmation(payloadJson: string) {
  try { window.sessionStorage.setItem(PENDING_CONFIRMATION_STORAGE, payloadJson) } catch { /* Session storage can be unavailable; in-memory retry remains safe. */ }
}
function clearStoredPendingConfirmation() {
  try { window.sessionStorage.removeItem(PENDING_CONFIRMATION_STORAGE) } catch { /* Nothing to clear when storage is unavailable. */ }
}
function isConfirmationResult(value: unknown): value is ConfirmationResult {
  return isRecord(value)
    && typeof value.stagingOnly === 'boolean'
    && typeof value.idempotente === 'boolean'
    && isRecord(value.reparto)
    && typeof value.reparto.id === 'string'
    && positiveInteger(value.reparto.version)
    && typeof value.reparto.clasificacion === 'string'
}
async function sendConfirmation(payloadJson: string, environment: 'staging' | 'production'): Promise<ConfirmationResult> {
  let response: Response
  try {
    response = await fetch(API, {
      method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: payloadJson,
    })
  } catch { throw new ConfirmationUncertainError() }

  // A source/version precondition failure is a known non-write outcome. It is safe to discard this snapshot and reload.
  if (response.status === 409) {
    const body = await response.json().catch(() => null)
    throw new ApiError(typeof body?.error === 'string' ? body.error : 'La fuente cambió desde la previsualización.', 409)
  }
  // A server failure could have happened after the write committed, so retain the exact idempotent request.
  if (response.status >= 500) throw new ConfirmationUncertainError()

  let body: unknown
  try { body = await response.json() }
  catch { throw new ConfirmationUncertainError() }
  if (!response.ok) {
    if (!isRecord(body) || typeof body.error !== 'string') throw new ConfirmationUncertainError()
    throw new ApiError(body.error, response.status)
  }
  if (!isConfirmationResult(body) || !responseMatchesEnvironment(body.stagingOnly, environment)) throw new ConfirmationUncertainError()
  return body
}

export default function CustomerCostAllocationWorkspace({ environment }: { environment: 'staging' | 'production' }) {
  const searchParams = useSearchParams()
  const deepLinkedFacturaId = searchParams.get('facturaId') || ''
  const [sources, setSources] = useState<SourcesResponse | null>(null)
  const [sourcesBusy, setSourcesBusy] = useState(true)
  const [sourceSearch, setSourceSearch] = useState('')
  const [selectedSource, setSelectedSource] = useState<Source | null>(null)
  const [servicePeriod, setServicePeriod] = useState(datePeriod)
  const [contractSearch, setContractSearch] = useState('')
  const [contracts, setContracts] = useState<ContractsResponse | null>(null)
  const [contractsBusy, setContractsBusy] = useState(false)
  const [chosen, setChosen] = useState<Record<number, Contract>>({})
  const [classification, setClassification] = useState<Classification>('REPARTIBLE')
  const [reverseOf, setReverseOf] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [humanConfirmed, setHumanConfirmed] = useState(false)
  const [confirmationKey, setConfirmationKey] = useState('')
  const [pendingConfirmation, setPendingConfirmation] = useState<string | null>(null)
  const [confirmationUncertain, setConfirmationUncertain] = useState(false)
  const [pendingConfirmationLoaded, setPendingConfirmationLoaded] = useState(false)
  const [preparationConfirmed, setPreparationConfirmed] = useState(false)

  const selectedContracts = useMemo(() => Object.values(chosen).sort((a, b) => a.contratoId - b.contratoId), [chosen])
  const eligibleSelected = selectedContracts.filter(row => row.seleccionable)
  const totalWeight = useMemo(() => preview?.lineas.reduce((sum, line) => sum + BigInt(line.ventaNormalizadaDoceavosCentimo), ZERO) || ZERO, [preview])
  const reversalContracts = useMemo(() => history.find(item => item.id === reverseOf)?.contratos || [], [history, reverseOf])
  const interactionLocked = busy || Boolean(pendingConfirmation) || !pendingConfirmationLoaded
  const currentPage = sources?.page || 1

  async function loadSources(search = sourceSearch, page = currentPage, facturaId = ''): Promise<SourcesResponse | null> {
    setSourcesBusy(true); setError('')
    try {
      const query = `${API}?recurso=fuentes&page=${encodeURIComponent(String(page))}&buscar=${encodeURIComponent(search)}${facturaId ? `&facturaId=${encodeURIComponent(facturaId)}` : ''}`
      const data = sourcesFromResponse(await api<unknown>(query))
      if (!responseMatchesEnvironment(data.stagingOnly, environment)) throw new Error('La respuesta de reparto no corresponde al entorno financiero verificado.')
      setSources(data)
      return data
    } catch (cause) { setError(message(cause)); return null }
    finally { setSourcesBusy(false) }
  }
  useEffect(() => { void loadSources('', 1, deepLinkedFacturaId) }, [deepLinkedFacturaId])
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(PENDING_CONFIRMATION_STORAGE)
      if (stored && storedConfirmationIsSafe(stored)) {
        setPendingConfirmation(stored)
        setConfirmationUncertain(true)
        setError('Hay una confirmación pendiente de recuperación. No cambies la selección: reintenta exactamente la misma confirmación.')
      } else if (stored) clearStoredPendingConfirmation()
    } catch { /* Storage is optional; an in-memory pending request still remains protected. */ }
    finally { setPendingConfirmationLoaded(true) }
  }, [])
  useEffect(() => {
    if (!canChooseSource(selectedSource)) return
    const controller = new AbortController()
    setContractsBusy(true); setContracts(null); setError('')
    const timer = window.setTimeout(() => {
      api<unknown>(`${API}?recurso=contratos&fuenteId=${encodeURIComponent(selectedSource.sourceId)}&periodoServicio=${encodeURIComponent(servicePeriod)}&buscar=${encodeURIComponent(contractSearch)}`, { signal: controller.signal })
        .then(value => {
          const data = contractsFromResponse(value)
          if (!responseMatchesEnvironment(data.stagingOnly, environment)) throw new Error('La respuesta de contratos no corresponde al entorno financiero verificado.')
          if (!controller.signal.aborted) setContracts(data)
        })
        .catch(cause => { if (!controller.signal.aborted) setError(message(cause)) })
        .finally(() => { if (!controller.signal.aborted) setContractsBusy(false) })
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [selectedSource, servicePeriod, contractSearch, environment])
  useEffect(() => {
    if (!canChooseSource(selectedSource)) return
    api<unknown>(`${API}?recurso=historial&fuenteId=${encodeURIComponent(selectedSource.sourceId)}`)
      .then(value => {
        const data = historyFromResponse(value)
        if (!responseMatchesEnvironment(data.stagingOnly, environment)) throw new Error('La respuesta de historial no corresponde al entorno financiero verificado.')
        setHistory(data.historial)
      }).catch(() => setHistory([]))
  }, [selectedSource, environment])

  function clearPreviewConfirmation() {
    setPreview(null); setHumanConfirmed(false); setConfirmationKey('')
  }
  function chooseSource(source: Source) {
    if (interactionLocked || !canOpenInvoiceCandidate(source)) return
    // Retain the selected source evidence as a snapshot; later page loads cannot change this request context.
    setSelectedSource(Object.freeze({ ...source }))
    setChosen({}); clearPreviewConfirmation(); setError(''); setNotice(''); setReverseOf(''); setClassification('REPARTIBLE'); setPreparationConfirmed(false)
  }
  function toggle(contract: Contract) {
    if (interactionLocked || !contract.seleccionable || classification === 'PUNTUAL') return
    clearPreviewConfirmation()
    setChosen(previous => {
      const next = { ...previous }
      if (next[contract.contratoId]) delete next[contract.contratoId]
      else next[contract.contratoId] = contract
      return next
    })
  }
  function toggleHistorical(contract: HistoryItem['contratos'][number]) {
    if (interactionLocked) return
    clearPreviewConfirmation()
    setChosen(previous => {
      const next = { ...previous }
      if (next[contract.contratoId]) delete next[contract.contratoId]
      else next[contract.contratoId] = {
        clienteId: contract.clienteId,
        clienteNombre: contract.clienteNombre || `Cliente histórico ${contract.clienteId}`,
        contratoId: contract.contratoId,
        contratoTitulo: contract.contratoTitulo || `Contrato histórico ${contract.contratoId}`,
        tarifa: 'Snapshot histórico del reparto positivo',
        precio: null,
        unidadesPeriodoMeses: null,
        seleccionable: true,
        motivoExclusion: null,
      }
      return next
    })
  }
  function buildPayload(action: 'preview' | 'confirm') {
    if (!canChooseSource(selectedSource)) throw new Error('Prepara y revisa primero la factura para reparto.')
    const base = {
      action, fuenteId: selectedSource.sourceId, sourceVersion: selectedSource.version, invoiceSnapshotHash: selectedSource.snapshotHash,
      periodoServicio: servicePeriod, clasificacion: classification,
      selecciones: classification === 'PUNTUAL' ? [] : eligibleSelected.map(row => ({ clienteId: row.clienteId!, contratoId: row.contratoId })),
      reversionDeRepartoId: classification === 'ABONO_EXPLICITO' ? reverseOf || null : null,
    }
    return action === 'confirm' ? { ...base, idempotencyKey: confirmationKey } : base
  }
  async function prepareSelectedInvoice() {
    if (interactionLocked || !selectedSource || !canOpenInvoiceCandidate(selectedSource)) return
    if (!preparationConfirmed) return setError('Confirma que has revisado la factura antes de prepararla para reparto.')
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await api<unknown>(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prepare', facturaId: selectedSource.facturaId, invoiceSnapshotHash: selectedSource.snapshotHash, confirmarPreparacion: true }),
      })
      if (!isRecord(result) || typeof result.stagingOnly !== 'boolean' || !responseMatchesEnvironment(result.stagingOnly, environment) || typeof result.preparada !== 'boolean' || !isRecord(result.fuente) || typeof result.fuente.id !== 'string' || !positiveInteger(result.fuente.version) || typeof result.fuente.invoiceSnapshotHash !== 'string' || typeof result.fuente.estado !== 'string' || typeof result.fuente.facturaId !== 'string') throw new Error('La preparación no tiene el formato de entorno esperado.')
      const updated: Source = Object.freeze({ ...selectedSource, sourceId: result.fuente.id, version: result.fuente.version, snapshotHash: result.fuente.invoiceSnapshotHash, estado: result.fuente.estado, situacion: 'APTA', bloqueada: false, motivoBloqueo: null })
      setSelectedSource(updated)
      setSources(previous => previous ? { ...previous, fuentes: previous.fuentes.map(source => source.facturaId === updated.facturaId ? updated : source) } : previous)
      setPreparationConfirmed(false)
      setNotice(result.preparada ? 'Factura preparada y revisada para reparto. La factura original no se ha modificado.' : 'La factura ya estaba preparada para reparto; se reutiliza su fuente existente.')
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(false) }
  }
  async function makePreview() {
    if (interactionLocked) return
    setError(''); setNotice(''); setPreview(null); setHumanConfirmed(false)
    if (!canChooseSource(selectedSource)) return setError('La fuente no está disponible para reparto.')
    if (classification === 'REPARTIBLE' && !eligibleSelected.length) return setError('Selecciona explícitamente al menos un contrato verificable.')
    if (classification === 'ABONO_EXPLICITO' && (!reverseOf || !eligibleSelected.length)) return setError('Un abono exige elegir un reparto positivo vigente y mapear manualmente sus contratos.')
    setBusy(true)
    try {
      const body = await api<unknown>(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPayload('preview')) })
      if (!isRecord(body) || typeof body.stagingOnly !== 'boolean' || !responseMatchesEnvironment(body.stagingOnly, environment) || !isRecord(body.preview)) throw new Error('La previsualización no tiene el formato de entorno esperado.')
      setPreview(body.preview as unknown as Preview)
      setConfirmationKey(newKey())
    } catch (cause) { setError(message(cause)) }
    finally { setBusy(false) }
  }
  function clearPendingConfirmation() {
    setPendingConfirmation(null); setConfirmationUncertain(false); clearStoredPendingConfirmation()
  }
  function clearSourceContext() {
    setSelectedSource(null); setContracts(null); setHistory([]); setChosen({}); clearPreviewConfirmation(); setReverseOf('')
  }
  async function handleKnownConflict() {
    clearPendingConfirmation()
    clearSourceContext()
    setNotice('')
    const refreshed = await loadSources(sourceSearch, currentPage)
    setError(refreshed
      ? 'La fuente cambió o ya no está disponible. Se recargó la lista: selecciona de nuevo la fuente antes de continuar.'
      : 'La fuente cambió. No se pudo recargar la lista; vuelve a cargarla y selecciona de nuevo la fuente.')
  }
  function refreshAfterConfirmation(source: Source | null) {
    void loadSources(sourceSearch, currentPage)
    if (canChooseSource(source)) {
      void api<unknown>(`${API}?recurso=historial&fuenteId=${encodeURIComponent(source.sourceId)}`)
        .then(value => {
          const data = historyFromResponse(value)
          if (!responseMatchesEnvironment(data.stagingOnly, environment)) throw new Error('La respuesta de historial no corresponde al entorno financiero verificado.')
          setHistory(data.historial)
        }).catch(() => setHistory([]))
    }
  }
  async function submitPendingConfirmation(payloadJson: string) {
    setBusy(true); setError(''); setNotice('')
    const sourceAtSend = selectedSource
    try {
      const result = await sendConfirmation(payloadJson, environment)
      clearPendingConfirmation()
      setNotice(result.idempotente ? 'Se recuperó el recibo de la misma confirmación.' : `Decisión ${result.reparto.version} guardada de forma auditable. No se modificó la factura original.`)
      clearPreviewConfirmation(); setChosen({})
      refreshAfterConfirmation(sourceAtSend)
    } catch (cause) {
      if (cause instanceof ConfirmationUncertainError) {
        setConfirmationUncertain(true)
        setError('No se pudo determinar si la confirmación se guardó. La selección permanece bloqueada; reintenta exactamente la misma confirmación.')
      } else if (cause instanceof ApiError && cause.status === 409) {
        await handleKnownConflict()
      } else {
        // Other client-side rejections are known outcomes and cannot be retried with this stale snapshot.
        clearPendingConfirmation()
        setError(message(cause))
      }
    } finally { setBusy(false) }
  }
  async function confirm() {
    if (pendingConfirmation) return submitPendingConfirmation(pendingConfirmation)
    if (!preview || !humanConfirmed || busy || interactionLocked) return
    if (!confirmationKey) return setError('Vuelve a generar la previsualización antes de confirmar.')
    const payloadJson = confirmationPayloadJson(buildPayload('confirm'))
    // Store before sending. Every uncertain retry uses this byte-for-byte snapshot and its original idempotency key.
    savePendingConfirmation(payloadJson)
    setPendingConfirmation(payloadJson)
    setConfirmationUncertain(false)
    await submitPendingConfirmation(payloadJson)
  }

  return <main className="mx-auto max-w-7xl space-y-6 pb-10 text-slate-900">
    <header className="rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-blue-800">Finanzas · {environment === 'production' ? 'producción con confirmación manual' : 'staging aislado'}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Reparto de coste entre clientes</h1>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-700">El peso se calcula con la venta contractual sin IVA de los contratos que selecciones explícitamente, nunca con el banco ni con una selección automática de clientes. Los costes puntuales quedan fuera de la bolsa compartida.</p>
        </div>
        {interactionLocked
          ? <span aria-disabled="true" className="inline-flex shrink-0 cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-500">Volver a costes de operadora</span>
          : <Link href="/admin/finanzas/analitica-costes/costes-operadora" className="inline-flex shrink-0 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-700">Volver a costes de operadora</Link>}
      </div>
    </header>

    {error && <p role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-950"><ExclamationTriangleIcon className="mr-2 inline h-5 w-5" />{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-950"><CheckCircleIcon className="mr-2 inline h-5 w-5" />{notice}</p>}
    {confirmationUncertain && pendingConfirmation && <section role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-sm text-amber-950">
      <h2 className="font-bold">Confirmación pendiente de recuperación</h2>
      <p className="mt-1">No cambies la fuente, el período, la clasificación ni los contratos. Sólo se puede reintentar el mismo envío con su clave original.</p>
      <button type="button" disabled={busy} onClick={() => void submitPendingConfirmation(pendingConfirmation)} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><ArrowPathIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Reintentar la misma confirmación</button>
    </section>}

    <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="source-heading">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 id="source-heading" className="text-lg font-bold">1. Factura de proveedor</h2><p className="mt-1 text-sm text-slate-700">Abre una factura económica válida. Si aún no está preparada, revísala y confírmala expresamente antes de clasificarla. Las que ya tienen un coste directo se bloquean para evitar doble conteo.</p></div>
        <button type="button" onClick={() => void loadSources(sourceSearch, currentPage)} disabled={sourcesBusy || interactionLocked} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold hover:bg-slate-50 disabled:opacity-60"><ArrowPathIcon className={`h-4 w-4 ${sourcesBusy ? 'animate-spin' : ''}`} />Actualizar</button>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex gap-2"><div className="relative flex-1"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600" /><input disabled={interactionLocked} value={sourceSearch} onChange={e => setSourceSearch(e.target.value)} onKeyDown={e => { if (!interactionLocked && e.key === 'Enter') void loadSources(sourceSearch, 1) }} placeholder="Proveedor o número de factura" className={`${input} pl-9`} /></div><button type="button" disabled={interactionLocked} onClick={() => void loadSources(sourceSearch, 1)} className="rounded-lg bg-blue-800 px-4 text-sm font-bold text-white hover:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-60">Buscar</button></div>
        {selectedSource && <div className="mb-4 rounded-lg border border-blue-300 bg-blue-50 p-3 text-sm text-blue-950"><strong>Factura elegida:</strong> {selectedSource.proveedor} · {selectedSource.numFactura || 'sin número'} · {money(selectedSource.base)} base sin IVA.</div>}
        <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-700"><tr><th className="px-3 py-3">Proveedor</th><th className="px-3 py-3">Factura</th><th className="px-3 py-3">Base sin IVA</th><th className="px-3 py-3">Para reparto</th><th className="px-3 py-3"><span className="sr-only">Abrir</span></th></tr></thead><tbody>{sources?.fuentes.map(source => <tr key={source.rowKey} className={`border-t border-slate-200 ${selectedSource?.facturaId === source.facturaId ? 'bg-blue-50' : ''}`}><td className="px-3 py-3 font-semibold">{source.proveedor}<div className="mt-1 text-xs font-normal text-slate-600">{source.fecha || 'Fecha no disponible'}</div></td><td className="px-3 py-3">{source.numFactura || '—'}</td><td className="px-3 py-3 tabular-nums">{money(source.base)}</td><td className="px-3 py-3">{!source.respuestaValida ? <span className="font-bold text-red-800">No disponible</span> : source.bloqueada ? <span className="font-bold text-red-800">Bloqueada · coste directo</span> : source.situacion === 'PENDIENTE_PREPARACION' ? <span className="font-bold text-amber-900">Pendiente de preparar</span> : source.situacion === 'PENDIENTE_REVISION_FUENTE' ? <span className="font-bold text-amber-900">Pendiente de revisar</span> : source.clasificacionActual ? <span>Decisión vigente: {source.clasificacionActual}</span> : <span className="font-bold text-emerald-800">Apta</span>}</td><td className="px-3 py-3 text-right"><button type="button" disabled={interactionLocked || !canOpenInvoiceCandidate(source)} onClick={() => chooseSource(source)} className="rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-bold text-blue-950 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50">{selectedSource?.facturaId === source.facturaId ? 'Abierta' : 'Abrir'}</button></td></tr>)}</tbody></table></div>
        {!sourcesBusy && sources?.fuentes.length === 0 && <p className="py-7 text-center text-sm text-slate-700">No hay facturas económicas válidas que coincidan con la búsqueda.</p>}
        <div className="mt-3 flex flex-col gap-2 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between"><p>{sources ? <>Página {sources.page} de {sources.totalPages} · {sources.total} fuente(s)</> : 'Cargando fuentes…'}</p><div className="flex gap-2"><button type="button" disabled={interactionLocked || sourcesBusy || !sources || sources.page <= 1} onClick={() => void loadSources(sourceSearch, currentPage - 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Anterior</button><button type="button" disabled={interactionLocked || sourcesBusy || !sources || sources.page >= sources.totalPages} onClick={() => void loadSources(sourceSearch, currentPage + 1)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-bold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button></div></div>
      </div>
    </section>

    {selectedSource && !canChooseSource(selectedSource) && <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm sm:p-5" aria-labelledby="prepare-heading">
      <h2 id="prepare-heading" className="text-lg font-bold text-amber-950">2. Revisar y preparar esta factura</h2>
      <p className="mt-1 max-w-4xl text-sm leading-6 text-amber-950">Esta factura es económica y válida, pero todavía no está preparada para reparto. Esta acción crea o revisa su fuente de coste con un snapshot y auditoría; no cambia importes, estado fiscal, OCR, documento ni imputaciones de la factura.</p>
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-900"><input type="checkbox" disabled={interactionLocked || !sources?.canWrite} checked={preparationConfirmed} onChange={event => setPreparationConfirmed(event.target.checked)} /><span><strong>Confirmo que he revisado esta factura para clasificarla individualmente.</strong> Entiendo que la fuente quedará preparada para decidir si es repartible o puntual, sin clasificar otras facturas del proveedor.</span></label>
      <button type="button" disabled={interactionLocked || !sources?.canWrite || !preparationConfirmed} onClick={() => void prepareSelectedInvoice()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><CheckCircleIcon className="h-4 w-4" />Preparar factura para reparto</button>
    </section>}

    {canChooseSource(selectedSource) && <>
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="method-heading">
        <div className="border-b border-slate-200 px-4 py-4 sm:px-5"><h2 id="method-heading" className="text-lg font-bold">2. Decisión humana y período de servicio</h2><p className="mt-1 text-sm text-slate-700">La vigencia se comprueba para el período indicado. Si no hay precio histórico comprobable, el contrato queda excluido y no se inventa una tasa.</p></div>
        <fieldset disabled={interactionLocked} className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5"><label><span className="mb-1.5 block text-sm font-bold">Mes de servicio</span><input type="month" value={servicePeriod} onChange={e => { if (interactionLocked) return; setServicePeriod(e.target.value); setChosen({}); clearPreviewConfirmation() }} className={input} /></label><div className="sm:col-span-2"><span className="mb-1.5 block text-sm font-bold">Clasificación de esta factura</span><div className="grid gap-2 sm:grid-cols-3"><label className={`cursor-pointer rounded-lg border p-3 text-sm ${classification === 'REPARTIBLE' ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}><input type="radio" checked={classification === 'REPARTIBLE'} onChange={() => { if (interactionLocked) return; setClassification('REPARTIBLE'); setChosen({}); clearPreviewConfirmation() }} /> <strong>Repartible</strong><span className="mt-1 block text-xs text-slate-700">Sólo contratos que selecciones.</span></label><label className={`cursor-pointer rounded-lg border p-3 text-sm ${classification === 'PUNTUAL' ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}><input type="radio" checked={classification === 'PUNTUAL'} onChange={() => { if (interactionLocked) return; setClassification('PUNTUAL'); setChosen({}); clearPreviewConfirmation() }} /> <strong>Puntual</strong><span className="mt-1 block text-xs text-slate-700">Fuera de coste compartido; no es cero.</span></label><label className={`cursor-pointer rounded-lg border p-3 text-sm ${classification === 'ABONO_EXPLICITO' ? 'border-blue-700 bg-blue-50' : 'border-slate-300'}`}><input type="radio" checked={classification === 'ABONO_EXPLICITO'} onChange={() => { if (interactionLocked) return; setClassification('ABONO_EXPLICITO'); setChosen({}); clearPreviewConfirmation() }} /> <strong>Abono explícito</strong><span className="mt-1 block text-xs text-slate-700">Sólo para base negativa y reversión manual.</span></label></div></div>
          {classification === 'ABONO_EXPLICITO' && <label className="sm:col-span-3"><span className="mb-1.5 block text-sm font-bold">Reparto positivo que se revierte</span><select value={reverseOf} onChange={e => { if (interactionLocked) return; setReverseOf(e.target.value); setChosen({}); clearPreviewConfirmation() }} className={input}><option value="">Selecciona un reparto vigente…</option>{history.filter(item => item.estado === 'VIGENTE' && item.clasificacion === 'REPARTIBLE' && BigInt(item.costeCentimos) > ZERO).map(item => <option key={item.id} value={item.id}>Versión {item.version} · {item.periodoServicio} · {cents(item.costeCentimos)}</option>)}</select></label>}
        </fieldset>
      </section>

      {classification === 'ABONO_EXPLICITO' && reverseOf && <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="credit-contracts-heading">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 id="credit-contracts-heading" className="text-lg font-bold">3. Mapeo manual del abono</h2><p className="mt-1 text-sm text-slate-700">Marca expresamente cada contrato guardado en el reparto positivo. Se usan sus snapshots originales, no la vigencia ni el precio actual.</p></div><p className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{eligibleSelected.length} de {reversalContracts.length} contrato(s) marcado(s)</p></div>
        <div className="p-4 sm:p-5"><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-700"><tr><th className="px-3 py-3">Mapear</th><th className="px-3 py-3">Cliente histórico</th><th className="px-3 py-3">Contrato snapshot</th></tr></thead><tbody>{reversalContracts.map(contract => <tr key={contract.contratoId} className="border-t border-slate-200"><td className="px-3 py-3"><input type="checkbox" aria-label={`Mapear ${contract.contratoTitulo || 'contrato histórico'}`} disabled={interactionLocked} checked={Boolean(chosen[contract.contratoId])} onChange={() => toggleHistorical(contract)} /></td><td className="px-3 py-3 font-semibold">{contract.clienteNombre || `Cliente histórico ${contract.clienteId}`}</td><td className="px-3 py-3">{contract.contratoTitulo || `Contrato histórico ${contract.contratoId}`}</td></tr>)}</tbody></table></div>{reversalContracts.length === 0 && <p className="py-6 text-center text-sm text-amber-900">El reparto seleccionado no tiene contratos snapshot utilizables para reversión.</p>}</div>
      </section>}

      {classification === 'REPARTIBLE' && <section className="rounded-xl border border-slate-200 bg-white shadow-sm" aria-labelledby="contracts-heading">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"><div><h2 id="contracts-heading" className="text-lg font-bold">3. Clientes y contratos seleccionados manualmente</h2><p className="mt-1 text-sm text-slate-700">No se selecciona ningún cliente automáticamente. La venta es el precio contractual, no el importe bancario.</p></div><p className="rounded-md bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">{eligibleSelected.length} contrato(s) elegido(s)</p></div>
        <div className="p-4 sm:p-5"><div className="relative mb-3"><MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-600" /><input disabled={interactionLocked} value={contractSearch} onChange={e => setContractSearch(e.target.value)} placeholder="Buscar cliente, título o tarifa" className={`${input} pl-9`} /></div><div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-700"><tr><th className="px-3 py-3">Incluir</th><th className="px-3 py-3">Cliente · contrato</th><th className="px-3 py-3">Venta contractual</th><th className="px-3 py-3">Verificación</th></tr></thead><tbody>{contractsBusy ? <tr><td className="px-3 py-8 text-center text-slate-700" colSpan={4}>Cargando contratos…</td></tr> : contracts?.contratos.map(contract => <tr key={contract.contratoId} className="border-t border-slate-200"><td className="px-3 py-3"><input type="checkbox" aria-label={`Incluir ${contract.contratoTitulo}`} checked={Boolean(chosen[contract.contratoId])} disabled={interactionLocked || !contract.seleccionable} onChange={() => toggle(contract)} /></td><td className="px-3 py-3"><strong>{contract.clienteNombre || 'Cliente no verificable'}</strong><div className="mt-1 text-xs text-slate-700">{contract.contratoTitulo} · {contract.tarifa}</div></td><td className="px-3 py-3 tabular-nums">{contract.precio === null ? '—' : `${money(contract.precio)} / ${contract.unidadesPeriodoMeses === 12 ? 'año' : contract.unidadesPeriodoMeses === 3 ? 'trimestre' : 'mes'}`}</td><td className="px-3 py-3">{contract.seleccionable ? <span className="font-bold text-emerald-800">Verificado</span> : <span className="text-amber-900">{reason(contract.motivoExclusion)}</span>}</td></tr>)}</tbody></table></div>{!contractsBusy && contracts?.contratos.length === 0 && <p className="py-7 text-center text-sm text-slate-700">No se encontraron contratos.</p>}</div>
      </section>}

      <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 shadow-sm sm:p-5" aria-labelledby="preview-heading">
        <h2 id="preview-heading" className="text-lg font-bold text-slate-950">4. Previsualizar antes de guardar</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-700">La previsualización no escribe. Vuelve a comprobar la fuente, vigencia, precio, periodicidad y duplicados. Los céntimos se distribuyen por mayor residuo, con desempate estable por ID de cliente.</p>
        <button type="button" disabled={interactionLocked || (classification !== 'PUNTUAL' && !eligibleSelected.length)} onClick={() => void makePreview()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><ArrowPathIcon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />Previsualizar reparto</button>
        {preview && <div className="mt-5 rounded-xl border border-blue-200 bg-white p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-bold">Resultado a confirmar</h3><p className="mt-1 text-sm text-slate-700">Base: {cents(preview.fuente.costeCentimos)} · {preview.clasificacion} · servicio {preview.periodoServicio}</p></div>{preview.pendienteBolsa && <span className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-950">Bolsa sin asignar puntual</span>}</div>{preview.aviso && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{preview.aviso}</p>}
          {preview.lineas.length > 0 && <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-700"><tr><th className="px-3 py-3">Cliente</th><th className="px-3 py-3">Contratos</th><th className="px-3 py-3">Peso contractual</th><th className="px-3 py-3">Coste exacto</th></tr></thead><tbody>{preview.lineas.map(line => <tr key={line.clienteId} className="border-t border-slate-200"><td className="px-3 py-3 font-semibold">{line.clienteNombre}</td><td className="px-3 py-3">{line.contratoIds.length === 1 ? '1 contrato seleccionado' : `${line.contratoIds.length} contratos seleccionados`}</td><td className="px-3 py-3 tabular-nums">{weightPercentage(line.ventaNormalizadaDoceavosCentimo, totalWeight)}</td><td className="px-3 py-3 font-bold tabular-nums">{cents(line.costeCentimos)}</td></tr>)}</tbody></table></div>}
          <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-3"><label className="flex cursor-pointer items-start gap-2 text-sm text-slate-900"><input type="checkbox" disabled={interactionLocked} checked={humanConfirmed} onChange={e => { if (!interactionLocked) setHumanConfirmed(e.target.checked) }} /><span><strong>Confirmo esta decisión manual.</strong> He revisado clientes, contratos, pesos por venta contractual y coste. Sé que se creará una nueva decisión auditada y que el historial anterior se conserva.</span></label><button type="button" disabled={interactionLocked || !humanConfirmed} onClick={() => void confirm()} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"><CheckCircleIcon className="h-4 w-4" />Confirmar y guardar decisión</button></div>
        </div>}
      </section>

      {history.length > 0 && <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-4 py-4 sm:px-5"><h2 className="text-lg font-bold">Historial de decisiones</h2><p className="mt-1 text-sm text-slate-700">Historial conservado. Una nueva decisión mantiene las anteriores para auditoría y puede actualizar su estado.</p></div><ul className="divide-y divide-slate-200">{history.map(item => <li key={item.id} className="flex flex-col gap-1 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span><strong>V{item.version}</strong> · {item.clasificacion} · {item.estado} · servicio {item.periodoServicio}</span><span className="tabular-nums">{cents(item.costeCentimos)} · {item.creadoPor}</span></li>)}</ul></section>}
    </>}
  </main>
}
