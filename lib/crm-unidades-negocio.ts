export const CRM_BUSINESS_UNIT_PROPERTY = 'lfgd_business_unit'
export const CRM_BUSINESS_UNIT_NONE = '__SIN_UNIDAD__'

export type CrmBusinessUnitOption = {
  value: string
  label: string
}

export const DEFAULT_CRM_BUSINESS_UNITS: CrmBusinessUnitOption[] = [
  { value: 'LFDeal', label: 'LFDeal' },
  { value: 'LF Kapital', label: 'LF Kapital' },
  { value: 'LFGD', label: 'LFGD (Holding)' },
  { value: 'FarmsPlanet', label: 'FarmsPlanet' },
  { value: 'Mikels', label: 'Mikels' },
  { value: 'Internet Operadores', label: 'Internet Operadores' },
]

const CANONICAL_BUSINESS_UNITS = new Map(DEFAULT_CRM_BUSINESS_UNITS.map((option) => [option.value.toLocaleLowerCase('es-ES'), option.value]))

export function parseCrmBusinessUnits(value: unknown): string[] {
  if (value == null) return []
  const rawValues = Array.isArray(value) ? value : String(value).split(';')
  return [...new Set(rawValues.map((item) => String(item).trim()).filter(Boolean).map((item) => CANONICAL_BUSINESS_UNITS.get(item.toLocaleLowerCase('es-ES')) || item))]
}

export function getCrmBusinessUnitOptions(value: unknown): CrmBusinessUnitOption[] {
  if (!Array.isArray(value)) return DEFAULT_CRM_BUSINESS_UNITS
  const parsed = value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const option = item as Record<string, unknown>
    if (option.hidden || option.value == null || String(option.value).trim() === '') return []
    return [{
      value: String(option.value).trim(),
      label: option.label == null || String(option.label).trim() === '' ? String(option.value).trim() : String(option.label).trim(),
      displayOrder: typeof option.displayOrder === 'number' ? option.displayOrder : 9999,
    }]
  })
  if (parsed.length === 0) return DEFAULT_CRM_BUSINESS_UNITS
  return parsed
    .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label, 'es'))
    .map(({ value: optionValue, label }) => ({ value: optionValue, label }))
}

export function crmBusinessUnitLabel(value: string, options: CrmBusinessUnitOption[] = DEFAULT_CRM_BUSINESS_UNITS) {
  return options.find((option) => option.value === value)?.label || value
}
