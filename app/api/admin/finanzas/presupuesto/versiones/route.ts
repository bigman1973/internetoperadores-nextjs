import { extrasProduccionCerrados } from '@/lib/produccion-disponibilidad';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireFinAuth } from '@/lib/impuestos/auth';
import { generarParaEjercicio, listarVersiones, migracionPresupuestoAplicada, escenarioSubidaAprobado, escenarioSalarialVigente } from '@/lib/presupuesto/data';
import { reply, failure, readJson, ApiError, ejercicioSchema } from '../../_fin-shared';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const crearSchema = z.object({
  ejercicio: ejercicioSchema, nombre: z.string().trim().min(1).max(120), notas: z.string().trim().max(1500).nullable().optional(),
  subidaProveedoresPct: z.number().min(-50).max(100).default(3), mesesReal: z.number().int().min(1).max(12).default(10),
  copiarDe: z.string().max(80).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
}).strict();
export async function GET(req: NextRequest) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireFinAuth('presupuesto'); if ('error' in auth) return auth.error;
    const ejercicio = ejercicioSchema.parse(req.nextUrl.searchParams.get('ejercicio') ?? '2027');
    const migracion = await migracionPresupuestoAplicada();
    const [esc, sal] = await Promise.all([escenarioSubidaAprobado(), escenarioSalarialVigente()]);
    return reply({ migracion, versiones: await listarVersiones(ejercicio), escenarioSubida: esc, escenarioSalarial: sal, permisos: { puedeEditar: auth.puedeEditar, puedeAprobar: auth.puedeAprobar } });
  } catch (e) { return failure(e); }
}
/** Crea una versión nueva en BORRADOR: parte del real del año anterior o copia otra versión. */
export async function POST(req: NextRequest) {
  if (extrasProduccionCerrados()) return NextResponse.json({ error: 'No encontrado.' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  try {
    const auth = await requireFinAuth('presupuesto', { editar: true }); if ('error' in auth) return auth.error;
    const b = crearSchema.parse(await readJson(req));
    if (!(await migracionPresupuestoAplicada())) throw new ApiError('MIGRACION_PENDIENTE', 503, 'Falta aplicar la migración de Impuestos y Presupuesto.');
    const gen = b.copiarDe ? null : await generarParaEjercicio(b.ejercicio, { mesesReal: b.mesesReal, subidaProveedoresPct: b.subidaProveedoresPct });
    const id = await prisma.$transaction(async tx => {
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'area3_pre_' + b.ejercicio}))`);
      const num: any[] = await tx.$queryRaw(Prisma.sql`SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM area3_pre_versiones WHERE ejercicio = ${b.ejercicio}`);
      const origen: any[] = b.copiarDe ? await tx.$queryRaw(Prisma.sql`SELECT subida_proveedores_pct, meses_real, escenario_subida_id, escenario_salarial_id, meta FROM area3_pre_versiones WHERE id = ${b.copiarDe} AND ejercicio = ${b.ejercicio}`) : [];
      if (b.copiarDe && !origen[0]) throw new ApiError('NO_ENCONTRADO', 404, 'La versión a copiar no existe.');
      const meta = origen[0]?.meta ?? { avisos: gen?.avisos ?? [], excluido: gen?.excluido ?? null };
      const r: any[] = await tx.$queryRaw(Prisma.sql`INSERT INTO area3_pre_versiones (ejercicio, numero, nombre, notas, subida_proveedores_pct, meses_real, escenario_subida_id, escenario_salarial_id, meta, autor_id)
        VALUES (${b.ejercicio}, ${num[0].n}, ${b.nombre}, ${b.notas ?? null}, ${origen[0] ? origen[0].subida_proveedores_pct : b.subidaProveedoresPct}, ${origen[0] ? origen[0].meses_real : b.mesesReal}, ${origen[0] ? origen[0].escenario_subida_id : gen?.escenarioSubida?.id ?? null}, ${origen[0] ? origen[0].escenario_salarial_id : gen?.escenarioSalarial?.id ?? null}, ${JSON.stringify(meta)}::jsonb, ${auth.userId}) RETURNING id`);
      const vid = r[0].id as string;
      if (b.copiarDe) await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_lineas (version_id, tipo, naturaleza, centro, cuenta, fuente, real_anual, subida_pct, importe_auto, importe, origen, nota, orden, updated_by)
        SELECT ${vid}, tipo, naturaleza, centro, cuenta, fuente, real_anual, subida_pct, importe_auto, importe, origen, nota, orden, ${auth.userId} FROM area3_pre_lineas WHERE version_id = ${b.copiarDe}`);
      else for (const l of gen!.lineas) await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_lineas (version_id, tipo, naturaleza, centro, cuenta, fuente, real_anual, subida_pct, importe_auto, importe, origen, nota, orden, updated_by)
        VALUES (${vid}, ${l.tipo}, ${l.naturaleza}, ${l.centro}, ${l.cuenta}, ${l.fuente}, ${l.realAnual}, ${l.subidaPct}, ${l.importeAuto}, ${l.importe}, ${l.origen}, ${l.nota}, ${l.orden}, ${auth.userId})
        ON CONFLICT (version_id, tipo, naturaleza, centro, cuenta) DO UPDATE SET real_anual = area3_pre_lineas.real_anual + EXCLUDED.real_anual, importe_auto = area3_pre_lineas.importe_auto + EXCLUDED.importe_auto, importe = area3_pre_lineas.importe + EXCLUDED.importe`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO area3_pre_auditoria (accion, version_id, actor_id, detalle) VALUES (${b.copiarDe ? 'COPIAR_VERSION' : 'CREAR_VERSION'}, ${vid}, ${auth.userId}, ${JSON.stringify({ ejercicio: b.ejercicio, nombre: b.nombre, copiarDe: b.copiarDe ?? null, lineas: gen?.lineas.length ?? null })}::jsonb)`);
      return vid;
    }, { timeout: 30_000 });
    return reply({ ok: true, id });
  } catch (e) { return failure(e); }
}
