import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { normalizarGasto, type GastoNormalizado } from '@/lib/area5/core';
import {
  ApiError, actorActual, actorTrabajador, avisarRevisores, COLS, evento, eur, failure, FROM, gastoPorId, mismoOrigen,
  ocrTicket, prepararAdjunto, readJson, reply, type GastoRow,
} from '@/lib/area5/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** GET /api/empleado/mis-gastos — solo los gastos de la persona autenticada (nunca ?as= ni identidad del navegador). */
export async function GET(req: NextRequest) {
  try {
    const a = await actorActual();
    if (!a.empleado) return reply({ empleado: null, gastos: [], revisor: a.revisor });
    const estado = new URL(req.url).searchParams.get('estado');
    const filtroEstado = estado && /^[A-Z]+$/.test(estado) ? Prisma.sql`AND g.estado = ${estado}` : Prisma.empty;
    const gastos = await prisma.$queryRaw<GastoRow[]>(Prisma.sql`SELECT ${COLS} ${FROM} WHERE g.empleado_id = ${a.empleado.id} ${filtroEstado} ORDER BY g.fecha DESC, g.created_at DESC LIMIT 300`);
    return reply({ empleado: { nombreCompleto: a.empleado.nombreCompleto }, gastos, revisor: a.revisor });
  } catch (e) { return failure(e); }
}

async function insertar(tx: Prisma.TransactionClient, empleadoId: string, g: GastoNormalizado, estado: 'BORRADOR' | 'PENDIENTE', extra: { ocrEstado?: string; ocrConfianza?: number | null; ocrDatos?: unknown } = {}) {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    INSERT INTO area5_gastos (empleado_id, tipo, fecha, concepto, categoria, proyecto, cliente, comercio, cif_comercio, importe, tipo_iva, base_imponible, importe_iva, km, eur_km, ocr_estado, ocr_confianza, ocr_datos, estado)
    VALUES (${empleadoId}, ${g.tipo}, ${g.fecha}::date, ${g.concepto}, ${g.categoria}, ${g.proyecto}, ${g.cliente}, ${g.comercio}, ${g.cifComercio}, ${g.importe}::numeric,
      ${g.tipoIva}::numeric, ${g.baseImponible}::numeric, ${g.importeIva}::numeric, ${g.km}::numeric, ${g.eurKm}::numeric,
      ${extra.ocrEstado ?? 'NO'}, ${extra.ocrConfianza ?? null}::numeric, ${extra.ocrDatos ? JSON.stringify(extra.ocrDatos) : null}::jsonb, ${estado})
    RETURNING id`);
  return rows[0].id;
}

/**
 * POST /api/empleado/mis-gastos
 *  - multipart (file): sube foto/PDF del ticket, lanza la lectura automática y crea un BORRADOR para que el trabajador lo revise.
 *  - JSON {tipo:'KILOMETRAJE', fecha, concepto, km, eurKm, enviar?}: kilometraje sin ticket.
 */
export async function POST(req: NextRequest) {
  try {
    const a = await actorActual();
    const emp = actorTrabajador(a);
    const ct = req.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    if (ct === 'multipart/form-data') {
      mismoOrigen(req);
      const file = (await req.formData()).get('file');
      if (!(file instanceof File)) throw new ApiError('SIN_ARCHIVO', 400, 'Adjunta la foto o el PDF del ticket.');
      const adj = await prepararAdjunto(file);
      const dup = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT g.id FROM area5_gasto_adjuntos a JOIN area5_gastos g ON g.id = a.gasto_id WHERE a.sha256 = ${adj.sha256} AND g.empleado_id = ${emp.id} AND g.estado <> 'RECHAZADO' LIMIT 1`);
      if (dup.length) throw new ApiError('DUPLICADO', 409, 'Este ticket ya lo has subido antes.');
      const ocr = await ocrTicket(adj);
      const s = ocr.sugerencia;
      const hoy = new Date().toISOString().slice(0, 10);
      let borrador: GastoNormalizado;
      try {
        borrador = normalizarGasto({ tipo: 'TICKET', fecha: s?.fecha || hoy, concepto: s?.concepto || s?.comercio || adj.nombre.replace(/\.[^.]+$/, '') || 'Ticket', categoria: s?.categoria, comercio: s?.comercio, cifComercio: s?.cifComercio, importe: s?.importe || 1, tipoIva: s?.tipoIva, importeIva: s?.importeIva });
        if (!s?.importe) borrador.importe = 0;
      } catch { borrador = normalizarGasto({ tipo: 'TICKET', fecha: hoy, concepto: adj.nombre.slice(0, 200), importe: 1 }); borrador.importe = 0; }
      const id = await prisma.$transaction(async tx => {
        const nuevo = await insertar(tx, emp.id, borrador, 'BORRADOR', { ocrEstado: ocr.estado, ocrConfianza: s?.confianza ?? null, ocrDatos: s });
        await tx.$executeRaw(Prisma.sql`INSERT INTO area5_gasto_adjuntos (gasto_id, nombre, mime, tamano, sha256, datos) VALUES (${nuevo}, ${adj.nombre}, ${adj.mime}, ${adj.datos.length}, ${adj.sha256}, ${adj.datos})`);
        await evento(tx, nuevo, a.email, 'CREADO', ocr.estado === 'OK' ? 'Ticket subido con lectura automática' : 'Ticket subido (sin lectura automática)');
        return nuevo;
      });
      return reply({ gasto: await gastoPorId(id), ocr: ocr.estado }, 201);
    }
    const body = await readJson(req);
    if (body?.tipo !== 'KILOMETRAJE') throw new ApiError('SOLO_KM', 400, 'Los tickets se crean subiendo la foto o el PDF.');
    const g = normalizarGasto(body);
    const enviar = body.enviar === true;
    const id = await prisma.$transaction(async tx => {
      const nuevo = await insertar(tx, emp.id, g, enviar ? 'PENDIENTE' : 'BORRADOR');
      await evento(tx, nuevo, a.email, 'CREADO', `${g.km} km × ${g.eurKm} €/km`);
      if (enviar) {
        await evento(tx, nuevo, a.email, 'ENVIADO');
        await avisarRevisores(tx, a.email, 'NUEVO_GASTO', `${emp.nombreCompleto}: kilometraje ${eur(g.importe)} pendiente de revisar`, nuevo);
      }
      return nuevo;
    });
    return reply({ gasto: await gastoPorId(id), avisos: g.avisos }, 201);
  } catch (e) { return failure(e); }
}
