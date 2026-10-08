export type VividStatementValidation =
  | { ok: true }
  | { ok: false; code: string; error: string }

/** Solo valida el tipo de exportación y la presencia de datos; no convierte cobros en apuntes bancarios. */
export function validateVividStatement(content: string): VividStatementValidation {
  const lines = content.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
    .map(line => line.trim()).filter(Boolean)
  if (!lines.length) {
    return { ok: false, code: 'VIVID_EMPTY_FILE', error: 'El archivo de Vivid está vacío. Descarga un extracto de movimientos de la cuenta con operaciones en el período seleccionado.' }
  }
  const normalize = (value: string) => value.replace(/^"|"$/g, '').trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const headers = lines[0].split(';').map(normalize)
  const has = (value: string) => headers.includes(value)
  const merchant = has('fecha/hora') && has('nombre de la tienda') && has('cantidad total')
  const merchantEnglish = has('date/time') && has('store name') && has('total amount')
  const hasData = lines.slice(1).some(line => line.replace(/[;"\s]/g, '').length > 0)
  if (merchant || merchantEnglish) {
    return {
      ok: false,
      code: hasData ? 'VIVID_MERCHANT_REPORT' : 'VIVID_MERCHANT_EMPTY',
      error: hasData
        ? 'Este archivo es un informe de cobros de comercios de Vivid (MerchantAccountStatement), no un extracto de movimientos de la cuenta bancaria. Para evitar duplicar cobros o confundirlos con abonos bancarios, descarga el extracto CSV de la cuenta.'
        : 'Este informe de cobros de comercios de Vivid (MerchantAccountStatement) contiene solo la cabecera: 0 movimientos. No es el extracto de la cuenta bancaria. Descarga el extracto CSV de la cuenta con operaciones en el período seleccionado.',
    }
  }
  if (!hasData) {
    return { ok: false, code: 'VIVID_NO_TRANSACTIONS', error: 'El CSV de Vivid contiene solo la cabecera: 0 movimientos. Revisa el período y la cuenta seleccionados al descargar el extracto.' }
  }
  return { ok: true }
}
