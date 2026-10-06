export type IncorporationDateCheck = 'hire-unverified' | 'date-mismatch' | null;

/** Una condición de incorporación empieza exactamente en el alta contractual acreditada en nómina. */
export function checkIncorporationDate(
  hireDate: Date | null,
  payrollSeniority: Date | null,
  proposed: string | Date,
): IncorporationDateCheck {
  if (!hireDate || !payrollSeniority || hireDate.getTime() !== payrollSeniority.getTime()) {
    return 'hire-unverified';
  }
  const date = new Date(proposed);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== hireDate.toISOString().slice(0, 10)) {
    return 'date-mismatch';
  }
  return null;
}
