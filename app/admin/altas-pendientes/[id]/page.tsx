'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

interface AltaDetalle {
  id: string
  tipoCliente: 'PARTICULAR' | 'EMPRESA'
  nombre?: string
  apellidos?: string
  dni?: string
  razonSocial?: string
  cif?: string
  nombreApoderado?: string
  dniApoderado?: string
  email: string
  telefono?: string
  direccionFacturacion: string
  localidadFacturacion: string
  provinciaFacturacion: string
  cpFacturacion: string
  direccionInstalacion?: string
  localidadInstalacion?: string
  provinciaInstalacion?: string
  cpInstalacion?: string
  metodoPago: string
  iban?: string
  tarifaId: number
  tarifaNombre: string
  importeCuota: number
  importeAlta?: number
  permanencia?: string
  esPortabilidad: boolean
  numeroPortar?: string
  operadorActual?: string
  titularLineaDiferente: boolean
  estado: string
  token: string
  observaciones?: string
  contratoPdfUrl?: string
  contratoFirmado: boolean
  createdAt: string
  updatedAt: string
  completadoAt?: string
  documentos: DocumentoInfo[]
  enviosContrato: EnvioContratoInfo[]
}

interface DocumentoInfo {
  id: number
  tipo: string
  nombreArchivo: string
  url: string
  mimeType?: string
  tamano?: number
  validado: boolean
  observaciones?: string
  createdAt: string
}

interface EnvioContratoInfo {
  id: number
  enviadoA: string
  enviadoPor?: string
  createdAt: string
}

const TIPO_DOC_LABEL: Record<string, string> = {
  DNI_FRONTAL: 'DNI (frontal)',
  DNI_TRASERO: 'DNI (trasera)',
  CIF_EMPRESA: 'CIF Empresa',
  ESCRITURAS: 'Escrituras',
  TITULARIDAD_BANCARIA: 'Titularidad bancaria',
  FACTURA_OPERADOR_ACTUAL: 'Factura operador actual',
  DNI_TITULAR_LINEA: 'DNI titular línea',
  CIF_TITULAR_LINEA: 'CIF titular línea',
  ESCRITURAS_TITULAR_LINEA: 'Escrituras titular línea',
  CONTRATO_FIRMADO: 'Contrato firmado',
  OTRO: 'Otro',
}

