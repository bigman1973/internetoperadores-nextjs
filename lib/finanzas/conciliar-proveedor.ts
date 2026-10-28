/**
 * Alias de proveedor admitidos por Conciliar.
 *
 * Las cadenas que llegan aquí ya pasaron por `conciliarExactCounterparty`: no se
 * eliminan palabras ni se hace fuzzy matching. Salvo la pareja cerrada
 * documentada abajo, la identidad exige la misma cadena canónica en ambos lados.
 */
const XFERA_FACTURA = 'XFERA MOVILES, S.A.U.'
const XFERA_BANCO = 'GRUPO MASMOVIL XFERA'

/**
 * Reconoce exclusivamente la razón social de Xfera conservada en factura y el
 * literal exacto de beneficiario observado en banco. No acepta otras empresas
 * del Grupo MásMóvil, abreviaturas ni coincidencias parciales.
 */
export function conciliarProveedorAliasFuerte(leftAliases: readonly string[], rightAliases: readonly string[]): boolean {
  const left = new Set(leftAliases)
  if (!left.size) return false
  if (rightAliases.some(alias => left.has(alias))) return true

  const leftIsBankXfera = left.has(XFERA_BANCO)
  const leftIsInvoiceXfera = left.has(XFERA_FACTURA)
  const rightIsBankXfera = rightAliases.includes(XFERA_BANCO)
  const rightIsInvoiceXfera = rightAliases.includes(XFERA_FACTURA)
  return (leftIsBankXfera && rightIsInvoiceXfera) || (leftIsInvoiceXfera && rightIsBankXfera)
}

/**
 * Añade el alias cruzado sólo si ya existe uno de los dos literales cerrados.
 * El resultado es canónico y se puede entregar directamente a la comparación
 * exacta del lector y a su revalidación B4, sin inspeccionar importes ni texto
 * libre del concepto.
 */
export function conciliarConceptoBancoEsXferaFuerte(conceptoCanonico: string | null): boolean {
  // Algunos extractos anteponen el canal y la referencia documental, por
  // ejemplo `CI CC26… GRUPO MASMOVIL XFERA`. El beneficiario debe seguir siendo
  // exactamente el literal cerrado, al final o antes de la coma de separación
  // del campo bancario. No se admite una continuación de la razón social como
  // `... XFERA TELECOM`, otros nombres del grupo ni una coincidencia parcial.
  return typeof conceptoCanonico === 'string'
    && /(?:^|[^A-Z0-9])GRUPO MASMOVIL XFERA(?:\s*$|\s*,)/.test(conceptoCanonico)
}

export function conciliarProveedorAliasesFuertes(aliases: readonly string[], conceptoCanonico: string | null = null): string[] {
  const expanded = new Set(aliases)
  if (expanded.has(XFERA_BANCO) || conciliarConceptoBancoEsXferaFuerte(conceptoCanonico)) expanded.add(XFERA_FACTURA)
  if (expanded.has(XFERA_FACTURA)) expanded.add(XFERA_BANCO)
  return [...expanded]
}

export const CONCILIAR_XFERA_ALIAS_FUERTE = Object.freeze({
  banco: XFERA_BANCO,
  factura: XFERA_FACTURA,
})
