'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'

interface AltaInfo {
  id: string
  tipoCliente: 'PARTICULAR' | 'EMPRESA'
  nombre?: string
  apellidos?: string
  razonSocial?: string
  email: string
  tarifaNombre: string
  estado: string
  esPortabilidad: boolean
  titularLineaDiferente: boolean
  documentos: DocumentoInfo[]
}

interface DocumentoInfo {
  id: number
  tipo: string
  nombreArchivo: string
  url: string
  validado: boolean
  createdAt: string
}

interface DocRequerido {
  tipo: string
  label: string
  descripcion: string
  obligatorio: boolean
}

const DOCS_PARTICULAR: DocRequerido[] = [
  { tipo: 'CONTRATO_FIRMADO', label: 'Contrato firmado', descripcion: 'Contrato de servicio firmado por el titular (descargado del email que te enviamos)', obligatorio: true },
  { tipo: 'DNI_FRONTAL', label: 'DNI (cara frontal)', descripcion: 'Foto del DNI vigente por la cara frontal', obligatorio: true },
  { tipo: 'DNI_TRASERO', label: 'DNI (cara trasera)', descripcion: 'Foto del DNI vigente por la cara trasera', obligatorio: true },
  { tipo: 'TITULARIDAD_BANCARIA', label: 'Certificado de titularidad bancaria', descripcion: 'Certificado del banco o recibo donde aparezca el nombre del titular y todos los dígitos de la cuenta', obligatorio: true },
]

const DOCS_EMPRESA: DocRequerido[] = [
  { tipo: 'CONTRATO_FIRMADO', label: 'Contrato firmado', descripcion: 'Contrato de servicio firmado por el representante legal (descargado del email que te enviamos)', obligatorio: true },
  { tipo: 'CIF_EMPRESA', label: 'Tarjeta CIF de la empresa', descripcion: 'Tarjeta identificativa del CIF de la empresa', obligatorio: true },
  { tipo: 'DNI_FRONTAL', label: 'DNI del apoderado (frontal)', descripcion: 'Foto del DNI vigente del apoderado o persona con poderes (cara frontal)', obligatorio: true },
  { tipo: 'DNI_TRASERO', label: 'DNI del apoderado (trasera)', descripcion: 'Foto del DNI vigente del apoderado (cara trasera)', obligatorio: true },
  { tipo: 'ESCRITURAS', label: 'Escrituras', descripcion: 'Solo necesario si contrata telefonía', obligatorio: false },
  { tipo: 'TITULARIDAD_BANCARIA', label: 'Certificado de titularidad bancaria', descripcion: 'Certificado del banco o recibo donde aparezca el nombre del titular y todos los dígitos de la cuenta', obligatorio: true },
]

const DOCS_PORTABILIDAD: DocRequerido[] = [
  { tipo: 'DNI_TITULAR_LINEA', label: 'DNI del titular actual de la línea', descripcion: 'Si el titular es persona física: DNI vigente. Si es empresa: CIF + DNI representante', obligatorio: true },
  { tipo: 'FACTURA_OPERADOR_ACTUAL', label: 'Factura del operador actual', descripcion: 'Última factura del operador del que se porta el número', obligatorio: true },
]

function DocumentacionContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [altaInfo, setAltaInfo] = useState<AltaInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [completado, setCompletado] = useState(false)

  const fetchAlta = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetch(`/api/altas/info?token=${token}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setAltaInfo(data)
    } catch (err: any) {
      setError(err.message || 'Error al cargar la información')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchAlta()
  }, [fetchAlta])

  const getDocsRequeridos = (): DocRequerido[] => {
    if (!altaInfo) return []
    let docs = altaInfo.tipoCliente === 'EMPRESA' ? [...DOCS_EMPRESA] : [...DOCS_PARTICULAR]
    if (altaInfo.esPortabilidad && altaInfo.titularLineaDiferente) {
      docs = [...docs, ...DOCS_PORTABILIDAD]
    }
    return docs
  }

  const getDocSubido = (tipo: string): DocumentoInfo | undefined => {
    return altaInfo?.documentos.find(d => d.tipo === tipo)
  }

  const handleUpload = async (tipo: string, file: File) => {
    if (!token) return
    setUploading(tipo)
    setError('')
    setSuccess('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('tipo', tipo)
    formData.append('token', token)

    try {
      const res = await fetch('/api/altas/documentos', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSuccess(`${file.name} subido correctamente`)
      await fetchAlta()
    } catch (err: any) {
      setError(err.message || 'Error al subir el documento')
    } finally {
      setUploading(null)
    }
  }

  const handleFinalizar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await fetch('/api/altas/completar-documentacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCompletado(true)
    } catch (err: any) {
      setError(err.message || 'Error al finalizar')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (!token || (!altaInfo && !loading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-md">
          <p className="text-red-600 text-lg font-medium">Enlace no válido</p>
          <p className="text-gray-500 mt-2">El enlace de documentación no es válido o ha expirado.</p>
        </div>
      </div>
    )
  }

  if (completado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-sm text-center max-w-lg">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Documentación enviada</h2>
          <p className="text-gray-600 mb-4">
            Hemos recibido tu documentación correctamente. Nuestro equipo revisará todo y te contactaremos
            para confirmar la activación del servicio.
          </p>
          <p className="text-sm text-gray-500">
            Recibirás un email de confirmación en <strong>{altaInfo?.email}</strong>.
            Si necesitas añadir o modificar algún documento, puedes volver a este enlace en cualquier momento.
          </p>
          <div className="mt-6 p-3 bg-orange-50 rounded-lg">
            <p className="text-sm text-orange-700">
              <strong>Tiempo estimado de activación:</strong> 5-10 días hábiles
            </p>
          </div>
        </div>
      </div>
    )
  }

  const docsRequeridos = getDocsRequeridos()
  const docsObligatoriosSubidos = docsRequeridos
    .filter(d => d.obligatorio)
    .every(d => getDocSubido(d.tipo))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-orange-500 italic">io</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Documentación</h1>
              <p className="text-sm text-gray-500">Alta de servicio · {altaInfo?.tarifaNombre}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Info del alta */}
        <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-500">Titular</p>
              <p className="font-medium text-gray-900">
                {altaInfo?.tipoCliente === 'EMPRESA' ? altaInfo.razonSocial : `${altaInfo?.nombre} ${altaInfo?.apellidos}`}
              </p>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
              altaInfo?.tipoCliente === 'EMPRESA' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {altaInfo?.tipoCliente === 'EMPRESA' ? 'Empresa' : 'Particular'}
            </span>
          </div>
        </div>

        {/* Instrucciones */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <h3 className="text-sm font-bold text-blue-800 mb-1">Documentación necesaria</h3>
          <p className="text-sm text-blue-700">
            Sube los documentos requeridos para tramitar tu alta. Los archivos marcados con * son obligatorios.
            Puedes subir imágenes (JPG, PNG) o documentos PDF. Tamaño máximo: 10 MB por archivo.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
            {success}
          </div>
        )}

        {/* Lista de documentos */}
        <div className="space-y-3">
          {docsRequeridos.map((doc) => {
            const subido = getDocSubido(doc.tipo)
            const isUploading = uploading === doc.tipo

            return (
              <div key={doc.tipo} className={`bg-white rounded-xl shadow-sm border p-4 transition ${
                subido ? 'border-green-200' : doc.obligatorio ? 'border-orange-200' : 'border-gray-200'
              }`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {subido ? (
                        <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      )}
                      <h4 className="text-sm font-medium text-gray-900">
                        {doc.label} {doc.obligatorio && <span className="text-red-500">*</span>}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-8">{doc.descripcion}</p>
                    {subido && (
                      <p className="text-xs text-green-600 mt-1 ml-8">
                        ✓ {subido.nombreArchivo} — subido {new Date(subido.createdAt).toLocaleDateString('es-ES')}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    <label className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition ${
                      isUploading ? 'bg-gray-100 text-gray-400' :
                      subido ? 'bg-green-50 text-green-700 hover:bg-green-100' :
                      'bg-orange-50 text-orange-700 hover:bg-orange-100'
                    }`}>
                      {isUploading ? (
                        <>
                          <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Subiendo...
                        </>
                      ) : subido ? (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Reemplazar
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Subir
                        </>
                      )}
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*,.pdf"
                        disabled={isUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handleUpload(doc.tipo, file)
                          e.target.value = ''
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Botón finalizar */}
        <div className="mt-8">
          <button
            onClick={handleFinalizar}
            disabled={!docsObligatoriosSubidos || loading}
            className={`w-full py-3 rounded-lg font-medium transition ${
              docsObligatoriosSubidos
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-200 text-gray-500 cursor-not-allowed'
            }`}
          >
            {docsObligatoriosSubidos ? 'Enviar documentación y finalizar' : 'Sube todos los documentos obligatorios para continuar'}
          </button>
          {!docsObligatoriosSubidos && (
            <p className="text-xs text-center text-gray-500 mt-2">
              Faltan {docsRequeridos.filter(d => d.obligatorio && !getDocSubido(d.tipo)).length} documento(s) obligatorio(s)
            </p>
          )}
        </div>

        {/* Info */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Puedes volver a este enlace en cualquier momento para añadir o modificar documentación.
          También recibirás un email con el enlace directo.
        </p>
      </div>
    </div>
  )
}

export default function DocumentacionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <DocumentacionContent />
    </Suspense>
  )
}
