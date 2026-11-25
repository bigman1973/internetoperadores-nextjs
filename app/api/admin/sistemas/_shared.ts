import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { primerCampoSospechoso } from '@/lib/sistemas/secretos';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };
export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export class ApiError extends Error { constructor(public code: string, public status = 400, public detail?: string) { super(code); } }
export function failure(e: unknown) {
  if (e instanceof ApiError) return reply({ error: e.detail ?? e.code, code: e.code }, e.status);
  if (e instanceof z.ZodError) return reply({ error: 'Datos no válidos', code: 'VALIDATION', issues: e.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
  if (e instanceof SyntaxError) return reply({ error: 'JSON no válido', code: 'JSON' }, 400);
  const msg = e instanceof Error ? e.message : String(e);
  if (/area9_sis|relation .* does not exist/i.test(msg)) return reply({ error: 'Falta aplicar la migración de Sistemas y servicios en esta base de datos.', code: 'MIGRACION_PENDIENTE' }, 503);
  console.error('sistemas', msg.slice(0, 300));
  return reply({ error: 'No se pudo completar la operación.', code: 'INTERNAL' }, 500);
}
/** Las mutaciones solo se aceptan desde el mismo origen, con JSON acotado. */
export async function readJson(req: NextRequest, max = 65_536): Promise<unknown> {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) throw new ApiError('ORIGIN_NOT_ALLOWED', 403);
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError('JSON_REQUIRED', 415);
  const text = await req.text();
  if (text.length > max) throw new ApiError('REQUEST_TOO_LARGE', 413);
  return JSON.parse(text);
}
/** Rechaza cualquier campo de texto que parezca una contraseña o un token. */
export function sinCredenciales(campos: Record<string, unknown>) {
  const k = primerCampoSospechoso(campos);
  if (k) throw new ApiError('CREDENCIAL_DETECTADA', 400, `El campo «${k}» parece una contraseña o un token. Aquí no se guardan credenciales: van en las variables de entorno.`);
}
export const idSchema = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
export const mesSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const fechaSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);
