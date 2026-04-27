"use client";
import Link from 'next/link';
import { TarifaWeb } from '../../lib/tarifas-web';

interface ProductosSolucionProps {
  tarifas: TarifaWeb[];
  solucionNombre: string;
  colorAccent?: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function ProductosSolucion({ tarifas, solucionNombre, colorAccent = 'orange' }: ProductosSolucionProps) {
  if (tarifas.length === 0) return null;

  const colorClasses: Record<string, { bg: string; text: string; border: string; badge: string; button: string; buttonHover: string }> = {
    orange: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-700', button: 'bg-orange-600', buttonHover: 'hover:bg-orange-700' },
    blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-700', button: 'bg-blue-600', buttonHover: 'hover:bg-blue-700' },
    green: { bg: 'bg-green-50', text: 'text-green-600', border: 'border-green-200', badge: 'bg-green-100 text-green-700', button: 'bg-green-600', buttonHover: 'hover:bg-green-700' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-700', button: 'bg-purple-600', buttonHover: 'hover:bg-purple-700' },
    cyan: { bg: 'bg-cyan-50', text: 'text-cyan-600', border: 'border-cyan-200', badge: 'bg-cyan-100 text-cyan-700', button: 'bg-cyan-600', buttonHover: 'hover:bg-cyan-700' },
    red: { bg: 'bg-red-50', text: 'text-red-600', border: 'border-red-200', badge: 'bg-red-100 text-red-700', button: 'bg-red-600', buttonHover: 'hover:bg-red-700' },
  };

  const colors = colorClasses[colorAccent] || colorClasses.orange;

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <span className={`inline-block ${colors.badge} px-3 py-1 rounded-full text-xs font-semibold mb-3`}>
              Productos y Servicios
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
              Nuestras Tarifas de {solucionNombre}
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Soluciones adaptadas a las necesidades de tu empresa
            </p>
          </div>

          <div className={`grid grid-cols-1 ${tarifas.length === 1 ? 'max-w-md mx-auto' : tarifas.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'md:grid-cols-3'} gap-6 sm:gap-8`}>
            {tarifas.map((tarifa) => (
              <div
                key={tarifa.id}
                className={`relative rounded-2xl overflow-hidden transition-all ${
                  tarifa.esPopular
                    ? `${colors.button} text-white shadow-xl scale-[1.02]`
                    : 'bg-white border-2 border-gray-200 hover:border-gray-300 shadow-lg'
                }`}
              >
                {tarifa.esPopular && (
                  <div className="absolute top-0 right-0 bg-white text-orange-600 px-3 py-1 rounded-bl-lg text-xs font-bold">
                    La Más Elegida
                  </div>
                )}
                <div className="p-6 sm:p-8">
                  <h3 className={`text-lg sm:text-xl font-bold mb-1 ${tarifa.esPopular ? 'text-white' : 'text-gray-900'}`}>
                    {tarifa.nombre}
                  </h3>
                  {tarifa.descripcionCorta && (
                    <p className={`text-sm mb-4 ${tarifa.esPopular ? 'text-white/80' : 'text-gray-500'}`}>
                      {tarifa.descripcionCorta}
                    </p>
                  )}
                  <div className="mb-4">
                    <span className={`text-3xl sm:text-4xl font-bold ${tarifa.esPopular ? 'text-white' : colors.text}`}>
                      {formatCurrency(tarifa.precioConIva)}
                    </span>
                    <span className={`text-sm ${tarifa.esPopular ? 'text-white/70' : 'text-gray-500'}`}>/mes</span>
                    <div className={`text-xs mt-1 ${tarifa.esPopular ? 'text-white/60' : 'text-gray-400'}`}>
                      {formatCurrency(tarifa.precioSinIva)} sin IVA
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    {tarifa.velocidad && (
                      <div className={`flex items-center gap-2 text-sm ${tarifa.esPopular ? 'text-white/90' : 'text-gray-600'}`}>
                        <svg className={`w-4 h-4 flex-shrink-0 ${tarifa.esPopular ? 'text-white' : colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {tarifa.velocidad}
                      </div>
                    )}
                    {tarifa.velocidadBajada && (
                      <div className={`flex items-center gap-2 text-sm ${tarifa.esPopular ? 'text-white/90' : 'text-gray-600'}`}>
                        <svg className={`w-4 h-4 flex-shrink-0 ${tarifa.esPopular ? 'text-white' : colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Bajada: {tarifa.velocidadBajada}
                      </div>
                    )}
                    {tarifa.datosIncluidos && (
                      <div className={`flex items-center gap-2 text-sm ${tarifa.esPopular ? 'text-white/90' : 'text-gray-600'}`}>
                        <svg className={`w-4 h-4 flex-shrink-0 ${tarifa.esPopular ? 'text-white' : colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {tarifa.datosIncluidos}
                      </div>
                    )}
                    {tarifa.minutosIncluidos && (
                      <div className={`flex items-center gap-2 text-sm ${tarifa.esPopular ? 'text-white/90' : 'text-gray-600'}`}>
                        <svg className={`w-4 h-4 flex-shrink-0 ${tarifa.esPopular ? 'text-white' : colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {tarifa.minutosIncluidos}
                      </div>
                    )}
                    <div className={`flex items-center gap-2 text-sm ${tarifa.esPopular ? 'text-white/90' : 'text-gray-600'}`}>
                      <svg className={`w-4 h-4 flex-shrink-0 ${tarifa.esPopular ? 'text-white' : colors.text}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      {tarifa.permanencia || (tarifa.duracionPermanenciaMeses ? `${tarifa.duracionPermanenciaMeses} meses` : 'Sin permanencia')}
                    </div>
                    {tarifa.contratosActivos && tarifa.contratosActivos > 0 && (
                      <div className={`flex items-center gap-2 text-xs mt-2 ${tarifa.esPopular ? 'text-white/60' : 'text-gray-400'}`}>
                        <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" />
                        </svg>
                        {tarifa.contratosActivos} empresas confían en esta tarifa
                      </div>
                    )}
                  </div>

                  <Link
                    href="/contacto"
                    className={`block w-full text-center py-3 rounded-lg font-semibold transition-all ${
                      tarifa.esPopular
                        ? 'bg-white text-orange-600 hover:bg-orange-50'
                        : `${colors.button} text-white ${colors.buttonHover}`
                    }`}
                  >
                    Solicitar Presupuesto
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {tarifas.length > 3 && (
            <div className="text-center mt-8">
              <Link href="/tarifas/empresa" className={`inline-flex items-center gap-2 ${colors.text} font-semibold hover:underline`}>
                Ver todas las tarifas
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
