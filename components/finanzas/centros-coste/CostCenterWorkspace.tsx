'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { usePermisoArea } from '@/hooks/usePermisoArea'
import {
  AnaliticaResponse,
  Centro,
  Gap,
  Linea,
  LineasResponse,
  Paginacion,
  formatEuroCentimos,
  isCalendarDate,
  parseAnaliticaResponse,
  parseCatalogResponse,
  parseLineasResponse,
} from './CostCenterWorkspace.parsers'

const AREA = 'admin.finanzas.conciliacion'
const LINES_LIMIT = 50
const CENTROS_URL = '/api/admin/finanzas/centros-coste'
const ASIGNAR_URL = '/api/admin/finanzas/centros-coste/asignar'

type Notice = { kind: 'ok' | 'error' | 'info'; text: string } | null
type CatalogMode = 'closed' | 'create' | 'edit'
type LoadOptions = Readonly<{ pagina?: number; preserveNotice?: boolean }>

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function message(value: unknown, fallback: string): string {
  return value !== null && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
    ? (value as { error: string }).error
    : fallback
}

function noStore(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { cache: 'no-store', ...init })
}

function uuid(): string {
  // The server validates this as a UUID. randomUUID is available in supported browsers.
  return crypto.randomUUID()
}

function catalogLabel(center: Centro): string {
  return `${center.codigo} · ${center.nombre}${center.activo ? '' : ' (inactivo)'}`
}

function appliedCenterLabel(line: Linea, catalogById: ReadonlyMap<string, Centro>): string {
  if (line.centroCosteFinanzasId === null) return 'Sin centro de coste'
  const center = catalogById.get(line.centroCosteFinanzasId)
  return center ? catalogLabel(center) : `${line.centroCosteCodigo ?? 'Centro histórico'} (no disponible en catálogo)`
}

/**
 * B8 UI: it displays only server-validated reads and sends only explicit PATCH
 * assignment commands. It never derives a centre, an amount, a document link,
 * or a default catalogue entry on the client.
 */
