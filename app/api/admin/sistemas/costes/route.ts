import { extrasProduccionCerrados } from '@/lib/produccion-disponibilidad';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSistemasAuth } from '@/lib/sistemas/auth';
import { auditar, cargarCostes, facturasSinServicio, mesActualMadrid } from '@/lib/sistemas/data';
import { ApiError, failure, fechaSchema, idSchema, mesSchema, readJson, reply, sinCredenciales } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const u = new URL(req.url); const act = mesActualMadrid();
    const desde = mesSchema.catch(`${act.slice(0, 4)}-01`).parse(u.searchParams.get('desde') ?? undefined);
    const hasta = mesSchema.catch(act).parse(u.searchParams.get('hasta') ?? undefined);
    if (hasta < desde) throw new ApiError('PERIODO', 400, 'El mes final no puede ser anterior al inicial.');
    const subida = Math.max(-50, Math.min(100, Number(u.searchParams.get('subida') ?? 0) || 0));
    const [res, sinServicio] = await Promise.all([cargarCostes(desde, hasta, subida), facturasSinServicio(desde)]);
    return reply({ ...res, facturasSinServicio: sinServicio });
  } catch (e) { return failure(e); }
}

const manualSchema = z.object({
  servicioId: z.string().min(1).max(80), fecha: fechaSchema.nullable(), concepto: z.string().trim().min(1).max(300),
  importe: z.number().min(0).max(1_000_000), moneda: z.enum(['EUR', 'USD']), ivaPct: z.number().min(0).max(30),
  tipo: z.enum(['RECURRENTE', 'UNICO']), estado: z.enum(['REAL', 'PREVISTO']), nota: z.string().trim().max(500).nullable().optional(),
}).strict();

/** Añade un coste a mano (pago único, cargo sin factura o previsión). Es el relleno manual cuando no hay factura. */
export async function POST(req: NextRequest) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const b = manualSchema.parse(await readJson(req));
    sinCredenciales({ concepto: b.concepto, nota: b.nota });
    if (b.tipo === 'RECURRENTE' && !b.fecha) throw new ApiError('FECHA', 400, 'Un coste recurrente necesita fecha para saber a qué mes pertenece.');
    const s: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id FROM area9_sis_servicios WHERE id = ${b.servicioId}`);
    if (!s.length) throw new ApiError('NO_EXISTE', 404, 'El servicio no existe.');
    const r: any[] = await prisma.$queryRaw(Prisma.sql`INSERT INTO area9_sis_costes_manuales (servicio_id, fecha, concepto, importe, moneda, iva_pct, tipo, estado, nota, actor_id)
      VALUES (${b.servicioId}, ${b.fecha}::date, ${b.concepto}, ${b.importe}, ${b.moneda}, ${b.ivaPct}, ${b.tipo}, ${b.estado}, ${b.nota ?? null}, ${auth.userId}) RETURNING id`);
    await auditar('COSTE_MANUAL_ALTA', 'coste_manual', r[0].id, auth.userId, { servicioId: b.servicioId, tipo: b.tipo, importe: b.importe, moneda: b.moneda });
    return reply({ id: r[0].id }, 201);
  } catch (e) { return failure(e); }
}

const anularSchema = z.object({ id: idSchema }).strict();
/** Anula (no borra) un coste manual: queda en la base con la fecha de anulación. */
export async function DELETE(req: NextRequest) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const { id } = anularSchema.parse(await readJson(req));
    const n = await prisma.$executeRaw(Prisma.sql`UPDATE area9_sis_costes_manuales SET anulado_at = now() WHERE id = ${id} AND anulado_at IS NULL`);
    if (!n) throw new ApiError('NO_EXISTE', 404, 'No existe o ya estaba anulado.');
    await auditar('COSTE_MANUAL_ANULADO', 'coste_manual', id, auth.userId);
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