export default function AltaDetallePage() {
  const params = useParams()
  const router = useRouter()
  const [alta, setAlta] = useState<AltaDetalle | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editData, setEditData] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (params.id) fetchAlta()
  }, [params.id])

  const fetchAlta = async () => {
    try {
      const res = await fetch(`/api/admin/altas/${params.id}`)
      const data = await res.json()
      if (res.ok) setAlta(data)
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const cambiarEstado = async (nuevoEstado: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/altas/${params.id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado }),
      })
      if (res.ok) await fetchAlta()
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setActionLoading(false)
    }
  }

  const validarDocumento = async (docId: number, validado: boolean) => {
    try {
      await fetch(`/api/admin/altas/${params.id}/documentos/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validado }),
      })
      await fetchAlta()
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const startEdit = () => {
    if (!alta) return
    setEditData({
      nombre: alta.nombre || '',
      apellidos: alta.apellidos || '',
      dni: alta.dni || '',
      razonSocial: alta.razonSocial || '',
      cif: alta.cif || '',
      nombreApoderado: alta.nombreApoderado || '',
      dniApoderado: alta.dniApoderado || '',
      email: alta.email || '',
      telefono: alta.telefono || '',
      direccionFacturacion: alta.direccionFacturacion || '',
      localidadFacturacion: alta.localidadFacturacion || '',
      provinciaFacturacion: alta.provinciaFacturacion || '',
      cpFacturacion: alta.cpFacturacion || '',
      direccionInstalacion: alta.direccionInstalacion || '',
      localidadInstalacion: alta.localidadInstalacion || '',
      provinciaInstalacion: alta.provinciaInstalacion || '',
      cpInstalacion: alta.cpInstalacion || '',
      iban: alta.iban || '',
      observaciones: alta.observaciones || '',
    })
    setEditMode(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/altas/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      if (res.ok) {
        setEditMode(false)
        await fetchAlta()
      } else {
        const data = await res.json()
        alert(data.error || 'Error al guardar')
      }
    } catch (err) {
      alert('Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (!alta) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Alta no encontrada</p>
        <Link href="/admin/altas-pendientes" className="text-orange-600 hover:underline mt-2 inline-block">
          Volver al listado
        </Link>
      </div>
    )
  }

  const nombreCliente = alta.tipoCliente === 'EMPRESA'
    ? alta.razonSocial
    : `${alta.nombre} ${alta.apellidos}`

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/admin/altas-pendientes" className="text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{nombreCliente}</h1>
          <p className="text-sm text-gray-500">{alta.tarifaNombre}</p>
        </div>
        <div className="flex gap-2">
          {!editMode && (
            <button onClick={startEdit}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200">
              ✏️ Editar datos
            </button>
          )}
          {alta.estado === 'DOCUMENTACION_COMPLETA' && (
            <button onClick={() => cambiarEstado('EN_REVISION')} disabled={actionLoading}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 disabled:opacity-50">
              Marcar en revisión
            </button>
          )}
          {alta.estado === 'EN_REVISION' && (
            <>
              <button onClick={() => cambiarEstado('APROBADA')} disabled={actionLoading}
                className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50">
                Aprobar
              </button>
              <button onClick={() => cambiarEstado('RECHAZADA')} disabled={actionLoading}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50">
                Rechazar
              </button>
            </>
          )}
          {alta.estado === 'APROBADA' && (
            <button onClick={() => cambiarEstado('SERVICIO_ACTIVO')} disabled={actionLoading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Activar servicio
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Datos del titular */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Datos del titular</h2>
              {editMode && (
                <div className="flex gap-2">
                  <button onClick={() => setEditMode(false)} className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">
                    Cancelar
                  </button>
                  <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-xs text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              )}
            </div>

            {editMode ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                {alta.tipoCliente === 'PARTICULAR' ? (
                  <>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">Nombre</label>
                      <input type="text" value={editData.nombre || ''} onChange={e => setEditData({...editData, nombre: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">Apellidos</label>
                      <input type="text" value={editData.apellidos || ''} onChange={e => setEditData({...editData, apellidos: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">DNI</label>
                      <input type="text" value={editData.dni || ''} onChange={e => setEditData({...editData, dni: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">Razón Social</label>
                      <input type="text" value={editData.razonSocial || ''} onChange={e => setEditData({...editData, razonSocial: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">CIF</label>
                      <input type="text" value={editData.cif || ''} onChange={e => setEditData({...editData, cif: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">Apoderado</label>
                      <input type="text" value={editData.nombreApoderado || ''} onChange={e => setEditData({...editData, nombreApoderado: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-gray-600 text-xs font-medium mb-1">DNI Apoderado</label>
                      <input type="text" value={editData.dniApoderado || ''} onChange={e => setEditData({...editData, dniApoderado: e.target.value})}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                  </>
                )}
                <div>
                  <label className="block text-gray-600 text-xs font-medium mb-1">Email</label>
                  <input type="email" value={editData.email || ''} onChange={e => setEditData({...editData, email: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs font-medium mb-1">Teléfono</label>
                  <input type="text" value={editData.telefono || ''} onChange={e => setEditData({...editData, telefono: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div className="col-span-2">
                  <label className="block text-gray-600 text-xs font-medium mb-1">Dirección facturación</label>
                  <input type="text" value={editData.direccionFacturacion || ''} onChange={e => setEditData({...editData, direccionFacturacion: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs font-medium mb-1">Localidad</label>
                  <input type="text" value={editData.localidadFacturacion || ''} onChange={e => setEditData({...editData, localidadFacturacion: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs font-medium mb-1">Provincia</label>
                  <input type="text" value={editData.provinciaFacturacion || ''} onChange={e => setEditData({...editData, provinciaFacturacion: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs font-medium mb-1">Código Postal</label>
                  <input type="text" value={editData.cpFacturacion || ''} onChange={e => setEditData({...editData, cpFacturacion: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-gray-600 text-xs font-medium mb-1">IBAN</label>
                  <input type="text" value={editData.iban || ''} onChange={e => setEditData({...editData, iban: e.target.value})}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div className="col-span-2">
                  <label className="block text-gray-600 text-xs font-medium mb-1">Observaciones</label>
                  <textarea value={editData.observaciones || ''} onChange={e => setEditData({...editData, observaciones: e.target.value})}
                    rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="Notas internas o del cliente..." />
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 text-xs font-medium">Tipo</p>
                    <p className="font-medium text-gray-900">{alta.tipoCliente === 'EMPRESA' ? 'Empresa' : 'Particular'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs font-medium">{alta.tipoCliente === 'EMPRESA' ? 'CIF' : 'DNI'}</p>
                    <p className="font-medium text-gray-900">{alta.tipoCliente === 'EMPRESA' ? alta.cif : alta.dni}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs font-medium">Email</p>
                    <p className="font-medium text-gray-900">{alta.email}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs font-medium">Teléfono</p>
                    <p className="font-medium text-gray-900">{alta.telefono || '-'}</p>
                  </div>
                  {alta.tipoCliente === 'EMPRESA' && (
                    <>
                      <div>
                        <p className="text-gray-500 text-xs font-medium">Apoderado</p>
                        <p className="font-medium text-gray-900">{alta.nombreApoderado || '-'}</p>
                      </div>
                      <div>
                        <p className="text-gray-500 text-xs font-medium">DNI Apoderado</p>
                        <p className="font-medium text-gray-900">{alta.dniApoderado || '-'}</p>
                      </div>
                    </>
                  )}
                </div>

                <h3 className="text-sm font-semibold text-gray-700 mt-6 mb-2">Dirección de facturación</h3>
                <p className="text-sm text-gray-900">{alta.direccionFacturacion}</p>
                <p className="text-sm text-gray-700">{alta.cpFacturacion} {alta.localidadFacturacion}, {alta.provinciaFacturacion}</p>

                {alta.direccionInstalacion && (
                  <>
                    <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-2">Dirección de instalación</h3>
                    <p className="text-sm text-gray-900">{alta.direccionInstalacion}</p>
                    <p className="text-sm text-gray-700">{alta.cpInstalacion} {alta.localidadInstalacion}, {alta.provinciaInstalacion}</p>
                  </>
                )}

                {/* Observaciones */}
                {alta.observaciones && (
                  <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-xs font-semibold text-amber-800 mb-1">Observaciones</p>
                    <p className="text-sm text-amber-900">{alta.observaciones}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Documentación */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Documentación ({alta.documentos.length} archivos)
            </h2>
            {alta.documentos.length === 0 ? (
              <p className="text-gray-500 text-sm">El cliente aún no ha subido documentación.</p>
            ) : (
              <div className="space-y-3">
                {alta.documentos.map(doc => (
                  <div key={doc.id} className={`flex items-center gap-4 p-3 rounded-lg border ${
                    doc.validado ? 'border-green-200 bg-green-50' : 'border-gray-200'
                  }`}>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900">
                          {TIPO_DOC_LABEL[doc.tipo] || doc.tipo}
                        </p>
                        {doc.validado && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">✓ Validado</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600">{doc.nombreArchivo} · {doc.tamano ? `${(doc.tamano / 1024).toFixed(0)} KB` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <a href={doc.url} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-orange-600 hover:text-orange-700 font-medium">
                        Ver
                      </a>
                      <button
                        onClick={() => validarDocumento(doc.id, !doc.validado)}
                        className={`text-xs px-2 py-1 rounded font-medium ${
                          doc.validado
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                      >
                        {doc.validado ? 'Invalidar' : 'Validar'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Portabilidad */}
          {alta.esPortabilidad && (
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Portabilidad</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs font-medium">Número a portar</p>
                  <p className="font-medium text-gray-900">{alta.numeroPortar || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-medium">Operador actual</p>
                  <p className="font-medium text-gray-900">{alta.operadorActual || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-medium">Titular diferente</p>
                  <p className="font-medium text-gray-900">{alta.titularLineaDiferente ? 'Sí' : 'No'}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {/* Estado */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado actual</h3>
            <span className={`inline-block text-sm px-3 py-1.5 rounded-full font-medium ${
              (alta.estado === 'APROBADA' || alta.estado === 'SERVICIO_ACTIVO') ? 'bg-green-100 text-green-800' :
              alta.estado === 'RECHAZADA' ? 'bg-red-100 text-red-700' :
              alta.estado === 'EN_REVISION' ? 'bg-purple-100 text-purple-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {alta.estado.replace(/_/g, ' ')}
            </span>
            <div className="mt-4 text-xs text-gray-600 space-y-1">
              <p>Creada: {new Date(alta.createdAt).toLocaleString('es-ES')}</p>
              <p>Actualizada: {new Date(alta.updatedAt).toLocaleString('es-ES')}</p>
              {alta.completadoAt && <p>Completada: {new Date(alta.completadoAt).toLocaleString('es-ES')}</p>}
            </div>
          </div>

          {/* Servicio */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Servicio</h3>
            <p className="text-sm font-medium text-gray-900">{alta.tarifaNombre}</p>
            <p className="text-lg font-bold text-orange-600 mt-1">{Number(alta.importeCuota).toFixed(2)}€/mes</p>
            {alta.importeAlta && Number(alta.importeAlta) > 0 && (
              <p className="text-sm text-gray-600">Alta: {Number(alta.importeAlta).toFixed(2)}€</p>
            )}
            {alta.permanencia && <p className="text-sm text-gray-600">Permanencia: {alta.permanencia}</p>}
          </div>

          {/* Pago */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Método de pago</h3>
            <p className="text-sm font-medium text-gray-900">
              {alta.metodoPago === 'SEPA_DOMICILIACION' && '🏦 Domiciliación SEPA'}
              {alta.metodoPago === 'TARJETA_VIVID' && '💳 Tarjeta'}
              {alta.metodoPago === 'CRYPTO_TRIPLE_A' && '🪙 Criptomonedas'}
            </p>
            {alta.iban && (
              <p className="text-sm text-gray-800 font-mono mt-1">
                {alta.iban.replace(/(.{4})/g, '$1 ').trim()}
              </p>
            )}
          </div>

          {/* Enlace documentación */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Enlace del cliente</h3>
            <p className="text-xs text-gray-600 mb-2">Enlace para que el cliente complete/modifique su documentación:</p>
            <div className="bg-gray-50 p-2 rounded text-xs font-mono break-all text-gray-700">
              https://www.internetoperadores.com/alta-servicio/documentacion?token={alta.token}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`https://www.internetoperadores.com/alta-servicio/documentacion?token=${alta.token}`)
                  alert('Enlace copiado al portapapeles')
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-xs font-medium text-gray-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copiar
              </button>
              <button
                onClick={() => {
                  const url = `https://www.internetoperadores.com/alta-servicio/documentacion?token=${alta.token}`
                  const text = `Hola ${alta.nombre || alta.razonSocial || ''}, aquí tienes el enlace para completar la documentación de tu alta en Internet Operadores: ${url}`
                  if (navigator.share) {
                    navigator.share({ title: 'Documentación - Internet Operadores', text, url })
                  } else {
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
                  }
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-100 hover:bg-green-200 rounded-lg text-xs font-medium text-green-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Compartir
              </button>
              <button
                onClick={() => {
                  const url = `https://www.internetoperadores.com/alta-servicio/documentacion?token=${alta.token}`
                  const subject = encodeURIComponent('Documentación para tu alta - Internet Operadores')
                  const body = encodeURIComponent(`Hola ${alta.nombre || alta.razonSocial || ''},\n\nPara completar el proceso de alta de tu servicio, necesitamos que subas la documentación requerida a través del siguiente enlace:\n\n${url}\n\nSi tienes alguna duda, no dudes en contactarnos.\n\nUn saludo,\nInternet Operadores`)
                  window.open(`mailto:${alta.email}?subject=${subject}&body=${body}`, '_blank')
                }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-orange-100 hover:bg-orange-200 rounded-lg text-xs font-medium text-orange-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email
              </button>
            </div>
          </div>

          {/* Contrato */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Contrato</h3>
            <div className="space-y-3">
              <a
                href={`/api/altas/contrato?altaId=${alta.id}&format=html`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Ver contrato generado
              </a>
              <div className="border-t pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`w-2 h-2 rounded-full ${alta.contratoFirmado ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                  <span className="text-xs text-gray-700">
                    {alta.contratoFirmado ? 'Contrato firmado por el cliente' : 'Pendiente de firma del cliente'}
                  </span>
                </div>
                <button
                  onClick={async () => {
                    setActionLoading(true)
                    try {
                      const res = await fetch(`/api/altas/${alta.id}/enviar-contrato`, { method: 'POST' })
                      if (res.ok) {
                        alert('Contrato enviado por email al cliente')
                        await fetchAlta()
                      } else {
                        const data = await res.json()
                        alert(data.error || 'Error al enviar el contrato')
                      }
                    } catch (err) {
                      alert('Error al enviar el contrato')
                    } finally {
                      setActionLoading(false)
                    }
                  }}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs font-medium text-blue-700 transition-colors disabled:opacity-50"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  Enviar contrato al cliente por email
                </button>
              </div>

              {/* Historial de envíos */}
              {alta.enviosContrato && alta.enviosContrato.length > 0 && (
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Historial de envíos</p>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {alta.enviosContrato.map(envio => (
                      <div key={envio.id} className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full flex-shrink-0"></span>
                        <span className="font-medium">{new Date(envio.createdAt).toLocaleString('es-ES')}</span>
                        <span className="text-gray-400">→</span>
                        <span>{envio.enviadoA}</span>
                        {envio.enviadoPor && <span className="text-gray-400 ml-auto">por {envio.enviadoPor.split('@')[0]}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
