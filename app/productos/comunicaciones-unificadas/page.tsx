"use client";
import Link from 'next/link';
import { useState, useEffect } from 'react';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

interface TarifaWeb {
  id: number;
  nombre: string;
  nombreComercial: string | null;
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  precioSinIva: number;
  precioConIva: number;
  permanencia: string | null;
  duracionPermanenciaMeses: number | null;
  contratosActivos?: number;
  esPopular?: boolean;
  categoria: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function ComunicacionesUnificadasPage() {
  const [tarifas, setTarifas] = useState<TarifaWeb[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('todas');

  useEffect(() => {
    fetch('/api/tarifas-solucion?solucion=comunicaciones-unificadas')
      .then(res => res.json())
      .then(data => {
        setTarifas(data.tarifas || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Agrupar tarifas por tipo (basado en descripcionCorta que tiene "Product Family > Product Line")
  const gruposTarifa = tarifas.reduce((acc, t) => {
    const grupo = t.descripcionCorta || 'Otros';
    if (!acc[grupo]) acc[grupo] = [];
    acc[grupo].push(t);
    return acc;
  }, {} as Record<string, TarifaWeb[]>);

  // Filtrar por grupo
  const tarifasFiltradas = filtro === 'todas' ? tarifas : (gruposTarifa[filtro] || []);

  // Categorías para el filtro
  const categoriasFiltro = Object.keys(gruposTarifa).sort();

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="productos" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/productos" className="inline-flex items-center gap-1 text-orange-400 text-sm mb-4 hover:text-orange-300 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Productos
            </Link>
            <div className="inline-block bg-orange-600/20 text-orange-400 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold mb-4">
              Partners Wildix & Zoom
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              Comunicaciones Unificadas
            </h1>
            <p className="text-base sm:text-lg text-gray-300 mb-6 max-w-2xl mx-auto">
              VoIP, centralitas virtuales, videoconferencia y colaboración en una sola plataforma. Soluciones Wildix, Zoom Workplace y SIP Trunking para empresas de cualquier tamaño.
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-full">
                ✓ {tarifas.length} productos disponibles
              </span>
              <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-full">
                ✓ Sin permanencia en planes mensuales
              </span>
              <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-full">
                ✓ Partner autorizado Zoom
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filtros */}
      <section className="py-8 border-b border-gray-200 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2 justify-center">
            <button
              onClick={() => setFiltro('todas')}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                filtro === 'todas'
                  ? 'bg-orange-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-300'
              }`}
            >
              Todas ({tarifas.length})
            </button>
            {categoriasFiltro.map(cat => (
              <button
                key={cat}
                onClick={() => setFiltro(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  filtro === cat
                    ? 'bg-orange-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-300'
                }`}
              >
                {cat.split(' > ')[1] || cat} ({gruposTarifa[cat]?.length || 0})
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Listado de tarifas */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          {loading ? (
            <div className="max-w-5xl mx-auto">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-gray-200 rounded w-64 mx-auto"></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                  {[1,2,3,4,5,6].map(i => <div key={i} className="h-48 bg-gray-200 rounded-xl"></div>)}
                </div>
              </div>
            </div>
          ) : tarifasFiltradas.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No se encontraron productos en esta categoría.</p>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {tarifasFiltradas.map((tarifa) => (
                  <div
                    key={tarifa.id}
                    className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-300 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-base font-bold text-gray-900 leading-tight">
                          {(tarifa.nombreComercial || tarifa.nombre).replace('Zoom - ', '')}
                        </h3>
                        {tarifa.descripcionCorta && (
                          <p className="text-xs text-orange-600 mt-1 font-medium">
                            {tarifa.descripcionCorta.split(' > ')[1] || tarifa.descripcionCorta}
                          </p>
                        )}
                      </div>
                    </div>

                    {tarifa.descripcionLarga && (
                      <p className="text-sm text-gray-500 mb-4 line-clamp-3">
                        {tarifa.descripcionLarga}
                      </p>
                    )}

                    <div className="border-t border-gray-100 pt-4 mt-auto">
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="text-2xl font-bold text-orange-600">
                            {formatCurrency(tarifa.precioSinIva)}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">
                            {tarifa.duracionPermanenciaMeses 
                              ? tarifa.duracionPermanenciaMeses <= 1 ? '/mes' 
                              : tarifa.duracionPermanenciaMeses <= 12 ? '/año'
                              : tarifa.duracionPermanenciaMeses <= 24 ? '/2 años'
                              : '/3 años'
                              : '/año'}
                          </span>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatCurrency(tarifa.precioConIva)} con IVA
                          </div>
                        </div>
                        {tarifa.permanencia && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            {tarifa.permanencia}
                          </span>
                        )}
                      </div>
                    </div>

                    <Link
                      href="/contacto"
                      className="block w-full text-center py-2.5 mt-4 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-all text-sm"
                    >
                      Solicitar
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-orange-600 py-12 sm:py-16">
        <div className="container mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
            ¿Necesitas asesoramiento?
          </h2>
          <p className="text-white/80 mb-6 max-w-xl mx-auto">
            Nuestro equipo te ayuda a elegir la solución de comunicaciones unificadas ideal para tu empresa.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/contacto" className="px-8 py-3 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold">
              Solicitar presupuesto
            </Link>
            <a href="tel:900730034" className="px-8 py-3 border-2 border-white text-white rounded-lg hover:bg-white/10 transition-all font-semibold">
              Llamar: 900 730 034
            </a>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
