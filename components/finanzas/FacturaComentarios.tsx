'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

interface Comentario {
  id: string
  texto: string
  createdAt: string
  autor: { nombre: string }
}

interface ReferenciaProveedor {
  id: string
  texto: string
  createdAt: string
  factura: {
    id: string
    numFactura: string | null
    fecha: string
  }
}

interface ComentariosResponse {
  comentarios: Comentario[]
  page: number
  totalPages: number
  total: number
  puedeComentar: boolean
  referenciasProveedor: ReferenciaProveedor[]
}

interface FacturaComentariosProps {
  facturaId: string
}

const MAX_TEXTO_LENGTH = 4000
const COMENTARIOS_POR_PAGINA = 20

function formatearFecha(fecha: string) {
  return new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(fecha))
}

export default function FacturaComentarios({ facturaId }: FacturaComentariosProps) {
  const [datos, setDatos] = useState<ComentariosResponse | null>(null)
  const [facturaCargada, setFacturaCargada] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensajeExito, setMensajeExito] = useState<string | null>(null)
  const [pagina, setPagina] = useState(1)
  const solicitudIdRef = useRef<string | null>(null)
  const textoSolicitudRef = useRef<string | null>(null)
  const envioEnCursoRef = useRef(false)
  const facturaActualRef = useRef(facturaId)
  const cargaActualRef = useRef(0)
  const versionFacturaRef = useRef(0)
  const envioActualRef = useRef(0)
  facturaActualRef.current = facturaId

  const cargarComentarios = useCallback(async (paginaSolicitada: number, signal?: AbortSignal) => {
    const facturaSolicitada = facturaId
    const cargaId = ++cargaActualRef.current
    setCargando(true)
    setError(null)

    try {
      const respuesta = await fetch(
        `/api/admin/finanzas/facturas/${encodeURIComponent(facturaSolicitada)}/comentarios?page=${paginaSolicitada}&limit=${COMENTARIOS_POR_PAGINA}`,
        { cache: 'no-store', signal }
      )
      const contenido = await respuesta.json().catch(() => null)

      if (signal?.aborted || facturaActualRef.current !== facturaSolicitada || cargaActualRef.current !== cargaId) return

      if (!respuesta.ok) {
        setDatos(null)
        setFacturaCargada(null)
        setError(contenido?.error || 'No se pudieron cargar los comentarios.')
        return
      }

      setDatos(contenido as ComentariosResponse)
      setFacturaCargada(facturaSolicitada)
    } catch {
      if (signal?.aborted || facturaActualRef.current !== facturaSolicitada || cargaActualRef.current !== cargaId) return
      setDatos(null)
      setFacturaCargada(null)
      setError('No se pudieron cargar los comentarios. Inténtalo de nuevo.')
    } finally {
      if (!signal?.aborted && facturaActualRef.current === facturaSolicitada && cargaActualRef.current === cargaId) {
        setCargando(false)
      }
    }
  }, [facturaId])

  useEffect(() => {
    const controller = new AbortController()
    versionFacturaRef.current += 1
    envioActualRef.current += 1
    envioEnCursoRef.current = false
    setDatos(null)
    setFacturaCargada(null)
    setPagina(1)
    setTexto('')
    solicitudIdRef.current = null
    textoSolicitudRef.current = null
    setEnviando(false)
    setMensajeExito(null)
    void cargarComentarios(1, controller.signal)

    return () => controller.abort()
  }, [cargarComentarios])

  async function enviarComentario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (facturaCargada !== facturaId || !datos?.puedeComentar || !texto.trim() || envioEnCursoRef.current) return

    const facturaSolicitada = facturaId
    const versionFactura = versionFacturaRef.current
    const envioId = envioActualRef.current + 1
    envioActualRef.current = envioId
    envioEnCursoRef.current = true
    setEnviando(true)
    setError(null)
    setMensajeExito(null)

    // Se conserva solo para reintentar exactamente el mismo payload tras un fallo.
    const solicitudId = solicitudIdRef.current && textoSolicitudRef.current === texto
      ? solicitudIdRef.current
      : crypto.randomUUID()
    solicitudIdRef.current = solicitudId
    textoSolicitudRef.current = texto

    const sigueSiendoEnvioActual = () => (
      facturaActualRef.current === facturaSolicitada
      && versionFacturaRef.current === versionFactura
      && envioActualRef.current === envioId
    )

    try {
      const respuesta = await fetch(`/api/admin/finanzas/facturas/${encodeURIComponent(facturaSolicitada)}/comentarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto, solicitudId }),
      })
      const contenido = await respuesta.json().catch(() => null)

      if (!sigueSiendoEnvioActual()) return

      if (!respuesta.ok) {
        setError(contenido?.error || 'No se pudo guardar el comentario. Puedes volver a intentarlo.')
        return
      }

      setTexto('')
      solicitudIdRef.current = null
      textoSolicitudRef.current = null
      setMensajeExito(contenido?.duplicado ? 'El comentario ya se había registrado.' : 'Comentario añadido correctamente.')
      await cargarComentarios(pagina)
    } catch {
      if (!sigueSiendoEnvioActual()) return
      setError('No se pudo guardar el comentario. El texto se conserva para que puedas reintentarlo.')
    } finally {
      if (sigueSiendoEnvioActual()) {
        envioEnCursoRef.current = false
        setEnviando(false)
      }
    }
  }

  const datosVisibles = facturaCargada === facturaId ? datos : null
  const puedeComentar = datosVisibles?.puedeComentar === true
  const paginaActual = datosVisibles?.page ?? pagina
  const totalPaginas = datosVisibles?.totalPages ?? 0

  function cambiarPagina(nuevaPagina: number) {
    if (cargando || enviando || nuevaPagina < 1 || nuevaPagina > totalPaginas || nuevaPagina === paginaActual) return
    setPagina(nuevaPagina)
    void cargarComentarios(nuevaPagina)
  }

  return (
    <section id="comentarios" aria-labelledby="comentarios-titulo" className="bg-white text-gray-900 rounded-xl border border-gray-200 p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="comentarios-titulo" className="text-base font-semibold">Comentarios</h2>
          <p className="text-sm text-gray-600">Notas internas asociadas a esta factura.</p>
        </div>
        {datosVisibles && (
          <span className="text-sm text-gray-500" aria-label={`${datosVisibles.total} comentarios`}>
            {datosVisibles.total === 1 ? '1 comentario' : `${datosVisibles.total} comentarios`}
          </span>
        )}
      </div>

      <div className="mt-5" aria-live="polite">
        {cargando && <p className="text-sm text-gray-600">Cargando comentarios…</p>}
        {!cargando && error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void cargarComentarios(paginaActual)}
              className="mt-2 font-medium underline underline-offset-2 hover:text-red-950"
            >
              Reintentar
            </button>
          </div>
        )}
        {!cargando && !error && datosVisibles?.comentarios.length === 0 && (
          <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">Todavía no hay comentarios para esta factura.</p>
        )}
        {!cargando && !error && datosVisibles && datosVisibles.comentarios.length > 0 && (
          <ul className="space-y-3" aria-label="Lista de comentarios">
            {datosVisibles.comentarios.map((comentario) => (
              <li key={comentario.id} className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <p className="text-sm font-medium text-gray-900">{comentario.autor.nombre}</p>
                  <time dateTime={comentario.createdAt} className="shrink-0 text-xs text-gray-500">
                    {formatearFecha(comentario.createdAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">{comentario.texto}</p>
              </li>
            ))}
          </ul>
        )}
        {!cargando && !error && datosVisibles && totalPaginas > 1 && (
          <nav className="mt-4 flex flex-col gap-3 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between" aria-label="Paginación de comentarios" aria-busy={cargando || enviando}>
            <p className="text-sm text-gray-600" aria-live="polite">
              Página {paginaActual} de {totalPaginas}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => cambiarPagina(paginaActual - 1)}
                disabled={cargando || enviando || paginaActual === 1}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => cambiarPagina(paginaActual + 1)}
                disabled={cargando || enviando || paginaActual === totalPaginas}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Siguiente
              </button>
            </div>
          </nav>
        )}
      </div>

      {datosVisibles && datosVisibles.referenciasProveedor.length > 0 && (
        <details className="mt-5 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-800">
            Contexto: notas recientes de otras facturas del proveedor
          </summary>
          <p className="mt-2 text-xs text-gray-600">
            Solo sirven como contexto; no se aplican automáticamente ni crean reglas.
          </p>
          <ul className="mt-3 space-y-3">
            {datosVisibles.referenciasProveedor.map((referencia) => (
              <li key={referencia.id} className="border-l-2 border-gray-300 pl-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                  <a
                    href={`/admin/finanzas/facturas/${referencia.factura.id}#comentarios`}
                    className="text-sm font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
                  >
                    {referencia.factura.numFactura ? `Factura ${referencia.factura.numFactura}` : 'Factura sin número'}
                  </a>
                  <time dateTime={referencia.createdAt} className="text-xs text-gray-500">
                    {formatearFecha(referencia.createdAt)}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{referencia.texto}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {datosVisibles && !puedeComentar && (
        <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Puedes consultar los comentarios, pero tu permiso actual no permite añadir nuevos.
        </p>
      )}

      {puedeComentar && (
        <form onSubmit={enviarComentario} className="mt-5 border-t border-gray-200 pt-5">
          <label htmlFor="nuevo-comentario-factura" className="block text-sm font-medium text-gray-900">
            Añadir comentario
          </label>
          <textarea
            id="nuevo-comentario-factura"
            value={texto}
            onChange={(event) => setTexto(event.target.value.slice(0, MAX_TEXTO_LENGTH))}
            maxLength={MAX_TEXTO_LENGTH}
            rows={4}
            disabled={enviando}
            aria-describedby="contador-comentario-factura"
            className="mt-2 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
            placeholder="Escribe una nota interna sobre esta factura"
          />
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p id="contador-comentario-factura" className="text-xs text-gray-500" aria-live="polite">
              {texto.length} / {MAX_TEXTO_LENGTH} caracteres
            </p>
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              className="inline-flex justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {enviando ? 'Guardando…' : 'Añadir comentario'}
            </button>
          </div>
          {mensajeExito && <p className="mt-3 text-sm text-green-700" role="status">{mensajeExito}</p>}
        </form>
      )}
    </section>
  )
}
