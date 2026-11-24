import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { generarLineas, totales, seguimiento, type EntradaPresupuesto, type Linea, type EscenarioSubida, type EscenarioSalarial } from './calc';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const n = (v: unknown) => (v == null ? 0 : Number(v));
export const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

export async function migracionPresupuestoAplicada(): Promise<boolean> {
  try { const r: any[] = await prisma.$queryRaw`SELECT to_regclass('public.area3_pre_versiones') IS NOT NULL AS ok`; return !!r[0]?.ok; } catch { return false; }
}

export async function cargarFuentes(ejercicioBase: number) {
  const desde = new Date(Date.UTC(ejercicioBase, 0, 1)); const hasta = new Date(Date.UTC(ejercicioBase + 3, 0, 1));
  const [em, rc, nm, rev] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT fecha, base, imputacion FROM facturas_emitidas WHERE fecha >= ${desde} AND fecha < ${hasta}`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, proveedor, num_factura, fecha, base, tipo_iva, importe_iva, tipo_irpf, importe_irpf, concepto, calidad::text AS calidad, deducible_iva, es_internacional, imputacion
      FROM facturas_recibidas WHERE fecha >= ${desde} AND fecha < ${hasta} AND copia_de_id IS NULL AND NOT COALESCE(duplicado_externo, false) AND calidad::text IN ('VALIDA','REVISAR_LECTURA')`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT anio, mes, coste_total_empresa FROM nominas WHERE anio >= ${ejercicioBase}`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT count(*)::int AS n FROM facturas_recibidas WHERE fecha >= ${desde} AND fecha < ${new Date(Date.UTC(ejercicioBase + 1, 0, 1))} AND copia_de_id IS NULL AND NOT COALESCE(duplicado_externo, false) AND calidad::text = 'REVISAR_LECTURA'`),
  ]);
  return {
    emitidas: em.map(x => ({ fecha: iso(x.fecha), base: n(x.base), imputacion: x.imputacion as string | null })),
    recibidas: rc.map(x => ({ id: x.id, proveedor: x.proveedor ?? '', num: x.num_factura, fecha: iso(x.fecha), base: n(x.base), tipoIva: x.tipo_iva == null ? null : n(x.tipo_iva), importeIva: x.importe_iva == null ? null : n(x.importe_iva), tipoIrpf: x.tipo_irpf == null ? null : n(x.tipo_irpf), importeIrpf: x.importe_irpf == null ? null : n(x.importe_irpf), concepto: x.concepto as string | null, calidad: x.calidad as string, deducible: x.deducible_iva !== false, internacional: !!x.es_internacional, imputacion: x.imputacion as string | null })),
    nominas: nm.map(x => ({ anio: x.anio as number, mes: x.mes as number, costeEmpresa: n(x.coste_total_empresa) })),
    recibidasRevisar: n(rev[0]?.n),
  };
}

/** Escenario de Subida de precios APROBADO más reciente (si lo hay). */
export async function escenarioSubidaAprobado(id?: string | null): Promise<EscenarioSubida | null> {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, nombre, fecha_efecto, resumen FROM area2_subida_escenarios WHERE estado_aprobacion = 'APROBADO' ${id ? Prisma.sql`AND id = ${id}` : Prisma.empty} ORDER BY aprobado_at DESC NULLS LAST LIMIT 1`);
    const r = rows[0]; if (!r) return null;
    const extra = Number((r.resumen as any)?.extraAnual); if (!isFinite(extra)) return null;
    return { id: r.id, nombre: r.nombre, extraAnual: extra, fechaEfecto: r.fecha_efecto ? iso(r.fecha_efecto) : null };
  } catch { return null; }
}
export async function escenarioSalarialVigente(id?: string | null): Promise<EscenarioSalarial | null> {
  try {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT s.id, s.nombre, s.estado, s.fecha_efectiva,
        COALESCE(SUM(l.coste_empresa_actual) FILTER (WHERE l.incluido), 0) AS actual, COALESCE(SUM(l.coste_empresa_propuesto) FILTER (WHERE l.incluido), 0) AS propuesto, COUNT(l.id) FILTER (WHERE l.incluido) AS n
      FROM escenarios_salariales s LEFT JOIN lineas_escenarios_salariales l ON l.escenario_id = s.id
      WHERE ${id ? Prisma.sql`s.id = ${id}` : Prisma.sql`s.estado <> 'descartado'`} GROUP BY s.id ORDER BY (s.estado = 'aprobado') DESC, s.fecha_efectiva DESC NULLS LAST LIMIT 1`);
    const r = rows[0]; if (!r || !n(r.n)) return null;
    return { id: r.id, nombre: r.nombre, estado: r.estado, fechaEfectiva: r.fecha_efectiva ? iso(r.fecha_efectiva) : null, costeActualAnual: n(r.actual), costePropuestoAnual: n(r.propuesto) };
  } catch { return null; }
}

