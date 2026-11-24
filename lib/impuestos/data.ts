import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { calcularImpuestos, type EmitidaIn, type RecibidaIn, type NominaIn, type PresentadoIn, type ResultadoImpuestos } from './calc';

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');
const n = (v: unknown) => (v == null ? 0 : Number(v));

export async function migracionImpuestosAplicada(): Promise<boolean> {
  try { const r: any[] = await prisma.$queryRaw`SELECT to_regclass('public.area3_imp_presentados') IS NOT NULL AS ok`; return !!r[0]?.ok; } catch { return false; }
}
export const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Lee las facturas del panel con el filtro estándar (VALIDA o REVISAR, sin copias ni duplicados externos). */
export async function cargarEntrada(ejercicio: number) {
  const desde = new Date(Date.UTC(ejercicio, 0, 1)); const hasta = new Date(Date.UTC(ejercicio + 1, 0, 1));
  const [em, rc, nm, pr, aapp] = await Promise.all([
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, num_factura, cliente, fecha, base, tipo_iva, importe_iva FROM facturas_emitidas WHERE fecha >= ${desde} AND fecha < ${hasta}`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, proveedor, num_factura, fecha, base, tipo_iva, importe_iva, tipo_irpf, importe_irpf, concepto, calidad::text AS calidad, deducible_iva, es_internacional
      FROM facturas_recibidas WHERE fecha >= ${desde} AND fecha < ${hasta} AND copia_de_id IS NULL AND NOT COALESCE(duplicado_externo, false) AND calidad::text IN ('VALIDA','REVISAR_LECTURA')`),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT anio, mes, irpf FROM nominas WHERE anio = ${ejercicio}`),
    (await migracionImpuestosAplicada())
      ? prisma.$queryRaw<any[]>(Prisma.sql`SELECT modelo, ejercicio, trimestre, importe, estado, referencia FROM area3_imp_presentados WHERE anulado_at IS NULL AND ejercicio = ${ejercicio}`)
      : Promise.resolve([] as any[]),
    prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, categoria, titulo, importe, estado, ejercicio FROM documentos_aapp WHERE categoria IN ('iva','irpf') AND importe IS NOT NULL AND ejercicio = ${ejercicio}`),
  ]);
  const emitidas: EmitidaIn[] = em.map(x => ({ id: x.id, num: x.num_factura, cliente: x.cliente ?? '', fecha: iso(x.fecha), base: n(x.base), tipoIva: x.tipo_iva == null ? null : n(x.tipo_iva), importeIva: x.importe_iva == null ? null : n(x.importe_iva) }));
  const recibidas: RecibidaIn[] = rc.map(x => ({ id: x.id, proveedor: x.proveedor ?? '', num: x.num_factura, fecha: iso(x.fecha), base: n(x.base), tipoIva: x.tipo_iva == null ? null : n(x.tipo_iva), importeIva: x.importe_iva == null ? null : n(x.importe_iva), tipoIrpf: x.tipo_irpf == null ? null : n(x.tipo_irpf), importeIrpf: x.importe_irpf == null ? null : n(x.importe_irpf), concepto: x.concepto, calidad: x.calidad, deducible: x.deducible_iva !== false, internacional: !!x.es_internacional }));
  const nominas: NominaIn[] = nm.map(x => ({ anio: x.anio, mes: x.mes, irpf: n(x.irpf) }));
  const presentados: PresentadoIn[] = pr.map(x => ({ modelo: x.modelo, ejercicio: x.ejercicio, trimestre: x.trimestre, importe: n(x.importe), estado: x.estado, fuente: 'MANUAL' as const, referencia: x.referencia }));
  // Modelos cargados en AAPP: «IVA 1T 2026», «IRPF 2T 2026»… (solo si el título trae el trimestre).
  for (const a of aapp) {
    const m = /\b([1-4])\s*T\b/i.exec(a.titulo ?? ''); if (!m) continue;
    const modelo = a.categoria === 'iva' ? '303' : /\b115\b|alquiler/i.test(a.titulo) ? '115' : '111';
    const estado = String(a.estado ?? '').toUpperCase() === 'PAGADO' ? 'PAGADO' : String(a.estado ?? '').toUpperCase() === 'APLAZADO' ? 'APLAZADO' : String(a.estado ?? '').toUpperCase() === 'DENEGADO' ? 'DENEGADO' : 'PRESENTADO';
    presentados.push({ modelo: modelo as any, ejercicio: a.ejercicio, trimestre: Number(m[1]), importe: n(a.importe), estado, fuente: 'AAPP', referencia: a.titulo });
  }
  return { emitidas, recibidas, nominas, presentados };
}

export async function resultadoImpuestos(ejercicio: number, hoy = hoyMadrid()): Promise<ResultadoImpuestos & { migracion: boolean }> {
  const e = await cargarEntrada(ejercicio);
  return { ...calcularImpuestos({ ejercicio, hoy, ...e }), migracion: await migracionImpuestosAplicada() };
}

export async function listarPresentados(ejercicio: number) {
  if (!(await migracionImpuestosAplicada())) return [];
  const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT p.id, p.modelo, p.ejercicio, p.trimestre, p.importe, p.estado, p.fecha_presentacion, p.referencia, p.nota, p.created_at, u.nombre AS autor
    FROM area3_imp_presentados p LEFT JOIN usuarios_admin u ON u.id = p.actor_id WHERE p.anulado_at IS NULL AND p.ejercicio = ${ejercicio} ORDER BY p.trimestre, p.modelo`);
  return rows.map(r => ({ id: r.id, modelo: r.modelo, ejercicio: r.ejercicio, trimestre: r.trimestre, importe: n(r.importe), estado: r.estado, fechaPresentacion: r.fecha_presentacion ? iso(r.fecha_presentacion) : null, referencia: r.referencia, nota: r.nota, autor: r.autor ?? '' }));
}
