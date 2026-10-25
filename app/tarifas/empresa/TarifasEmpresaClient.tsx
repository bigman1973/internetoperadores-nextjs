'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { iconoCategoria } from './tarifasEmpresaShared';

interface CategoriaResumen {
  nombre: string;
  total: number;
}

interface Props {
  categorias: CategoriaResumen[];
  total: number;
}

function coincideBusqueda(elemento: HTMLElement, termino: string) {
  if (!termino) return true;

  return [
    elemento.dataset.tarifaNombre,
    elemento.dataset.tarifaDescripcion,
    elemento.dataset.tarifaVelocidad,
    elemento.dataset.tarifaCategoria,
  ].some((valor) => valor?.includes(termino));
}

export default function TarifasEmpresaClient({ categorias, total }: Props) {
  const router = useRouter();
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('TODAS');
  const [busqueda, setBusqueda] = useState('');
  const [tarifasVisibles, setTarifasVisibles] = useState(total);
  const [refreshing, setRefreshing] = useState(false);
  const seHaFiltrado = useRef(false);

  useEffect(() => {
    const termino = busqueda.trim().toLowerCase();
    const tieneFiltro = categoriaSeleccionada !== 'TODAS' || Boolean(termino);

    // En la carga inicial no se toca el catálogo estático: el navegador puede
    // pintar el HTML completo sin recorrer ni reconciliar miles de nodos.
    if (!tieneFiltro && !seHaFiltrado.current) {
      setTarifasVisibles(total);
      return;
    }

    const catalogo = document.getElementById('tarifas-empresa-catalogo');
    const sinResultados = document.getElementById('tarifas-empresa-sin-resultados');
    if (!catalogo || !sinResultados) return;

    const secciones = Array.from(catalogo.querySelectorAll<HTMLElement>('[data-tarifas-categoria]'));
    const seccionesConResultado = secciones.map((seccion) => {
      const categoria = seccion.dataset.tarifasCategoria;
      const tarifas = Array.from(seccion.querySelectorAll<HTMLElement>('[data-tarifa]'));
      let visibles = 0;
      let primerIndiceVisible = Number.POSITIVE_INFINITY;

      for (const tarifa of tarifas) {
        const coincideCategoria = categoriaSeleccionada === 'TODAS' || categoria === categoriaSeleccionada;
        const coincide = coincideCategoria && coincideBusqueda(tarifa, termino);
        tarifa.hidden = !coincide;
        if (coincide) {
          visibles += 1;
          primerIndiceVisible = Math.min(primerIndiceVisible, Number(tarifa.dataset.tarifaIndice));
        }
      }

      seccion.hidden = visibles === 0;
      return {
        seccion,
        visibles,
        primerIndiceVisible,
      };
    });

    const visibles = seccionesConResultado.reduce((acumulado, seccion) => acumulado + seccion.visibles, 0);
    const ordenadas = [...seccionesConResultado].sort(
      (a, b) => b.visibles - a.visibles || a.primerIndiceVisible - b.primerIndiceVisible,
    );

    if (ordenadas.some((seccion, indice) => seccion.seccion !== secciones[indice])) {
      const fragmento = document.createDocumentFragment();
      for (const { seccion } of ordenadas) fragmento.append(seccion);
      catalogo.append(fragmento);
    }

    sinResultados.hidden = visibles !== 0;
    setTarifasVisibles(visibles);
    seHaFiltrado.current = tieneFiltro;
  }, [busqueda, categoriaSeleccionada, categorias, total]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch('/api/revalidate-tarifas', { method: 'POST' });
      router.refresh();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setTimeout(() => setRefreshing(false), 1000);
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        <div className="bg-white rounded-xl shadow-lg p-4 md:p-6">
          <form id="tarifas-empresa-filtros" onSubmit={(event) => event.preventDefault()} onReset={() => { setBusqueda(''); setCategoriaSeleccionada('TODAS'); }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Buscar tarifa</label>
                <input
                  type="text"
                  value={busqueda}
                  onChange={(event) => setBusqueda(event.target.value)}
                  placeholder="Nombre, velocidad, categoría..."
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
                <select
                  value={categoriaSeleccionada}
                  onChange={(event) => setCategoriaSeleccionada(event.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  <option value="TODAS">Todas las categorías ({total})</option>
                  {categorias.map((categoria) => (
                    <option key={categoria.nombre} value={categoria.nombre}>
                      {iconoCategoria[categoria.nombre] || '📦'} {categoria.nombre} ({categoria.total})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  Mostrando <span className="font-bold text-orange-600">{tarifasVisibles}</span> tarifas
                </p>
                <button
                  type="button"
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
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={() => setCategoriaSeleccionada('TODAS')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              categoriaSeleccionada === 'TODAS'
                ? 'bg-orange-500 text-white'
                : 'bg-white text-gray-700 hover:bg-orange-50 border border-gray-200'
            }`}
          >
            Todas
          </button>
          {categorias.map((categoria) => (
            <button
              type="button"
              key={categoria.nombre}
              onClick={() => setCategoriaSeleccionada(categoria.nombre)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                categoriaSeleccionada === categoria.nombre
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-orange-50 border border-gray-200'
              }`}
            >
              {iconoCategoria[categoria.nombre] || '📦'} {categoria.nombre}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
