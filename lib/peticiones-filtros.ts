export function filtrarPeticiones<T extends { estado: string; tipo: string }>(
  peticiones: T[],
  estado: string,
  tipo: string,
): T[] {
  return peticiones.filter(p => (!estado || p.estado === estado) && (!tipo || p.tipo === tipo))
}
