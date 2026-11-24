import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { esRevisor, listaRevisores, parseOcrJson, MAX_ADJUNTO_BYTES, MIMES_ADJUNTO, type SugerenciaOcr } from './core';

export const NO_STORE = { 'Cache-Control': 'private, no-store' };
export const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });
export class ApiError extends Error { constructor(public code: string, public status = 400, public detail?: string) { super(code); } }

export function failure(e: unknown) {
  if (e instanceof ApiError) return reply({ error: e.detail ?? e.code, code: e.code }, e.status);
  if (e instanceof z.ZodError) return reply({ error: e.issues[0]?.message || 'Datos no válidos', code: 'VALIDATION', issues: e.issues.slice(0, 5).map(i => `${i.path.join('.')}: ${i.message}`) }, 400);
  if (e instanceof SyntaxError) return reply({ error: 'JSON no válido', code: 'JSON' }, 400);
  const msg = e instanceof Error ? e.message : String(e);
  if (/area5_|relation .* does not exist/i.test(msg)) return reply({ error: 'Falta aplicar la migración del Área 5 (gastos y nóminas) en esta base de datos.', code: 'MIGRACION_PENDIENTE' }, 503);
  // Errores de validación de negocio lanzados con Error(message) desde el núcleo.
  if (e instanceof Error && e.name === 'ValidacionArea5') return reply({ error: msg, code: 'VALIDATION' }, 400);
  console.error('area5', msg.slice(0, 300));
  return reply({ error: 'No se pudo completar la operación.', code: 'INTERNAL' }, 500);
}
export const validacion = (msg: string) => Object.assign(new Error(msg), { name: 'ValidacionArea5' });

/** Las escrituras solo se aceptan desde el mismo origen. */
export function mismoOrigen(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin || origin !== new URL(req.url).origin) throw new ApiError('ORIGIN_NOT_ALLOWED', 403);
}
export async function readJson(req: NextRequest, max = 65_536): Promise<any> {
  mismoOrigen(req);
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError('JSON_REQUIRED', 415);
  const text = await req.text();
  if (text.length > max) throw new ApiError('REQUEST_TOO_LARGE', 413);
  return JSON.parse(text);
}

/* ------------------------------- Identidad ------------------------------- */
export interface Actor {
  email: string; usuarioId: number; revisor: boolean; actuando: boolean;
  empleado: { id: string; nombreCompleto: string; nif: string; email: string | null } | null;
}
/** Usuario autenticado del panel (activo en usuarios_admin). Nunca acepta selectores de identidad del navegador. */
export async function actorActual(): Promise<Actor> {
  const session: any = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.userType !== 'admin') throw new ApiError('NO_AUTENTICADO', 401, 'No autenticado');
  const email = String(session.user.email).trim().toLowerCase();
  const u = await prisma.usuarioAdmin.findUnique({ where: { email: session.user.email }, select: { id: true, activo: true } });
  if (!u?.activo) throw new ApiError('NO_AUTORIZADO', 403, 'No autorizado');
  const empleado = await prisma.empleado.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
    select: { id: true, nombreCompleto: true, nif: true, email: true, estado: true },
  });
  return { email, usuarioId: u.id, revisor: esRevisor(email), actuando: !!session.impersonation, empleado };
}
export async function actorRevisor(): Promise<Actor> {
  const a = await actorActual();
  if (!a.revisor) throw new ApiError('SOLO_REVISORES', 403, 'Solo David y Víctor pueden hacer esto');
  if (a.actuando) throw new ApiError('ACTUACION', 403, 'No disponible durante una actuación («Actuar como»)');
  return a;
}
export function actorTrabajador(a: Actor) {
  if (!a.empleado) throw new ApiError('SIN_FICHA', 403, 'No se encontró tu ficha de empleado. Contacta con administración.');
  return a.empleado;
}

