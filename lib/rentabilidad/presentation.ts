/** Transport only: immutable full snapshots remain the calculation/audit basis.
 * Each contract is retained exactly once under its client, with all cost sources.
 * Monthly matrix sources duplicate the selected-product drilldown and are omitted.
 */
export function compactReportPresentation<T extends Record<string, any>>(report: T): Omit<T, 'contracts'> & { monthly: any[] } {
  const { contracts: _duplicatedContracts, ...rest } = report;
  const monthly = (report.monthly || []).map((month: any) => ({
    ...month,
    products: (month.products || []).map((product: any) => {
      const { sources: _matrixSources, ...metrics } = product;
      return metrics;
    }),
  }));
  return { ...rest, monthly };
}
