'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ParticularNav from '../../../components/ParticularNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import AddToCartButton from '../../../components/AddToCartButton';
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

export default function TarifasParticularClient({ tarifas, categorias, total }: Props) {
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

  const tarifasDestacadas = tarifasFiltradas.filter(t => t.destacada);
  const tarifasNormales = tarifasFiltradas.filter(t => !t.destacada);

  const getDetalleConectividad = (tarifa: TarifaWeb): string | null => {
    const parts: string[] = [];
    if (tarifa.velocidad) return tarifa.velocidad;
    if (tarifa.fibraBajada) parts.push(`${tarifa.fibraBajada}/${tarifa.fibraSubida || '?'} Mbps Fibra`);
    else if (tarifa.velocidadBajada) parts.push(`${tarifa.velocidadBajada}/${tarifa.velocidadSubida || '?'} Mbps`);
    if (tarifa.datosIncluidos) parts.push(`${tarifa.datosIncluidos} datos`);
    if (tarifa.minutosIncluidos) parts.push(`${tarifa.minutosIncluidos} min`);
    return parts.length > 0 ? parts.join(' · ') : null;
  };

  if (total === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white py-16 md:py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">Tarifas para Particulares</h1>
            <p className="text-lg text-white/90 max-w-2xl mx-auto mb-8">
              Estamos preparando nuestro catálogo de tarifas. Contacta con nosotros para más información.
            </p>
            <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
              Contactar
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const TarifaCard = ({ tarifa, destacada = false }: { tarifa: TarifaWeb; destacada?: boolean }) => (
    <div className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden ${tarifa.esPopular ? 'ring-2 ring-orange-500 border-orange-400' : destacada ? 'ring-2 ring-orange-500 border-orange-400' : 'border border-gray-100'}`}>
      {tarifa.esPopular && (
        <div className="bg-orange-500 text-white text-center py-1.5 text-xs font-semibold uppercase tracking-wider">
          Más vendido
        </div>
      )}
      {destacada && !tarifa.esPopular && (
        <div className="bg-gray-800 text-white text-center py-1.5 text-xs font-semibold uppercase tracking-wider">
          Destacada
        </div>
      )}
      <div className="p-6">
        <div className="text-xs text-orange-600 font-semibold uppercase tracking-wider mb-2">
          {iconoCategoria[tarifa.categoria] || '📦'} {tarifa.categoria}
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">{tarifa.nombreComercial || tarifa.nombre}</h3>
        {getDetalleConectividad(tarifa) && (
          <p className="text-gray-600 mb-3 text-sm">{getDetalleConectividad(tarifa)}</p>
        )}
        {tarifa.descripcionCorta && (
          <p className="text-sm text-gray-500 mb-4 line-clamp-2">{tarifa.descripcionCorta}</p>
        )}
        <div className="mb-4">
          <span className="text-3xl font-bold text-gray-900">
            {tarifa.precioConIva > 0 ? `${tarifa.precioConIva.toFixed(2)}€` : 'Consultar'}
          </span>
          {tarifa.precioConIva > 0 && <span className="text-gray-600">/mes</span>}
        </div>
        {tarifa.precioSinIva > 0 && (
          <p className="text-xs text-gray-400 mb-2">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
        )}
        {tarifa.garantia && (
          <p className="text-xs text-gray-500 mb-2">
            Garantía: {tarifa.garantia}
          </p>
        )}
        {tarifa.cuotaAlta && tarifa.cuotaAlta > 0 && (
          <p className="text-xs text-gray-500 mb-2">
            Alta: {(tarifa.cuotaAlta * 1.21).toFixed(2)} € (IVA incl.)
          </p>
        )}
        {/* Características / Funcionalidades */}
        {tarifa.caracteristicas && tarifa.caracteristicas.items && tarifa.caracteristicas.items.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Funcionalidades:</p>
            {tarifa.caracteristicas.incluyePlanAnterior && (
              <p className="text-xs italic text-blue-600 mb-2">{tarifa.caracteristicas.incluyePlanAnterior}</p>
            )}
            <div className="space-y-1">
              {tarifa.caracteristicas.items.map((feat: {titulo: string; descripcion: string}, idx: number) => (
                <div key={idx} className="text-xs text-gray-600">
                  <span className="font-medium text-gray-800">{feat.titulo}</span>
                  {feat.descripcion && <span className="text-gray-500"> — {feat.descripcion}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
        <AddToCartButton tarifa={tarifa} variant="secondary" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <ParticularNav currentPage="internet" />
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">Tarifas para Particulares</h1>
          <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto mb-6">
            Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
              Contactar
            </Link>
            <Link href="/tarifas/empresa" className="border-2 border-white/30 text-white hover:bg-white/10 px-8 py-3 rounded-lg font-semibold transition-colors">
              Ver Tarifas Empresas
            </Link>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Buscar tarifa</label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, velocidad..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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

        {/* Categorías rápidas */}
        {categoriasOrdenadas.length > 1 && (
          <div className="flex flex-wrap gap-2 justify-center mb-8">
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
        )}

        {/* Tarifas Destacadas */}
        {tarifasDestacadas.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Tarifas Destacadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tarifasDestacadas.map(tarifa => (
                <TarifaCard key={tarifa.id} tarifa={tarifa} destacada />
              ))}
            </div>
          </div>
        )}

        {/* Tarifas Normales */}
        {tarifasNormales.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {tarifasDestacadas.length > 0 ? 'Todas las Tarifas' : 'Nuestras Tarifas'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tarifasNormales.map(tarifa => (
                <TarifaCard key={tarifa.id} tarifa={tarifa} />
              ))}
            </div>
          </div>
        )}

        {/* Sin resultados */}
        {tarifasFiltradas.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg mb-4">No se encontraron tarifas con los filtros seleccionados.</p>
            <button
              onClick={() => { setBusqueda(''); setCategoriaSeleccionada('TODAS'); }}
              className="text-orange-600 hover:text-orange-700 font-medium"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* CTA Final */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">¿No encuentras lo que buscas?</h2>
          <p className="text-lg opacity-90 mb-8">
            Contacta con nosotros y te ayudaremos a encontrar la tarifa perfecta para ti.
          </p>
          <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
            Contactar
          </Link>
        </div>
      </div>
      <EmpresaFooter />
    </div>
  );
}
