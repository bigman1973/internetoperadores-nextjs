import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireSubidaAuth } from '@/lib/subida-precios/auth';
import { auditar, failure, readJson, reply } from '../_shared';

export const dynamic = 'force-dynamic';
const schema = z.object({
  clave: z.string().min(1).max(200), nombre: z.string().min(1).max(300), tipo: z.enum(['E', 'R', 'P']).nullable(), motivo: z.string().max(500).optional(),
}).strict();

/** tipo = null elimina la corrección manual y vuelve a la detección automática. */
export async function PUT(req: NextRequest) {
  try {
    const auth = await requireSubidaAuth(); if ('error' in auth) return auth.error;
    const b = schema.parse(await readJson(req, 8192));
    if (b.tipo === null) {
      await prisma.$executeRaw(Prisma.sql`DELETE FROM area2_subida_tipo_cliente WHERE clave = ${b.clave}`);
    } else {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO area2_subida_tipo_cliente (clave, nombre, tipo, motivo, actor_id) VALUES (${b.clave}, ${b.nombre}, ${b.tipo}, ${b.motivo ?? null}, ${auth.userId})
        ON CONFLICT (clave) DO UPDATE SET tipo = EXCLUDED.tipo, motivo = EXCLUDED.motivo, actor_id = EXCLUDED.actor_id, updated_at = now()`);
    }
    await auditar(auth.userId, 'TIPO_CLIENTE', null, { clave: b.clave, tipo: b.tipo });
    return reply({ ok: true });
  } catch (e) { return failure(e); }
}
