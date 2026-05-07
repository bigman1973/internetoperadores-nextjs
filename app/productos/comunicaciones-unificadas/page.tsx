"use client";
import Link from 'next/link';
import Image from 'next/image';
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

interface GrupoProducto {
  slug: string;
  nombre: string;
  descripcion: string | null;
  subcategoria: string | null;
  variantes: TarifaWeb[];
  caracteristicas: TarifaWeb['caracteristicas'];
  tieneVariantesDuracion: boolean;
  tieneVariantesTramo: boolean;
  esLicenciaPorUsuario: boolean;
  minUsuarios: number;
}

function formatCurrency(value: number): string {
  // Usar de-DE para garantizar punto de miles (1.234,56 €) en todos los casos
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);
}

function getNombreGrupo(tarifa: TarifaWeb): string {
  const nc = tarifa.nombreComercial || tarifa.nombre;
  // Limpiar prefijos y sufijos de duración
  let nombre = nc
    .replace('Zoom - ', '')
    .replace(/ Annual$/, '')
    .replace(/ Two Years? Prepay$/, '')
    .replace(/ Two Year Prepay$/, '')
    .replace(/ Three Years? Prepay$/, '')
    .replace(/ Three Year Prepay$/, '')
    .replace(/ PrePay$/, '')
    .replace(/ - 1 Month$/, '')
    .trim();
  // Limpiar números de participantes para webinars y meetings
  // "Webinar 1000" -> "Zoom Webinar", "1000 Participants meeting" -> "Zoom Large Meeting"
  if (tarifa.grupoProducto === 'zoom-webinar') {
    nombre = 'Zoom Webinar';
  } else if (tarifa.grupoProducto === 'zoom-large-meeting') {
    nombre = 'Zoom Large Meeting';
  }
  return nombre;
}

function getDuracionLabel(meses: number | null): string {
  if (!meses || meses <= 1) return 'Mensual';
  if (meses <= 12) return '1 año';
  if (meses <= 24) return '2 años';
  return '3 años';
}

function getPrecioMensual(tarifa: TarifaWeb): number {
  const meses = tarifa.duracionPermanenciaMeses || 1;
  return tarifa.precioSinIva / (meses || 1);
}

