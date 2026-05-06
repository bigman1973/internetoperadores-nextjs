'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import type { TarifaWeb } from '@/lib/tarifas-web';

const iconoCategoria: Record<string, string> = {
  'INTERNET': '🌐',
  
  
  
  
  'TELEFONÍA FIJA': '📞',
  'TELEFONÍA FIJA (TARIFA PLANA)': '📞',
  'LÍNEA FIJA': '📞',
  'TELEFONÍA MÓVIL': '📱',
  'TELEFONÍA MÓVIL (BASE)': '📱',
  'LÍNEA MÓVIL (BASE)': '📱',
  'LÍNEA ADICIONAL': '📱',
  'BONOS MÓVIL': '📱',
  'BONOS FIJO': '📞',
  'COMPARTE GB': '📱',
  'CENTRALITAS PBX': '💬',
  'PBX CLOUD WILDIX': '💬',
  'COMUNICACIONES UNIFICADAS': '🎥',
  'HOSTING': '☁️',
  'BACKUP Y CLOUD': '☁️',
  'BACKUP': '☁️',
  'SERVICIOS CLOUD': '☁️',
  'SERVIDORES Y CLOUD': '🖥️',
  'DATACENTER': '🖥️',
  'HOTSPOT Y GESTIÓN': '📶',
  'HOTSPOT': '📶',
  'EQUIPOS Y HARDWARE': '🔧',
  'TERMINALES': '📟',
  'MANTENIMIENTO': '🔧',
  'SERVICIOS IT': '💻',
  'IP Y REDES': '🌐',
  'INTERCONEXIÓN OPERADOR': '🔗',
  'SERVICIOS OPERADOR': '🔗',
  'ALQUILER Y SOFTWARE': '💿',
  'CUOTAS DE ALTA': '📋',
};

interface Props {
  tarifas: TarifaWeb[];
  categorias: Record<string, TarifaWeb[]>;
  total: number;
}

