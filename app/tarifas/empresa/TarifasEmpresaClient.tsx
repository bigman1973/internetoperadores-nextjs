'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { coincideTarifaEmpresa, normalizaBusquedaTarifaEmpresa } from './tarifasEmpresaFilter';
import { iconoCategoria } from './tarifasEmpresaShared';

interface CategoriaResumen {
  nombre: string;
  total: number;
}

interface Props {
  categorias: CategoriaResumen[];
  total: number;
}

interface TarifaCatalogo {
  elemento: HTMLElement;
  nombre: string;
  descripcion: string;
  velocidad: string;
  categoria: string;
}

interface SeccionCatalogo {
  elemento: HTMLElement;
  categoria: string;
  tarifas: TarifaCatalogo[];
}

export default function TarifasEmpresaClient({ categorias, total }: Props) {
  const router = useRouter();
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState('TODAS');
  const [busquedaEntrada, setBusquedaEntrada] = useState('');
  const busqueda = useDeferredValue(busquedaEntrada);
  const [tarifasVisibles, setTarifasVisibles] = useState(total);
  const [refreshing, setRefreshing] = useState(false);
  const seHaFiltrado = useRef(false);
  const catalogoCacheado = useRef<SeccionCatalogo[] | null>(null);

  useEffect(() => {
    const termino = normalizaBusquedaTarifaEmpresa(busqueda);
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

    // El catálogo es HTML estable del servidor. Se crea su índice sólo al
    // primer filtro para no recorrer miles de nodos en cada pulsación. Un
    // router.refresh puede sustituir ese HTML, por lo que se invalida sólo en
    // ese caso antes de volver a indexarlo.
    if (catalogoCacheado.current?.some(({ elemento }) => !catalogo.contains(elemento))) {
      catalogoCacheado.current = null;
    }
    catalogoCacheado.current ??= Array.from(
      catalogo.querySelectorAll<HTMLElement>('[data-tarifas-categoria]'),
    ).map((seccion) => ({
      elemento: seccion,
      categoria: seccion.dataset.tarifasCategoria || '',
      tarifas: Array.from(seccion.querySelectorAll<HTMLElement>('[data-tarifa]')).map((elemento) => ({
        elemento,
        nombre: elemento.dataset.tarifaNombre || '',
        descripcion: elemento.dataset.tarifaDescripcion || '',
        velocidad: elemento.dataset.tarifaVelocidad || '',
        categoria: elemento.dataset.tarifaCategoria || '',
      })),
    }));

    let tarifasVisiblesAhora = 0;
    for (const seccion of catalogoCacheado.current) {
      let visiblesEnSeccion = 0;

      for (const tarifa of seccion.tarifas) {
        const coincideCategoria = categoriaSeleccionada === 'TODAS' || seccion.categoria === categoriaSeleccionada;
        const coincide = coincideCategoria && coincideTarifaEmpresa(tarifa, termino);
        const debeOcultarse = !coincide;
        if (tarifa.elemento.hidden !== debeOcultarse) tarifa.elemento.hidden = debeOcultarse;
        if (coincide) {
          visiblesEnSeccion += 1;
        }
      }

      const debeOcultarse = visiblesEnSeccion === 0;
      if (seccion.elemento.hidden !== debeOcultarse) seccion.elemento.hidden = debeOcultarse;
      tarifasVisiblesAhora += visiblesEnSeccion;
    }

    sinResultados.hidden = tarifasVisiblesAhora !== 0;
    setTarifasVisibles(tarifasVisiblesAhora);
    seHaFiltrado.current = tieneFiltro;
  }, [busqueda, categoriaSeleccionada, total]);

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
          <form id="tarifas-empresa-filtros" onSubmit={(event) => event.preventDefault()} onReset={() => { setBusquedaEntrada(''); setCategoriaSeleccionada('TODAS'); }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Buscar tarifa</label>
                <input
                  type="text"
                  value={busquedaEntrada}
                  onChange={(event) => setBusquedaEntrada(event.target.value)}
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
