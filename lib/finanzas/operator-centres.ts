export type CentreGroup = {
  id: string;
  nombre: string;
  ambito: string;
  zona: string | null;
  conexion: string | null;
};
type AggregateRow = {
  grupoId: string;
  _sum: { importe: unknown };
  _count: { _all: number };
};
export function mergeCentreTotals(
  groups: CentreGroup[],
  all: AggregateRow[],
  own: AggregateRow[],
  pending: AggregateRow[],
) {
  const map = (rows: AggregateRow[]) =>
    new Map(rows.map((row) => [row.grupoId, row]));
  const a = map(all),
    o = map(own),
    p = map(pending);
  const cents = (value: unknown) => Math.round(Number(value || 0) * 100);
  return groups.map((group) => {
    const total = cents(a.get(group.id)?._sum.importe),
      propia = cents(o.get(group.id)?._sum.importe);
    return {
      ...group,
      basePropia: propia / 100,
      baseTerceros: (total - propia) / 100,
      basePendienteRefacturacion: cents(p.get(group.id)?._sum.importe) / 100,
      baseSeleccionada: total / 100,
      articulos: a.get(group.id)?._count._all || 0,
    };
  });
}
export async function readOperatorCentres(
  prisma: any,
  groups: CentreGroup[],
  periodo: string,
) {
  const source = {
    estado: { not: "ARCHIVADO" },
    ...(periodo ? { periodo } : {}),
  };
  const totals = (extra: object) =>
    prisma.articuloCosteOperadora.groupBy({
      by: ["grupoId"],
      where: {
        grupoId: { in: groups.map((g) => g.id) },
        fuente: { ...source, ...extra },
      },
      _sum: { importe: true },
      _count: { _all: true },
    });
  const [all, own, pending] = await Promise.all([
    totals({}),
    totals({ origen: "PROPIA" }),
    totals({ origen: "TERCERO", documentos: { none: { rol: "REFACTURA" } } }),
  ]);
  return mergeCentreTotals(groups, all, own, pending);
}
