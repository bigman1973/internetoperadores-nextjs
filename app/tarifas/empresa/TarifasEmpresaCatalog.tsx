import AddToCartButton from '../../../components/AddToCartButton';
import type { TarifaWeb } from '@/lib/tarifas-web';
import { esCategoriaDeTabla, getDetalleConectividad, iconoCategoria } from './tarifasEmpresaShared';

interface Props {
  tarifas: TarifaWeb[];
}

function tarifaParaCarrito(tarifa: TarifaWeb) {
  return {
    id: tarifa.id,
    nombre: tarifa.nombre,
    nombreComercial: tarifa.nombreComercial,
    descripcionCorta: tarifa.descripcionCorta,
    precioConIva: tarifa.precioConIva,
    precioSinIva: tarifa.precioSinIva,
    cuotaAlta: tarifa.cuotaAlta,
    tipoPeriodicidad: tarifa.tipoPeriodicidad,
    duracionPermanenciaMeses: tarifa.duracionPermanenciaMeses,
    categoria: tarifa.categoria,
    tipoCliente: tarifa.tipoCliente,
  };
}

function atributosBusqueda(tarifa: TarifaWeb, indice: number) {
  return {
    'data-tarifa': '',
    'data-tarifa-nombre': tarifa.nombre.toLowerCase(),
    'data-tarifa-descripcion': tarifa.descripcionCorta?.toLowerCase() || '',
    'data-tarifa-velocidad': tarifa.velocidad?.toLowerCase() || '',
    'data-tarifa-categoria': tarifa.categoria.toLowerCase(),
    'data-tarifa-indice': indice,
  };
}

