import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSubidaAuth } from '@/lib/subida-precios/auth';
import { csvAvisos, csvPrecios, libroExcel, type Resultado2 } from '@/lib/subida-precios/export';
import { ApiError, auditar, failure, idSchema } from '../../../_shared';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ id: string }> };
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'escenario';

/** Solo se descargan escenarios aprobados: el borrador no sale del panel. */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const id = idSchema.parse((await ctx.params).id);
    const tipo = req.nextUrl.searchParams.get('tipo') ?? 'xlsx';
    if (!['xlsx', 'precios', 'avisos'].includes(tipo)) throw new ApiError('TIPO_NO_VALIDO', 400);
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT nombre, resultado, estado_aprobacion AS ea, fecha_efecto::text AS fe FROM area2_subida_escenarios WHERE id = ${id}`);
    if (!rows.length) throw new ApiError('NO_ENCONTRADO', 404, 'El escenario ya no existe.');
    if (rows[0].ea !== 'APROBADO' || !rows[0].resultado) throw new ApiError('SIN_APROBAR', 409, 'Las listas solo se generan cuando el superadmin aprueba el escenario.');
    const res = rows[0].resultado as Resultado2; const base = `subida_precios_${slug(rows[0].nombre)}`;
    await auditar(auth.userId, 'EXPORTACION', id, { tipo });
    const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };
    if (tipo === 'xlsx') {
      const buf = libroExcel(res, rows[0].nombre, rows[0].fe);
      return new NextResponse(new Uint8Array(buf), { headers: { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="${base}.xlsx"` } });
    }
    const body = tipo === 'precios' ? csvPrecios(res) : csvAvisos(res);
    return new NextResponse(body, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${base}_${tipo}.csv"` } });
  } catch (e) { return failure(e); }
}
