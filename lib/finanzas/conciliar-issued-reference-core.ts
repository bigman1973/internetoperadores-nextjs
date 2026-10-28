/**
 * Referencias documentales de facturas emitidas para COBROS.
 *
 * El patrón léxico sólo encuentra posibles referencias. La autoridad es siempre
 * `referenciasEmitidasCanonicas`, construida por el lector desde la población
 * canónica persistida de FacturaEmitida: no hay una lista de series codificada.
 * Una referencia de una serie propia sigue siendo propia aunque el número falte.
 */
export type ReferenciasEmitidasCanonicas = readonly unknown[]

/** Normaliza sin perder dígitos significativos de año/serie ni sufijos numéricos. */
export function normalizarReferenciaFactura(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES').replace(/[^A-Z0-9]/g, '')
  if (!normalized || normalized.length > 120 || !/[0-9]/.test(normalized)) return null
  return normalized.replace(/^F(?=\d)/, '')
}

/** Referencias citadas de forma explícita; no se usa una coincidencia por subcadena. */
export function referenciasFacturaCitadas(textoBanco: unknown): readonly string[] {
  if (typeof textoBanco !== 'string') return []
  const normalized = textoBanco.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('es-ES')
  const result = new Set<string>()
  // Every match is one syntactic identifier, not the rest of the concept. This
  // preserves meaningful year/series digits (F2600082023) and permits multiple
  // explicit invoice references in a single transfer.
  const explicit = /(?:^|[^A-Z0-9])(?:FACTURA|FACT\.?|FRA\.?|F)\s*(?:N(?:U)?M(?:ERO)?\s*)?[-#:/. ]*([A-Z]{0,6}\s*\d{2,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(explicit)) {
    const reference = normalizarReferenciaFactura(match[1])
    if (reference && reference.length >= 4) result.add(reference)
  }
  // Bank exports commonly omit FACTURA but keep an issuer-like alphabetic series
  // (INST26/68, ZOOM26/2, DRAX26/94). A pure numeric token is deliberately not
  // a reference: dates, amounts and remittance numbers must not make a document
  // look verified. REMESA/RECIBO tokens are semantic bank grouping references,
  // not invoice series.
  const bare = /(?:^|[^A-Z0-9])([A-Z]{2,12}\s*\d{2,}(?:\s*[/-]\s*\d{1,10})?)(?=$|[^A-Z0-9])/g
  for (const match of normalized.matchAll(bare)) {
    const raw = match[1].replace(/\s+/g, '')
    // FACTURA 260007 ya se extrajo como 260007 arriba. FACTURA no es una
    // segunda serie emisora; no debe convertir una referencia exacta en empate.
    if (/^(?:REMESA|RECIBO|SUBREMESA|FACTURA|FACT|FRA|NUMERO|NUM)\d/.test(raw)) continue
    const reference = normalizarReferenciaFactura(raw)
    if (reference && reference.length >= 4) result.add(reference)
  }
  return [...result].sort()
}

/**
 * Extrae sólo referencias que estén en el perfil/registro canónico de emitidas.
 * Una etiqueta ajena (proveedor, banco, albarán o texto hostil) no contradice
 * por sí sola una factura emitida. El lector debe aportar toda la población
 * canónica aplicable, no únicamente el documento que ya está propuesto.
 */
export function extractRefsOwnIssued(textoBanco: unknown, referenciasEmitidasCanonicas: ReferenciasEmitidasCanonicas): readonly string[] {
  const registered = new Set(referenciasEmitidasCanonicas
    .map(normalizarReferenciaFactura)
    .filter((reference): reference is string => reference !== null))
  if (!registered.size) return []
  const result = new Set(referenciasFacturaCitadas(textoBanco).filter(reference => registered.has(reference)))
  // Learn lexical SERIES + year-width from persisted invoice numbers, not from
  // the payer's text or the selected proposal. A missing INST26/999 still cannot
  // silently become an exact match for another INST invoice.
  const signatures = new Set<string>()
  for (const value of referenciasEmitidasCanonicas) {
    if (typeof value !== 'string') continue
    const match = value.toUpperCase().match(/^([A-Z]{2,12})\s*(\d{2,4})\s*[/-]\s*\d{1,10}$/)
    if (match) signatures.add(`${match[1]}:${match[2].length}`)
  }
  if (typeof textoBanco === 'string' && signatures.size) {
    const text = textoBanco.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
    const pattern = /(?:^|[^A-Z0-9])([A-Z]{2,12})\s*(\d{2,4})\s*[/-]\s*(\d{1,10})(?=$|[^A-Z0-9])/g
    for (const match of text.matchAll(pattern)) {
      if (!signatures.has(`${match[1]}:${match[2].length}`)) continue
      const reference = normalizarReferenciaFactura(`${match[1]}${match[2]}/${match[3]}`)
      if (reference) result.add(reference)
    }
  }
  return [...result].sort()
}

/**
 * Sólo una referencia explícita que el perfil canónico reconoce como emitida
 * puede bloquear el documento propuesto. Sin referencia propia, la identidad
 * documental se decide por los demás controles exactos del llamador.
 */
export function referenciaFacturaEmitidaCompatible(
  textoBanco: unknown,
  referenciaDocumento: unknown,
  referenciasEmitidasCanonicas: ReferenciasEmitidasCanonicas,
): boolean {
  const cited = extractRefsOwnIssued(textoBanco, referenciasEmitidasCanonicas)
  if (!cited.length) return true
  const documentReference = normalizarReferenciaFactura(referenciaDocumento)
  return documentReference !== null && cited.every(reference => reference === documentReference)
}

/** Misma regla para una composición de recibos de COBROS: sólo las referencias
 * propias registradas deben estar representadas en la composición propuesta. */
export function referenciasEmitidasComposicionCompatible(
  textoBanco: unknown,
  referenciasComposicion: readonly unknown[],
  referenciasEmitidasCanonicas: ReferenciasEmitidasCanonicas,
): boolean {
  const cited = extractRefsOwnIssued(textoBanco, referenciasEmitidasCanonicas)
  if (!cited.length) return true
  const composition = new Set(referenciasComposicion
    .map(normalizarReferenciaFactura)
    .filter((reference): reference is string => reference !== null))
  return cited.every(reference => composition.has(reference))
}