export default function TarifasEmpresaCatalog({ tarifas }: Props) {
  const tarifasPorCategoria = tarifas.reduce<Record<string, TarifaWeb[]>>((resultado, tarifa) => {
    const categoria = tarifa.categoria || 'OTROS';
    if (!resultado[categoria]) resultado[categoria] = [];
    resultado[categoria].push(tarifa);
    return resultado;
  }, {});

  const categoriasOrdenadas = Object.entries(tarifasPorCategoria)
    .sort((a, b) => b[1].length - a[1].length);
  const indicesTarifa = new Map(tarifas.map((tarifa, indice) => [tarifa.id, indice]));

  return (
    <div id="tarifas-empresa-catalogo">
      {categoriasOrdenadas.map(([categoria, tarifasCategoria], indice) => (
        <section
          key={categoria}
          className="mb-12"
          id={categoria.toLowerCase().replace(/\s+/g, '-')}
          data-tarifas-categoria={categoria}
          data-tarifas-orden={indice}
        >
          <div className="flex items-center gap-3 mb-6">
            <span className="text-3xl">{iconoCategoria[categoria] || '📦'}</span>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{categoria}</h2>
              <p className="text-sm text-gray-500">{tarifasCategoria.length} tarifas disponibles</p>
            </div>
          </div>

          {esCategoriaDeTabla(categoria) ? (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="max-w-full overflow-x-auto overscroll-x-contain" role="region" aria-label={`Tabla de tarifas ${categoria}`} tabIndex={0}>
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="bg-gray-900 text-white">
                      <th className="text-left px-6 py-4 font-semibold">Tarifa</th>
                      <th className="text-left px-6 py-4 font-semibold">Detalle</th>
                      <th className="text-right px-6 py-4 font-semibold">Precio (sin IVA)</th>
                      <th className="text-right px-6 py-4 font-semibold">Precio (con IVA)</th>
                      <th className="text-center px-6 py-4 font-semibold">Permanencia</th>
                      <th className="text-center px-6 py-4 font-semibold">Garantía</th>
                      <th className="text-center px-6 py-4 font-semibold">Alta</th>
                      <th className="text-center px-6 py-4 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {tarifasCategoria.map((tarifa, tarifaIndice) => {
                      const detalle = getDetalleConectividad(tarifa);
                      return (
                        <tr
                          key={tarifa.id}
                          {...atributosBusqueda(tarifa, indicesTarifa.get(tarifa.id) || 0)}
                          className={`border-b border-gray-100 hover:bg-orange-50 transition-colors ${tarifaIndice % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{tarifa.nombreComercial || tarifa.nombre}</span>
                              {tarifa.esPopular && <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">Más vendido</span>}
                              {tarifa.destacada && !tarifa.esPopular && <span className="text-yellow-500 text-xs">★</span>}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-gray-600 text-sm">{detalle || '—'}</td>
                          <td className="px-6 py-4 text-right text-gray-700">
                            {tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 && tarifa.precioPeriodo
                              ? `${tarifa.precioPeriodo.toFixed(2)} €`
                              : tarifa.precioSinIva > 0 ? `${tarifa.precioSinIva.toFixed(2)} €` : '-'}
                            {tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 && (
                              <span className="text-gray-400 text-[10px] block">/mes</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            {tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 ? (
                              <>
                                <span className="font-bold text-gray-900 text-lg">
                                  {tarifa.precioPeriodoIva ? `${tarifa.precioPeriodoIva.toFixed(2)} €` : tarifa.precioConIva > 0 ? `${tarifa.precioConIva.toFixed(2)} €` : 'Consultar'}
                                </span>
                                <span className="text-gray-500 text-xs block">/mes</span>
                                <span className="text-gray-400 text-[10px] block">
                                  Pago {tarifa.tipoPeriodicidad >= 36 ? 'trianual' : tarifa.tipoPeriodicidad >= 24 ? 'bianual' : 'anual'}: {tarifa.precioConIva.toFixed(2)} €
                                </span>
                              </>
                            ) : (
                              <>
                                <span className="font-bold text-gray-900 text-lg">
                                  {tarifa.precioConIva > 0 ? `${tarifa.precioConIva.toFixed(2)} €` : 'Consultar'}
                                </span>
                                {tarifa.precioConIva > 0 && <span className="text-gray-500 text-xs block">/mes</span>}
                              </>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center text-sm text-gray-600">—</td>
                          <td className="px-6 py-4 text-center text-sm text-gray-600">{tarifa.garantia || '—'}</td>
                          <td className="px-6 py-4 text-center text-sm text-gray-600">
                            {tarifa.cuotaAlta && tarifa.cuotaAlta > 0 ? `${(tarifa.cuotaAlta * 1.21).toFixed(2)} €` : '—'}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <AddToCartButton tarifa={tarifaParaCarrito(tarifa)} compact />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tarifasCategoria.map((tarifa) => {
                const detalle = getDetalleConectividad(tarifa);
                return (
                  <div
                    key={tarifa.id}
                    {...atributosBusqueda(tarifa, indicesTarifa.get(tarifa.id) || 0)}
                    className={`bg-white rounded-xl shadow-sm hover:shadow-lg transition-shadow overflow-hidden border ${tarifa.esPopular ? 'border-orange-400 ring-1 ring-orange-200' : tarifa.destacada ? 'border-orange-300 ring-1 ring-orange-100' : 'border-gray-100'}`}
                  >
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
                      {detalle && (
                        <p className="text-xs text-gray-600 mb-3 bg-gray-50 rounded px-2 py-1">{detalle}</p>
                      )}
                      <div className="flex items-baseline gap-1 mb-1">
                        {tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 ? (
                          <>
                            <span className="text-3xl font-bold text-gray-900">
                              {tarifa.precioPeriodoIva ? tarifa.precioPeriodoIva.toFixed(2) : tarifa.precioConIva > 0 ? tarifa.precioConIva.toFixed(2) : 'Consultar'}
                            </span>
                            <span className="text-gray-500">€/mes</span>
                          </>
                        ) : (
                          <>
                            <span className="text-3xl font-bold text-gray-900">
                              {tarifa.precioConIva > 0 ? `${tarifa.precioConIva.toFixed(2)}` : 'Consultar'}
                            </span>
                            {tarifa.precioConIva > 0 && <span className="text-gray-500">€/mes</span>}
                          </>
                        )}
                      </div>
                      {tarifa.tipoPeriodicidad && tarifa.tipoPeriodicidad >= 12 ? (
                        <>
                          {tarifa.precioPeriodo && <p className="text-xs text-gray-400 mb-1">{tarifa.precioPeriodo.toFixed(2)} €/mes sin IVA</p>}
                          <p className="text-xs text-green-600 bg-green-50 inline-block px-2 py-0.5 rounded mb-2">
                            Pago {tarifa.tipoPeriodicidad >= 36 ? 'trianual' : tarifa.tipoPeriodicidad >= 24 ? 'bianual' : 'anual'}: {tarifa.precioSinIva.toFixed(2)} € sin IVA ({tarifa.precioConIva.toFixed(2)} € con IVA)
                          </p>
                        </>
                      ) : (
                        tarifa.precioSinIva > 0 && (
                          <p className="text-xs text-gray-400 mb-2">{tarifa.precioSinIva.toFixed(2)} € sin IVA</p>
                        )
                      )}
                      {tarifa.garantia && (
                        <p className="text-xs text-gray-500 mb-1">Garantía: {tarifa.garantia}</p>
                      )}
                      {tarifa.cuotaAlta && tarifa.cuotaAlta > 0 && (
                        <p className="text-xs text-gray-500 mb-1">Alta: {(tarifa.cuotaAlta * 1.21).toFixed(2)} € (IVA incl.)</p>
                      )}
                      {tarifa.caracteristicas && tarifa.caracteristicas.items && tarifa.caracteristicas.items.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Funcionalidades:</p>
                          {tarifa.caracteristicas.incluyePlanAnterior && (
                            <p className="text-xs italic text-blue-600 mb-2">{tarifa.caracteristicas.incluyePlanAnterior}</p>
                          )}
                          <div className="space-y-1">
                            {tarifa.caracteristicas.items.map((feature, indiceFeature) => (
                              <div key={indiceFeature} className="text-xs text-gray-600">
                                <span className="font-medium text-gray-800">{feature.titulo}</span>
                                {feature.descripcion && <span className="text-gray-500"> — {feature.descripcion}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="px-6 pb-6">
                      <AddToCartButton tarifa={tarifaParaCarrito(tarifa)} variant="secondary" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
