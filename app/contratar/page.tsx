'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useCart, type CartItem } from '@/components/CartProvider'
import EmpresaNav from '@/components/EmpresaNav'
import EmpresaFooter from '@/components/EmpresaFooter'

function ContratarContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { items: cartItems, clearCart, totalConIva, totalAltas, totalGeneral } = useCart()

  const tarifaId = searchParams.get('tarifaId')
  const fromCart = searchParams.get('fromCart') === 'true'

  const [tarifa, setTarifa] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [customerType, setCustomerType] = useState<'PARTICULAR' | 'EMPRESA'>('PARTICULAR')
  const [paymentMethod, setPaymentMethod] = useState<string>('VIVID_CARD')
  const [periodicidad, setPeriodicidad] = useState<string>('MENSUAL')

  // Formulario
  const [form, setForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerNif: '',
    customerCompany: '',
  })

  // Modo: carrito o producto individual
  const isCartMode = fromCart && cartItems.length > 0

  useEffect(() => {
    if (isCartMode) {
      // Modo carrito: no necesitamos cargar tarifa
      setLoading(false)
      return
    }

    if (!tarifaId) {
      setError('No se ha especificado un producto')
      setLoading(false)
      return
    }

    fetch(`/api/tarifas/${tarifaId}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError('Producto no encontrado')
        } else {
          setTarifa(data)
          if (data.tipoPeriodicidad === 2) {
            setPeriodicidad('ANUAL')
          }
        }
        setLoading(false)
      })
      .catch(() => {
        setError('Error al cargar el producto')
        setLoading(false)
      })
  }, [tarifaId, isCartMode])

  // Calcular importes
  const importeAlta = isCartMode
    ? totalAltas
    : (tarifa?.cuotaAlta ? Number(tarifa.cuotaAlta) : 0)
  const importeCuota = isCartMode
    ? totalConIva
    : (tarifa ? Number(tarifa.precioConIva) : 0)
  const importeTotal = importeAlta + importeCuota
  const descuentoCrypto = paymentMethod === 'TRIPLE_A' ? Math.round(importeTotal * 0.01 * 100) / 100 : 0
  const importeFinal = importeTotal - descuentoCrypto

  // Métodos disponibles según importe
  const showSepa = importeTotal > 1000

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      if (isCartMode) {
        // Crear un pago por cada item del carrito (o un pago agrupado)
        // Por ahora creamos un pago con el primer item y el total
        const response = await fetch('/api/payments/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tarifaId: cartItems[0].tarifaId,
            customerEmail: form.customerEmail,
            customerName: form.customerName,
            customerPhone: form.customerPhone,
            customerNif: form.customerNif,
            customerCompany: form.customerCompany,
            customerType,
            paymentMethod,
            periodicidad: cartItems[0].periodicidad,
            // Pasar items del carrito para referencia
            cartItems: cartItems.map(i => ({
              tarifaId: i.tarifaId,
              nombre: i.nombre,
              cantidad: i.cantidad,
              precioConIva: i.precioConIva,
              cuotaAlta: i.cuotaAlta || 0,
            })),
            overrideAmount: importeFinal,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Error al procesar el pago')
        }

        clearCart()
        window.location.href = data.paymentUrl
      } else {
        const response = await fetch('/api/payments/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tarifaId: parseInt(tarifaId!),
            customerEmail: form.customerEmail,
            customerName: form.customerName,
            customerPhone: form.customerPhone,
            customerNif: form.customerNif,
            customerCompany: form.customerCompany,
            customerType,
            paymentMethod,
            periodicidad,
          }),
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || 'Error al procesar el pago')
        }

        window.location.href = data.paymentUrl
      }
    } catch (err: any) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (error && !tarifa && !isCartMode) {
    return (
      <div className="min-h-screen bg-gray-50">
        <EmpresaNav currentPage="" />
        <div className="flex items-center justify-center py-20">
          <div className="bg-white p-8 rounded-lg shadow-md text-center">
            <p className="text-red-600 text-lg">{error}</p>
            <button
              onClick={() => router.back()}
              className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600"
            >
              Volver
            </button>
          </div>
        </div>
        <EmpresaFooter />
      </div>
    )
  }

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)

  return (
    <div className="min-h-screen bg-gray-50">
      <EmpresaNav currentPage="" />

      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Finalizar contratación</h1>
          <p className="text-gray-600 mt-2">Completa tus datos para proceder al pago</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulario */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Tipo de cliente */}
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Tipo de cliente</h2>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => setCustomerType('PARTICULAR')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      customerType === 'PARTICULAR'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium">Particular</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomerType('EMPRESA')}
                    className={`flex-1 py-3 px-4 rounded-lg border-2 transition-all ${
                      customerType === 'EMPRESA'
                        ? 'border-orange-500 bg-orange-50 text-orange-700'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="font-medium">Empresa</span>
                  </button>
                </div>
              </div>

              {/* Datos personales */}
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Datos personales</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Nombre completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={form.customerName}
                      onChange={e => setForm({ ...form, customerName: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="Tu nombre y apellidos"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={form.customerEmail}
                      onChange={e => setForm({ ...form, customerEmail: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Teléfono *
                    </label>
                    <input
                      type="tel"
                      required
                      value={form.customerPhone}
                      onChange={e => setForm({ ...form, customerPhone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder="+34 600 000 000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {customerType === 'EMPRESA' ? 'CIF *' : 'DNI/NIE *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={form.customerNif}
                      onChange={e => setForm({ ...form, customerNif: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      placeholder={customerType === 'EMPRESA' ? 'B12345678' : '12345678A'}
                    />
                  </div>
                  {customerType === 'EMPRESA' && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Razón social *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.customerCompany}
                        onChange={e => setForm({ ...form, customerCompany: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                        placeholder="Nombre de la empresa"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Método de pago */}
              <div className="bg-white p-6 rounded-xl shadow-sm">
                <h2 className="text-lg font-semibold mb-4">Método de pago</h2>
                <div className="space-y-3">
                  {/* Tarjeta */}
                  <label
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      paymentMethod === 'VIVID_CARD'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="VIVID_CARD"
                      checked={paymentMethod === 'VIVID_CARD'}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <div className="text-2xl">💳</div>
                      <div>
                        <p className="font-medium text-gray-900">Tarjeta de crédito/débito</p>
                        <p className="text-sm text-gray-500">Visa, Mastercard, AMEX, Google Pay, Apple Pay</p>
                      </div>
                    </div>
                    {importeTotal >= 119 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Recomendado</span>
                    )}
                  </label>

                  {/* Crypto */}
                  <label
                    className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      paymentMethod === 'TRIPLE_A'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="TRIPLE_A"
                      checked={paymentMethod === 'TRIPLE_A'}
                      onChange={e => setPaymentMethod(e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex items-center gap-3 flex-1">
                      <div className="text-2xl">🪙</div>
                      <div>
                        <p className="font-medium text-gray-900">Stablecoins (USDC / EURC)</p>
                        <p className="text-sm text-gray-500">Pago con criptomonedas estables — 1% de descuento</p>
                      </div>
                    </div>
                    {importeTotal < 119 && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Recomendado</span>
                    )}
                    {descuentoCrypto > 0 && paymentMethod === 'TRIPLE_A' && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full ml-2">
                        -{descuentoCrypto.toFixed(2)}€
                      </span>
                    )}
                  </label>

                  {/* SEPA - solo para > 1000€ */}
                  {showSepa && (
                    <label
                      className={`flex items-center p-4 rounded-lg border-2 cursor-pointer transition-all ${
                        paymentMethod === 'VIVID_SEPA'
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="VIVID_SEPA"
                        checked={paymentMethod === 'VIVID_SEPA'}
                        onChange={e => setPaymentMethod(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-3 flex-1">
                        <div className="text-2xl">🏦</div>
                        <div>
                          <p className="font-medium text-gray-900">Transferencia bancaria (SEPA)</p>
                          <p className="text-sm text-gray-500">Transferencia directa — sin comisiones</p>
                        </div>
                      </div>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">Recomendado</span>
                    </label>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
                  {error}
                </div>
              )}

              {/* Botón de pago */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-orange-500 text-white font-bold text-lg rounded-xl hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Procesando...
                  </span>
                ) : (
                  `Pagar ${formatCurrency(importeFinal)}`
                )}
              </button>

              <p className="text-xs text-gray-500 text-center">
                Al hacer clic en &quot;Pagar&quot; aceptas nuestros términos y condiciones de servicio.
                El pago se procesará de forma segura a través de {paymentMethod === 'TRIPLE_A' ? 'Triple-A' : 'Vivid Business'}.
              </p>
            </form>
          </div>

          {/* Resumen del pedido */}
          <div className="lg:col-span-1">
            <div className="bg-white p-6 rounded-xl shadow-sm sticky top-24">
              <h2 className="text-lg font-semibold mb-4">Resumen del pedido</h2>

              {isCartMode ? (
                <div className="space-y-4">
                  {/* Items del carrito */}
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {cartItems.map((item) => (
                      <div key={item.tarifaId} className="flex justify-between items-start text-sm border-b border-gray-50 pb-2">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{item.nombre}</p>
                          {item.cantidad > 1 && (
                            <p className="text-xs text-gray-500">x{item.cantidad}</p>
                          )}
                        </div>
                        <p className="font-medium text-gray-900 ml-2">
                          {formatCurrency(item.precioConIva * item.cantidad)}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cuotas</span>
                      <span className="font-medium">{formatCurrency(totalConIva)}</span>
                    </div>
                    {totalAltas > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Altas</span>
                        <span className="font-medium">{formatCurrency(totalAltas)}</span>
                      </div>
                    )}
                    {descuentoCrypto > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento crypto (1%)</span>
                        <span>-{formatCurrency(descuentoCrypto)}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between">
                      <span className="font-bold text-gray-900">Total a pagar hoy</span>
                      <span className="font-bold text-xl text-orange-600">{formatCurrency(importeFinal)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">IVA incluido</p>
                  </div>
                </div>
              ) : tarifa ? (
                <div className="space-y-4">
                  <div>
                    <p className="font-medium text-gray-900">{tarifa.nombreComercial || tarifa.nombre}</p>
                    {tarifa.descripcionCorta && (
                      <p className="text-sm text-gray-500 mt-1">{tarifa.descripcionCorta}</p>
                    )}
                  </div>

                  <div className="border-t pt-4 space-y-2">
                    {importeAlta > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Alta</span>
                        <span className="font-medium">{formatCurrency(importeAlta)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        Cuota {periodicidad === 'ANUAL' ? 'anual' : periodicidad === 'MENSUAL' ? 'mensual' : ''}
                      </span>
                      <span className="font-medium">{formatCurrency(importeCuota)}</span>
                    </div>
                    {descuentoCrypto > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Descuento crypto (1%)</span>
                        <span>-{formatCurrency(descuentoCrypto)}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex justify-between">
                      <span className="font-bold text-gray-900">Total a pagar hoy</span>
                      <span className="font-bold text-xl text-orange-600">{formatCurrency(importeFinal)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">IVA incluido</p>

                  </div>
                </div>
              ) : null}

              {/* Trust badges */}
              <div className="mt-6 pt-4 border-t space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Pago seguro SSL 256-bit
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Activación inmediata tras el pago
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Soporte técnico incluido
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <EmpresaFooter />
    </div>
  )
}

export default function ContratarPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <ContratarContent />
    </Suspense>
  )
}