export default function TarifasEmpresaClient({ tarifas, categorias, total }: Props) {
  const router = useRouter();
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const categoriasOrdenadas = useMemo(() => {
    return Object.entries(categorias)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([cat]) => cat);
  }, [categorias]);

  const tarifasFiltradas = useMemo(() => {
    let resultado = tarifas;

    if (categoriaSeleccionada !== 'TODAS') {
      resultado = resultado.filter(t => t.categoria === categoriaSeleccionada);
    }

    if (busqueda.trim()) {
      const term = busqueda.toLowerCase();
      resultado = resultado.filter(t =>
        t.nombre.toLowerCase().includes(term) ||
        (t.descripcionCorta && t.descripcionCorta.toLowerCase().includes(term)) ||
        (t.velocidad && t.velocidad.toLowerCase().includes(term)) ||
        t.categoria.toLowerCase().includes(term)
      );
    }

    return resultado;
  }, [tarifas, categoriaSeleccionada, busqueda]);

  const tarifasFiltradasPorCategoria = useMemo(() => {
    const grouped: Record<string, TarifaWeb[]> = {};
    tarifasFiltradas.forEach(t => {
      const cat = t.categoria || 'OTROS';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(t);
    });
    return grouped;
  }, [tarifasFiltradas]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/revalidate-tarifas', { method: 'POST' });
      router.refresh();
    } catch (e) {
      console.error('Error refreshing:', e);
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  const getDetalleConectividad = (tarifa: TarifaWeb): string => {
    const parts: string[] = [];
    if (tarifa.velocidad) parts.push(tarifa.velocidad);
    else {
      if (tarifa.fibraBajada) parts.push(`${tarifa.fibraBajada}/${tarifa.fibraSubida || '?'} Mbps Fibra`);
      else if (tarifa.velocidadBajada) parts.push(`${tarifa.velocidadBajada}/${tarifa.velocidadSubida || '?'} Mbps`);
    }
    if (tarifa.datosIncluidos) parts.push(`${tarifa.datosIncluidos} datos`);
    if (tarifa.minutosIncluidos) parts.push(`${tarifa.minutosIncluidos} min`);
    if (tarifa.smsIncluidos) parts.push(`${tarifa.smsIncluidos} SMS`);
    return parts.join(' · ') || tarifa.descripcionCorta || '';
  };

  if (total === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Tarifas para <span className="text-orange-500">Empresas</span>
            </h1>
            <p className="text-lg text-gray-300 max-w-3xl mx-auto mb-8">
              Estamos preparando nuestro catálogo de tarifas. Contacta con nosotros para un presupuesto personalizado.
            </p>
            <Link href="/contacto" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
              Solicitar Presupuesto
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <EmpresaNav currentPage="tarifas" />
      {/* Hero */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white py-16 md:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-block bg-orange-500/20 text-orange-400 text-sm font-semibold px-4 py-1 rounded-full mb-4">
              TARIFAS 2026
            </span>
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Tarifas para <span className="text-orange-500">Empresas</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-300 max-w-3xl mx-auto mb-8">
              Soluciones de conectividad, comunicaciones y mantenimiento IT para tu negocio. 
              Todos los precios incluyen IVA. Sin sorpresas.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/contacto" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
                Solicitar Presupuesto Personalizado
              </Link>
              <Link href="/tarifas/particular" className="border-2 border-white/30 text-white hover:bg-white/10 px-8 py-3 rounded-lg font-semibold transition-colors">
                Ver Tarifas Particulares
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar tarifa</label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, velocidad, categoría..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="TODAS">Todas las categorías ({total})</option>
                {categoriasOrdenadas.map(cat => (
                  <option key={cat} value={cat}>
                    {iconoCategoria[cat] || '📦'} {cat} ({categorias[cat]?.length || 0})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando <span className="font-bold text-orange-600">{tarifasFiltradas.length}</span> tarifas
              </p>
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="text-xs text-gray-400 hover:text-orange-600 flex items-center gap-1 transition-colors"
                title="Actualizar tarifas"
              >
                <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
                </svg>
                {refreshing ? 'Actualizando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Categorías rápidas */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            onClick={() => setCategoriaSeleccionada('TODAS')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              categoriaSeleccionada === 'TODAS'
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-700 hover:bg-orange-50 border border-gray-200'
            }`}
          >
            Todas
          </button>
          {categoriasOrdenadas.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoriaSeleccionada(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                categoriaSeleccionada === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-orange-50 border border-gray-200'
              }`}
            >
              {iconoCategoria[cat] || '📦'} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tarifas por categoría */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {tarifasFiltradas.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-500 text-lg mb-4">
              No se encontraron tarifas con los filtros seleccionados.
            </p>
            <button
              onClick={() => { setBusqueda(''); setCategoriaSeleccionada('TODAS'); }}
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              Limpiar filtros
            </button>
          </div>
        )}

        {Object.entries(tarifasFiltradasPorCategoria)
          .sort((a, b) => b[1].length - a[1].length)
          .map(([cat, tarifasCat]) => (
            <div key={cat} className="mb-12" id={cat.toLowerCase().replace(/\s+/g, '-')}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{iconoCategoria[cat] || '📦'}</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{cat}</h2>
                  <p className="text-sm text-gray-500">{tarifasCat.length} tarifas disponibles</p>
                </div>
              </div>

              {/* Table view for connectivity/telephony categories */}
              {(cat.includes('FIBRA') || cat.includes('INTERNET') || cat.includes('TELEFONÍA') || cat.includes('LÍNEA') || cat.includes('MÓVIL') || cat.includes('FTTH')) ? (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-900 text-white">
                          <th className="text-left px-6 py-4 font-semibold">Tarifa</th>
                          <th className="text-left px-6 py-4 font-semibold">Detalle</th>
                          <th className="text-right px-6 py-4 font-semibold">Precio (sin IVA)</th>
                          <th className="text-right px-6 py-4 font-semibold">Precio (con IVA)</th>
                          <th className="text-center px-6 py-4 font-semibold">Permanencia</th>
                          <th className="text-center px-6 py-4 font-semibold">Garantía</th>
                          <th className="text-center px-6 py-4 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tarifasCat.map((tarifa, idx) => (
                          <tr key={tarifa.id} className={`border-b border-gray-100 hover:bg-orange-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900">{tarifa.nombreComercial || tarifa.nombre}</span>
                                {tarifa.esPopular && <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">Más vendido</span>}
                                {tarifa.destacada && !tarifa.esPopular && <span className="text-yellow-500 text-xs">★</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-gray-600 text-sm">
                              {getDetalleConectividad(tarifa) || '—'}
                            </td>
                            <td className="px-6 py-4 text-right text-gray-700">
                              {tarifa.precioSinIva > 0 ? `${tarifa.precioSinIva.toFixed(2)} €` : '-'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="font-bold text-gray-900 text-lg">
                                {tarifa.precioConIva > 0 ? `${tarifa.precioConIva.toFixed(2)} €` : 'Consultar'}
                              </span>
                              {tarifa.precioConIva > 0 && <span className="text-gray-500 text-xs block">/mes</span>}
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-gray-600">
                              {tarifa.duracionPermanenciaMeses ? `${tarifa.duracionPermanenciaMeses} meses` : tarifa.permanencia || '—'}
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-gray-600">
                              {tarifa.garantia || '—'}
                            </td>
                            <td className="px-6 py-4 text-center">
                              <Link href="/contacto" className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                                Contratar
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Cards for other categories */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tarifasCat.map((tarifa) => (
                    <div key={tarifa.id} className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden border ${tarifa.esPopular ? 'border-orange-400 ring-1 ring-orange-200' : tarifa.destacada ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-100'}`}>
                      {tarifa.esPopular && (
                        <div className="bg-orange-500 text-white text-center py-1.5 text-xs font-semibold uppercase tracking-wider">
                          Más vendido
                        </div>
                      )}
                      {tarifa.destacada && !tarifa.esPopular && (
                        <div className="bg-gray-800 text-white text-center py-1.5 text-xs font-semibold uppercase tracking-wider">
                          Destacada
                        </div>
                      )}
                      <div className="p-6">
                        <div className="text-xs text-orange-600 font-semibold uppercase tracking-wider mb-2">
                          {tarifa.categoria}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">{tarifa.nombreComercial || tarifa.nombre}</h3>
                        {tarifa.descripcionCorta && (
                          <p className="text-sm text-gray-500 mb-3 line-clamp-2">{tarifa.descripcionCorta}</p>
                        )}
                        {getDetalleConectividad(tarifa) && (
                          <p className="text-xs text-gray-600 mb-3 bg-gray-50 rounded px-2 py-1">
                            {getDetalleConectividad(tarifa)}
                          </p>
                        )}
                        <div className="flex items-baseline gap-1 mb-4">
                          <span className="text-3xl font-bold text-gray-900">
                            {tarifa.precioConIva > 0 ? `${tarifa.precioConIva.toFixed(2)}` : 'Consultar'}
                          </span>
                          {tarifa.precioConIva > 0 && <span className="text-gray-500">€/mes</span>}
                        </div>
                        {tarifa.precioSinIva > 0 && (
                          <p className="text-xs text-gray-400 mb-2">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
                        )}
                        {(tarifa.permanencia || tarifa.duracionPermanenciaMeses) && (
                          <p className="text-xs text-gray-500 mb-1">
                            Permanencia: {tarifa.duracionPermanenciaMeses ? `${tarifa.duracionPermanenciaMeses} meses` : tarifa.permanencia}
                          </p>
                        )}
                        {tarifa.garantia && (
                          <p className="text-xs text-gray-500 mb-1">
                            Garantía: {tarifa.garantia}
                          </p>
                        )}
                      </div>
                      <div className="px-6 pb-6">
                        <Link href="/contacto" className="block w-full bg-orange-500 hover:bg-orange-600 text-white text-center py-3 rounded-lg font-medium transition-colors">
                          Contratar
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>

      {/* CTA Final */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">¿Necesitas una solución a medida?</h2>
          <p className="text-lg opacity-90 mb-8">
            Nuestro equipo comercial te preparará un presupuesto personalizado adaptado a las necesidades de tu empresa. Sin compromiso.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
              Solicitar Presupuesto
            </Link>
            <Link href="/tarifas/particular" className="border-2 border-white text-white hover:bg-white/10 px-8 py-3 rounded-lg font-semibold transition-colors">
              Ver Tarifas Particulares
            </Link>
          </div>
        </div>
      </div>
      <EmpresaFooter />
    </div>
  );
}
