'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

function RespuestaContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const opcion = searchParams.get('opcion')
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'invalid'>('loading')
  const [mensaje, setMensaje] = useState('')
  const [clienteNombre, setClienteNombre] = useState('')

  useEffect(() => {
    if (!token || !opcion) {
      setStatus('invalid')
      return
    }

    const validOptions = ['aceptar', 'llamar', 'baja']
    if (!validOptions.includes(opcion)) {
      setStatus('invalid')
      return
    }

    // Enviar la respuesta al backend
    const enviarRespuesta = async () => {
      try {
        const res = await fetch('/api/respuesta-migracion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, opcion }),
        })

        const data = await res.json()

        if (res.ok) {
          setStatus('success')
          setClienteNombre(data.nombre || '')
          switch (opcion) {
            case 'aceptar':
              setMensaje('Has aceptado la tarifa recomendada. Un asesor de Internet Operadores se pondrá en contacto contigo para confirmar la migración y coordinar los detalles.')
              break
            case 'llamar':
              setMensaje('Hemos registrado tu solicitud. Un asesor de Internet Operadores te llamará en los próximos días para presentarte todas las opciones disponibles.')
              break
            case 'baja':
              setMensaje('Hemos registrado tu solicitud de baja. Un asesor de Internet Operadores se pondrá en contacto contigo para confirmar y gestionar el proceso.')
              break
          }
        } else {
          setStatus('error')
          setMensaje(data.error || 'Ha ocurrido un error al procesar tu respuesta.')
        }
      } catch {
        setStatus('error')
        setMensaje('Ha ocurrido un error de conexión. Por favor, inténtalo de nuevo o contacta con nosotros.')
      }
    }

    enviarRespuesta()
  }, [token, opcion])

  const getIcon = () => {
    switch (opcion) {
      case 'aceptar': return '✅'
      case 'llamar': return '📞'
      case 'baja': return '👋'
      default: return '📋'
    }
  }

  const getTitle = () => {
    switch (opcion) {
      case 'aceptar': return 'Tarifa aceptada'
      case 'llamar': return 'Solicitud registrada'
      case 'baja': return 'Solicitud de baja registrada'
      default: return 'Respuesta registrada'
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Procesando tu respuesta...</p>
        </div>
      </div>
    )
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Enlace no válido</h1>
          <p className="text-gray-600 mb-6">Este enlace no es válido o ha expirado. Si necesitas ayuda, contacta con nosotros.</p>
          <a href="tel:973621541" className="inline-block bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-600">
            Llamar al 973 621 541
          </a>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">❌</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-gray-600 mb-6">{mensaje}</p>
          <a href="tel:973621541" className="inline-block bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-600">
            Llamar al 973 621 541
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">{getIcon()}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">{getTitle()}</h1>
        {clienteNombre && (
          <p className="text-gray-500 mb-4">Gracias, {clienteNombre}</p>
        )}
        <p className="text-gray-600 mb-6 leading-relaxed">{mensaje}</p>
        
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <p className="text-sm text-gray-500 mb-1">¿Necesitas contactarnos?</p>
          <p className="text-lg font-bold text-gray-900">973 621 541</p>
          <p className="text-sm text-gray-500">comercial@internetoperadores.com</p>
        </div>

        <a href="https://www.internetoperadores.com" className="text-orange-500 hover:text-orange-600 text-sm font-medium">
          ← Volver a internetoperadores.com
        </a>
      </div>
    </div>
  )
}

export default function RespuestaMigracionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <RespuestaContent />
    </Suspense>
  )
}
