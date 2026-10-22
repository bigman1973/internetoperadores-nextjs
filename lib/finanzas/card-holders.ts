export const FINANCE_CARD_HOLDERS = [
  { last4: '9029', titular: 'Víctor' },
  { last4: '6440', titular: 'David' },
  { last4: '2390', titular: 'Sin asignar' },
  { last4: '8964', titular: 'Sin asignar' },
] as const

/** Sólo identificadores enmascarados explícitos; jamás tratar un número de factura como tarjeta. */
export function cardFromBankText(text: string | null | undefined) {
  if (!text) return null
  const tokens = [...text.matchAll(/(?:\*{1,12}\s*|X{2,12}\s*|TARJETA\s+(?:NUMERO\s*|N[º°.]?\s*)?)(\d{4})(?!\d)/gi)].map(match=>match[1])
  const matches = FINANCE_CARD_HOLDERS.filter(card=>tokens.includes(card.last4))
  return matches.length===1 ? { terminacion: matches[0].last4, titular: matches[0].titular } : null
}
