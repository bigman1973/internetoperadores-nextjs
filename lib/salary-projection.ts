/** Proyección informativa, no condición salarial pactada ni coste empresarial. */
export function projectPayrollSalary(gross: number, reimbursements: number | null) {
  if (reimbursements === null || !Number.isFinite(gross) || !Number.isFinite(reimbursements)) return null;
  const grossCents = Math.round(gross * 100);
  const expenseCents = Math.round(reimbursements * 100);
  if (!Number.isSafeInteger(grossCents) || !Number.isSafeInteger(expenseCents) || grossCents <= 0 || expenseCents < 0 || expenseCents >= grossCents) return null;
  return {
    brutoMensualTrabajador: (grossCents - expenseCents) / 100,
    proyeccionDoceMeses: ((grossCents - expenseCents) * 12) / 100,
    gastosExcluidos: expenseCents / 100,
  };
}
