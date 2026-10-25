'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePermisoArea } from '@/hooks/usePermisoArea'
import { useRole } from '@/components/admin/RoleContext'
import {
  b6ReadUrl,
  backendMessageB6,
  codigoBackendB6,
  crearIdempotencyKeyB6,
  crearPayloadAsociarDevolucionB6,
  crearPayloadAsociarFacturasB6,
  facturaEsMiembroActualB6,
  facturaPuedeAsociarseB6,
  facturasSourceHashB6,
  formatCentimosB6,
  parseDevolucionesB4ResponseB6,
  parseFacturasISPChoicesResponseB6,
  parseMiembrosRemesaResponseB6,
  parseRemesasListaResponseB6,
  puedePrepararAsociacionFacturasB6,
  remesaPuedeAsociarseB6,
  sumSignedCentimosB6,
} from './remesas-b6-parser'
import {
  B6_AREA_PERMISO,
  B6_MAX_MIEMBROS_REMESA,
  B6_MAX_OFFSET,
  B6_PAGE_SIZE,
  type AvisoB6,
  type DevolucionB4B6,
  type FacturaISPChoiceB6,
  type PaginacionB6,
  type RemesaB6,
  type RevisionDevolucionB6,
  type RevisionFacturasB6,
} from './remesas-b6-types'

const VACIA: PaginacionB6 = { limit: B6_PAGE_SIZE, offset: 0, total: 0 }

type ModalRevisionB6 = RevisionFacturasB6 | RevisionDevolucionB6 | null

function textoFuenteDesconocida(codigo: string | null): string {
  return codigo ? `Fuente bloqueada: ${codigo}` : 'Fuente bloqueada: faltan datos exactos verificables.'
}

function etiquetaFactura(factura: FacturaISPChoiceB6): string {
  const referencia = [factura.serieFactura, factura.numeroDocumento].filter(Boolean).join(' · ')
  return referencia || `Factura ISP #${factura.id}`
}

function etiquetaRemesa(remesa: RemesaB6): string {
  return remesa.nombre?.trim() || `Remesa ISP #${remesa.ispGestionId}`
}

function fechaVisible(fecha: string | null): string {
  if (!fecha) return 'Fuente desconocida'
  return fecha
}

function paginaAnterior(offset: number): number {
  return Math.max(0, offset - B6_PAGE_SIZE)
}

function paginaSiguiente(paginacion: PaginacionB6): number {
  return paginacion.offset + paginacion.limit
}

function hayPaginaSiguiente(paginacion: PaginacionB6): boolean {
  const nextOffset = paginacion.offset + paginacion.limit
  return nextOffset <= B6_MAX_OFFSET && nextOffset < paginacion.total
}