export default function CostCenterWorkspace() {
  const { data: session, status: sessionStatus } = useSession()
  const { canWrite } = usePermisoArea(AREA)
  // lib/auth.ts writes token.role into session.user.role; types/next-auth.d.ts makes
  // that optional field explicit. This is UI gating only: the service is authoritative.
  const canManageCatalog = sessionStatus === 'authenticated' && session.user?.role === 'SUPER_ADMIN'

  const [catalogo, setCatalogo] = useState<readonly Centro[]>([])
  const [analitica, setAnalitica] = useState<AnaliticaResponse | null>(null)
  const [lineas, setLineas] = useState<readonly Linea[]>([])
  const [paginacion, setPaginacion] = useState<Paginacion | null>(null)
  const [catalogGaps, setCatalogGaps] = useState<readonly Gap[]>([])
  const [lineGaps, setLineGaps] = useState<readonly Gap[]>([])
  const [fechaCorte, setFechaCorte] = useState(todayIso)
  const [loading, setLoading] = useState(true)
  const [readFailed,setReadFailed] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [catalogMode, setCatalogMode] = useState<CatalogMode>('closed')
  const [edicion, setEdicion] = useState<Centro | null>(null)
  const [codigo, setCodigo] = useState('')
  const [nombre, setNombre] = useState('')

  const mountedRef = useRef(true)
  const loadTokenRef = useRef(0)
  /** A failed manual retry obtains the exact same key for the same command payload. */
  const assignmentKeysRef = useRef(new Map<string, string>())

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const load = useCallback(async ({ pagina, preserveNotice = false }: LoadOptions = {}): Promise<boolean> => {
    const page = pagina ?? 1
    if (!isCalendarDate(fechaCorte)) {
      setReadFailed(true)
      setNotice({ kind: 'error', text: 'La fecha de corte debe ser una fecha de calendario YYYY-MM-DD.' })
      return false
    }

    const token = ++loadTokenRef.current
    setLoading(true)
    try {
      const [catalogResponse, analyticResponse, linesResponse] = await Promise.all([
        noStore(`${CENTROS_URL}?recurso=centros&incluirInactivos=true`),
        noStore(`${CENTROS_URL}?recurso=analitica&fechaCorte=${encodeURIComponent(fechaCorte)}`),
        noStore(`${CENTROS_URL}?recurso=lineas-confirmadas&pagina=${page}&limit=${LINES_LIMIT}`),
      ])
      const [catalogJson, analyticJson, linesJson] = await Promise.all([
        catalogResponse.json().catch(() => null),
        analyticResponse.json().catch(() => null),
        linesResponse.json().catch(() => null),
      ])
      if (!catalogResponse.ok) throw new Error(message(catalogJson, 'No se pudo leer el catálogo B8.'))
      if (!analyticResponse.ok) throw new Error(message(analyticJson, 'No se pudo leer la analítica B8.'))
      if (!linesResponse.ok) throw new Error(message(linesJson, 'No se pudieron leer las líneas B4 confirmadas.'))

      // Parse the complete triplet before updating any state: a malformed source
      // cannot turn into partial screen data or an implicit amount of zero.
      const catalog = parseCatalogResponse(catalogJson)
      const analytic = parseAnaliticaResponse(analyticJson)
      const currentLines = parseLineasResponse(linesJson)
      if (currentLines.paginacion.pagina !== page || currentLines.paginacion.limit !== LINES_LIMIT) {
        throw new Error('La paginación devuelta por B8 no corresponde a la solicitud; relea antes de asignar.')
      }
      if (analytic.fechaCorte !== fechaCorte) {
        throw new Error('La fecha de corte devuelta por B8 no corresponde a la lectura solicitada.')
      }

      if (!mountedRef.current || token !== loadTokenRef.current) return false
      setReadFailed(false)
      setCatalogo(catalog)
      setAnalitica(analytic)
      setLineas(currentLines.items)
      setPaginacion(currentLines.paginacion)
      setCatalogGaps(analytic.gaps)
      setLineGaps(currentLines.gaps)
      // This is only initial/current assignment state from the successful page;
      // it never replaces an unknown value with an empty selection.
      setChoices(Object.fromEntries(currentLines.items.map((line) => [line.id, line.centroCosteFinanzasId ?? ''])))
      if (!preserveNotice) setNotice(null)
      return true
    } catch (error) {
      if (!mountedRef.current || token !== loadTokenRef.current) return false
      setReadFailed(true)
      setNotice({ kind: 'error', text: (error instanceof Error ? error.message : 'No se pudo cargar B8.')+' Se conserva la última lectura válida sólo para consulta; las asignaciones están bloqueadas hasta recargar.' })
      return false
    } finally {
      if (mountedRef.current && token === loadTokenRef.current) setLoading(false)
    }
  }, [fechaCorte])

  useEffect(() => { void load({ pagina: 1 }) }, [load])

  const blocked = loading || busy !== null || readFailed
  const catalogById = useMemo(() => new Map(catalogo.map((center) => [center.id, center])), [catalogo])
  const activeCentros = useMemo(() => catalogo.filter((center) => center.activo), [catalogo])

  function closeCatalogForm(): void {
    setCatalogMode('closed')
    setEdicion(null)
    setCodigo('')
    setNombre('')
  }

  function startCreate(): void {
    if (!canManageCatalog || blocked) return
    // Blank form; B8 does not create default centres.
    setCatalogMode('create')
    setEdicion(null)
    setCodigo('')
    setNombre('')
  }

  function startEdit(center: Centro): void {
    if (!canManageCatalog || blocked) return
    setCatalogMode('edit')
    setEdicion(center)
    setCodigo(center.codigo)
    setNombre(center.nombre)
  }

  async function submitCatalog(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!canManageCatalog || blocked || catalogMode === 'closed') return
    if (catalogMode === 'edit' && edicion === null) {
      setNotice({ kind: 'error', text: 'Falta la versión del centro a editar; relea el catálogo.' })
      return
    }

    const editing = catalogMode === 'edit'
    setBusy('catalog')
    try {
      // The existing POST contract intentionally rejects a version for creation.
      // PATCH carries the current server version for optimistic concurrency.
      const body = editing
        ? { mode: 'editar', id: edicion!.id, version: edicion!.version, codigo, nombre }
        : { codigo, nombre }
      const response = await noStore(CENTROS_URL, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(message(json, 'No se pudo guardar el centro de coste.'))
      const reread = await load({ pagina: paginacion?.pagina ?? 1, preserveNotice: true })
      if (!reread) return
      closeCatalogForm()
      setNotice({ kind: 'ok', text: editing ? 'Centro actualizado y catálogo recargado.' : 'Centro creado y catálogo recargado.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar el centro.' })
    } finally {
      if (mountedRef.current) setBusy(null)
    }
  }

  async function deactivate(center: Centro): Promise<void> {
    if (!canManageCatalog || blocked) return
    if (!window.confirm(`Desactivar ${catalogLabel(center)}? La historia se conserva y no podrá recibir nuevas imputaciones.`)) return

    setBusy(`catalog:${center.id}`)
    try {
      const response = await noStore(CENTROS_URL, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'desactivar', id: center.id, version: center.version }),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(message(json, 'No se pudo desactivar el centro.'))
      const reread = await load({ pagina: paginacion?.pagina ?? 1, preserveNotice: true })
      if (!reread) return
      setNotice({ kind: 'ok', text: 'Centro desactivado y catálogo recargado. Las imputaciones históricas se conservan.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo desactivar el centro.' })
    } finally {
      if (mountedRef.current) setBusy(null)
    }
  }

  function assignmentPayloadSignature(line: Linea, desired: string): string {
    return JSON.stringify({
      mode: desired === '' ? 'desasignar' : 'asignar',
      vinculoMovimientoDocumentoId: line.id,
      centroCosteFinanzasId: desired === '' ? null : desired,
      versionCentroCoste: line.versionCentroCoste,
    })
  }

  function desiredCenterLabel(line: Linea, desired: string): string {
    if (desired === '') return 'Sin centro de coste'
    const center = catalogById.get(desired)
    return center ? catalogLabel(center) : desired === line.centroCosteFinanzasId
      ? appliedCenterLabel(line, catalogById)
      : 'Centro no disponible (no se enviará)'
  }

  async function applyLine(line: Linea): Promise<void> {
    if (!canWrite || blocked) return
    const desired = choices[line.id] ?? line.centroCosteFinanzasId ?? ''
    const current = line.centroCosteFinanzasId ?? ''
    if (desired === current) return
    if (desired !== '' && !catalogById.get(desired)?.activo) {
      setNotice({ kind: 'error', text: 'El centro seleccionado no está activo o no consta en el catálogo actual. Relea antes de asignar.' })
      return
    }

    const before = appliedCenterLabel(line, catalogById)
    const after = desiredCenterLabel(line, desired)
    const confirmed = window.confirm(
      `Revise la imputación B8 antes de aplicarla:\n\n` +
      `Movimiento: ${line.movimientoId}\n` +
      `Referencia documental: ${line.referencia}\n` +
      `Centro anterior: ${before}\n` +
      `Centro nuevo: ${after}\n\n` +
      `Esta acción sólo cambia la imputación B8 de esta línea. No modifica el vínculo, el documento ni ningún importe.`
    )
    if (!confirmed) return

    const signature = assignmentPayloadSignature(line, desired)
    // Keep the key after an error. A user-initiated retry of this exact payload
    // gets the same idempotency key; there is intentionally no automatic resend.
    const idempotencyKey = assignmentKeysRef.current.get(signature) ?? uuid()
    assignmentKeysRef.current.set(signature, idempotencyKey)
    const body = desired === ''
      ? { mode: 'desasignar', vinculoMovimientoDocumentoId: line.id, centroCosteFinanzasId: null, versionCentroCoste: line.versionCentroCoste, idempotencyKey }
      : { mode: 'asignar', vinculoMovimientoDocumentoId: line.id, centroCosteFinanzasId: desired, versionCentroCoste: line.versionCentroCoste, idempotencyKey }

    setBusy(`line:${line.id}`)
    try {
      const response = await noStore(ASIGNAR_URL, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await response.json().catch(() => null)
      if (!response.ok) throw new Error(message(json, 'No se pudo registrar la imputación explícita.'))
      const reread = await load({ pagina: paginacion?.pagina ?? 1, preserveNotice: true })
      if (!reread) return
      assignmentKeysRef.current.delete(signature)
      setNotice({ kind: 'ok', text: desired === '' ? 'Centro desasignado explícitamente y lectura recargada.' : 'Centro asignado explícitamente y lectura recargada.' })
    } catch (error) {
      setNotice({ kind: 'error', text: error instanceof Error ? error.message : 'No se pudo aplicar la imputación. Puede reintentar manualmente la misma solicitud.' })
    } finally {
      if (mountedRef.current) setBusy(null)
    }
  }

  async function goToPage(page: number): Promise<void> {
    if (blocked || !Number.isSafeInteger(page) || page < 1) return
    await load({ pagina: page })
  }

  return <main className="mx-auto min-w-0 max-w-[1600px] space-y-5 p-4 text-slate-900 sm:p-6">
    <header className="flex min-w-0 flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange-700">B8 · analítica explícita</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Centros de coste</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Selección humana por línea DOCUMENTO confirmada. No se infiere desde categoría, operadora o documento; los importes B4 no se editan.</p>
      </div>
      <button type="button" onClick={() => void load({ pagina: paginacion?.pagina ?? 1 })} disabled={loading || busy !== null} className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
        {loading ? 'Actualizando…' : 'Actualizar'}
      </button>
    </header>

    {!canWrite && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Modo consulta.</strong> Puede leer catálogo, analítica y líneas actuales; no puede cambiar imputaciones.</p>}
    {sessionStatus !== 'loading' && !canManageCatalog && <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><strong>Catálogo en consulta.</strong> Sólo el rol de sesión <code>SUPER_ADMIN</code> puede ver controles de creación, edición o desactivación. El servidor vuelve a comprobarlo.</p>}
    {notice && <p role={notice.kind === 'error' ? 'alert' : 'status'} className={`rounded-lg border p-3 text-sm ${notice.kind === 'error' ? 'border-red-200 bg-red-50 text-red-950' : notice.kind === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-blue-200 bg-blue-50 text-blue-950'}`}>{notice.text}</p>}

    <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
      <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div><h2 className="font-bold">Catálogo explícito</h2><p className="mt-1 text-xs text-slate-600">Incluye inactivos para preservar las imputaciones históricas. No se crean centros por defecto.</p></div>
          {canManageCatalog && <button type="button" onClick={startCreate} disabled={blocked} className="min-h-11 rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Nuevo centro</button>}
        </div>
        <div aria-busy={loading} className="min-h-[12rem] max-h-[28rem] overflow-y-auto [overflow-x:auto!important] overscroll-contain">
          <table className="min-w-[38rem] w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Código</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Estado</th><th className="relative px-4 py-3"><span className="sr-only">Acciones del catálogo</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {catalogo.map((center) => <tr key={center.id}><td className="px-4 py-3 font-mono font-semibold">{center.codigo}</td><td className="px-4 py-3">{center.nombre}</td><td className="px-4 py-3">{center.activo ? 'Activo' : 'Inactivo'}</td><td className="relative px-4 py-3 text-right whitespace-nowrap">{canManageCatalog && center.activo && <><button type="button" onClick={() => startEdit(center)} disabled={blocked} className="mr-3 font-semibold text-orange-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50">Editar</button><button type="button" disabled={blocked} onClick={() => void deactivate(center)} className="font-semibold text-red-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50">Desactivar</button></>}</td></tr>)}
              {!loading && catalogo.length === 0 && <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-500">No hay centros. Sólo un responsable raíz puede crear uno de manera explícita.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {canManageCatalog && catalogMode !== 'closed' && <form onSubmit={(event) => void submitCatalog(event)} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-bold">{catalogMode === 'edit' ? 'Editar centro' : 'Crear centro'}</h2>
        <p className="mt-1 text-xs text-slate-600">{catalogMode === 'edit' ? `Edición con versión ${edicion?.version ?? 'desconocida'}; una lectura obsoleta será rechazada.` : 'Campos vacíos: no se propone ni crea un centro por defecto.'}</p>
        <label className="mt-4 block text-sm font-semibold">Código<input required value={codigo} onChange={(event) => setCodigo(event.target.value.toUpperCase())} maxLength={64} disabled={blocked} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-100" placeholder="ESTRUCTURA.ADMIN" /></label>
        <label className="mt-3 block text-sm font-semibold">Nombre<input required value={nombre} onChange={(event) => setNombre(event.target.value)} maxLength={160} disabled={blocked} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" placeholder="Administración" /></label>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={blocked} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy === 'catalog' ? 'Guardando…' : catalogMode === 'edit' ? 'Guardar' : 'Crear centro'}</button><button type="button" disabled={blocked} onClick={closeCatalogForm} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button></div>
      </form>}
    </section>

    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-4"><h2 className="font-bold">Líneas DOCUMENTO actualmente confirmadas</h2><p className="mt-1 text-xs text-slate-600">Página servida por B8. La asignación requiere fuente B4 actual, cierre exacto y operación activa APLICADA. No cambia vínculo, documento ni importe.</p></div>
      <div aria-busy={loading} className="min-h-[20rem] max-h-[32rem] overflow-y-auto [overflow-x:auto!important] overscroll-contain">
        <table className="min-w-[58rem] w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Documento</th><th className="px-4 py-3">Centro actual</th><th className="px-4 py-3">Nueva selección</th><th className="relative px-4 py-3"><span className="sr-only">Acción de imputación</span></th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {lineas.map((line) => {
              const selected = choices[line.id] ?? line.centroCosteFinanzasId ?? ''
              const retainedInactive = line.centroCosteFinanzasId !== null && !catalogById.get(line.centroCosteFinanzasId)?.activo
              return <tr key={line.id}>
                <td className="px-4 py-3 whitespace-nowrap">{line.fechaOperacion}</td>
                <td className="max-w-[20rem] truncate px-4 py-3" title={line.referencia}>{line.referencia}</td>
                <td className="px-4 py-3">{appliedCenterLabel(line, catalogById)}</td>
                <td className="px-4 py-3"><select value={selected} onChange={(event) => setChoices((previous) => ({ ...previous, [line.id]: event.target.value }))} disabled={!canWrite || blocked} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 disabled:bg-slate-100"><option value="">Sin centro de coste</option>{retainedInactive && <option value={line.centroCosteFinanzasId!} disabled>{appliedCenterLabel(line, catalogById)}</option>}{activeCentros.map((center) => <option key={center.id} value={center.id}>{catalogLabel(center)}</option>)}</select></td>
                <td className="relative px-4 py-3 text-right"><button type="button" onClick={() => void applyLine(line)} disabled={!canWrite || blocked || selected === (line.centroCosteFinanzasId ?? '')} className="min-h-11 rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-900 disabled:cursor-not-allowed disabled:opacity-50">{busy === `line:${line.id}` ? 'Aplicando…' : 'Aplicar'}</button></td>
              </tr>
            })}
            {!loading && lineas.length === 0 && <tr><td colSpan={5} className="px-4 py-7 text-center text-slate-500">No hay líneas B4 actuales asignables en esta página.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-4 text-sm">
        <p className="text-slate-600">{paginacion ? `Página ${paginacion.pagina} · hasta ${paginacion.limit} líneas por página` : 'Paginación pendiente de lectura válida.'}</p>
        <div className="flex gap-2"><button type="button" onClick={() => void goToPage((paginacion?.pagina ?? 1) - 1)} disabled={blocked || !paginacion || paginacion.pagina <= 1} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50">Anterior</button><button type="button" onClick={() => void goToPage(paginacion?.siguientePagina ?? 0)} disabled={blocked || paginacion?.siguientePagina === null || !paginacion} className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-50">Siguiente</button></div>
      </div>
    </section>

    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 p-4">
        <div><h2 className="font-bold">Analítica actual</h2><p className="mt-1 text-xs text-slate-600">Importe documental confirmado por centro, firmado y sin prorrateo. El cliente no suma ni completa importes ausentes.</p></div>
        <label className="text-sm font-semibold">Fecha de corte<input type="date" value={fechaCorte} onChange={(event) => setFechaCorte(event.target.value)} disabled={loading || busy !== null} className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100" /></label>
      </div>
      <div aria-busy={loading} className="min-h-[12rem] max-h-[24rem] overflow-y-auto [overflow-x:auto!important] overscroll-contain">
        <table className="min-w-[46rem] w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-4 py-3">Centro</th><th className="px-4 py-3">Última fecha</th><th className="px-4 py-3 text-right">Líneas</th><th className="px-4 py-3 text-right">Importe documental (EUR)</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {analitica?.items.map((item) => <tr key={item.centroCosteFinanzasId ?? 'sin-centro'}><td className="px-4 py-3">{item.centroCosteFinanzasId === null ? 'Sin centro de coste' : `${item.codigo} · ${item.nombre}${item.activo ? '' : ' (inactivo)'}`}</td><td className="px-4 py-3 whitespace-nowrap">{item.fechaOperacion}</td><td className="px-4 py-3 text-right font-mono">{item.lineas}</td><td className="px-4 py-3 text-right font-mono font-bold">{formatEuroCentimos(item.importeDocumentalConfirmadoPorCentroCentimos)}</td></tr>)}
            {!loading && analitica !== null && analitica.items.length === 0 && <tr><td colSpan={4} className="px-4 py-7 text-center text-slate-500">No hay evidencia analítica válida hasta la fecha de corte.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    {(catalogGaps.length > 0 || lineGaps.length > 0) && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-bold text-amber-950">Huecos de evidencia</h2><p className="mt-1 text-sm text-amber-950">Se excluyen de la analítica o de la página; nunca se representan como importe 0.</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-950">{catalogGaps.map((gap, index) => <li key={`analitica-${gap.codigo}-${index}`}><strong>Analítica — {gap.codigo}</strong>: {gap.detalle} ({gap.lineas} línea{gap.lineas === 1 ? '' : 's'} excluida{gap.lineas === 1 ? '' : 's'}).</li>)}{lineGaps.map((gap, index) => <li key={`lineas-${gap.codigo}-${index}`}><strong>Líneas — {gap.codigo}</strong>: {gap.detalle} ({gap.lineas} línea{gap.lineas === 1 ? '' : 's'} excluida{gap.lineas === 1 ? '' : 's'}).</li>)}</ul></section>}
  </main>
}
