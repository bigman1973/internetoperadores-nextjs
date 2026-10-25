export type CrmBusinessUnitOption = { value: string; label: string }

type EditPermission = {
  editable: boolean
  isViewingAs: boolean
  isSuperAdmin: boolean
  hasAreaAccess: boolean
}

export function canEditCrmBusinessUnits({ editable, isViewingAs, isSuperAdmin, hasAreaAccess }: EditPermission) {
  return editable && !isViewingAs && (isSuperAdmin || hasAreaAccess)
}

export function mergeCrmBusinessUnitOptions(options: CrmBusinessUnitOption[], initialUnits: string[]) {
  const known = new Set(options.map((option) => option.value))
  return [...options, ...initialUnits.filter((unit) => !known.has(unit)).map((unit) => ({ value: unit, label: unit }))]
}
