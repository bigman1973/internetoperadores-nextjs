"use client";
export const dynamic = "force-dynamic";


import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Tarifa {
  id: number;
  nombre: string;
  categoria: string;
  descripcionCorta: string | null;
  velocidad: string | null;
  precioConIva: number;
  permanencia: string | null;
  destacada: boolean;
}

export default function TarifasParticularPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState<string>('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    cargarTarifas();
  }, [categoriaSeleccionada, busqueda]);

  const cargarTarifas = async () => {
    try {
      const params = new URLSearchParams({
        tipoCliente: 'PARTICULAR',
        activa: 'true',
      });

      if (categoriaSeleccionada !== 'TODAS') {
        params.append('categoria', categoriaSeleccionada);
      }

      if (busqueda) {
        params.append('busqueda', busqueda);
      }

      const response = await fetch(`/api/tarifas?${params}`);
      const data = await response.json();

      setTarifas(data.tarifas || []);

      // Extraer categorías únicas
      if (categoriaSeleccionada === 'TODAS') {
        const cats = Array.from(new Set(data.tarifas.map((t: Tarifa) => t.categoria)));
        setCategorias(cats as string[]);
      }

    } catch (error) {
      console.error('Error cargando tarifas:', error);
    } finally {
      setLoading(false);
    }
  };

  const tarifasDestacadas = tarifas.filter(t => t.destacada);
  const tarifasNormales = tarifas.filter(t => !t.destacada);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-2xl font-bold text-orange-600">
              Internet Operadores
            </Link>
            <nav className="hidden md:flex gap-6">
              <Link href="/tarifas/particular" className="text-orange-600 font-medium">
                Particulares
              </Link>
              <Link href="/tarifas/empresa" className="text-gray-600 hover:text-gray-900">
                Empresas
              </Link>
              <Link href="/contacto" className="text-gray-600 hover:text-gray-900">
                Contacto
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="bg-gradient-to-r from-orange-600 to-orange-500 text-white py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl md:text-5xl font-bold mb-4">
            Tarifas para Particulares
          </h1>
          <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto">
            Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-lg shadow-sm p-4 md:p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Búsqueda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Buscar tarifa
              </label>
              <input
                type="text"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, velocidad..."
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
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
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="TODAS">Todas las categorías</option>
                {categorias.map(cat => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
            <p className="mt-4 text-gray-600">Cargando tarifas...</p>
          </div>
        )}

        {/* Tarifas Destacadas */}
        {!loading && tarifasDestacadas.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              ⭐ Tarifas Destacadas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tarifasDestacadas.map(tarifa => (
                <TarifaCard key={tarifa.id} tarifa={tarifa} destacada />
              ))}
            </div>
          </div>
        )}

        {/* Tarifas Normales */}
        {!loading && tarifasNormales.length > 0 && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Todas las Tarifas
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tarifasNormales.map(tarifa => (
                <TarifaCard key={tarifa.id} tarifa={tarifa} />
              ))}
            </div>
          </div>
        )}

        {/* Sin resultados */}
        {!loading && tarifas.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg">
              No se encontraron tarifas con los filtros seleccionados.
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p>© 2025 Internet Operadores. Todos los derechos reservados.</p>
        </div>
      </footer>
    </div>
  );
}

function TarifaCard({ tarifa, destacada = false }: { tarifa: Tarifa; destacada?: boolean }) {
  return (
    <div className={`bg-white rounded-lg shadow-md overflow-hidden hover:shadow-xl transition-shadow ${destacada ? 'ring-2 ring-orange-500' : ''}`}>
      {destacada && (
        <div className="bg-orange-500 text-white text-center py-2 text-sm font-semibold">
          ⭐ DESTACADA
        </div>
      )}
      
      <div className="p-6">
        {/* Categoría */}
        <div className="text-sm text-orange-600 font-medium mb-2">
          {tarifa.categoria}
        </div>

        {/* Nombre */}
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {tarifa.nombre}
        </h3>

        {/* Velocidad */}
        {tarifa.velocidad && (
          <p className="text-gray-600 mb-4">
            {tarifa.velocidad}
          </p>
        )}

        {/* Descripción */}
        {tarifa.descripcionCorta && (
          <p className="text-sm text-gray-500 mb-4">
            {tarifa.descripcionCorta}
          </p>
        )}

        {/* Precio */}
        <div className="mb-4">
          <span className="text-3xl font-bold text-gray-900">
            {tarifa.precioConIva.toFixed(2)}€
          </span>
          <span className="text-gray-600">/mes</span>
        </div>

        {/* Permanencia */}
        {tarifa.permanencia && (
          <p className="text-sm text-gray-500 mb-4">
            Permanencia: {tarifa.permanencia}
          </p>
        )}

        {/* Botón */}
        <button className="w-full bg-orange-600 text-white py-3 rounded-md hover:bg-orange-700 transition-colors font-medium">
          Contratar
        </button>
      </div>
    </div>
  );
}
