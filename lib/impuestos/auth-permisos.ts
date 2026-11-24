/** Permisos de Impuestos y Presupuesto sin dependencias de servidor (se prueban sin base de datos). */
export type Modulo = 'impuestos' | 'presupuesto';
export function permisosFin(modulo: Modulo, rol: string, roles: string[] | null | undefined) {
  const admin = rol === 'SUPER_ADMIN' || rol === 'GERENTE';
  const conta = rol === 'CONTABILIDAD' || (roles ?? []).includes('CONTABILIDAD');
  if (admin) return { acceso: true, puedeEditar: true, puedeAprobar: rol === 'SUPER_ADMIN', soloLectura: false };
  if (modulo === 'impuestos' && conta) return { acceso: true, puedeEditar: false, puedeAprobar: false, soloLectura: true };
  return { acceso: false, puedeEditar: false, puedeAprobar: false, soloLectura: false };
}
