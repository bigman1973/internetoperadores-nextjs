import {archivoRecibidaControlado,bibliotecaFinancieraConfigurada} from './archivo-fuente-controlada';
/*
 * Precondición documental para una NUEVA confirmación B4 JUSTIFICADO de cargo.
 *
 * Se ejecuta dentro de la transacción B4, después de bloquear movimiento y
 * wrappers y antes de crear operación/vínculos. No escribe, no inicializa B4 y
 * nunca intenta reparar un JUSTIFICADO histórico: ése se muestra como incidencia
 * mediante listarArchivosPrivadosMovimiento.
 */
import { Prisma } from '@prisma/client';
import { driveItemDesdeArchivoUrlNominaControlada } from '@/lib/finanzas/nominas-propuestas-db';

const ID = /^[A-Za-z0-9!_.~-]{4,220}$/;
const MAX = 101;

type Tx = Prisma.TransactionClient & Record<string, any>;
export class ArchivoFinancieroAssertError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly missing: readonly string[] = []) { super(message); }
}
function fail(status: number, code: string, message: string, missing: readonly string[] = []): never {
  throw new ArchivoFinancieroAssertError(status, code, message, missing);
}

function base64PdfValido(value: unknown): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 17 * 1024 * 1024) return false;
  // archivoPdf es el base64 crudo del modelo, no una URL ni data URI.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return false;
  try { return Buffer.from(value, 'base64').length > 0; } catch { return false; }
}

function fuenteControlada(doc: any): boolean {
  if (doc.tipo === 'NOMINA') {
    const payrollDocuments = Array.isArray(doc.nomina?.documentos) ? doc.nomina.documentos : [];
    return !!bibliotecaFinancieraConfigurada() && (payrollDocuments.some((item: any) => ID.test(String(item?.driveItemId ?? '')) && ['NOMINA'].includes(String(item?.tipo ?? '')))
      || driveItemDesdeArchivoUrlNominaControlada(doc.nomina?.archivoUrl) !== null);
  }
  if (doc.tipo === 'FACTURA_RECIBIDA') {
    return !!archivoRecibidaControlado(doc.facturaRecibida);
  }
  if (doc.tipo === 'TICKET') return !!bibliotecaFinancieraConfigurada() && ID.test(String(doc.gasto?.oneDriveItemId ?? ''));
  if (doc.tipo === 'IMPUESTO_TGSS') {
    return base64PdfValido(doc.documentoAapp?.archivoPdf) || base64PdfValido(doc.pagoFraccionado?.documento?.archivoPdf);
  }
  return false;
}

/**
 * Requiere que cada wrapper financiero nuevo tenga archivo propio controlado o
 * que el movimiento conserve al menos un soporte B5 COMPLETO con drive/item.
 * La excepción no se convierte en false/[]: aborta la confirmación antes de DML.
 */
export async function assertArchivosFinancierosParaNuevoCargoJustificadoTx(
  tx: Tx,
  input: Readonly<{ movimientoId: string; estado: 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE'; documentoConciliableIds: readonly string[] }>,
): Promise<void> {
  if (input.estado !== 'JUSTIFICADO' || input.documentoConciliableIds.length === 0) return;
  const movementRows = await tx.$queryRaw<Array<{ importe: string }>>(Prisma.sql`
    SELECT importe::text AS importe FROM movimientos_bancarios WHERE id = ${input.movimientoId} FOR UPDATE
  `);
  if (movementRows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.');
  if (!/^-\d+(?:\.\d{1,2})?$/.test(movementRows[0].importe)) return; // sólo cargos nuevos

  const b5 = await tx.adjuntoPendienteB5.findMany({
    where: { movimientoId: input.movimientoId, estado: 'UPLOAD_COMPLETO' },
    select: { id: true, driveId: true, oneDriveItemId: true }, take: MAX,
  });
  if (b5.length === MAX) fail(409, 'SOPORTES_B5_TRUNCADOS', 'Hay demasiados soportes B5 para verificar la confirmación.');
  const hasB5Support = b5.some((row: any) => ID.test(String(row.driveId ?? '')) && ID.test(String(row.oneDriveItemId ?? '')));

  const ids = [...new Set(input.documentoConciliableIds)];
  const docs = await tx.documentoConciliable.findMany({
    where: { id: { in: ids } },
    include: {
      nomina: { include: { documentos: { select: { driveItemId: true, tipo: true } } } },
      facturaRecibida: { select: { oneDriveDriveId: true, oneDriveItemId: true, archivoOneDrive: true } },
      gasto: { select: { oneDriveItemId: true } },
      documentoAapp: { select: { archivoPdf: true } },
      pagoFraccionado: { include: { documento: { select: { archivoPdf: true } } } },
    },
    take: MAX,
  });
  if (docs.length !== ids.length || docs.length === MAX) fail(409, 'DOCUMENTOS_INCOMPLETOS', 'No se pudo verificar todos los documentos de la confirmación.');
  const missing = docs.filter((doc: any) => !fuenteControlada(doc) && !hasB5Support).map((doc: any) => doc.id);
  if (missing.length) {
    fail(409, 'ARCHIVO_DESCARGABLE_REQUERIDO', 'Un cargo JUSTIFICADO nuevo requiere archivo controlado del documento o soporte B5 completo.', missing);
  }
}
