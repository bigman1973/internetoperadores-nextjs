import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };
export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export class ApiError extends Error { constructor(public code: string, public status = 400, public detail?: string) { super(code); } }

export function failure(e: unknown) {
  if (e instanceof ApiError) return reply({ error: e.detail ?? e.code, code: e.code }, e.status);
  if (e instanceof z.ZodError) return reply({ error: 'Datos no válidos', code: 'VALIDATION', issues: e.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
  if (e instanceof SyntaxError) return reply({ error: 'JSON no válido', code: 'JSON' }, 400);
  const msg = e instanceof Error ? e.message : String(e);
  if (msg === 'SIN_FOTO_RENTABILIDAD') return reply({ error: 'Rentabilidad todavía no tiene una foto calculada. Genera primero la rentabilidad del mes.', code: msg }, 409);
  if (/area2_subida|relation .* does not exist/i.test(msg)) return reply({ error: 'Falta aplicar la migración de Subida de precios en esta base de datos.', code: 'MIGRACION_PENDIENTE' }, 503);
  console.error('subida-precios', msg.slice(0, 300));
  return reply({ error: 'No se pudo completar la operación.', code: 'INTERNAL' }, 500);
}

/** Las mutaciones solo se aceptan desde el mismo origen y con JSON de tamaño acotado. */
export async function readJson(req: NextRequest, max = 262_144): Promise<unknown> {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) throw new ApiError('ORIGIN_NOT_ALLOWED', 403);
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError('JSON_REQUIRED', 415);
  const text = await req.text();
  if (text.length > max) throw new ApiError('REQUEST_TOO_LARGE', 413);
  return JSON.parse(text);
}

const pct = z.number().min(-100).max(300);
const key = z.string().min(1).max(200);
export const estadoSchema = z.object({
  nombre: z.string().trim().min(1).max(120), nota: z.string().max(2000).default(''),
  ing: z.record(key, pct), cost: z.record(key, pct), pub: pct, capR: pct, inclAnual: z.boolean(),
  rounding: z.number().min(0).max(100), churnE: z.number().min(0).max(100), churnR: z.number().min(0).max(100),
  cli: z.record(key, pct), con: z.record(key, pct),
  aviso: z.object({ E: z.number().int().min(0).max(12), R: z.number().int().min(0).max(12), P: z.number().int().min(0).max(12) }),
  fechaEfecto: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/),
}).strict();
export const periodoSchema = z.object({ desde: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/), hasta: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/) });

export async function auditar(actorId: number, accion: string, escenarioId: string | null, detalle?: Record<string, unknown>) {
  await prisma.$executeRaw(Prisma.sql`INSERT INTO area2_subida_auditoria (accion, escenario_id, actor_id, detalle) VALUES (${accion}, ${escenarioId}, ${actorId}, ${detalle ? JSON.stringify(detalle) : null}::jsonb)`);
}
export const idSchema = z.string().uuid();
