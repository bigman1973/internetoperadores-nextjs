/** El período analítico de coste no limita el documento salvo elección explícita. */
export const OPERATOR_INVOICE_ALL_HISTORY_DEFAULT = true;
export function operatorInvoiceParams({
  buscar,
  page,
  allHistory = OPERATOR_INVOICE_ALL_HISTORY_DEFAULT,
  periodo,
}: {
  buscar: string;
  page: number;
  allHistory?: boolean;
  periodo: string;
}) {
  const params = new URLSearchParams({
    action: "facturas",
    buscar: buscar.trim(),
    page: String(page),
  });
  if (!allHistory && periodo) params.set("periodo", periodo);
  return params;
}