export async function generarParaEjercicio(ejercicio: number, opts: { mesesReal: number; subidaProveedoresPct: number; escenarioSubidaId?: string | null; escenarioSalarialId?: string | null }) {
  const f = await cargarFuentes(ejercicio - 1);
  const [esc, sal] = await Promise.all([escenarioSubidaAprobado(opts.escenarioSubidaId), escenarioSalarialVigente(opts.escenarioSalarialId)]);
  const entrada: EntradaPresupuesto = { ejercicio, mesesReal: opts.mesesReal, subidaProveedoresPct: opts.subidaProveedoresPct, emitidas: f.emitidas, recibidas: f.recibidas, nominas: f.nominas, recibidasRevisar: f.recibidasRevisar, escenarioSubida: esc, escenarioSalarial: sal };
  return { ...generarLineas(entrada), escenarioSubida: esc, escenarioSalarial: sal };
}

const mapLinea = (r: any): Linea & { id: string } => ({
  id: r.id, tipo: r.tipo, naturaleza: r.naturaleza, centro: r.centro, cuenta: r.cuenta, fuente: r.fuente, realAnual: n(r.real_anual), subidaPct: r.subida_pct == null ? null : n(r.subida_pct),
  importeAuto: n(r.importe_auto), importe: n(r.importe), origen: r.origen, nota: r.nota, orden: r.orden,
});
export async function listarVersiones(ejercicio: number) {
  if (!(await migracionPresupuestoAplicada())) return [];
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT v.id, v.numero, v.nombre, v.estado, v.subida_proveedores_pct, v.meses_real, v.aprobado_at, v.created_at, v.updated_at, a.nombre AS autor, p.nombre AS aprobador,
      COALESCE((SELECT SUM(importe) FROM area3_pre_lineas WHERE version_id = v.id AND tipo = 'INGRESO'), 0) AS ing, COALESCE((SELECT SUM(importe) FROM area3_pre_lineas WHERE version_id = v.id AND tipo = 'GASTO'), 0) AS gas
    FROM area3_pre_versiones v LEFT JOIN usuarios_admin a ON a.id = v.autor_id LEFT JOIN usuarios_admin p ON p.id = v.aprobado_por WHERE v.ejercicio = ${ejercicio} ORDER BY v.numero DESC`);
  return rows.map(r => ({ id: r.id, numero: r.numero, nombre: r.nombre, estado: r.estado, subidaProveedoresPct: n(r.subida_proveedores_pct), mesesReal: r.meses_real, aprobadoAt: r.aprobado_at ? r.aprobado_at.toISOString() : null, aprobador: r.aprobador ?? null, autor: r.autor ?? '', creadaAt: r.created_at.toISOString(), actualizadaAt: r.updated_at.toISOString(), ingresos: n(r.ing), gastos: n(r.gas) }));
}
export async function detalleVersion(id: string) {
  const v: any[] = await prisma.$queryRaw(Prisma.sql`SELECT v.*, a.nombre AS autor, p.nombre AS aprobador FROM area3_pre_versiones v LEFT JOIN usuarios_admin a ON a.id = v.autor_id LEFT JOIN usuarios_admin p ON p.id = v.aprobado_por WHERE v.id = ${id}`);
  if (!v[0]) return null;
  const ls: any[] = await prisma.$queryRaw(Prisma.sql`SELECT * FROM area3_pre_lineas WHERE version_id = ${id} ORDER BY tipo DESC, orden, centro, importe DESC`);
  const lineas = ls.map(mapLinea); const r = v[0];
  return {
    version: { id: r.id, ejercicio: r.ejercicio, numero: r.numero, nombre: r.nombre, notas: r.notas, estado: r.estado, subidaProveedoresPct: n(r.subida_proveedores_pct), mesesReal: r.meses_real, escenarioSubidaId: r.escenario_subida_id, escenarioSalarialId: r.escenario_salarial_id, aprobadoAt: r.aprobado_at ? r.aprobado_at.toISOString() : null, aprobador: r.aprobador ?? null, autor: r.autor ?? '', avisos: (r.meta?.avisos ?? []) as any[] },
    lineas, totales: totales(lineas),
  };
}
export async function seguimientoVersion(id: string, hoy = hoyMadrid()) {
  const d = await detalleVersion(id); if (!d) return null;
  const f = await cargarFuentes(d.version.ejercicio);
  return { ejercicio: d.version.ejercicio, version: d.version, ...seguimiento(d.version.ejercicio, d.lineas, f.emitidas, f.recibidas, f.nominas, hoy) };
}
