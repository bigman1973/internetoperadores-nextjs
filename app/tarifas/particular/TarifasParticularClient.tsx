'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import ParticularNav from '../../../components/ParticularNav';
import ParticularFooter from '../../../components/ParticularFooter';
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

// Iconos y orden para subcategorías de Internet (tecnologías)
const iconoTecnologia: Record<string, string> = {
  'Fibra': '🔵',
  '4G/5G': '📶',
  'Radio': '📡',
  'Satélite': '🛰️',
};
const ordenTecnologia: Record<string, number> = {
  'Fibra': 1,
  '4G/5G': 2,
  'Radio': 3,
  'Satélite': 4,
};
const descripcionTecnologia: Record<string, string> = {
  'Fibra': 'Conexión de fibra óptica. Máxima velocidad y estabilidad para tu hogar.',
  '4G/5G': 'Internet móvil de alta velocidad. Cobertura donde no llega la fibra.',
  'Radio': 'Conexión inalámbrica por radioenlace. Ideal para zonas rurales y aisladas.',
  'Satélite': 'Internet vía satélite. Cobertura garantizada en cualquier punto.',
};

interface Props {
  tarifas: TarifaWeb[];
  categorias: Record<string, TarifaWeb[]>;
  total: number;
  masVendidoIds?: number[];
}
export default function TarifasParticularClient({ tarifas, categorias, total, masVendidoIds = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // Map URL ?cat= param to category filter
  useEffect(() => {
    const catParam = searchParams.get('cat');
    if (catParam) {
      const catMap: Record<string, string> = {
        'internet': 'INTERNET',
        'movil': 'TELEFONÍA MÓVIL',
        'fijo': 'TELEFONÍA FIJA',
        'packs': 'PACKS',
        'mas-vendido': 'MAS_VENDIDO',
      };
      const mapped = catMap[catParam.toLowerCase()];
      if (mapped) {
        setCategoriaSeleccionada(mapped);
      }
    }
  }, [searchParams]);
  // Títulos dinámicos según categoría
  const titulosPorCategoria: Record<string, { titulo: string; descripcion: string }> = {
    'TODAS': { titulo: 'Tarifas para Particulares', descripcion: 'Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.' },
    'INTERNET': { titulo: 'Tarifas de Internet', descripcion: 'Fibra óptica, 4G/5G, radio y satélite para tu hogar. Conexión estable y rápida con la mejor cobertura.' },
    'TELEFONÍA MÓVIL': { titulo: 'Tarifas Móvil', descripcion: 'Datos, llamadas y SMS con cobertura nacional. Elige el plan que mejor se adapte a tu consumo.' },
    'TELEFONÍA MÓVIL (BASE)': { titulo: 'Tarifas Móvil', descripcion: 'Tarifas base de telefonía móvil con la mejor relación calidad-precio.' },
    'TELEFONÍA FIJA': { titulo: 'Tarifas de Fijo', descripcion: 'Línea fija con llamadas ilimitadas. La solución clásica que nunca falla.' },
    'LÍNEA FIJA': { titulo: 'Línea Fija', descripcion: 'Numeración adicional y líneas fijas para tu hogar.' },
    'MAS_VENDIDO': { titulo: 'Más Vendido', descripcion: 'Las tarifas más contratadas por nuestros clientes. Calidad probada y satisfacción garantizada.' },
    'PACKS': { titulo: 'Packs Ahorro', descripcion: 'Combina internet, móvil y fijo en un solo pack. Más servicios, menos preocupaciones y el mejor precio.' },
  };
  const heroInfo = titulosPorCategoria[categoriaSeleccionada] || titulosPorCategoria['TODAS'];
  const categoriasOrdenadas = useMemo(() => {
    return Object.entries(categorias)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([cat]) => cat);
  }, [categorias]);
  // Mapeo de categoría seleccionada a sección web para filtrar
  const seccionWebMap: Record<string, string> = {
    'INTERNET': 'internet',
    'TELEFONÍA MÓVIL': 'movil',
    'PACKS': 'packs',
    'MAS_VENDIDO': 'mas-vendido',
  };

  const tarifasFiltradas = useMemo(() => {
    let resultado = tarifas;
    const seccionWeb = seccionWebMap[categoriaSeleccionada];
    if (categoriaSeleccionada === 'MAS_VENDIDO') {
      // Más vendido: filtrar por sección web O por masVendidoIds
      resultado = resultado.filter(t => t.seccionWebParticular === 'mas-vendido' || masVendidoIds.includes(t.id));
    } else if (seccionWeb) {
      // Filtrar por sección web asignada en el admin
      resultado = resultado.filter(t => t.seccionWebParticular === seccionWeb);
    } else if (categoriaSeleccionada !== 'TODAS') {
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
  }, [tarifas, categoriaSeleccionada, busqueda, masVendidoIds]);

  // Filtro de subcategoría para vista Internet
  const [filtroTecnologia, setFiltroTecnologia] = useState<string>('todas');

  // Subcategorías disponibles en Internet
  const subcategoriasInternet = useMemo(() => {
    if (categoriaSeleccionada !== 'INTERNET') return [];
    const cats = new Set<string>();
    tarifasFiltradas.forEach(t => {
      if (t.subcategoria) cats.add(t.subcategoria);
    });
    return Array.from(cats).sort((a, b) => (ordenTecnologia[a] || 99) - (ordenTecnologia[b] || 99));
  }, [tarifasFiltradas, categoriaSeleccionada]);

  // Tarifas filtradas por subcategoría
  const tarifasInternetFiltradas = useMemo(() => {
    if (filtroTecnologia === 'todas') return tarifasFiltradas;
    return tarifasFiltradas.filter(t => t.subcategoria === filtroTecnologia);
  }, [tarifasFiltradas, filtroTecnologia]);

  // Agrupar tarifas de INTERNET por subcategoría (tecnología)
  const tarifasPorTecnologia = useMemo(() => {
    if (categoriaSeleccionada !== 'INTERNET') return null;
    const grouped: Record<string, TarifaWeb[]> = {};
    tarifasInternetFiltradas.forEach(t => {
      const tech = t.subcategoria || 'Otros';
      if (!grouped[tech]) grouped[tech] = [];
      grouped[tech].push(t);
    });
    // Ordenar por el orden definido
    const sorted = Object.entries(grouped).sort((a, b) => {
      return (ordenTecnologia[a[0]] || 99) - (ordenTecnologia[b[0]] || 99);
    });
    return sorted;
  }, [tarifasInternetFiltradas, categoriaSeleccionada]);

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
          {tarifa.subcategoria && <span className="text-gray-400 ml-2">· {tarifa.subcategoria}</span>}
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
          <div className="mt-4 pt-4 border-t border-gray-200">
            {tarifa.caracteristicas.incluyePlanAnterior && (
              <p className="text-xs italic text-blue-600 mb-3">{tarifa.caracteristicas.incluyePlanAnterior}</p>
            )}
            <div className="space-y-2">
              {tarifa.caracteristicas.items.filter((feat: {titulo: string; descripcion: string}) => feat.titulo).map((feat: {titulo: string; descripcion: string}, idx: number) => (
                <div key={idx} className="flex items-start gap-2 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0 mt-0.5 text-orange-500" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <div>
                    <span className="font-medium text-gray-800">{feat.titulo}</span>
                    {feat.descripcion && (
                      <span className="text-gray-500 text-xs"> - {feat.descripcion}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <AddToCartButton tarifa={tarifa} variant="secondary" />
      </div>
    </div>
  );

  // Determinar si estamos en vista de Internet (para mostrar agrupación por tecnología)
  const esVistaInternet = categoriaSeleccionada === 'INTERNET' && tarifasPorTecnologia && tarifasPorTecnologia.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <ParticularNav currentPage={searchParams.get("cat") || "internet"} />
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">{heroInfo.titulo}</h1>
          <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto mb-6">
            {heroInfo.descripcion}
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
              Contactar
            </Link>
          </div>
        </div>
      </div>
      {/* Categorías */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Vista agrupada por tecnología (solo para INTERNET) */}
        {esVistaInternet ? (
          <>
            {/* Filtros por subcategoría/tecnología */}
            {subcategoriasInternet.length > 1 && (
              <div className="py-6 border-b border-gray-200 bg-gray-50 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 mb-8 rounded-lg">
                <div className="flex flex-wrap items-center gap-2 justify-center">
                  <button
                    onClick={() => setFiltroTecnologia('todas')}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filtroTecnologia === 'todas'
                        ? 'bg-orange-600 text-white'
                        : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-300'
                    }`}
                  >
                    Todas
                  </button>
                  {subcategoriasInternet.map(sub => (
                    <button
                      key={sub}
                      onClick={() => setFiltroTecnologia(sub)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                        filtroTecnologia === sub
                          ? 'bg-orange-600 text-white'
                          : 'bg-white text-gray-600 border border-gray-300 hover:border-orange-300'
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {/* Tarjetas agrupadas por tecnología */}
            <div className="space-y-12">
              {tarifasPorTecnologia!.map(([tech, tarifasTech]) => (
                <div key={tech} id={`tech-${tech.toLowerCase().replace(/[^a-z0-9]/g, '')}`}>
                  {/* Header de tecnología */}
                  <div className="mb-6">
                    <h2 className="text-2xl font-bold text-gray-900">{tech}</h2>
                    <div className="h-1 w-16 bg-orange-500 mt-2 rounded"></div>
                  </div>
                  {/* Grid de tarjetas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tarifasTech
                      .sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.precioConIva - b.precioConIva)
                      .map((tarifa) => (
                      <div
                        key={tarifa.id}
                        className={`bg-white border-2 rounded-xl p-6 hover:shadow-lg transition-all flex flex-col ${
                          tarifa.esPopular || tarifa.destacada
                            ? 'border-orange-400 ring-1 ring-orange-200'
                            : 'border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {/* Nombre */}
                        <div className="mb-3">
                          <h3 className="text-lg font-bold text-gray-900 leading-tight">
                            {tarifa.nombreComercial || tarifa.nombre}
                          </h3>
                          {tarifa.descripcionCorta && (
                            <p className="text-xs text-orange-600 mt-1 font-medium">
                              {tarifa.descripcionCorta}
                            </p>
                          )}
                        </div>
                        {/* Precio */}
                        <div className="border-t border-gray-100 pt-4 mt-auto">
                          <div>
                            <span className="text-3xl font-bold text-orange-600">
                              {tarifa.precioSinIva > 0 ? `${tarifa.precioSinIva.toFixed(2)} €` : 'Consultar'}
                            </span>
                            <span className="text-sm text-gray-400 ml-1">/mes</span>
                            {tarifa.precioConIva > 0 && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {tarifa.precioConIva.toFixed(2)} € con IVA
                              </div>
                            )}
                          </div>
                          {tarifa.cuotaAlta && tarifa.cuotaAlta > 0 && (
                            <span className="inline-block text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded mt-2">
                              Alta: {(tarifa.cuotaAlta * 1.21).toFixed(2)} €
                            </span>
                          )}
                        </div>
                        {/* Características */}
                        {tarifa.caracteristicas && tarifa.caracteristicas.items && tarifa.caracteristicas.items.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-gray-100">
                            <div className="space-y-1.5">
                              {tarifa.caracteristicas.items.filter((feat: {titulo: string; descripcion: string}) => feat.titulo).map((feat: {titulo: string; descripcion: string}, idx: number) => (
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
                        <AddToCartButton tarifa={tarifa} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
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
          </>
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
      <ParticularFooter />
    </div>
  );
}
