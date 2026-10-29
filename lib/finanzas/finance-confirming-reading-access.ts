/**
 * Esta guarda no resuelve roles ni concede capacidades. Recibe los permisos ya
 * calculados por el guard vivo existente y sólo permite montar la bandeja como
 * sección de Conciliar. Para pedir por sí solo nunca abre Finanzas ni archivos.
 */
export type FinanceConfirmingReadingAccess = Readonly<{
  puedeVer: boolean
  seccion: 'CONCILIAR_REVISAR_LECTURA' | null
  puedeConfirmarB4: false
  puedePedir: false
  amplíaPermisosFinanzas: false
}>

export function resolveFinanceConfirmingReadingAccess(input: Readonly<{
  puedeConciliar: boolean
  puedeParaPedir: boolean
}>): FinanceConfirmingReadingAccess {
  if (!input.puedeConciliar) {
    return { puedeVer: false, seccion: null, puedeConfirmarB4: false, puedePedir: false, amplíaPermisosFinanzas: false }
  }
  // La capacidad Para pedir se conserva fuera de este componente. No se usa
  // para inferir permiso de documentos ni para elevar el ámbito de Lorena.
  void input.puedeParaPedir
  return { puedeVer: true, seccion: 'CONCILIAR_REVISAR_LECTURA', puedeConfirmarB4: false, puedePedir: false, amplíaPermisosFinanzas: false }
}
