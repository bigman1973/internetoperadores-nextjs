export interface TarifaEmpresaBusqueda {
  nombre: string;
  descripcion: string;
  velocidad: string;
  categoria: string;
}

export interface ResultadoOrdenableTarifaEmpresa<T> {
  elemento: T;
  visibles: number;
  primerIndice: number;
}

export function normalizaBusquedaTarifaEmpresa(termino: string) {
  return termino.trim().toLowerCase();
}

/**
 * Conserva la semántica del filtro de Empresa: una coincidencia parcial y sin
 * distinción de mayúsculas en nombre, descripción, velocidad o categoría. El
 * cliente aporta los atributos y el término ya normalizados una vez.
 */
export function coincideTarifaEmpresa(tarifa: TarifaEmpresaBusqueda, termino: string) {
  if (!termino) return true;

  return [tarifa.nombre, tarifa.descripcion, tarifa.velocidad, tarifa.categoria]
    .some((valor) => valor.includes(termino));
}

/**
 * Conserva el orden público del catálogo tras filtrar: más coincidencias primero
 * y, cuando empatan, la tarifa que aparecía antes en el catálogo original.
 */
export function ordenaResultadosTarifaEmpresa<T>(
  resultados: ResultadoOrdenableTarifaEmpresa<T>[],
) {
  return [...resultados].sort(
    (a, b) => b.visibles - a.visibles || a.primerIndice - b.primerIndice,
  );
}
