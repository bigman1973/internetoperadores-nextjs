"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import tarifasData from '../../../data/tarifas.json';

interface Tarifa {
  tipo_cliente: string;
  categoria: string;
  nombre: string;
  descripcion_corta: string | null;
  velocidad: string | null;
  precio_sin_iva: number | null;
  precio_con_iva: number | null;
  coste_operador: number | null;
  permanencia: string | null;
  sla: string | null;
  observaciones: string | null;
  orden: number;
}

const iconoCategoria: Record<string, string> = {
  'Conexiones Internet': '🌐',
  'Backup Internet': '🔄',
  'Telefonía Fija': '📞',
  'Comunicaciones Unificadas': '💬',
  'Hotspot WiFi': '📶',
  'Videoconferencia': '🎥',
  'Terminales y Equipos': '🖥️',
  'Mantenimiento IT': '🔧',
};

const ordenCategorias = [
  'Conexiones Internet',
  'Backup Internet',
  'Telefonía Fija',
  'Comunicaciones Unificadas',
  'Hotspot WiFi',
  'Videoconferencia',
  'Terminales y Equipos',
  'Mantenimiento IT',
];

export default function TarifasEmpresaPage() {
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>('TODAS');
  const [busqueda, setBusqueda] = useState('');

  const tarifasEmpresa = useMemo(() => {
    return (tarifasData as Tarifa[]).filter(t => t.tipo_cliente === 'EMPRESA');
  }, []);

  const categorias = useMemo(() => {
    const cats = Array.from(new Set(tarifasEmpresa.map(t => t.categoria)));
    return ordenCategorias.filter(c => cats.includes(c));
  }, [tarifasEmpresa]);

  const tarifasFiltradas = useMemo(() => {
    let resultado = tarifasEmpresa;

    if (categoriaSeleccionada !== 'TODAS') {
      resultado = resultado.filter(t => t.categoria === categoriaSeleccionada);
    }

    if (busqueda.trim()) {
      const term = busqueda.toLowerCase();
      resultado = resultado.filter(t =>
        t.nombre.toLowerCase().includes(term) ||
        (t.descripcion_corta && t.descripcion_corta.toLowerCase().includes(term)) ||
        (t.velocidad && t.velocidad.toLowerCase().includes(term)) ||
        t.categoria.toLowerCase().includes(term)
      );
    }

    return resultado;
  }, [tarifasEmpresa, categoriaSeleccionada, busqueda]);

  const tarifasPorCategoria = useMemo(() => {
    const grouped: Record<string, Tarifa[]> = {};
    tarifasFiltradas.forEach(t => {
      if (!grouped[t.categoria]) grouped[t.categoria] = [];
      grouped[t.categoria].push(t);
    });
    return grouped;
  }, [tarifasFiltradas]);

  return (
    <div className="min-h-screen bg-gray-50">
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
              <a href="https://wa.me/34900123456" className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
                WhatsApp Comercial
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Búsqueda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar tarifa
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, velocidad, categoría..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {/* Categoría */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Categoría
              </label>
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="TODAS">Todas las categorías ({tarifasEmpresa.length})</option>
                {categorias.map(cat => {
                  const count = tarifasEmpresa.filter(t => t.categoria === cat).length;
                  return (
                    <option key={cat} value={cat}>
                      {iconoCategoria[cat] || ''} {cat} ({count})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Contador */}
            <div className="text-center md:text-right">
              <p className="text-sm text-gray-500">
                Mostrando <span className="font-bold text-orange-600">{tarifasFiltradas.length}</span> tarifas
              </p>
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
          {categorias.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoriaSeleccionada(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                categoriaSeleccionada === cat
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-orange-50 border border-gray-200'
              }`}
            >
              {iconoCategoria[cat]} {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Tarifas por categoría */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {Object.keys(tarifasPorCategoria).length === 0 && (
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

        {ordenCategorias
          .filter(cat => tarifasPorCategoria[cat])
          .map(cat => (
            <div key={cat} className="mb-12" id={cat.toLowerCase().replace(/\s+/g, '-')}>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl">{iconoCategoria[cat]}</span>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{cat}</h2>
                  <p className="text-sm text-gray-500">{tarifasPorCategoria[cat].length} tarifas disponibles</p>
                </div>
              </div>

              {/* Tabla para conexiones, backup, telefonía */}
              {['Conexiones Internet', 'Backup Internet', 'Telefonía Fija'].includes(cat) ? (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-900 text-white">
                          <th className="text-left px-6 py-4 font-semibold">Tarifa</th>
                          <th className="text-left px-6 py-4 font-semibold">Velocidad / Detalle</th>
                          <th className="text-right px-6 py-4 font-semibold">Precio (sin IVA)</th>
                          <th className="text-right px-6 py-4 font-semibold">Precio (con IVA)</th>
                          <th className="text-center px-6 py-4 font-semibold">Permanencia</th>
                          <th className="text-center px-6 py-4 font-semibold">SLA</th>
                          <th className="text-center px-6 py-4 font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tarifasPorCategoria[cat].map((tarifa, idx) => (
                          <tr key={idx} className={`border-b border-gray-100 hover:bg-orange-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                            <td className="px-6 py-4">
                              <span className="font-semibold text-gray-900">{tarifa.nombre}</span>
                            </td>
                            <td className="px-6 py-4 text-gray-600 text-sm">
                              {tarifa.velocidad || tarifa.descripcion_corta || '-'}
                            </td>
                            <td className="px-6 py-4 text-right text-gray-700">
                              {tarifa.precio_sin_iva ? `${tarifa.precio_sin_iva.toFixed(2)} €` : '-'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              <span className="font-bold text-gray-900 text-lg">
                                {tarifa.precio_con_iva ? `${tarifa.precio_con_iva.toFixed(2)} €` : 'Consultar'}
                              </span>
                              <span className="text-gray-500 text-xs block">/mes</span>
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-gray-600">
                              {tarifa.permanencia || '-'}
                            </td>
                            <td className="px-6 py-4 text-center text-sm text-gray-600">
                              {tarifa.sla || '-'}
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
                /* Cards para el resto de categorías */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {tarifasPorCategoria[cat].map((tarifa, idx) => (
                    <div key={idx} className="bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden border border-gray-100">
                      <div className="p-6">
                        <div className="text-xs text-orange-600 font-semibold uppercase tracking-wider mb-2">
                          {tarifa.categoria}
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">
                          {tarifa.nombre}
                        </h3>
                        {tarifa.descripcion_corta && (
                          <p className="text-sm text-gray-500 mb-4 line-clamp-2">
                            {tarifa.descripcion_corta}
                          </p>
                        )}

                        <div className="flex items-baseline gap-1 mb-4">
                          <span className="text-3xl font-bold text-gray-900">
                            {tarifa.precio_con_iva ? `${tarifa.precio_con_iva.toFixed(2)}` : 'Consultar'}
                          </span>
                          {tarifa.precio_con_iva && (
                            <span className="text-gray-500">€/mes</span>
                          )}
                        </div>

                        {tarifa.precio_sin_iva && (
                          <p className="text-xs text-gray-400 mb-2">
                            {tarifa.precio_sin_iva.toFixed(2)} € sin IVA
                          </p>
                        )}

                        {tarifa.permanencia && (
                          <p className="text-xs text-gray-500 mb-1">
                            Permanencia: {tarifa.permanencia}
                          </p>
                        )}

                        {tarifa.sla && (
                          <p className="text-xs text-gray-500 mb-1">
                            SLA: {tarifa.sla}
                          </p>
                        )}

                        {tarifa.observaciones && (
                          <p className="text-xs text-gray-400 mt-2 italic">
                            {tarifa.observaciones}
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
          <h2 className="text-3xl font-bold mb-4">
            ¿Necesitas una solución a medida?
          </h2>
          <p className="text-lg opacity-90 mb-8">
            Nuestro equipo comercial te preparará un presupuesto personalizado adaptado a las necesidades de tu empresa. Sin compromiso.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link href="/contacto" className="bg-white text-orange-600 hover:bg-gray-100 px-8 py-3 rounded-lg font-semibold transition-colors">
              Solicitar Presupuesto
            </Link>
            <a href="tel:+34900123456" className="border-2 border-white text-white hover:bg-white/10 px-8 py-3 rounded-lg font-semibold transition-colors">
              Llamar Ahora
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
