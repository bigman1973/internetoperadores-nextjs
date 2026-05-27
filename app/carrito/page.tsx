'use client'

import Link from 'next/link'
import { useCart, type CartItem } from '@/components/CartProvider'
import DynamicNav from '@/components/DynamicNav'
import ParticularFooter from '@/components/ParticularFooter'

export default function CarritoPage() {
  const { items, removeItem, updateQuantity, clearCart, itemCount, totalConIva, totalAltas, totalGeneral } = useCart()

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DynamicNav currentPage="" />

      <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Servicios seleccionados {itemCount > 0 && <span className="text-gray-400 text-lg font-normal">({itemCount} {itemCount === 1 ? 'servicio' : 'servicios'})</span>}
          </h1>
          {items.length > 0 && (
            <button
              onClick={clearCart}
              className="text-sm text-red-500 hover:text-red-700 transition-colors"
            >
              Eliminar todo
            </button>
          )}
        </div>

        {items.length === 0 ? (
          /* Carrito vacío */
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No has seleccionado ningún servicio</h2>
            <p className="text-gray-500 mb-6">Explora nuestras tarifas y selecciona los servicios que necesitas.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/tarifas/particular"
                className="inline-block px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold"
              >
                Tarifas Particular
              </Link>
              <Link
                href="/tarifas/empresa"
                className="inline-block px-6 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-semibold"
              >
                Tarifas Empresa
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Lista de productos */}
            <div className="lg:col-span-2 space-y-4">
              {items.map((item) => (
                <div key={item.tarifaId} className="bg-white rounded-xl shadow-sm p-4 sm:p-6 flex flex-col sm:flex-row gap-4">
                  {/* Info del producto */}
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                      <div>
                        {item.categoria && (
                          <span className="text-xs text-orange-600 font-semibold uppercase tracking-wider">
                            {item.categoria}
                          </span>
                        )}
                        <h3 className="text-lg font-bold text-gray-900 mt-1">{item.nombre}</h3>
                        {item.descripcion && (
                          <p className="text-sm text-gray-500 mt-1">{item.descripcion}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.tarifaId)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        title="Eliminar"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                      {/* Cantidad */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">Líneas:</span>
                        <div className="flex items-center border border-gray-200 rounded-lg">
                          <button
                            onClick={() => updateQuantity(item.tarifaId, item.cantidad - 1)}
                            className="px-3 py-1 text-gray-600 hover:bg-gray-100 transition-colors rounded-l-lg"
                          >
                            -
                          </button>
                          <span className="px-3 py-1 text-sm font-medium border-x border-gray-200">
                            {item.cantidad}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.tarifaId, item.cantidad + 1)}
                            className="px-3 py-1 text-gray-600 hover:bg-gray-100 transition-colors rounded-r-lg"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Precio */}
                      <div className="text-right">
                        <p className="text-lg font-bold text-gray-900">
                          {formatCurrency(item.precioConIva * item.cantidad)}
                          <span className="text-xs text-gray-400 font-normal">
                            /{item.periodicidad === 'ANUAL' ? 'año' : item.periodicidad === 'MENSUAL' ? 'mes' : ''}
                          </span>
                        </p>
                        {item.cuotaAlta && item.cuotaAlta > 0 && (
                          <p className="text-xs text-gray-500">
                            + Alta: {formatCurrency(item.cuotaAlta * item.cantidad)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Seguir añadiendo */}
              <div className="text-center pt-4">
                <Link
                  href="/tarifas/particular"
                  className="inline-flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Añadir más servicios
                </Link>
              </div>
            </div>

            {/* Resumen del pedido */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm p-6 sticky top-24">
                <h2 className="text-lg font-bold text-gray-900 mb-4">Resumen de tu alta</h2>

                <div className="space-y-3 border-b border-gray-100 pb-4 mb-4">
                  {items.filter(i => i.periodicidad === 'MENSUAL').length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cuotas mensuales</span>
                      <span className="font-medium">{formatCurrency(items.filter(i => i.periodicidad === 'MENSUAL').reduce((s, i) => s + i.precioConIva * i.cantidad, 0))}/mes</span>
                    </div>
                  )}
                  {items.filter(i => i.periodicidad === 'ANUAL').length > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cuotas anuales</span>
                      <span className="font-medium">{formatCurrency(items.filter(i => i.periodicidad === 'ANUAL').reduce((s, i) => s + i.precioConIva * i.cantidad, 0))}/año</span>
                    </div>
                  )}
                  {totalAltas > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cuotas de alta (pago único)</span>
                      <span className="font-medium">{formatCurrency(totalAltas)}</span>
                    </div>
                  )}
                </div>

                <div className="flex justify-between mb-6">
                  <span className="font-bold text-gray-900">Total mensual</span>
                  <span className="font-bold text-xl text-orange-600">{formatCurrency(totalConIva)}</span>
                </div>

                <p className="text-xs text-gray-500 mb-4">IVA incluido. No se realizará ningún cargo hasta la activación del servicio.</p>

                <Link
                  href="/alta-servicio?fromCart=true"
                  className="block w-full text-center py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-bold text-lg"
                >
                  Proceder al alta
                </Link>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Sin cobro hasta activación del servicio
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Domiciliación SEPA o tarjeta
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Activación en 5-10 días hábiles
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <ParticularFooter />
    </div>
  )
}