export default function ComunicacionesUnificadasPage() {
  const [tarifas, setTarifas] = useState<TarifaWeb[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<string>('todas');
  const [duracionSeleccionada, setDuracionSeleccionada] = useState<Record<string, number>>({});
  const [tramoSeleccionado, setTramoSeleccionado] = useState<Record<string, string>>({});
  const [numUsuarios, setNumUsuarios] = useState<Record<string, number>>({});

  useEffect(() => {
    fetch('/api/tarifas-solucion?solucion=comunicaciones-unificadas')
      .then(res => res.json())
      .then(data => {
        setTarifas(data.tarifas || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Agrupar tarifas: las que tienen grupo_producto se agrupan, las que no se muestran individuales
  const grupos = useMemo(() => {
    const gruposMap: Record<string, GrupoProducto> = {};
    const individuales: TarifaWeb[] = [];

    tarifas.forEach(t => {
      if (t.grupoProducto) {
        if (!gruposMap[t.grupoProducto]) {
          // Definir qué grupos son licencia por usuario (precio × nº usuarios)
          const gruposLicencia: Record<string, number> = {
            'zoom-workplace-pro': 1,
            'zoom-workplace-business': 1,
            'zoom-workplace-enterprise': 50,
            'zoom-rooms': 1,
          };
          const esLicencia = t.grupoProducto in gruposLicencia;
          gruposMap[t.grupoProducto] = {
            slug: t.grupoProducto,
            nombre: getNombreGrupo(t),
            descripcion: t.descripcionCorta,
            subcategoria: t.subcategoria,
            variantes: [],
            caracteristicas: t.caracteristicas,
            tieneVariantesDuracion: false,
            tieneVariantesTramo: false,
            esLicenciaPorUsuario: esLicencia,
            minUsuarios: gruposLicencia[t.grupoProducto] || 1,
          };
        }
        gruposMap[t.grupoProducto].variantes.push(t);
        // Usar las características de la variante anual si existen
        if (t.caracteristicas && t.duracionPermanenciaMeses === 12) {
          gruposMap[t.grupoProducto].caracteristicas = t.caracteristicas;
        }
      } else {
        individuales.push(t);
      }
    });

    // Determinar si tienen variantes de duración o de tramo
    Object.values(gruposMap).forEach(g => {
      const duraciones = new Set(g.variantes.map(v => v.duracionPermanenciaMeses));
      const tramos = new Set(g.variantes.filter(v => v.varianteLabel).map(v => v.varianteLabel));
      g.tieneVariantesDuracion = duraciones.size > 1;
      g.tieneVariantesTramo = tramos.size > 1;
      
      if (g.tieneVariantesTramo) {
        // Ordenar por precio descendente (más licencias = más barato)
        g.variantes.sort((a, b) => b.precioSinIva - a.precioSinIva);
      } else {
        // Ordenar variantes por duración
        g.variantes.sort((a, b) => (a.duracionPermanenciaMeses || 0) - (b.duracionPermanenciaMeses || 0));
      }
    });

    // Ordenar grupos según prioridad definida
    const ordenGrupos: Record<string, number> = {
      'zoom-workplace-pro': 1,
      'zoom-workplace-business': 2,
      'zoom-workplace-enterprise': 3,
      'zoom-rooms': 4,
      'zoom-large-meeting': 5,
      'zoom-webinar': 6,
      'pbx-basico': 7,
      'pbx-esencial': 8,
      'pbx-business': 9,
      'pbx-premium': 10,
    };
    const agrupados = Object.values(gruposMap).sort((a, b) => {
      const ordenA = ordenGrupos[a.slug] ?? 99;
      const ordenB = ordenGrupos[b.slug] ?? 99;
      return ordenA - ordenB;
    });

    return { agrupados, individuales };
  }, [tarifas]);

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

  // Filtrar grupos e individuales por subcategoría
  const gruposFiltrados = useMemo(() => {
    if (filtro === 'todas') return grupos;
    return {
      agrupados: grupos.agrupados.filter(g => 
        g.variantes.some(v => v.subcategoria === filtro)
      ),
      individuales: grupos.individuales.filter(t => t.subcategoria === filtro),
    };
  }, [grupos, filtro]);

  const handleDuracionChange = (grupoSlug: string, meses: number) => {
    setDuracionSeleccionada(prev => ({ ...prev, [grupoSlug]: meses }));
  };

  const handleTramoChange = (grupoSlug: string, label: string) => {
    setTramoSeleccionado(prev => ({ ...prev, [grupoSlug]: label }));
  };

  const handleNumUsuariosChange = (grupoSlug: string, num: number, grupo: GrupoProducto) => {
    if (num < 1) num = 1;
    setNumUsuarios(prev => ({ ...prev, [grupoSlug]: num }));
    // Detectar tramo automáticamente basado en el número de usuarios
    const tramo = getTramoParaUsuarios(grupo, num);
    if (tramo && tramo.varianteLabel) {
      setTramoSeleccionado(prev => ({ ...prev, [grupoSlug]: tramo.varianteLabel! }));
    }
  };

  const getTramoParaUsuarios = (grupo: GrupoProducto, num: number): TarifaWeb | null => {
    // Parsear los tramos del varianteLabel para encontrar el correcto
    // Formato esperado: "1 a 5 licencias", "6 a 50 licencias", "51 a 200 licencias", "+ de 201 licencias"
    for (const v of grupo.variantes) {
      if (!v.varianteLabel) continue;
      const label = v.varianteLabel.toLowerCase();
      // Extraer rango del label
      const rangoMatch = label.match(/(\d+)\s*a\s*(\d+)/);
      if (rangoMatch) {
        const min = parseInt(rangoMatch[1]);
        const max = parseInt(rangoMatch[2]);
        if (num >= min && num <= max) return v;
      }
      // Formato "+ de X" o "> X" o "< X"
      const mayorMatch = label.match(/[+>]\s*(?:de\s*)?(\d+)/);
      if (mayorMatch) {
        const min = parseInt(mayorMatch[1]);
        if (num >= min) return v;
      }
      const menorMatch = label.match(/<\s*(\d+)/);
      if (menorMatch) {
        const max = parseInt(menorMatch[1]);
        if (num >= max) return v;
      }
    }
    // Si no se encuentra, devolver la última variante (tramo más alto)
    return grupo.variantes[grupo.variantes.length - 1];
  };

  const getVarianteSeleccionada = (grupo: GrupoProducto): TarifaWeb => {
    // Si tiene AMBAS variantes (tramo + duración), filtrar por ambas
    if (grupo.tieneVariantesTramo && grupo.tieneVariantesDuracion) {
      const tramoSel = tramoSeleccionado[grupo.slug] || grupo.variantes[0]?.varianteLabel;
      const mesesSel = duracionSeleccionada[grupo.slug] ?? 12;
      const match = grupo.variantes.find(v => v.varianteLabel === tramoSel && v.duracionPermanenciaMeses === mesesSel);
      if (match) return match;
      // Fallback: buscar solo por tramo
      const porTramo = grupo.variantes.find(v => v.varianteLabel === tramoSel);
      if (porTramo) return porTramo;
      return grupo.variantes[0];
    }
    // Si solo tiene variantes por tramo, usar selector de tramo
    if (grupo.tieneVariantesTramo) {
      const tramoSel = tramoSeleccionado[grupo.slug];
      if (tramoSel) {
        return grupo.variantes.find(v => v.varianteLabel === tramoSel) || grupo.variantes[0];
      }
      return grupo.variantes[0]; // Por defecto el primer tramo
    }
    // Si solo tiene variantes por duración
    const mesesSel = duracionSeleccionada[grupo.slug];
    if (mesesSel !== undefined) {
      return grupo.variantes.find(v => v.duracionPermanenciaMeses === mesesSel) || grupo.variantes[0];
    }
    // Por defecto mostrar la anual
    return grupo.variantes.find(v => v.duracionPermanenciaMeses === 12) || grupo.variantes[0];
  };

  // Función para renderizar una tarjeta de grupo (reutilizada en ambos modos)
  const renderTarjetaGrupo = (grupo: GrupoProducto, varianteActual: TarifaWeb) => (
    <div
      key={grupo.slug}
      className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-300 hover:shadow-lg transition-all flex flex-col"
    >
      {/* Nombre del producto */}
      <div className="mb-3">
        <h3 className="text-base font-bold text-gray-900 leading-tight">
          {grupo.nombre}
        </h3>
        {grupo.descripcion && (
          <p className="text-xs text-orange-600 mt-1 font-medium">
            {grupo.descripcion.split(' > ')[1] || grupo.descripcion}
          </p>
        )}
      </div>

      {/* Selector de participantes (dropdown) cuando tiene variantes de tramo */}
      {grupo.tieneVariantesTramo && !grupo.tieneVariantesDuracion && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">¿Cuántos usuarios necesitas?</label>
          <input
            type="number"
            min="1"
            value={numUsuarios[grupo.slug] || 1}
            onChange={(e) => handleNumUsuariosChange(grupo.slug, parseInt(e.target.value) || 1, grupo)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-gray-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
          <p className="text-xs text-gray-400 mt-1">
            Tramo: {varianteActual.varianteLabel} — {formatCurrency(varianteActual.precioSinIva)}/usuario/mes
          </p>
        </div>
      )}

      {/* Doble selector: participantes + duración */}
      {grupo.tieneVariantesTramo && grupo.tieneVariantesDuracion && (() => {
        const tramosUnicos = [...new Set(grupo.variantes.map(v => v.varianteLabel).filter(Boolean))] as string[];
        const duracionesUnicas = [...new Set(grupo.variantes.map(v => v.duracionPermanenciaMeses).filter(Boolean))] as number[];
        duracionesUnicas.sort((a, b) => a - b);
        const tramoActual = tramoSeleccionado[grupo.slug] || tramosUnicos[0];
        const duracionActual = duracionSeleccionada[grupo.slug] ?? 12;
        return (
          <div className="mb-4 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Participantes</label>
              <select
                value={tramoActual}
                onChange={(e) => setTramoSeleccionado(prev => ({ ...prev, [grupo.slug]: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-gray-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
              >
                {tramosUnicos.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                {duracionesUnicas.map((meses) => {
                  const isSelected = meses === duracionActual;
                  return (
                    <button
                      key={meses}
                      onClick={() => handleDuracionChange(grupo.slug, meses)}
                      className={`flex-1 py-1.5 text-xs font-medium transition-all ${
                        isSelected
                          ? 'bg-orange-600 text-white'
                          : 'bg-gray-50 text-gray-600 hover:bg-orange-50'
                      }`}
                    >
                      {getDuracionLabel(meses)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Selector de duración (solo duración, sin tramo) */}
      {grupo.tieneVariantesDuracion && !grupo.tieneVariantesTramo && (
        <div className="mb-4">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {grupo.variantes.map((v) => {
              const isSelected = v.id === varianteActual.id;
              return (
                <button
                  key={v.id}
                  onClick={() => handleDuracionChange(grupo.slug, v.duracionPermanenciaMeses || 0)}
                  className={`flex-1 py-1.5 text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-orange-600 text-white'
                      : 'bg-gray-50 text-gray-600 hover:bg-orange-50'
                  }`}
                >
                  {getDuracionLabel(v.duracionPermanenciaMeses)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Input de nº de usuarios/licencias para productos con precio por usuario */}
      {grupo.esLicenciaPorUsuario && (
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            Nº de licencias {grupo.minUsuarios > 1 ? `(mínimo ${grupo.minUsuarios})` : ''}
          </label>
          <input
            type="number"
            min={grupo.minUsuarios}
            value={numUsuarios[grupo.slug] || grupo.minUsuarios}
            onChange={(e) => {
              let val = parseInt(e.target.value) || grupo.minUsuarios;
              if (val < grupo.minUsuarios) val = grupo.minUsuarios;
              setNumUsuarios(prev => ({ ...prev, [grupo.slug]: val }));
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-gray-50 focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </div>
      )}

      {/* Precio */}
      <div className="border-t border-gray-100 pt-4">
        {grupo.tieneVariantesTramo && !grupo.tieneVariantesDuracion ? (
          <div>
            <div className="flex items-end justify-between">
              <div>
                <span className="text-2xl font-bold text-orange-600">
                  {formatCurrency(varianteActual.precioSinIva * (numUsuarios[grupo.slug] || 1))}
                </span>
                <span className="text-xs text-gray-400 ml-1">/mes</span>
              </div>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {formatCurrency(varianteActual.precioSinIva * (numUsuarios[grupo.slug] || 1) * 1.21)} /mes con IVA
            </div>
            <div className="text-xs text-gray-500 mt-1 bg-gray-50 px-2 py-1 rounded">
              {numUsuarios[grupo.slug] || 1} usuario{(numUsuarios[grupo.slug] || 1) > 1 ? 's' : ''} × {formatCurrency(varianteActual.precioSinIva)}/ud = {formatCurrency(varianteActual.precioSinIva * (numUsuarios[grupo.slug] || 1))}/mes
            </div>
          </div>
        ) : (
          <div>
            {grupo.esLicenciaPorUsuario ? (
              <>
                <div className="flex items-end">
                  <span className="text-2xl font-bold text-orange-600">
                    {formatCurrency(getPrecioMensual(varianteActual) * (numUsuarios[grupo.slug] || grupo.minUsuarios))}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">/mes</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {formatCurrency(getPrecioMensual(varianteActual) * (numUsuarios[grupo.slug] || grupo.minUsuarios) * 1.21)} /mes con IVA
                </div>
                <div className="text-xs text-gray-500 mt-1 bg-gray-50 px-2 py-1 rounded">
                  {numUsuarios[grupo.slug] || grupo.minUsuarios} licencia{(numUsuarios[grupo.slug] || grupo.minUsuarios) > 1 ? 's' : ''} × {formatCurrency(getPrecioMensual(varianteActual))}/ud/mes
                </div>
                {varianteActual.duracionPermanenciaMeses && varianteActual.duracionPermanenciaMeses > 1 && (
                  <div className="text-xs text-orange-700 font-medium mt-2 bg-orange-50 px-2 py-1.5 rounded">
                    Pago {varianteActual.duracionPermanenciaMeses === 12 ? 'anual' : varianteActual.duracionPermanenciaMeses === 24 ? 'bianual' : 'trianual'}: {formatCurrency(varianteActual.precioSinIva * (numUsuarios[grupo.slug] || grupo.minUsuarios))} sin IVA ({formatCurrency(varianteActual.precioConIva * (numUsuarios[grupo.slug] || grupo.minUsuarios))} con IVA)
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-end">
                  <span className="text-2xl font-bold text-orange-600">
                    {formatCurrency(getPrecioMensual(varianteActual))}
                  </span>
                  <span className="text-xs text-gray-400 ml-1">/mes</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {formatCurrency(getPrecioMensual(varianteActual) * 1.21)} /mes con IVA
                </div>
                {varianteActual.duracionPermanenciaMeses && varianteActual.duracionPermanenciaMeses > 1 && (
                  <div className="text-xs text-orange-700 font-medium mt-2 bg-orange-50 px-2 py-1.5 rounded">
                    Pago {varianteActual.duracionPermanenciaMeses === 12 ? 'anual' : varianteActual.duracionPermanenciaMeses === 24 ? 'bianual' : 'trianual'}: {formatCurrency(varianteActual.precioSinIva)} sin IVA ({formatCurrency(varianteActual.precioConIva)} con IVA)
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Características */}
      {grupo.caracteristicas && grupo.caracteristicas.items && grupo.caracteristicas.items.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100 flex-1">
          {grupo.caracteristicas.incluyePlanAnterior && (
            <p className="text-xs italic text-blue-600 mb-2">
              {grupo.caracteristicas.incluyePlanAnterior}
            </p>
          )}
          <div className="space-y-1.5">
            {grupo.caracteristicas.items.map((feat, idx) => (
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

  // Función para renderizar una tarjeta de tarifa individual (sin grupo_producto)
  const renderTarjetaIndividual = (tarifa: TarifaWeb) => (
    <div
      key={tarifa.id}
      className="bg-white border-2 border-gray-200 rounded-xl p-6 hover:border-orange-300 hover:shadow-lg transition-all flex flex-col"
    >
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

      {tarifa.descripcionLarga && (
        <p className="text-sm text-gray-600 mb-4 flex-1">
          {tarifa.descripcionLarga}
        </p>
      )}

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
                ✓ {grupos.agrupados.length + grupos.individuales.length} productos disponibles
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

      {/* Listado de productos agrupados */}
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
              {/* Productos agrupados por fabricante/subcategoría cuando filtro es 'todas' */}
              {(gruposFiltrados.agrupados.length > 0 || gruposFiltrados.individuales.length > 0) && filtro === 'todas' ? (
                <div className="space-y-12">
                  {(() => {
                    // Agrupar por fabricante (nivel superior) derivado de subcategoría
                    const fabricanteMap: Record<string, { nombre: string; subcategorias: Record<string, GrupoProducto[]>; individuales: Record<string, TarifaWeb[]> }> = {};
                    const ordenFabricantes: Record<string, number> = { 'Wildix': 1, 'Otros': 50, 'Zoom': 99 };

                    const getFabricante = (sub: string): string => {
                      if (sub.toLowerCase().includes('zoom') || sub === 'Webinars' || sub === 'Grandes Reuniones' || sub === 'Salas de reuniones') return 'Zoom';
                      if (sub.toLowerCase().includes('wildix')) return 'Wildix';
                      return 'Otros';
                    };
                    
                    gruposFiltrados.agrupados.forEach(grupo => {
                      const sub = grupo.subcategoria || 'Sin categoría';
                      const fabricante = getFabricante(sub);
                      if (!fabricanteMap[fabricante]) {
                        fabricanteMap[fabricante] = { nombre: fabricante, subcategorias: {}, individuales: {} };
                      }
                      if (!fabricanteMap[fabricante].subcategorias[sub]) {
                        fabricanteMap[fabricante].subcategorias[sub] = [];
                      }
                      fabricanteMap[fabricante].subcategorias[sub].push(grupo);
                    });

                    // Incluir tarifas individuales dentro de su fabricante correspondiente
                    gruposFiltrados.individuales.forEach(t => {
                      const sub = t.subcategoria || 'Sin categoría';
                      const fabricante = getFabricante(sub);
                      if (!fabricanteMap[fabricante]) {
                        fabricanteMap[fabricante] = { nombre: fabricante, subcategorias: {}, individuales: {} };
                      }
                      if (!fabricanteMap[fabricante].individuales[sub]) {
                        fabricanteMap[fabricante].individuales[sub] = [];
                      }
                      fabricanteMap[fabricante].individuales[sub].push(t);
                    });

                    const fabricantesOrdenados = Object.entries(fabricanteMap).sort(
                      ([a], [b]) => (ordenFabricantes[a] ?? 99) - (ordenFabricantes[b] ?? 99)
                    );

                    return fabricantesOrdenados.map(([fabricante, data]) => (
                      <div key={fabricante}>
                        {/* Encabezado de fabricante con logo */}
                        <div className="mb-6">
                          {fabricante === 'Wildix' ? (
                            <div className="flex items-center gap-3">
                              <Image src="/logos/wildix-logo.png" alt="Wildix" width={160} height={50} className="h-10 w-auto object-contain" />
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">Partner Certificado</span>
                            </div>
                          ) : fabricante === 'Zoom' ? (
                            <div className="flex items-center gap-3">
                              <Image src="/logos/zoom-logo.png" alt="Zoom" width={140} height={50} className="h-10 w-auto object-contain" />
                              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">Partner Certificado</span>
                            </div>
                          ) : (
                            <h2 className="text-2xl font-bold text-gray-900">{fabricante}</h2>
                          )}
                          <div className="h-1 w-16 bg-orange-500 mt-2 rounded"></div>
                        </div>
                        {/* Subcategorías dentro del fabricante */}
                        {Object.entries(data.subcategorias).map(([subcat, gruposSub]) => (
                          <div key={subcat} className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 pl-1">{subcat}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {gruposSub.map((grupo) => {
                                const varianteActual = getVarianteSeleccionada(grupo);
                                return renderTarjetaGrupo(grupo, varianteActual);
                              })}
                            </div>
                          </div>
                        ))}
                        {/* Tarifas individuales dentro del fabricante */}
                        {Object.entries(data.individuales).map(([subcat, tarifasSub]) => (
                          <div key={`indiv-${subcat}`} className="mb-8">
                            <h3 className="text-lg font-semibold text-gray-700 mb-4 pl-1">{subcat}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {tarifasSub.map(tarifa => renderTarjetaIndividual(tarifa))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ));
                  })()}

                </div>
              ) : (gruposFiltrados.agrupados.length > 0 || gruposFiltrados.individuales.length > 0) ? (
                <div>
                  {gruposFiltrados.agrupados.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
                      {gruposFiltrados.agrupados.map((grupo) => {
                        const varianteActual = getVarianteSeleccionada(grupo);
                        return renderTarjetaGrupo(grupo, varianteActual);
                      })}
                    </div>
                  )}
                  {gruposFiltrados.individuales.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {gruposFiltrados.individuales.map(tarifa => renderTarjetaIndividual(tarifa))}
                    </div>
                  )}
                </div>
              ) : (
                null
              )}

              {gruposFiltrados.agrupados.length === 0 && gruposFiltrados.individuales.length === 0 && (
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
