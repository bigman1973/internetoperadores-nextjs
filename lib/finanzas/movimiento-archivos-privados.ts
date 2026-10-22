import {archivoRecibidaControlado,bibliotecaFinancieraConfigurada} from './archivo-fuente-controlada';
/*
 * Listado privado de archivos por movimiento B4.
 *
 * La descarga vuelve a calcular esta lista. El cliente aporta sólo movimientoId
 * y archivoId opaco: nunca driveId, itemId, archivoUrl, host ni URL Graph.
 * No hay catch que convierta un error de fuente en lista vacía.
 */
import prisma from '@/lib/prisma';
import { ConfirmingSupportError, readConfirmedSupportFiles } from '@/lib/finanzas/confirming-draxton-db';
import { driveItemDesdeArchivoUrlNominaControlada } from '@/lib/finanzas/nominas-propuestas-db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOVIMIENTO_ID = /^[A-Za-z0-9_-]{1,160}$/;
const ID = /^[A-Za-z0-9!_.~-]{4,220}$/;
const MAX = 101; // 100 + centinela

export type OrigenArchivoMovimiento =
  | 'NOMINA_DOCUMENTO'
  | 'NOMINA_ARCHIVO_URL_RELATIVA'
  | 'FACTURA_RECIBIDA_ONEDRIVE'
  | 'GASTO_TICKET_ONEDRIVE'
  | 'DOCUMENTO_AAPP_BASE64'
  | 'PAGO_FRACCIONADO_DOCUMENTO_AAPP_BASE64'
  | 'ADJUNTO_B5'
  | 'CONFIRMING_REFERIDO';
export type VinculoArchivoMovimiento = 'CONFIRMADO_B4' | 'SOPORTE_B5' | 'SOPORTE_CONFIRMING_REFERIDO';

export type ArchivoDisponibleInterno = Readonly<{
  archivoId: string;
  origen: OrigenArchivoMovimiento;
  vinculo: VinculoArchivoMovimiento;
  estado: 'DISPONIBLE';
  nombre: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'application/octet-stream';
  tipoDocumentoB4: string | null;
  documentoConciliableId: string | null;
  noMonetario: boolean;
  locator: Readonly<
    | { tipo: 'DRIVE_EXPLICITO'; driveId: string; itemId: string }
    | { tipo: 'DRIVE_CONFIGURADO'; itemId: string }
    | { tipo: 'AAPP_BASE64'; contenidoBase64: string }
  >;
}>;
export type ArchivoFaltanteMovimiento = Readonly<{
  archivoId: null;
  origen: OrigenArchivoMovimiento | null;
  vinculo: VinculoArchivoMovimiento | 'CONFIRMADO_B4';
  estado: 'FALTA_ARCHIVO_DESCARGABLE';
  nombre: null;
  mimeType: null;
  tipoDocumentoB4: string | null;
  documentoConciliableId: string | null;
  noMonetario: boolean;
  motivo: string;
}>;
export type ArchivoMovimientoUI = Omit<ArchivoDisponibleInterno, 'locator'> | ArchivoFaltanteMovimiento;

export class MovimientoArchivosError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
function fail(status: number, code: string, message: string): never { throw new MovimientoArchivosError(status, code, message); }
function isUuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function isFile(value: ArchivoMovimientoUI): value is ArchivoDisponibleInterno { return value.estado === 'DISPONIBLE'; }
function fileId(origen: OrigenArchivoMovimiento, id: string): string { return `${origen}:${id}`; }
function name(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/[\r\n\\/]/g, ' ').trim();
  return clean.length > 0 && clean.length <= 180 ? clean : fallback;
}
function mime(value: unknown): ArchivoDisponibleInterno['mimeType'] {
  return value === 'application/pdf' || value === 'image/jpeg' || value === 'image/png' ? value : 'application/octet-stream';
}
function base64Pdf(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 17 * 1024 * 1024 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}
function missing(
  tipoDocumentoB4: string | null,
  documentoConciliableId: string | null,
  motivo: string,
  origen: OrigenArchivoMovimiento | null = null,
  vinculo: ArchivoFaltanteMovimiento['vinculo'] = 'CONFIRMADO_B4',
  noMonetario = false,
): ArchivoFaltanteMovimiento {
  return { archivoId: null, origen, vinculo, estado: 'FALTA_ARCHIVO_DESCARGABLE', nombre: null, mimeType: null, tipoDocumentoB4, documentoConciliableId, noMonetario, motivo };
}

