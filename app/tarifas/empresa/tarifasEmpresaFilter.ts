export interface TarifaEmpresaBusqueda {
  nombre: string;
  descripcion: string;
  velocidad: string;
  categoria: string;
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
