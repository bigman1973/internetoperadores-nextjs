"use client";
import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TarifaWeb {
  id: number;
  nombre: string;
  nombreComercial: string | null;
  descripcionCorta: string | null;
  velocidad: string | null;
  velocidadBajada: string | null;
  datosIncluidos: string | null;
  minutosIncluidos: string | null;
  precioSinIva: number;
  precioConIva: number;
  permanencia: string | null;
  duracionPermanenciaMeses: number | null;
  contratosActivos?: number;
  esPopular?: boolean;
  categoria: string;
  garantia: string | null;
  cuotaAlta: number | null;
  caracteristicas: { incluyePlanAnterior: string | null; items: { titulo: string; descripcion: string }[] } | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function ProductosSolucionDynamic({ solucion, solucionNombre, ctaHref = '/contacto' }: { solucion: string; solucionNombre: string; ctaHref?: string }) {
  const [tarifas, setTarifas] = useState<TarifaWeb[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/tarifas-solucion?solucion=${solucion}`)
      .then(res => res.json())
      .then(data => {
        setTarifas(data.top3 || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [solucion]);

  if (loading) {
    return (
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="container mx-auto px-4 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-64 mx-auto"></div>
            <div className="h-4 bg-gray-200 rounded w-96 mx-auto"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 max-w-5xl mx-auto">
              {[1,2,3].map(i => <div key={i} className="h-64 bg-gray-200 rounded-2xl"></div>)}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (tarifas.length === 0) return null;

  return (
    <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10 sm:mb-12">
            <span className="inline-block bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-semibold mb-3">
              Productos y Servicios
            </span>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3">
              Tarifas de {solucionNombre}
            </h2>
            <p className="text-base sm:text-lg text-gray-600">
              Las tarifas más elegidas por nuestros clientes
            </p>
          </div>

          <div className={`grid grid-cols-1 ${tarifas.length === 1 ? 'max-w-md mx-auto' : tarifas.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'md:grid-cols-3'} gap-6 sm:gap-8`}>
            {tarifas.map((tarifa) => (
              <div
                key={tarifa.id}
                className={`relative rounded-2xl overflow-hidden transition-all ${
                  tarifa.esPopular
                    ? 'bg-orange-600 text-white shadow-xl scale-[1.02]'
                    : 'bg-white border-2 border-gray-200 hover:border-orange-300 shadow-lg'
                }`}
              >
                {tarifa.esPopular && (
                  <div className="absolute top-0 right-0 bg-white text-orange-600 px-3 py-1 rounded-bl-lg text-xs font-bold">
                    La Más Elegida
                  </div>
                )}
                <div className="p-6 sm:p-8">
                  <h3 className={`text-lg sm:text-xl font-bold mb-1 ${tarifa.esPopular ? 'text-white' : 'text-gray-900'}`}>
                    {tarifa.nombreComercial || tarifa.nombre}
                  </h3>
                  {tarifa.descripcionCorta && (
                    <p className={`text-sm mb-4 ${tarifa.esPopular ? 'text-white/80' : 'text-gray-500'}`}>
                      {tarifa.descripcionCorta}
                    </p>
                  )}
                  {tarifa.categoria && (
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-3 ${tarifa.esPopular ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {tarifa.categoria}
                    </span>
                  )}
                  <div className="mb-4">
                    <span className={`text-3xl sm:text-4xl font-bold ${tarifa.esPopular ? 'text-white' : 'text-orange-600'}`}>
                      {formatCurrency(tarifa.precioConIva)}
                    </span>
                    <span className={`text-sm ${tarifa.esPopular ? 'text-white/70' : 'text-gray-500'}`}>/mes</span>
                    <div className={`text-xs mt-1 ${tarifa.esPopular ? 'text-white/60' : 'text-gray-400'}`}>
                      {formatCurrency(tarifa.precioSinIva)} sin IVA
                    </div>
                  </div>

                  <div className="space-y-2 mb-6">
                    {tarifa.velocidad && (
                      <Feature text={tarifa.velocidad} popular={tarifa.esPopular} />
                    )}
                    {tarifa.velocidadBajada && (
                      <Feature text={`Bajada: ${tarifa.velocidadBajada}`} popular={tarifa.esPopular} />
                    )}
                    {tarifa.datosIncluidos && (
                      <Feature text={tarifa.datosIncluidos} popular={tarifa.esPopular} />
                    )}
                    {tarifa.minutosIncluidos && (
                      <Feature text={tarifa.minutosIncluidos} popular={tarifa.esPopular} />
                    )}
                    <Feature
                      text={tarifa.permanencia || (tarifa.duracionPermanenciaMeses ? `${tarifa.duracionPermanenciaMeses} meses` : 'Sin permanencia')}
                      popular={tarifa.esPopular}
                    />
                    {tarifa.garantia && (
                      <Feature
                        text={`Garantía: ${tarifa.garantia}`}
                        popular={tarifa.esPopular}
                      />
                    )}
                    {tarifa.cuotaAlta && tarifa.cuotaAlta > 0 && (
                      <Feature
                        text={`Alta: ${(tarifa.cuotaAlta * 1.21).toFixed(2)} € (IVA incl.)`}
                        popular={tarifa.esPopular}
                      />
                    )}

                    {/* Características / Funcionalidades */}
                    {tarifa.caracteristicas && tarifa.caracteristicas.items && tarifa.caracteristicas.items.length > 0 && (
                      <div className={`mt-4 pt-4 border-t ${tarifa.esPopular ? 'border-white/20' : 'border-gray-200'}`}>
                        <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${tarifa.esPopular ? 'text-white/80' : 'text-gray-500'}`}>Funcionalidades:</p>
                        {tarifa.caracteristicas.incluyePlanAnterior && (
                          <p className={`text-xs italic mb-3 ${tarifa.esPopular ? 'text-white/70' : 'text-blue-600'}`}>
                            {tarifa.caracteristicas.incluyePlanAnterior}
                          </p>
                        )}
                        <div className="space-y-2">
                          {tarifa.caracteristicas.items.map((feat, idx) => (
                            <div key={idx} className={`flex items-start gap-2 text-sm ${tarifa.esPopular ? 'text-white/90' : 'text-gray-600'}`}>
                              <svg className={`w-3 h-3 flex-shrink-0 mt-1 ${tarifa.esPopular ? 'text-white/60' : 'text-gray-400'}`} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                              </svg>
                              <div>
                                <span className={`font-medium ${tarifa.esPopular ? 'text-white' : 'text-gray-800'}`}>{feat.titulo}</span>
                                {feat.descripcion && (
                                  <p className={`text-xs mt-0.5 ${tarifa.esPopular ? 'text-white/70' : 'text-gray-500'}`}>{feat.descripcion}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  </div>

                  <Link
                    href={ctaHref}
                    className={`block w-full text-center py-3 rounded-lg font-semibold transition-all ${
                      tarifa.esPopular
                        ? 'bg-white text-orange-600 hover:bg-orange-50'
                        : 'bg-orange-600 text-white hover:bg-orange-700'
                    }`}
                  >
                    Solicitar Presupuesto
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Feature({ text, popular }: { text: string; popular?: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${popular ? 'text-white/90' : 'text-gray-600'}`}>
      <svg className={`w-4 h-4 flex-shrink-0 ${popular ? 'text-white' : 'text-orange-600'}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
      </svg>
      {text}
    </div>
  );
}