function payrollFile(
  origen: 'NOMINA_DOCUMENTO' | 'NOMINA_ARCHIVO_URL_RELATIVA', entidadId: string, vinculo: VinculoArchivoMovimiento,
  itemId: string, filename: unknown, documentoId: string | null,
): ArchivoDisponibleInterno | null {
  if (!bibliotecaFinancieraConfigurada() || !ID.test(entidadId) || !ID.test(itemId)) return null;
  return {
    archivoId: fileId(origen, entidadId), origen, vinculo, estado: 'DISPONIBLE', nombre: name(filename, 'nomina.pdf'), mimeType: 'application/pdf',
    tipoDocumentoB4: 'NOMINA', documentoConciliableId: documentoId, noMonetario: false,
    locator: { tipo: 'DRIVE_CONFIGURADO', itemId },
  };
}

async function confirmadosB4(movimientoId: string): Promise<Array<ArchivoDisponibleInterno | ArchivoFaltanteMovimiento>> {
  const links = await (prisma as any).vinculoMovimientoDocumento.findMany({
    where: { movimientoId, activo: true, tipoLinea: 'DOCUMENTO' },
    select: {
      documentoConciliableId: true,
      documentoConciliable: {
        select: {
          id: true, tipo: true,
          nomina: { select: { id: true, archivoUrl: true, archivoNombre: true, documentos: { select: { id: true, driveItemId: true, nombre: true, tipo: true } } } },
          facturaRecibida: { select: { id: true, oneDriveDriveId: true, oneDriveItemId: true, archivoOneDrive: true } },
          gasto: { select: { id: true, oneDriveItemId: true, archivoNombre: true } },
          documentoAapp: { select: { id: true, archivoPdf: true, nombreArchivo: true } },
          pagoFraccionado: { select: { id: true, documento: { select: { id: true, archivoPdf: true, nombreArchivo: true } } } },
        },
      },
    },
    take: MAX,
  });
  if (links.length === MAX) fail(409, 'LISTA_CONFIRMADOS_TRUNCADA', 'Demasiados vínculos confirmados para una lista documental completa.');
  const files: Array<ArchivoDisponibleInterno | ArchivoFaltanteMovimiento> = [];
  for (const link of links) {
    const doc = link.documentoConciliable;
    if (!doc?.id || !doc?.tipo) {
      files.push(missing(null, link.documentoConciliableId ?? null, 'El vínculo confirmado no conserva su wrapper B4.'));
      continue;
    }
    if (doc.tipo === 'NOMINA') {
      const nomina = doc.nomina;
      if (!nomina) { files.push(missing('NOMINA', doc.id, 'El wrapper NOMINA no conserva una nómina fuente.')); continue; }
      const sources = (nomina.documentos || []).filter((item: any) => ID.test(String(item.driveItemId ?? '')) && ['NOMINA'].includes(String(item.tipo ?? '')));
      for (const source of sources) {
        const file = payrollFile('NOMINA_DOCUMENTO', source.id, 'CONFIRMADO_B4', source.driveItemId, source.nombre, doc.id);
        if (file) files.push(file);
      }
      const legacyItem = driveItemDesdeArchivoUrlNominaControlada(nomina.archivoUrl);
      if (legacyItem) {
        const file = payrollFile('NOMINA_ARCHIVO_URL_RELATIVA', nomina.id, 'CONFIRMADO_B4', legacyItem, nomina.archivoNombre, doc.id);
        if (file) files.push(file);
      }
      if (sources.length === 0 && !legacyItem) files.push(missing('NOMINA', doc.id, 'La nómina confirmada no tiene NominaDocumento ni ruta privada interna reconocida.'));
      continue;
    }
    if (doc.tipo === 'FACTURA_RECIBIDA') {
      const source = doc.facturaRecibida;
      const location=archivoRecibidaControlado(source);
      if (source && ID.test(String(source.id)) && location) {
        files.push({ archivoId: fileId('FACTURA_RECIBIDA_ONEDRIVE', source.id), origen: 'FACTURA_RECIBIDA_ONEDRIVE', vinculo: 'CONFIRMADO_B4', estado: 'DISPONIBLE', nombre: name(source.archivoOneDrive?.split(/[\\/]/).pop(), 'factura.pdf'), mimeType: 'application/pdf', tipoDocumentoB4: doc.tipo, documentoConciliableId: doc.id, noMonetario: false, locator: { tipo: 'DRIVE_EXPLICITO', driveId: location.driveId, itemId: location.itemId } });
      } else files.push(missing(doc.tipo, doc.id, 'La factura recibida confirmada no tiene drive/item interno verificable.'));
      continue;
    }
    if (doc.tipo === 'TICKET') {
      const source = doc.gasto;
      if (source && ID.test(String(source.id)) && ID.test(String(source.oneDriveItemId ?? ''))) {
        files.push({ archivoId: fileId('GASTO_TICKET_ONEDRIVE', source.id), origen: 'GASTO_TICKET_ONEDRIVE', vinculo: 'CONFIRMADO_B4', estado: 'DISPONIBLE', nombre: name(source.archivoNombre, 'ticket'), mimeType: 'application/octet-stream', tipoDocumentoB4: doc.tipo, documentoConciliableId: doc.id, noMonetario: false, locator: { tipo: 'DRIVE_CONFIGURADO', itemId: source.oneDriveItemId } });
      } else files.push(missing(doc.tipo, doc.id, 'El gasto/ticket confirmado no tiene item interno descargable.'));
      continue;
    }
    if (doc.tipo === 'IMPUESTO_TGSS') {
      const aapp = doc.documentoAapp || doc.pagoFraccionado?.documento;
      const origin: OrigenArchivoMovimiento = doc.pagoFraccionado ? 'PAGO_FRACCIONADO_DOCUMENTO_AAPP_BASE64' : 'DOCUMENTO_AAPP_BASE64';
      const originId = doc.pagoFraccionado ? String(doc.pagoFraccionado.id) : String(aapp?.id ?? '');
      if (aapp && Number.isInteger(aapp.id) && base64Pdf(aapp.archivoPdf)) {
        files.push({ archivoId: fileId(origin, originId), origen: origin, vinculo: 'CONFIRMADO_B4', estado: 'DISPONIBLE', nombre: name(aapp.nombreArchivo, 'documento-aapp.pdf'), mimeType: 'application/pdf', tipoDocumentoB4: doc.tipo, documentoConciliableId: doc.id, noMonetario: false, locator: { tipo: 'AAPP_BASE64', contenidoBase64: aapp.archivoPdf } });
      } else files.push(missing(doc.tipo, doc.id, 'El documento AAPP o la cuota no conserva archivoPdf interno válido.'));
      continue;
    }
    files.push(missing(doc.tipo, doc.id, `No existe una fuente de archivo controlada para ${doc.tipo}.`));
  }
  return files;
}

