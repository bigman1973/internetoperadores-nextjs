"use client";
import Link from 'next/link';
import { useState, useEffect, useMemo } from 'react';
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
  cuotaAlta: number | null;
  subcategoria: string | null;
  grupoProducto: string | null;
  varianteLabel: string | null;
  caracteristicas: { incluyePlanAnterior: string | null; items: { titulo: string; descripcion: string }[] } | null;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

export default function ConectividadAvanzadaPage() {
  const [tarifas, setTarifas] = useState<TarifaWeb[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('todas');

  useEffect(() => {
    fetch('/api/tarifas-solucion?solucion=conectividad-avanzada')
      .then(res => res.json())
      .then(data => {
        setTarifas(data.tarifas || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Subcategorías para filtro (solo las que tienen al menos un producto)
  const categoriasFiltro = useMemo(() => {
    const cats = new Set<string>();
    tarifas.forEach(t => {
      if (t.subcategoria) {
        cats.add(t.subcategoria);
      }
    });
    return Array.from(cats).sort();
  }, [tarifas]);

  // Filtrar tarifas por subcategoría
  const tarifasFiltradas = useMemo(() => {
    if (filtro === 'todas') return tarifas;
    return tarifas.filter(t => t.subcategoria === filtro);
  }, [tarifas, filtro]);

  // Agrupar por subcategoría cuando filtro es 'todas'
  const gruposPorSubcategoria = useMemo(() => {
    const grupos: Record<string, TarifaWeb[]> = {};
    tarifasFiltradas.forEach(t => {
      const sub = t.subcategoria || 'Otros';
      if (!grupos[sub]) grupos[sub] = [];
      grupos[sub].push(t);
    });
    // Ordenar subcategorías
    const ordenSubcategorias: Record<string, number> = {
      'Fibra': 1,
      'Radio': 2,
      'Satélite': 3,
      'Otros': 99,
    };
    return Object.entries(grupos).sort(
      ([a], [b]) => (ordenSubcategorias[a] ?? 50) - (ordenSubcategorias[b] ?? 50)
    );
  }, [tarifasFiltradas]);

  const renderTarjeta = (tarifa: TarifaWeb) => (
    <div
      key={tarifa.id}
      className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-300 hover:shadow-lg transition-all flex flex-col"
    >
      {/* Nombre del producto */}
      <div className="mb-3">
        <h3 className="text-base font-bold text-gray-900 leading-tight">
          {tarifa.nombreComercial || tarifa.nombre}
        </h3>
        {tarifa.descripcionCorta && (
          <p className="text-xs text-orange-600 mt-1 font-medium">
            {tarifa.descripcionCorta}
          </p>
        )}
      </div>

      {/* Descripción larga */}
      {tarifa.descripcionLarga && (
        <p className="text-sm text-gray-600 mb-4 flex-1">
          {tarifa.descripcionLarga}
        </p>
      )}

      {/* Precio */}
      <div className="border-t border-gray-100 pt-4 mt-auto">
        <div className="flex items-end justify-between">
          <div>
            <span className="text-2xl font-bold text-orange-600">
              {formatCurrency(tarifa.precioSinIva)}
            </span>
            <span className="text-xs text-gray-400 ml-1">/mes</span>
            <div className="text-xs text-gray-400 mt-0.5">
              {formatCurrency(tarifa.precioConIva)} con IVA
            </div>
          </div>
          {tarifa.cuotaAlta && tarifa.cuotaAlta > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              Alta: {formatCurrency(tarifa.cuotaAlta)}
            </span>
          )}
        </div>
      </div>

      {/* Características */}
      {tarifa.caracteristicas && tarifa.caracteristicas.items && tarifa.caracteristicas.items.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="space-y-1.5">
            {tarifa.caracteristicas.items.map((feat, idx) => (
              <div key={idx} className="flex items-start gap-2 text-sm">
                <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                <div>
                  <span className="font-medium text-gray-800 text-xs">{feat.titulo}</span>
                  {feat.descripcion && (
                    <span className="text-xs text-gray-500 ml-1">- {feat.descripcion}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Link
        href="/contacto"
        className="block w-full text-center py-2.5 mt-4 bg-orange-600 text-white rounded-lg font-semibold hover:bg-orange-700 transition-all text-sm"
      >
        Solicitar
      </Link>
    </div>
  );

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
              Volver a Contrata
            </Link>
            <div className="inline-block bg-orange-600/20 text-orange-400 px-3 py-1.5 rounded-full text-xs sm:text-sm font-semibold mb-4">
              Conectividad para empresas
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
              Conectividad Avanzada
            </h1>
            <p className="text-base sm:text-lg text-gray-300 mb-6 max-w-2xl mx-auto">
              Soluciones de conectividad empresarial: radioenlaces, fibra óptica, satélite y backup 4G/5G. Máxima disponibilidad y velocidad garantizada.
            </p>
            <div className="flex flex-wrap justify-center gap-3 text-sm">
              <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-full">
                ✓ {tarifas.length} productos disponibles
              </span>
              <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-full">
                ✓ Cobertura nacional
              </span>
              <span className="bg-green-600/20 text-green-400 px-3 py-1.5 rounded-full">
                ✓ SLA garantizado
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filtros */}
      {categoriasFiltro.length > 1 && (
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
                Todas
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
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Listado de productos */}
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
          ) : (
            <div className="max-w-7xl mx-auto">
              {/* Agrupado por subcategoría cuando filtro es 'todas' */}
              {filtro === 'todas' && tarifasFiltradas.length > 0 ? (
                <div className="space-y-12">
                  {gruposPorSubcategoria.map(([subcategoria, tarifasSub]) => (
                    <div key={subcategoria}>
                      <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900">{subcategoria}</h2>
                        <div className="h-1 w-16 bg-orange-500 mt-2 rounded"></div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tarifasSub.map(tarifa => renderTarjeta(tarifa))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : tarifasFiltradas.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tarifasFiltradas.map(tarifa => renderTarjeta(tarifa))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-gray-500 text-lg">No se encontraron productos en esta categoría.</p>
                </div>
              )}
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
            Nuestro equipo te ayuda a elegir la solución de conectividad ideal para tu empresa.
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