function claseAviso(tipo: AvisoB6['tipo']): string {
  if (tipo === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-900'
  if (tipo === 'warning') return 'border-amber-200 bg-amber-50 text-amber-950'
  if (tipo === 'info') return 'border-orange-200 bg-orange-50 text-orange-950'
  return 'border-rose-200 bg-rose-50 text-rose-950'
}

function esLineaDevolucionCompleta(linea: DevolucionB4B6): boolean {
  // B4 declara los dos importes. Pueden diferir por una DIF explícita: no se igualan ni prorratean.
  return Number.isSafeInteger(linea.importeDocumentoCentimos)
    && Number.isSafeInteger(linea.importeBancoCentimos)
    && linea.importeDocumentoCentimos < 0
    && linea.importeBancoCentimos < 0
}

/**
 * UI preparada para montar por el padre. La carga inicial se limita a remesasLista;
 * facturas y devoluciones sólo se leen después de una acción humana visible.
 */
export default function RemesasWorkspace() {
  const { canRead, canWrite } = usePermisoArea(B6_AREA_PERMISO)
  const { permisosLoaded } = useRole()
  const [remesas, setRemesas] = useState<readonly RemesaB6[]>([])
  const [remesasPaginacion, setRemesasPaginacion] = useState<PaginacionB6>(VACIA)
  const [remesasBusqueda, setRemesasBusqueda] = useState('')
  const [remesasBusquedaAplicada, setRemesasBusquedaAplicada] = useState('')
  const [remesasCargando, setRemesasCargando] = useState(false)
  const [remesaSeleccionada, setRemesaSeleccionada] = useState<RemesaB6 | null>(null)

  // Sólo miembrosRemesa acredita y conserva las fuentes de membresía actual.
  // El catálogo se mantiene separado: puede tener miles de filas y sólo aporta
  // una fuente cuando la persona selecciona explícitamente una factura nueva.
  const [miembrosPorId, setMiembrosPorId] = useState<Map<number, FacturaISPChoiceB6>>(new Map())
  const [miembrosCargando, setMiembrosCargando] = useState(false)
  const [completeMemberRead, setCompleteMemberRead] = useState(false)
  const [facturasPorId, setFacturasPorId] = useState<Map<number, FacturaISPChoiceB6>>(new Map())
  const [facturasPagina, setFacturasPagina] = useState<readonly FacturaISPChoiceB6[]>([])
  const [facturasPaginacion, setFacturasPaginacion] = useState<PaginacionB6>(VACIA)
  const [facturasBusqueda, setFacturasBusqueda] = useState('')
  const [facturasBusquedaAplicada, setFacturasBusquedaAplicada] = useState('')
  const [facturasCargando, setFacturasCargando] = useState(false)
  const [facturasLeidas, setFacturasLeidas] = useState(false)
  const [facturaIdsSeleccionadas, setFacturaIdsSeleccionadas] = useState<Set<number>>(new Set())

  const [devoluciones, setDevoluciones] = useState<readonly DevolucionB4B6[]>([])
  const [devolucionesPaginacion, setDevolucionesPaginacion] = useState<PaginacionB6>(VACIA)
  const [devolucionesBusqueda, setDevolucionesBusqueda] = useState('')
  const [devolucionesBusquedaAplicada, setDevolucionesBusquedaAplicada] = useState('')
  const [devolucionesCargando, setDevolucionesCargando] = useState(false)
  const [devolucionesLeidas, setDevolucionesLeidas] = useState(false)
  const [lineaDevolucion, setLineaDevolucion] = useState<DevolucionB4B6 | null>(null)
  const [facturaDevolucionId, setFacturaDevolucionId] = useState<number | null>(null)

  const [modalRevision, setModalRevision] = useState<ModalRevisionB6>(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<AvisoB6 | null>(null)
  const requestSequence = useRef(0)
  const memberRequestSequence = useRef(0)
  const devolucionRequestSequence = useRef(0)
  const remesaSeleccionadaIdRef = useRef<number | null>(null)

  const facturasMiembroActual = useMemo(
    () => remesaSeleccionada ? [...miembrosPorId.values()].filter((factura) => facturaEsMiembroActualB6(factura, remesaSeleccionada.id)).sort((a, b) => a.id - b.id) : [],
    [miembrosPorId, remesaSeleccionada],
  )
  const facturasSeleccionadas = useMemo(
    () => [...facturaIdsSeleccionadas].map((id) => miembrosPorId.get(id) ?? facturasPorId.get(id)).filter((factura): factura is FacturaISPChoiceB6 => Boolean(factura)),
    [facturaIdsSeleccionadas, miembrosPorId, facturasPorId],
  )
  const cierreFacturas = useMemo(() => {
    if (!remesaSeleccionada || !remesaPuedeAsociarseB6(remesaSeleccionada)) return null
    try {
      const suma = sumSignedCentimosB6(facturasSeleccionadas)
      return { suma, total: remesaSeleccionada.targetSource.totalCentimos, exacto: suma === remesaSeleccionada.targetSource.totalCentimos }
    } catch {
      return null
    }
  }, [facturasSeleccionadas, remesaSeleccionada])
  const selectedKnownSource = useMemo(
    () => facturaIdsSeleccionadas.size === facturasSeleccionadas.length,
    [facturaIdsSeleccionadas, facturasSeleccionadas],
  )
  const puedePrepararFacturas = useMemo(
    () => selectedKnownSource && puedePrepararAsociacionFacturasB6(remesaSeleccionada, facturasSeleccionadas, completeMemberRead),
    [completeMemberRead, facturasSeleccionadas, remesaSeleccionada, selectedKnownSource],
  )

  const cargarRemesas = useCallback(async (offset = 0) => {
    if (!canRead) return
    setRemesasCargando(true)
    try {
      const response = await fetch(b6ReadUrl('remesasLista', {
        limit: B6_PAGE_SIZE, offset, q: remesasBusquedaAplicada,
      }), { cache: 'no-store' })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(backendMessageB6(json, 'No se pudo leer el listado de remesas B6.'))
      const parsed = parseRemesasListaResponseB6(json)
      setRemesas(parsed.items)
      setRemesasPaginacion(parsed.paginacion)
      setAviso(null)
    } catch (error) {
      setAviso({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudo leer el listado de remesas B6.' })
    } finally {
      setRemesasCargando(false)
    }
  }, [canRead, remesasBusquedaAplicada])

  // Único GET permitido al iniciar: remesasLista. No se carga una candidatura ni B4 sin clic humano.
  useEffect(() => {
    if (canRead) void cargarRemesas(0)
  }, [canRead, cargarRemesas])

  const clearMemberCaptured = useCallback(() => {
    setMiembrosPorId(new Map())
    setCompleteMemberRead(false)
    setFacturaIdsSeleccionadas(new Set())
    setFacturaDevolucionId(null)
  }, [])

  const cargarMiembros = useCallback(async (remesaId: number) => {
    if (!canRead) return
    const sequence = ++memberRequestSequence.current
    clearMemberCaptured()
    setMiembrosCargando(true)
    try {
      const members = new Map<number, FacturaISPChoiceB6>()
      let offset = 0
      let total: number | null = null
      do {
        const response = await fetch(b6ReadUrl('miembrosRemesa', {
          remesaId, limit: B6_PAGE_SIZE, offset,
        }), { cache: 'no-store' })
        const json: unknown = await response.json().catch(() => null)
        if (!response.ok) throw new Error(backendMessageB6(json, 'No se pudieron leer los miembros actuales de la remesa.'))
        const parsed = parseMiembrosRemesaResponseB6(json)
        if (sequence !== memberRequestSequence.current || remesaSeleccionadaIdRef.current !== remesaId || parsed.remesaId !== remesaId) return
        if (parsed.paginacion.total > B6_MAX_MIEMBROS_REMESA) throw new Error('La membresía actual supera el límite contractual B6 de 2.000 facturas.')
        if (parsed.paginacion.offset !== offset) throw new Error('La fuente de miembros devolvió una página fuera de secuencia.')
        if (total !== null && parsed.paginacion.total !== total) throw new Error('La fuente de miembros cambió durante la captura; relea antes de preparar.')
        total = parsed.paginacion.total
        const expectedItems = Math.min(parsed.paginacion.limit, total - offset)
        if (parsed.items.length !== expectedItems) throw new Error('La fuente de miembros devolvió una página incompleta.')
        parsed.items.forEach((factura) => members.set(factura.id, factura))
        offset += parsed.paginacion.limit
      } while (total !== null && offset < total)
      if (sequence !== memberRequestSequence.current || remesaSeleccionadaIdRef.current !== remesaId) return
      if (members.size !== total) throw new Error('La fuente de miembros contiene identificadores duplicados o está incompleta.')
      // Una captura completa se publica de una vez: no existe estado de membresía parcial.
      setMiembrosPorId(members)
      setFacturaIdsSeleccionadas(new Set(members.keys()))
      setCompleteMemberRead(true)
      setAviso(null)
    } catch (error) {
      if (sequence === memberRequestSequence.current && remesaSeleccionadaIdRef.current === remesaId) {
        clearMemberCaptured()
        setAviso({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudieron leer los miembros actuales de la remesa.' })
      }
    } finally {
      if (sequence === memberRequestSequence.current && remesaSeleccionadaIdRef.current === remesaId) setMiembrosCargando(false)
    }
  }, [canRead, clearMemberCaptured])

  const cargarFacturas = useCallback(async (remesaId: number, offset = 0, q = facturasBusquedaAplicada) => {
    if (!canRead) return
    const sequence = ++requestSequence.current
    setFacturasCargando(true)
    try {
      const response = await fetch(b6ReadUrl('facturasISPchoices', {
        remesaId, limit: B6_PAGE_SIZE, offset, q,
      }), { cache: 'no-store' })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(backendMessageB6(json, 'No se pudieron leer las facturas ISP.'))
      const parsed = parseFacturasISPChoicesResponseB6(json)
      if (sequence !== requestSequence.current || remesaSeleccionadaIdRef.current !== remesaId || parsed.remesaId !== remesaId) return
      setFacturasPorId((previous) => {
        const next = new Map(previous)
        parsed.items.forEach((factura) => next.set(factura.id, factura))
        return next
      })
      setFacturasPagina(parsed.items)
      setFacturasPaginacion(parsed.paginacion)
      setFacturasLeidas(true)
    } catch (error) {
      if (sequence === requestSequence.current && remesaSeleccionadaIdRef.current === remesaId) {
        setAviso({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudieron leer las facturas ISP.' })
      }
    } finally {
      if (sequence === requestSequence.current && remesaSeleccionadaIdRef.current === remesaId) setFacturasCargando(false)
    }
  }, [canRead, facturasBusquedaAplicada])

  const cargarDevoluciones = useCallback(async (remesaId: number, offset = 0, q = devolucionesBusquedaAplicada) => {
    if (!canRead) return
    const sequence = ++devolucionRequestSequence.current
    setDevolucionesCargando(true)
    try {
      const response = await fetch(b6ReadUrl('devolucionesB4', {
        remesaId, limit: B6_PAGE_SIZE, offset, q,
      }), { cache: 'no-store' })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) throw new Error(backendMessageB6(json, 'No se pudieron leer las líneas B4 de devolución.'))
      const parsed = parseDevolucionesB4ResponseB6(json)
      if (sequence !== devolucionRequestSequence.current || remesaSeleccionadaIdRef.current !== remesaId) return
      setDevoluciones(parsed.items)
      setDevolucionesPaginacion(parsed.paginacion)
      setDevolucionesLeidas(true)
    } catch (error) {
      if (sequence === devolucionRequestSequence.current && remesaSeleccionadaIdRef.current === remesaId) setAviso({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudieron leer las líneas B4 de devolución.' })
    } finally {
      if (sequence === devolucionRequestSequence.current && remesaSeleccionadaIdRef.current === remesaId) setDevolucionesCargando(false)
    }
  }, [canRead, devolucionesBusquedaAplicada])

  const seleccionarRemesa = useCallback((remesa: RemesaB6) => {
    // Invalida antes de limpiar: una respuesta anterior jamás puede restaurar fuentes.
    remesaSeleccionadaIdRef.current = remesa.id
    requestSequence.current += 1
    memberRequestSequence.current += 1
    devolucionRequestSequence.current += 1
    setRemesaSeleccionada(remesa)
    clearMemberCaptured()
    setFacturasPorId(new Map())
    setFacturasPagina([])
    setFacturasPaginacion(VACIA)
    setFacturasLeidas(false)
    setFacturasBusqueda('')
    setFacturasBusquedaAplicada('')
    setFacturaDevolucionId(null)
    setLineaDevolucion(null)
    setModalRevision(null)
    // Seleccionar sólo captura la membresía actual completa; el catálogo se lee
    // después mediante búsqueda o paginación normal, jamás de forma exhaustiva.
    void cargarMiembros(remesa.id)
  }, [cargarMiembros, clearMemberCaptured])

  const alternarFactura = useCallback((factura: FacturaISPChoiceB6) => {
    if (!remesaSeleccionada || factura.remesaId !== null) return
    if (!facturaPuedeAsociarseB6(factura, remesaSeleccionada.id)) return
    setFacturaIdsSeleccionadas((previous) => {
      const next = new Set(previous)
      if (next.has(factura.id)) next.delete(factura.id); else next.add(factura.id)
      return next
    })
    setModalRevision(null)
  }, [remesaSeleccionada])

  const prepararRevisionFacturas = useCallback(async () => {
    if (!remesaSeleccionada || !remesaPuedeAsociarseB6(remesaSeleccionada)) {
      setAviso({ tipo: 'error', texto: 'La remesa tiene una fuente de fecha o importe desconocida; B6 no puede asociar.' })
      return
    }
    if (!completeMemberRead || !selectedKnownSource || !puedePrepararFacturas || !cierreFacturas?.exacto) {
      setAviso({ tipo: 'error', texto: 'Espere a la lectura completa de miembros, seleccione sólo facturas con fuente conocida y compruebe el cierre firmado exacto antes de preparar la confirmación.' })
      return
    }
    const bloqueada = facturasSeleccionadas.find((factura) => !facturaPuedeAsociarseB6(factura, remesaSeleccionada.id))
    if (bloqueada) {
      setAviso({ tipo: 'error', texto: `La factura ISP #${bloqueada.id} tiene una fuente desconocida o incoherente; no se enviará.` })
      return
    }
    try {
      const hash = await facturasSourceHashB6(facturasSeleccionadas)
      const payload = crearPayloadAsociarFacturasB6(
        remesaSeleccionada.id,
        remesaSeleccionada.targetSource.totalCentimos,
        remesaSeleccionada.targetSource.sourceFingerprintSHA256,
        facturasSeleccionadas.map((factura) => factura.id),
        hash,
        crearIdempotencyKeyB6(),
      )
      setModalRevision({
        clase: 'facturas', payload, facturas: facturasSeleccionadas,
        sumaFacturasCentimos: cierreFacturas.suma,
        totalRemesaCentimos: cierreFacturas.total,
        cierreExacto: true,
        advertenciasB4Directas: facturasSeleccionadas.filter((factura) => factura.tieneEvidenciaDirectaB4),
      })
      setAviso(null)
    } catch (error) {
      setAviso({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudo preparar el hash de fuentes B6.' })
    }
  }, [cierreFacturas, completeMemberRead, facturasSeleccionadas, puedePrepararFacturas, remesaSeleccionada, selectedKnownSource])

  const seleccionarLineaDevolucion = useCallback((linea: DevolucionB4B6) => {
    if (!remesaSeleccionada || linea.remesaId !== remesaSeleccionada.id) {
      setAviso({ tipo: 'warning', texto: 'Esta línea B4 pertenece a otra remesa. Seleccione primero su remesa para evitar cualquier inferencia.' })
      return
    }
    if (!esLineaDevolucionCompleta(linea)) {
      setAviso({ tipo: 'error', texto: 'La línea B4 no contiene importes negativos completos y exactos; no puede trazarse en B6.' })
      return
    }
    setLineaDevolucion(linea)
    setFacturaDevolucionId(null)
    setModalRevision(null)
  }, [remesaSeleccionada])

  const prepararRevisionDevolucion = useCallback(() => {
    if (!remesaSeleccionada || !lineaDevolucion || !esLineaDevolucionCompleta(lineaDevolucion)) {
      setAviso({ tipo: 'error', texto: 'Seleccione una línea B4 REMESA negativa completa y exacta.' })
      return
    }
    const factura = miembrosPorId.get(facturaDevolucionId ?? -1)
    if (!factura || !facturaEsMiembroActualB6(factura, remesaSeleccionada.id)) {
      setAviso({ tipo: 'error', texto: 'Para devolución B6 seleccione exactamente una factura que ya sea miembro actual de esta remesa.' })
      return
    }
    try {
      const payload = crearPayloadAsociarDevolucionB6(
        remesaSeleccionada.id, factura.id, lineaDevolucion.vinculoId, lineaDevolucion.movimientoId, crearIdempotencyKeyB6(),
      )
      setModalRevision({ clase: 'devolucion', payload, linea: lineaDevolucion, factura })
      setAviso(null)
    } catch (error) {
      setAviso({ tipo: 'error', texto: error instanceof Error ? error.message : 'No se pudo preparar la devolución B6.' })
    }
  }, [facturaDevolucionId, lineaDevolucion, miembrosPorId, remesaSeleccionada])

  const confirmarRevision = useCallback(async () => {
    // El único POST queda inaccesible sin revisión visible y clic humano en este segundo botón.
    if (!modalRevision || enviando || !canWrite) return
    setEnviando(true)
    try {
      const response = await fetch('/api/admin/finanzas/remesas/b6', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modalRevision.payload),
      })
      const json: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const codigo = codigoBackendB6(json)
        throw new Error(`${backendMessageB6(json, 'La confirmación B6 no se completó.')}${codigo ? ` (${codigo})` : ''}`)
      }
      const accion = modalRevision.clase === 'facturas' ? 'La asociación de facturas' : 'La trazabilidad de devolución'
      setAviso({ tipo: 'success', texto: `${accion} se confirmó. No se marcó ninguna factura como cobrada, ni se sincronizó ni se enviaron correos.` })
      setModalRevision(null)
      if (modalRevision.clase === 'facturas' && remesaSeleccionada) {
        // Revalida la fuente de miembros; no se muta ni se infiere membresía localmente.
        void cargarMiembros(remesaSeleccionada.id)
      }
      if (modalRevision.clase === 'devolucion') {
        if (remesaSeleccionada) void cargarDevoluciones(remesaSeleccionada.id, devolucionesPaginacion.offset)
      }
    } catch (error) {
      // 409 y fallos de red permanecen en revisión: reintentar usa exactamente la misma key y payload.
      setAviso({ tipo: 'error', texto: `${error instanceof Error ? error.message : 'La confirmación B6 no se completó.'} No se asume éxito; revise o reintente con la misma confirmación.` })
    } finally {
      setEnviando(false)
    }
  }, [canWrite, cargarDevoluciones, cargarMiembros, devolucionesPaginacion.offset, enviando, modalRevision, remesaSeleccionada])

  if (!permisosLoaded) {
    return (
      <section className="mx-auto min-h-[1120px] max-w-7xl space-y-5 p-4 sm:p-6 lg:min-h-[760px]" aria-busy="true" aria-labelledby="b6-title">
        <div className="animate-pulse overflow-hidden rounded-2xl border border-orange-200 bg-orange-50 p-5 sm:p-7">
          <h1 id="b6-title" className="h-8 w-2/3 rounded bg-orange-200"> <span className="sr-only">Comprobando permiso de lectura…</span></h1>
          <div className="mt-3 h-4 w-full rounded bg-orange-100"></div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          {[1, 2].map(i => <div key={i} className="min-h-[260px] animate-pulse rounded-2xl border border-slate-200 bg-white p-4"><div className="h-5 w-2/5 rounded bg-slate-200"></div><div className="mt-4 space-y-3">{[1, 2, 3].map(row => <div key={row} className="h-10 rounded bg-slate-100"></div>)}</div></div>)}
        </div>
        <div className="min-h-[180px] animate-pulse rounded-2xl border border-slate-200 bg-white p-4"><div className="h-5 w-1/3 rounded bg-slate-200"></div></div>
      </section>
    )
  }

  if (!canRead) {
    return (
      <section className="mx-auto max-w-7xl p-4 sm:p-6" aria-labelledby="b6-title">
        <div className="rounded-2xl border border-orange-200 bg-orange-50 p-5 text-orange-950">
          <h1 id="b6-title" className="text-lg font-bold">B6 · Remesas ISP</h1>
          <p className="mt-2 text-sm">No tiene permiso de lectura para <code>{B6_AREA_PERMISO}</code>.</p>
        </div>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6" aria-labelledby="b6-title">
      <header className="overflow-hidden rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-700 via-orange-600 to-amber-500 p-5 text-white shadow-sm sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-100">Finanzas · control corporativo</p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 id="b6-title" className="text-2xl font-bold tracking-tight sm:text-3xl">B6 · Preparación de remesas</h1>
            <p className="mt-2 max-w-3xl text-sm text-orange-50">Asociación explícita, firmada y auditable. B6 añade trazabilidad; no cobra, no reasigna y no automatiza financiación.</p>
          </div>
          <span className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-bold ${canWrite ? 'border-white/50 bg-white/15 text-white' : 'border-orange-100/60 bg-orange-950/20 text-orange-50'}`}>
            {canWrite ? 'Lectura y confirmación' : 'Sólo lectura'}
          </span>
        </div>
      </header>

      {aviso && <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${claseAviso(aviso.tipo)}`}>{aviso.texto}</div>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-orange-100 bg-orange-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-orange-800">Paso 1</p>
            <h2 className="mt-1 font-bold text-slate-950">Seleccione una remesa</h2>
          </div>
          <form className="flex gap-2 p-4" onSubmit={(event) => { event.preventDefault(); setRemesasBusquedaAplicada(remesasBusqueda.trim()) }}>
            <label className="sr-only" htmlFor="b6-remesas-q">Buscar remesa</label>
            <input id="b6-remesas-q" value={remesasBusqueda} onChange={(event) => setRemesasBusqueda(event.target.value)} maxLength={120} placeholder="Nombre o ISP Gestión" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" />
            <button type="submit" className="rounded-lg bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800">Buscar</button>
          </form>
          <div className="max-h-[34rem] divide-y divide-slate-100 overflow-auto">
            {remesasCargando && <p className="p-4 text-sm text-slate-500">Leyendo remesas…</p>}
            {!remesasCargando && remesas.length === 0 && <p className="p-4 text-sm text-slate-500">No hay remesas en esta página.</p>}
            {remesas.map((remesa) => {
              const fuenteSegura = remesaPuedeAsociarseB6(remesa)
              const activa = remesaSeleccionada?.id === remesa.id
              return (
                <button key={remesa.id} type="button" onClick={() => seleccionarRemesa(remesa)} className={`block w-full px-4 py-3 text-left transition ${activa ? 'bg-orange-100 ring-1 ring-inset ring-orange-400' : 'hover:bg-slate-50'}`}>
                  <span className="flex items-start justify-between gap-3">
                    <span><span className="block font-semibold text-slate-950">{etiquetaRemesa(remesa)}</span><span className="mt-0.5 block text-xs text-slate-500">ISP #{remesa.ispGestionId} · {fechaVisible(remesa.fecha.iso)}</span></span>
                    <span className="shrink-0 text-right font-mono text-sm font-bold text-slate-900">{remesa.importe.exacto && remesa.importe.centimos !== null ? formatCentimosB6(remesa.importe.centimos) : 'Bloqueada'}</span>
                  </span>
                  {!fuenteSegura && <span className="mt-2 block text-xs font-medium text-rose-700">{textoFuenteDesconocida(remesa.importe.codigoFuente ?? remesa.fecha.codigoFuente)}</span>}
                </button>
              )
            })}
          </div>
          <Paginador paginacion={remesasPaginacion} onAnterior={() => void cargarRemesas(paginaAnterior(remesasPaginacion.offset))} onSiguiente={() => void cargarRemesas(paginaSiguiente(remesasPaginacion))} deshabilitado={remesasCargando} />
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-orange-100 bg-orange-50/70 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-orange-800">Paso 2</p>
            <h2 className="mt-1 font-bold text-slate-950">Facturas ISP de la remesa</h2>
            <p className="mt-1 text-xs text-slate-600">La membresía actual se captura completa en una fuente separada; el catálogo se consulta normalmente y sólo añade facturas que la persona elige de forma explícita.</p>
          </div>
          {!remesaSeleccionada ? <div className="p-6 text-sm text-slate-500">Seleccione una remesa para cargar sus facturas candidatas.</div> : <>
            <div className="border-b border-slate-100 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold text-slate-950">{etiquetaRemesa(remesaSeleccionada)}</p><p className="text-xs text-slate-500">Total fuente: {remesaSeleccionada.targetSource ? formatCentimosB6(remesaSeleccionada.targetSource.totalCentimos) : textoFuenteDesconocida(remesaSeleccionada.importe.codigoFuente ?? remesaSeleccionada.fecha.codigoFuente)}</p></div>
                <div className="flex flex-wrap gap-2"><span className={`rounded-lg border px-3 py-2 text-xs font-semibold ${completeMemberRead ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>{miembrosCargando ? 'Capturando miembros…' : completeMemberRead ? `${facturasMiembroActual.length} miembro(s) capturados` : 'Membresía pendiente'}</span><button type="button" onClick={() => void cargarFacturas(remesaSeleccionada.id, facturasPaginacion.offset, facturasBusquedaAplicada)} disabled={facturasCargando} className="rounded-lg border border-orange-300 px-3 py-2 text-sm font-semibold text-orange-800 hover:bg-orange-50 disabled:opacity-50">{facturasLeidas ? 'Releer catálogo' : 'Cargar catálogo'}</button></div>
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(event) => { event.preventDefault(); const q = facturasBusqueda.trim(); setFacturasBusquedaAplicada(q); void cargarFacturas(remesaSeleccionada.id, 0, q) }}>
                <label className="sr-only" htmlFor="b6-facturas-q">Buscar factura ISP</label>
                <input id="b6-facturas-q" value={facturasBusqueda} onChange={(event) => setFacturasBusqueda(event.target.value)} maxLength={120} placeholder="Factura, cliente o código" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" />
                <button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Filtrar</button>
              </form>
            </div>
            <div className="max-h-[28rem] overflow-auto">
              {facturasCargando && <p className="p-4 text-sm text-slate-500">Leyendo facturas…</p>}
              {!facturasCargando && !facturasLeidas && <p className="p-4 text-sm text-slate-500">Busque o cargue una página del catálogo para elegir facturas nuevas. No es necesario ni permitido recorrerlo completo.</p>}
              {facturasLeidas && facturasPagina.length === 0 && <p className="p-4 text-sm text-slate-500">No hay facturas en esta página.</p>}
              {facturasPagina.map((factura) => {
                const miembro = miembrosPorId.has(factura.id)
                const seleccionada = facturaIdsSeleccionadas.has(factura.id)
                const disponible = facturaPuedeAsociarseB6(factura, remesaSeleccionada.id)
                const espejoIncoherente = factura.facturaEmitidaActual !== null && !factura.facturaEmitidaActual.coincideConISP
                const bloqueada = !disponible || espejoIncoherente
                return <label key={factura.id} className={`flex cursor-pointer gap-3 border-b border-slate-100 p-4 ${seleccionada ? 'bg-orange-50/60' : ''} ${bloqueada ? 'opacity-75' : ''}`}>
                  <input type="checkbox" checked={seleccionada} disabled={miembro || bloqueada || !canWrite} onChange={() => alternarFactura(factura)} className="mt-1 h-4 w-4 accent-orange-700" />
                  <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span className="font-semibold text-slate-950">{etiquetaFactura(factura)}</span><span className="font-mono text-sm text-slate-900">{factura.importe.exacto && factura.importe.centimos !== null ? formatCentimosB6(factura.importe.centimos) : 'Bloqueada'}</span></span><span className="mt-0.5 block text-xs text-slate-500">ISP #{factura.ispGestionId} · {factura.nombreCompleto ?? factura.codigoCliente ?? 'Sin nombre de fuente'} · {fechaVisible(factura.fecha.iso)}</span>
                    {miembro && <span className="mt-1 block text-xs font-semibold text-orange-800">Miembro actual fijado (relación aditiva; no se puede quitar).</span>}
                    {bloqueada && <span className="mt-1 block text-xs font-semibold text-rose-700">{espejoIncoherente ? 'Bloqueada: el espejo FI explícito no coincide con ISP.' : textoFuenteDesconocida(factura.importe.codigoFuente ?? factura.fecha.codigoFuente)}</span>}
                    {factura.tieneEvidenciaDirectaB4 && <span className="mt-1 block text-xs font-semibold text-amber-800">Advertencia B4: existe evidencia directa de factura. Revise antes de confirmar; B6 no infiere financiación.</span>}
                  </span>
                </label>
              })}
            </div>
            <Paginador paginacion={facturasPaginacion} onAnterior={() => void cargarFacturas(remesaSeleccionada.id, paginaAnterior(facturasPaginacion.offset))} onSiguiente={() => void cargarFacturas(remesaSeleccionada.id, paginaSiguiente(facturasPaginacion))} deshabilitado={facturasCargando} />
            <div className={`m-4 rounded-xl border p-4 ${cierreFacturas?.exacto ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-600">Cierre firmado exacto</p><p className="mt-1 font-mono text-sm text-slate-950">Facturas: {cierreFacturas ? formatCentimosB6(cierreFacturas.suma) : '—'} · Remesa: {cierreFacturas ? formatCentimosB6(cierreFacturas.total) : '—'}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${cierreFacturas?.exacto ? 'bg-emerald-700 text-white' : 'bg-amber-200 text-amber-950'}`}>{cierreFacturas?.exacto ? 'Cierra exactamente' : 'No enviar'}</span></div>
              {!completeMemberRead && <p className="mt-3 text-xs font-medium text-amber-900">La fuente de miembros aún no está completa; B6 no prepara ni envía una membresía parcial.</p>}
              <button type="button" disabled={!canWrite || !puedePrepararFacturas} onClick={() => void prepararRevisionFacturas()} className="mt-3 w-full rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50">Preparar revisión de asociación</button>
            </div>
          </>}
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-orange-100 bg-orange-50/70 p-4"><p className="text-xs font-bold uppercase tracking-wide text-orange-800">Paso 3 · trazabilidad individual</p><h2 className="mt-1 font-bold text-slate-950">Devoluciones B4 de remesa</h2><p className="mt-1 text-xs text-slate-600">B4 ya confirmó el cargo. B6 sólo enlaza una línea B4 completa con una factura ya miembro; no crea vínculo, no cobra, no prorratea.</p></div>
        {!remesaSeleccionada ? <p className="p-5 text-sm text-slate-500">Seleccione primero una remesa; así no se atribuye una línea B4 a otra remesa.</p> : <>
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-end sm:justify-between"><form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); const q = devolucionesBusqueda.trim(); setDevolucionesBusquedaAplicada(q); void cargarDevoluciones(remesaSeleccionada.id, 0, q) }}><label className="sr-only" htmlFor="b6-dev-q">Buscar línea B4</label><input id="b6-dev-q" value={devolucionesBusqueda} onChange={(event) => setDevolucionesBusqueda(event.target.value)} maxLength={120} placeholder="Concepto o movimiento B4" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" /><button type="submit" className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Buscar B4</button></form><button type="button" onClick={() => void cargarDevoluciones(remesaSeleccionada.id, devolucionesPaginacion.offset)} disabled={devolucionesCargando} className="rounded-lg bg-orange-700 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-800 disabled:opacity-50">{devolucionesLeidas ? 'Releer B4' : 'Cargar líneas B4'}</button></div>
          {devolucionesLeidas && <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-4 py-3">Línea B4</th><th className="px-4 py-3 text-right">Principal B4</th><th className="px-4 py-3 text-right">Banco</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{devoluciones.map((linea) => { const pertenece = linea.remesaId === remesaSeleccionada.id; const valida = esLineaDevolucionCompleta(linea); const activa = lineaDevolucion?.vinculoId === linea.vinculoId; return <tr key={linea.vinculoId} className={activa ? 'bg-orange-50' : ''}><td className="px-4 py-3"><p className="font-medium text-slate-950">{linea.concepto || 'Sin concepto B4'}</p><p className="mt-1 font-mono text-xs text-slate-500">{linea.movimientoId} · {linea.fecha} · Remesa #{linea.remesaId}</p>{!pertenece && <p className="mt-1 text-xs text-slate-500">Otra remesa: no seleccionable en el contexto actual.</p>}{!valida && <p className="mt-1 text-xs text-rose-700">No es línea negativa completa verificable.</p>}</td><td className="px-4 py-3 text-right font-mono text-slate-900">{formatCentimosB6(linea.importeDocumentoCentimos)}</td><td className={`px-4 py-3 text-right font-mono ${linea.importeBancoCentimos === linea.importeDocumentoCentimos ? 'text-slate-900' : 'font-bold text-amber-800'}`}>{formatCentimosB6(linea.importeBancoCentimos)}{linea.importeBancoCentimos !== linea.importeDocumentoCentimos && <span className="mt-1 block text-xs font-sans font-normal">DIF B4 explícita</span>}</td><td className="px-4 py-3"><button type="button" disabled={!pertenece || !valida || !canWrite} onClick={() => seleccionarLineaDevolucion(linea)} className="rounded-lg border border-orange-300 px-3 py-2 text-xs font-bold text-orange-800 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40">{activa ? 'Seleccionada' : 'Seleccionar'}</button></td></tr> })}</tbody></table></div>}
          {devolucionesCargando && <p className="p-4 text-sm text-slate-500">Leyendo evidencia B4…</p>}
          {devolucionesLeidas && devoluciones.length === 0 && <p className="p-4 text-sm text-slate-500">No hay líneas B4 en esta página.</p>}
          {devolucionesLeidas && <Paginador paginacion={devolucionesPaginacion} onAnterior={() => void cargarDevoluciones(remesaSeleccionada.id, paginaAnterior(devolucionesPaginacion.offset))} onSiguiente={() => void cargarDevoluciones(remesaSeleccionada.id, paginaSiguiente(devolucionesPaginacion))} deshabilitado={devolucionesCargando} />}
          {lineaDevolucion && <div className="border-t border-orange-100 bg-orange-50/40 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-800">Factura actual de la remesa</p><p className="mt-1 text-sm text-slate-700">Elija una, y sólo una, factura de la captura fuente de miembros actuales. El catálogo de candidatas nunca alimenta este selector.</p></div><button type="button" disabled={!canWrite || !completeMemberRead || facturaDevolucionId === null} onClick={prepararRevisionDevolucion} className="rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50">Preparar revisión de devolución</button></div><div className="mt-3 grid gap-2 md:grid-cols-2">{facturasMiembroActual.map((factura) => <label key={factura.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${facturaDevolucionId === factura.id ? 'border-orange-400 bg-white' : 'border-slate-200 bg-white/70'}`}><input type="radio" name="b6-factura-devolucion" checked={facturaDevolucionId === factura.id} disabled={!canWrite || !completeMemberRead} onChange={() => { setFacturaDevolucionId(factura.id); setModalRevision(null) }} className="mt-1 accent-orange-700" /><span><span className="block font-semibold text-slate-950">{etiquetaFactura(factura)}</span><span className="text-xs text-slate-600">{formatCentimosB6(factura.source!.totalCentimos)} · ISP #{factura.ispGestionId}</span></span></label>)}{!completeMemberRead && <p className="text-sm text-amber-900">La captura de miembros aún no ha terminado; B6 no habilita la devolución con una lista parcial.</p>}{completeMemberRead && facturasMiembroActual.length === 0 && <p className="text-sm text-amber-900">La captura completa no contiene miembros actuales elegibles para devolución.</p>}</div></div>}
        </>}
      </article>

      <aside className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700"><strong className="text-slate-950">Límites operativos B6.</strong> Sin autoasociación ni inferencias de financiación; sin prorrateos; sin cambios de estado de cobro; sin sincronizaciones ni correos. Las fuentes desconocidas bloquean la escritura. Un conflicto <code>409</code> nunca se presenta como éxito.</aside>

      {modalRevision && <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-0 sm:items-center sm:justify-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="b6-review-title"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"><div className="border-b border-orange-100 bg-orange-50 p-5"><p className="text-xs font-bold uppercase tracking-wide text-orange-800">Revisión obligatoria</p><h2 id="b6-review-title" className="mt-1 text-xl font-bold text-slate-950">{modalRevision.clase === 'facturas' ? 'Confirmar asociación de facturas' : 'Confirmar trazabilidad de devolución'}</h2></div><div className="space-y-4 p-5">{modalRevision.clase === 'facturas' ? <><div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"><strong>Cierre firmado:</strong> {formatCentimosB6(modalRevision.sumaFacturasCentimos)} = {formatCentimosB6(modalRevision.totalRemesaCentimos)}.<p className="mt-2"><strong>Hash fuente remesa:</strong> <code className="break-all text-xs">{modalRevision.payload.expectedRemesaHashSHA256}</code></p><p className="mt-1"><strong>Hash fuentes facturas:</strong> <code className="break-all text-xs">{modalRevision.payload.expectedFacturasHashSHA256}</code></p></div><ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">{modalRevision.facturas.map((factura) => <li key={factura.id} className="flex justify-between gap-4 p-3 text-sm"><span>{etiquetaFactura(factura)} <span className="text-slate-500">(ISP #{factura.id})</span></span><span className="font-mono">{formatCentimosB6(factura.source!.totalCentimos)}</span></li>)}</ul>{modalRevision.advertenciasB4Directas.length > 0 && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Advertencia:</strong> {modalRevision.advertenciasB4Directas.length} factura(s) tienen evidencia directa B4. Esta confirmación no interpreta ni duplica financiación; revise el conflicto antes de seguir.</div>}</> : <><div className="rounded-lg border border-slate-200 p-3 text-sm"><p><strong>Factura miembro actual:</strong> {etiquetaFactura(modalRevision.factura)} (ISP #{modalRevision.factura.id})</p><p className="mt-2"><strong>Principal documentado B4:</strong> {formatCentimosB6(modalRevision.linea.importeDocumentoCentimos)}</p><p className="mt-1"><strong>Movimiento banco:</strong> {formatCentimosB6(modalRevision.linea.importeBancoCentimos)}</p>{modalRevision.linea.importeDocumentoCentimos !== modalRevision.linea.importeBancoCentimos && <p className="mt-2 font-semibold text-amber-800">Importes distintos: DIF B4 explícita. Se conserva la línea completa; B6 no prorratea ni normaliza.</p>}</div><div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-950">La asignación sólo crea trazabilidad individual de una línea B4 ya justificada. No crea un vínculo B4, no marca cobrada la factura y no modifica membresías.</div></>}</div><div className="flex flex-col-reverse gap-2 border-t border-slate-100 p-5 sm:flex-row sm:justify-end"><button type="button" disabled={enviando} onClick={() => setModalRevision(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Volver a revisar</button><button type="button" disabled={!canWrite || enviando} onClick={() => void confirmarRevision()} className="rounded-lg bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50">{enviando ? 'Confirmando…' : modalRevision.clase === 'facturas' ? 'Confirmar asociación humana' : 'Confirmar trazabilidad humana'}</button></div></div></div>}
    </section>
  )
}

function Paginador({ paginacion, onAnterior, onSiguiente, deshabilitado }: Readonly<{ paginacion: PaginacionB6; onAnterior: () => void; onSiguiente: () => void; deshabilitado: boolean }>) {
  const inicio = paginacion.total === 0 ? 0 : paginacion.offset + 1
  const fin = Math.min(paginacion.offset + paginacion.limit, paginacion.total)
  return <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600"><span>{inicio}–{fin} de {paginacion.total}</span><span className="flex gap-2"><button type="button" disabled={deshabilitado || paginacion.offset === 0} onClick={onAnterior} className="rounded border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40">Anterior</button><button type="button" disabled={deshabilitado || !hayPaginaSiguiente(paginacion)} onClick={onSiguiente} className="rounded border border-slate-300 px-2 py-1 font-semibold hover:bg-slate-50 disabled:opacity-40">Siguiente</button></span></div>
}