async function soportesB5(movimientoId: string): Promise<Array<ArchivoDisponibleInterno | ArchivoFaltanteMovimiento>> {
  const rows = await (prisma as any).adjuntoPendienteB5.findMany({
    where: { movimientoId, estado: 'UPLOAD_COMPLETO' },
    select: { id: true, storageName: true, mimeType: true, tipoDocumento: true, driveId: true, oneDriveItemId: true },
    take: MAX,
  });
  if (rows.length === MAX) fail(409, 'LISTA_B5_TRUNCADA', 'Demasiados soportes B5 para una lista documental completa.');
  return rows.map((row: any) => {
    if (!ID.test(String(row.id)) || !ID.test(String(row.driveId ?? '')) || !ID.test(String(row.oneDriveItemId ?? ''))) {
      return missing(null, null, 'El soporte B5 completo no conserva drive/item interno verificable.', 'ADJUNTO_B5', 'SOPORTE_B5', row.tipoDocumento === 'SOPORTE');
    }
    return {
      archivoId: fileId('ADJUNTO_B5', row.id), origen: 'ADJUNTO_B5', vinculo: 'SOPORTE_B5', estado: 'DISPONIBLE',
      nombre: name(row.storageName, 'soporte'), mimeType: mime(row.mimeType), tipoDocumentoB4: null, documentoConciliableId: null,
      noMonetario: row.tipoDocumento === 'SOPORTE', locator: { tipo: 'DRIVE_EXPLICITO', driveId: row.driveId, itemId: row.oneDriveItemId },
    } as ArchivoDisponibleInterno;
  });
}

