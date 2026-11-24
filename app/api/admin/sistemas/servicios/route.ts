import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireSistemasAuth } from '@/lib/sistemas/auth';
import { listarServicios, auditar, CATEGORIAS, ESTADOS, ENTORNOS, PERIODICIDADES } from '@/lib/sistemas/data';
import { ApiError, failure, fechaSchema, readJson, reply, sinCredenciales } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    return reply({ servicios: await listarServicios() });
  } catch (e) { return failure(e); }
}

const txt = (n: number) => z.string().trim().max(n).nullable();
const editSchema = z.object({
  id: z.string().min(1).max(80),
  nombre: z.string().trim().min(1).max(120).optional(), proveedor: z.string().trim().min(1).max(160).optional(),
  categoria: z.enum(CATEGORIAS).optional(), descripcion: txt(1500).optional(),
  modulos: z.array(z.string().trim().min(1).max(80)).max(20).optional(), entornos: z.array(z.enum(ENTORNOS)).max(2).optional(),
  titular: txt(160).optional(), responsable: txt(160).optional(), plan: txt(200).optional(), estado: z.enum(ESTADOS).optional(),
  fechaAlta: fechaSchema.nullable().optional(), fechaRenovacion: fechaSchema.nullable().optional(), periodicidad: z.enum(PERIODICIDADES).optional(),
  url: txt(300).optional(), notas: txt(2000).optional(), estadoManual: txt(1000).optional(),
  prevision2027Manual: z.number().min(0).max(1_000_000).nullable().optional(),
}).strict();

/** Edita los datos de un servicio. Cada campo es opcional; se audita qué campos cambian (no los valores sensibles). */
export async function PATCH(req: NextRequest) {
  try {
    const auth = await requireSistemasAuth(); if ('error' in auth) return auth.error;
    const b = editSchema.parse(await readJson(req));
    sinCredenciales({ nombre: b.nombre, proveedor: b.proveedor, descripcion: b.descripcion, modulos: b.modulos, titular: b.titular, responsable: b.responsable, plan: b.plan, url: b.url, notas: b.notas, estadoManual: b.estadoManual });
    const cur: any[] = await prisma.$queryRaw(Prisma.sql`SELECT id FROM area9_sis_servicios WHERE id = ${b.id}`);
    if (!cur.length) throw new ApiError('NO_EXISTE', 404, 'El servicio no existe.');
    const sets: Prisma.Sql[] = []; const campos: string[] = [];
    const add = (col: string, v: Prisma.Sql, nombre: string) => { sets.push(Prisma.sql`${Prisma.raw(col)} = ${v}`); campos.push(nombre); };
    if (b.nombre !== undefined) add('nombre', Prisma.sql`${b.nombre}`, 'nombre');
    if (b.proveedor !== undefined) add('proveedor', Prisma.sql`${b.proveedor}`, 'proveedor');
    if (b.categoria !== undefined) add('categoria', Prisma.sql`${b.categoria}`, 'categoria');
    if (b.descripcion !== undefined) add('descripcion', Prisma.sql`${b.descripcion || null}`, 'descripcion');
    if (b.modulos !== undefined) add('modulos', Prisma.sql`${b.modulos}::text[]`, 'modulos');
    if (b.entornos !== undefined) add('entornos', Prisma.sql`${b.entornos}::text[]`, 'entornos');
    if (b.titular !== undefined) add('titular', Prisma.sql`${b.titular || null}`, 'titular');
    if (b.responsable !== undefined) add('responsable', Prisma.sql`${b.responsable || null}`, 'responsable');
    if (b.plan !== undefined) add('plan', Prisma.sql`${b.plan || null}`, 'plan');
    if (b.estado !== undefined) add('estado', Prisma.sql`${b.estado}`, 'estado');
    if (b.fechaAlta !== undefined) add('fecha_alta', Prisma.sql`${b.fechaAlta}::date`, 'fechaAlta');
    if (b.fechaRenovacion !== undefined) add('fecha_renovacion', Prisma.sql`${b.fechaRenovacion}::date`, 'fechaRenovacion');
    if (b.periodicidad !== undefined) add('periodicidad', Prisma.sql`${b.periodicidad}`, 'periodicidad');
    if (b.url !== undefined) add('url', Prisma.sql`${b.url || null}`, 'url');
    if (b.notas !== undefined) add('notas', Prisma.sql`${b.notas || null}`, 'notas');
    if (b.estadoManual !== undefined) { add('estado_manual', Prisma.sql`${b.estadoManual || null}`, 'estadoManual'); sets.push(Prisma.sql`estado_manual_at = ${b.estadoManual ? new Date() : null}`); }
    if (b.prevision2027Manual !== undefined) add('prevision_2027_manual', Prisma.sql`${b.prevision2027Manual}`, 'prevision2027Manual');
    if (!sets.length) throw new ApiError('SIN_CAMBIOS', 400, 'No hay nada que guardar.');
    sets.push(Prisma.sql`updated_by = ${auth.userId}`, Prisma.sql`updated_at = now()`);
    await prisma.$executeRaw(Prisma.sql`UPDATE area9_sis_servicios SET ${Prisma.join(sets, ', ')} WHERE id = ${b.id}`);
    await auditar('SERVICIO_EDITADO', 'servicio', b.id, auth.userId, { campos });
    return reply({ ok: true, campos });
  } catch (e) { return failure(e); }
}
