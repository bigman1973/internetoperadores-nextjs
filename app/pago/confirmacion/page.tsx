'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ConfirmacionContent() {
  const searchParams = useSearchParams()
  const orderId = searchParams.get('orderId')
  const [order, setOrder] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orderId) {
      setLoading(false)
      return
    }

    // Polling para verificar el estado del pago (el webhook puede tardar unos segundos)
    const checkStatus = async () => {
      try {
        const res = await fetch(`/api/payments/status?orderId=${orderId}`)
        const data = await res.json()
        setOrder(data)
        
        if (data.paymentStatus === 'PROCESSING') {
          // Si aún está procesando, reintentar en 3 segundos
          setTimeout(checkStatus, 3000)
        } else {
          setLoading(false)
        }
      } catch {
        setLoading(false)
      }
    }

    checkStatus()
  }, [orderId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-900">Verificando tu pago...</h2>
          <p className="text-gray-500 mt-2">Esto puede tardar unos segundos</p>
        </div>
      </div>
    )
  }

  if (!orderId || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-md">
          <div className="text-6xl mb-4">❓</div>
          <h2 className="text-xl font-semibold text-gray-900">Pedido no encontrado</h2>
          <p className="text-gray-500 mt-2">No hemos podido localizar tu pedido.</p>
          <Link href="/" className="mt-6 inline-block px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600">
            Volver al inicio
          </Link>
        </div>
      </div>
    )
  }

  const isPaid = order.paymentStatus === 'PAID'
  const isFailed = order.paymentStatus === 'FAILED' || order.paymentStatus === 'CANCELLED'

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
      <div className="bg-white p-8 rounded-lg shadow-md text-center max-w-lg w-full">
        {isPaid ? (
          <>
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">¡Pago realizado con éxito!</h1>
            <p className="text-gray-600 mb-6">
              Tu contratación se ha procesado correctamente. Recibirás un email de confirmación en breve.
            </p>
            
            <div className="bg-gray-50 rounded-lg p-4 text-left mb-6">
              <h3 className="font-semibold text-gray-900 mb-3">Detalles del pedido</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Pedido</span>
                  <span className="font-mono text-xs">{order.id?.slice(0, 8)}...</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Producto</span>
                  <span className="font-medium">{order.tarifaNombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Importe</span>
                  <span className="font-medium">{Number(order.importeTotal).toFixed(2)}€</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Método</span>
                  <span className="font-medium">
                    {order.paymentGateway === 'VIVID_CARD' ? 'Tarjeta' : 
                     order.paymentGateway === 'TRIPLE_A' ? 'Stablecoins' : 'Transferencia SEPA'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left mb-6">
              <p className="text-sm text-blue-800">
                <strong>Próximos pasos:</strong> Nuestro equipo se pondrá en contacto contigo para completar la activación del servicio y solicitar la documentación necesaria.
              </p>
            </div>
          </>
        ) : isFailed ? (
          <>
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago no completado</h1>
            <p className="text-gray-600 mb-6">
              El pago no se ha podido procesar. Puedes intentarlo de nuevo o contactar con nuestro equipo.
            </p>
            <div className="flex gap-4 justify-center">
              <button
                onClick={() => window.history.back()}
                className="px-6 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
              >
                Intentar de nuevo
              </button>
              <Link href="/contacto" className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                Contactar
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Pago pendiente de confirmación</h1>
            <p className="text-gray-600 mb-6">
              Tu pago está siendo procesado. Te enviaremos un email cuando se confirme.
            </p>
          </>
        )}

        <Link href="/" className="inline-block mt-4 text-orange-600 hover:text-orange-700 font-medium">
          ← Volver al inicio
        </Link>
      </div>
    </div>
  )
}

export default function ConfirmacionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <ConfirmacionContent />
    </Suspense>
  )
}