async function confirming(movimientoId: string): Promise<ArchivoDisponibleInterno[]> {
  let references: Awaited<ReturnType<typeof readConfirmedSupportFiles>>;
  try {
    references = await readConfirmedSupportFiles(movimientoId);
  } catch (error) {
    if (error instanceof ConfirmingSupportError) fail(error.status, error.code, error.message);
    throw error;
  }
  if (references.length > 100) fail(409, 'LISTA_CONFIRMING_TRUNCADA', 'Demasiados soportes confirming para una lista documental completa.');
  return references.map((reference) => {
    if (reference.movimientoId !== movimientoId || !isUuid(reference.referenciaId) || !ID.test(reference.driveId) || !ID.test(reference.itemId)) {
      fail(409, 'SOPORTE_CONFIRMING_INVALIDO', 'El soporte confirming no conserva una referencia interna válida.');
    }
    return { archivoId: fileId('CONFIRMING_REFERIDO', reference.referenciaId), origen: 'CONFIRMING_REFERIDO', vinculo: 'SOPORTE_CONFIRMING_REFERIDO', estado: 'DISPONIBLE', nombre: name(reference.nombre, 'soporte-confirming.pdf'), mimeType: mime(reference.mimeType), tipoDocumentoB4: null, documentoConciliableId: null, noMonetario: true, locator: { tipo: 'DRIVE_EXPLICITO', driveId: reference.driveId, itemId: reference.itemId } };
  });
}

function dedupe(files: readonly (ArchivoDisponibleInterno | ArchivoFaltanteMovimiento)[]): Array<ArchivoDisponibleInterno | ArchivoFaltanteMovimiento> {
  const seen = new Set<string>();
  return files.filter((file) => {
    if (file.estado !== 'DISPONIBLE') return true;
    if (seen.has(file.archivoId)) return false;
    seen.add(file.archivoId);
    return true;
  });
}

export async function listarArchivosPrivadosMovimiento(movimientoId: string): Promise<Readonly<{
  movimientoId: string;
  archivos: readonly ArchivoMovimientoUI[];
  noEscrituras: true;
  requiereConfirmacionHumanaParaVinculos: true;
}>> {
  if (!MOVIMIENTO_ID.test(movimientoId)) fail(400, 'MOVIMIENTO_INVALIDO', 'Identificador de movimiento no válido.');
  const movement = await (prisma as any).movimientoBancario.findUnique({ where: { id: movimientoId }, select: { id: true } });
  if (!movement) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.');
  const [b4, b5, c9] = await Promise.all([confirmadosB4(movimientoId), soportesB5(movimientoId), confirming(movimientoId)]);
  return { movimientoId, archivos: dedupe([...b4, ...b5, ...c9]).map((file) => {
    if (file.estado === 'FALTA_ARCHIVO_DESCARGABLE') return file;
    const { locator: _locator, ...ui } = file;
    return ui;
  }), noEscrituras: true, requiereConfirmacionHumanaParaVinculos: true };
}

export async function resolverArchivoPrivadoMovimiento(movimientoId: string, requestedArchivoId: string): Promise<ArchivoDisponibleInterno> {
  if (typeof requestedArchivoId !== 'string' || requestedArchivoId.length === 0 || requestedArchivoId.length > 300) fail(400, 'ARCHIVO_INVALIDO', 'archivoId no es válido.');
  // Se recalcula completo; no se consulta por un id de drive entregado por el cliente.
  const all = await listarArchivosInternosMovimiento(movimientoId);
  const found = all.find((file) => file.estado === 'DISPONIBLE' && file.archivoId === requestedArchivoId);
  if (!found) fail(404, 'ARCHIVO_NO_PERTENECE_AL_MOVIMIENTO', 'El archivo no pertenece al movimiento autorizado.');
  if (found.estado !== 'DISPONIBLE') fail(404, 'ARCHIVO_NO_DISPONIBLE', 'El archivo no está disponible.');
  return found as ArchivoDisponibleInterno;
}

async function listarArchivosInternosMovimiento(movimientoId: string): Promise<readonly (ArchivoDisponibleInterno | ArchivoFaltanteMovimiento)[]> {
  if (!MOVIMIENTO_ID.test(movimientoId)) fail(400, 'MOVIMIENTO_INVALIDO', 'Identificador de movimiento no válido.');
  const movement = await (prisma as any).movimientoBancario.findUnique({ where: { id: movimientoId }, select: { id: true } });
  if (!movement) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.');
  const [b4, b5, c9] = await Promise.all([confirmadosB4(movimientoId), soportesB5(movimientoId), confirming(movimientoId)]);
  return dedupe([...b4, ...b5, ...c9]);
}