/* --------------------------------- SQL --------------------------------- */
export const COLS = Prisma.sql`g.id, g.empleado_id AS "empleadoId", e.nombre_completo AS "empleadoNombre", e.nif AS "empleadoNif", g.tipo,
  to_char(g.fecha, 'YYYY-MM-DD') AS fecha, g.concepto, g.categoria, g.proyecto, g.cliente, g.comercio, g.cif_comercio AS "cifComercio",
  g.importe::float8 AS importe, g.tipo_iva::float8 AS "tipoIva", g.base_imponible::float8 AS "baseImponible", g.importe_iva::float8 AS "importeIva",
  g.km::float8 AS km, g.eur_km::float8 AS "eurKm", g.ocr_estado AS "ocrEstado", g.ocr_confianza::float8 AS "ocrConfianza",
  g.estado, g.motivo, g.revisor_email AS "revisorEmail", g.revisado_at AS "revisadoAt", g.cierre_id AS "cierreId", g.created_at AS "createdAt",
  EXISTS (SELECT 1 FROM area5_gasto_adjuntos a WHERE a.gasto_id = g.id) AS "tieneAdjunto"`;
export const FROM = Prisma.sql`FROM area5_gastos g JOIN empleados e ON e.id = g.empleado_id`;

export interface GastoRow {
  id: string; empleadoId: string; empleadoNombre: string; empleadoNif: string; tipo: 'TICKET' | 'KILOMETRAJE'; fecha: string; concepto: string;
  categoria: string | null; proyecto: string | null; cliente: string | null; comercio: string | null; cifComercio: string | null;
  importe: number; tipoIva: number | null; baseImponible: number | null; importeIva: number | null; km: number | null; eurKm: number | null;
  ocrEstado: string; ocrConfianza: number | null; estado: 'BORRADOR' | 'PENDIENTE' | 'ACLARACION' | 'APROBADO' | 'RECHAZADO';
  motivo: string | null; revisorEmail: string | null; revisadoAt: string | null; cierreId: string | null; createdAt: string; tieneAdjunto: boolean;
}
export async function gastoPorId(id: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<GastoRow | null> {
  const rows = await db.$queryRaw<GastoRow[]>(Prisma.sql`SELECT ${COLS} ${FROM} WHERE g.id = ${id}`);
  return rows[0] ?? null;
}
export const filaComoEntrada = (g: GastoRow) => g.tipo === 'KILOMETRAJE'
  ? { tipo: 'KILOMETRAJE', fecha: g.fecha, concepto: g.concepto, proyecto: g.proyecto, cliente: g.cliente, km: g.km, eurKm: g.eurKm }
  : { tipo: 'TICKET', fecha: g.fecha, concepto: g.concepto, categoria: g.categoria, proyecto: g.proyecto, cliente: g.cliente, comercio: g.comercio, cifComercio: g.cifComercio, importe: g.importe, tipoIva: g.tipoIva, importeIva: null };

export async function evento(db: Prisma.TransactionClient | typeof prisma, gastoId: string, actor: string, accion: string, texto?: string | null) {
  await db.$executeRaw(Prisma.sql`INSERT INTO area5_gasto_eventos (gasto_id, actor_email, accion, texto) VALUES (${gastoId}, ${actor}, ${accion}, ${texto ? texto.slice(0, 1000) : null})`);
}
export async function aviso(db: Prisma.TransactionClient | typeof prisma, destinatario: string, tipo: string, texto: string, gastoId: string | null) {
  await db.$executeRaw(Prisma.sql`INSERT INTO area5_avisos (destinatario_email, gasto_id, tipo, texto) VALUES (${destinatario.toLowerCase()}, ${gastoId}, ${tipo}, ${texto.slice(0, 500)})`);
}
export async function avisarRevisores(db: Prisma.TransactionClient | typeof prisma, excluir: string, tipo: string, texto: string, gastoId: string) {
  // Un aviso por persona: victor@lfgd.es y victor@internetoperadores.com son la misma persona, pero basta avisar a ambas direcciones.
  for (const r of listaRevisores()) if (r !== excluir.toLowerCase()) await aviso(db, r, tipo, texto, gastoId);
}
export const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/* ------------------------------ Adjuntos y OCR ------------------------------ */
export interface AdjuntoPreparado { nombre: string; mime: string; datos: Buffer; sha256: string }
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  'application/pdf': b => b.subarray(0, 4).toString() === '%PDF',
  'image/jpeg': b => b[0] === 0xff && b[1] === 0xd8,
  'image/png': b => b.subarray(1, 4).toString() === 'PNG',
  'image/webp': b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP',
  'image/heic': b => b.subarray(4, 8).toString() === 'ftyp',
};
/** Valida (tipo real, tamaño) y normaliza fotos a JPEG girado y reducido. Los PDF se guardan tal cual. */
export async function prepararAdjunto(file: File): Promise<AdjuntoPreparado> {
  if (!(MIMES_ADJUNTO as readonly string[]).includes(file.type)) throw new ApiError('TIPO_NO_SOPORTADO', 400, 'Formato no soportado. Usa JPG, PNG, WebP, HEIC o PDF.');
  if (file.size > MAX_ADJUNTO_BYTES) throw new ApiError('ARCHIVO_GRANDE', 413, 'El archivo supera 8 MB.');
  if (file.size < 100) throw new ApiError('ARCHIVO_VACIO', 400, 'El archivo está vacío.');
  let datos: Buffer = Buffer.from(await file.arrayBuffer());
  if (!MAGIC[file.type]?.(datos)) throw new ApiError('ARCHIVO_NO_COINCIDE', 400, 'El contenido del archivo no coincide con su formato.');
  let mime = file.type;
  const nombre = (file.name || 'ticket').replace(/[^\w.\- ()áéíóúñÁÉÍÓÚÑ]/g, '_').slice(0, 120) || 'ticket';
  if (mime.startsWith('image/') && mime !== 'image/heic') {
    try {
      const sharp = (await import('sharp')).default;
      datos = await sharp(datos).rotate().resize({ width: 2200, height: 2200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
      mime = 'image/jpeg';
    } catch { throw new ApiError('IMAGEN_ILEGIBLE', 400, 'No se pudo leer la imagen. Prueba con otra foto o con un PDF.'); }
  }
  return { nombre, mime, datos, sha256: createHash('sha256').update(datos).digest('hex') };
}

export async function ocrTicket(adj: AdjuntoPreparado): Promise<{ estado: 'OK' | 'ERROR' | 'OMITIDO'; sugerencia: SugerenciaOcr | null }> {
  if (!process.env.OPENAI_API_KEY || adj.mime === 'image/heic') return { estado: 'OMITIDO', sugerencia: null };
  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ timeout: 40_000, maxRetries: 0 });
    const b64 = adj.datos.toString('base64');
    const parte: any = adj.mime === 'application/pdf'
      ? { type: 'file', file: { filename: 'ticket.pdf', file_data: `data:application/pdf;base64,${b64}` } }
      : { type: 'image_url', image_url: { url: `data:${adj.mime};base64,${b64}`, detail: 'high' } };
    const r = await client.chat.completions.create({
      model: process.env.AREA5_OCR_MODEL || 'gpt-4o', temperature: 0, max_tokens: 600,
      messages: [{ role: 'user', content: [{ type: 'text', text:
        `Lee este ticket o factura simplificada y responde SOLO con JSON (sin markdown): {"comercio":string|null,"cifComercio":string|null,"fecha":"YYYY-MM-DD"|null,"concepto":"descripción breve, máx 100 caracteres"|null,"importe":número total pagado con IVA|null,"tipoIva":0|4|10|21|null,"importeIva":número|null,"categoria":"COMIDA"|"DIETA"|"DESPLAZAMIENTO"|"COMBUSTIBLE"|"PARKING"|"PEAJE"|"ALOJAMIENTO"|"MATERIAL"|"FORMACION"|"OTROS"|null,"confianza":0..1}. Si un dato no se ve con claridad, pon null; no inventes.` }, parte] }],
    });
    const s = parseOcrJson(r.choices[0]?.message?.content || '');
    return s ? { estado: 'OK', sugerencia: s } : { estado: 'ERROR', sugerencia: null };
  } catch (e) {
    console.error('area5 ocr', e instanceof Error ? e.message.slice(0, 200) : 'error');
    return { estado: 'ERROR', sugerencia: null };
  }
}

export const mesRango = (periodo: string) => {
  const [y, m] = periodo.split('-').map(Number);
  const ini = `${periodo}-01`;
  const fin = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
  return { ini, fin, mes: m, anio: y };
};
export const periodoSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/, 'Periodo no válido (AAAA-MM)');
export const idSchema = z.string().uuid();
