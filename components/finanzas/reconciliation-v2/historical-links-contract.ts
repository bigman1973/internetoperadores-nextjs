import type {
  DocumentoB4,
  DocumentoHistoricoB4,
  HistoricoB4,
  LineaBorradorB4,
  MovimientoB4,
} from './types';

const MAX_TEXT = 240;
const MAX_REASON_LENGTH = 320;
const MAX_DOCUMENTS = 25;
const MAX_REASONS = 25;

type ParseResult<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>;

export type PreparacionHeredada = Readonly<{
  ok: true;
  documento: DocumentoB4;
  lineas: readonly LineaBorradorB4[];
  /** Sólo informativo: el DTO fuente prevalece; el wrapper aporta fallback y 1 es el último recurso. */
  versionDocumento: number;
}> | Readonly<{
  ok: false;
  reason: string;
}>;

function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

function fail<T = never>(error: string): ParseResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value: unknown, maxLength = MAX_TEXT): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLength;
}

function isSafeCentsOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isSafeInteger(value));
}

function isOptionalVersion(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0);
}

function parseSourceDocument(value: unknown): ParseResult<DocumentoHistoricoB4> {
  if (!isRecord(value)) return fail('Un documento heredado no tiene una forma válida.');
  if (!isText(value.tipo, 80) || !isText(value.sourceId, 160) || !isText(value.referencia, MAX_TEXT)) {
    return fail('Un documento heredado no contiene identidad documental verificable.');
  }
  if (value.documentoConciliableId !== null && !isText(value.documentoConciliableId, 160)) {
    return fail('El identificador del wrapper B4 heredado no es válido.');
  }
  if (!isSafeCentsOrNull(value.importeObjetivoCentimos) || typeof value.archivoDisponible !== 'boolean') {
    return fail('El documento heredado no declara un importe exacto o la disponibilidad de archivo de forma válida.');
  }
  if (!isOptionalVersion(value.version) || (value.stale !== undefined && typeof value.stale !== 'boolean')) {
    return fail('Los metadatos de versión del documento heredado no son válidos.');
  }
  const documentoConciliableId = value.documentoConciliableId === null ? null : value.documentoConciliableId as string;
  const importeObjetivoCentimos = value.importeObjetivoCentimos as number | null;
  const version = value.version as number | undefined;
  const stale = value.stale as boolean | undefined;
  return ok(Object.freeze({
    tipo: value.tipo.trim(),
    sourceId: value.sourceId.trim(),
    documentoConciliableId,
    referencia: value.referencia.trim(),
    importeObjetivoCentimos,
    archivoDisponible: value.archivoDisponible,
    ...(version === undefined ? {} : { version }),
    ...(stale === undefined ? {} : { stale }),
  }));
}

/**
 * Aísla el contrato opcional de Parent API. Un valor ausente es válido y no
 * cambia B4; un valor mal formado se rechaza sin inventar evidencia.
 */
export function parseHistoricoB4(value: unknown): ParseResult<HistoricoB4 | undefined> {
  if (value === undefined || value === null) return ok(undefined);
  if (!isRecord(value)) return fail('La evidencia heredada no es un objeto válido.');
  if (!isText(value.id, 160) || value.origen !== 'HISTORICO') return fail('La evidencia heredada no tiene origen o identidad válidos.');
  if (value.clasificacion !== 'JUSTIFICADO' && value.clasificacion !== 'PROPUESTA' && value.clasificacion !== 'YA_B4') {
    return fail('La clasificación heredada no pertenece al contrato.');
  }
  if (value.procedencia !== 'MANUAL' && value.procedencia !== 'AUTOMATICO_TOLERANCIAS' && value.procedencia !== 'DESCONOCIDO') {
    return fail('La procedencia heredada no pertenece al contrato.');
  }
  if (!isText(value.creadoAt, 80) || !Array.isArray(value.motivos) || value.motivos.length > MAX_REASONS) {
    return fail('Los motivos o la fecha de la evidencia heredada no son válidos.');
  }
  if (!value.motivos.every((motivo) => isText(motivo, MAX_REASON_LENGTH))) {
    return fail('Un motivo heredado no es texto operativo válido.');
  }
  if (!Array.isArray(value.documentos) || value.documentos.length > MAX_DOCUMENTS) {
    return fail('La lista de documentos heredados no es verificable.');
  }

  const documentos: DocumentoHistoricoB4[] = [];
  for (const document of value.documentos) {
    const parsed = parseSourceDocument(document);
    if ('error' in parsed) return fail(parsed.error);
    documentos.push(parsed.value);
  }

  const id = value.id as string;
  const creadoAt = value.creadoAt as string;
  const motivos = value.motivos as unknown[];
  return ok(Object.freeze({
    id: id.trim(),
    origen: 'HISTORICO',
    clasificacion: value.clasificacion,
    procedencia: value.procedencia,
    // Parent API conserva arrays; no se cambia su contrato aunque la UI los
    // trate como evidencia de sólo lectura.
    motivos: motivos.map((motivo) => (motivo as string).trim()),
    documentos,
    creadoAt: creadoAt.trim(),
  }));
}

function sameExactMetadata(source: DocumentoHistoricoB4, wrapper: DocumentoB4): boolean {
  return source.documentoConciliableId === wrapper.id
    && source.sourceId === wrapper.sourceId
    && source.tipo === wrapper.tipo
    && source.referencia === wrapper.referencia
    && source.importeObjetivoCentimos === wrapper.importeObjetivoCentimos;
}

function fullExactCapacity(wrapper: DocumentoB4, amount: number): boolean {
  return Number.isSafeInteger(wrapper.importeObjetivoCentimos)
    && Number.isSafeInteger(wrapper.asignadoCentimos)
    && Number.isSafeInteger(wrapper.disponibleCentimos)
    && wrapper.importeObjetivoCentimos === amount
    && wrapper.asignadoCentimos === 0
    && wrapper.disponibleCentimos === amount;
}

/**
 * Sólo habilita una preparación manual, nunca una confirmación. El importe de
 * la línea procede exclusivamente del objetivo documental histórico exacto;
 * el importe bancario se conserva para que B4 enseñe cualquier descuadre.
 */
export function prepararRevisionHeredada(
  movimiento: MovimientoB4,
  wrappers: readonly DocumentoB4[],
): PreparacionHeredada {
  const historico = movimiento.historico;
  if (!historico) return { ok: false, reason: 'No existe evidencia heredada para este movimiento.' };
  if (movimiento.estado === 'JUSTIFICADO') return { ok: false, reason: 'El movimiento ya está JUSTIFICADO en B4; sólo se muestra su evidencia.' };
  if (movimiento.estado !== 'SIN_DOCUMENTO') return { ok: false, reason: 'La evidencia heredada no prepara movimientos que no estén sin documento.' };
  if (historico.clasificacion !== 'PROPUESTA') return { ok: false, reason: 'Sólo una propuesta heredada puede preparar una revisión manual.' };
  if (historico.documentos.length !== 1) return { ok: false, reason: 'La propuesta heredada debe contener exactamente un documento verificable.' };

  const source = historico.documentos[0];
  const amount = source.importeObjetivoCentimos;
  if (source.documentoConciliableId === null || amount === null || !Number.isSafeInteger(amount) || amount === 0) {
    return { ok: false, reason: 'Falta el wrapper B4 o el importe documental exacto de la propuesta heredada.' };
  }
  if (movimiento.importeCentimos !== null && movimiento.importeCentimos < 0 && !source.archivoDisponible) {
    return { ok: false, reason: 'El cargo heredado no dispone de archivo; no puede prepararse para revisión.' };
  }

  const wrapper = wrappers.find((document) => document.id === source.documentoConciliableId);
  if (!wrapper) return { ok: false, reason: 'El wrapper B4 del documento heredado no está disponible en esta lectura.' };
  const sourceStale = source.stale ?? wrapper.stale;
  if (sourceStale || wrapper.stale) return { ok: false, reason: 'El wrapper documental está obsoleto y requiere revisión manual.' };
  if (source.version !== undefined && source.version !== wrapper.version) {
    return { ok: false, reason: 'La versión documental ha cambiado desde la recuperación histórica.' };
  }
  if (source.tipo === 'FACTURA_RECIBIDA' || source.tipo === 'FACTURA_EMITIDA') {
    const invoiceTime = wrapper.fecha === null ? NaN : Date.parse(wrapper.fecha);
    const paymentTime = Date.parse(movimiento.fechaOperacion);
    if (!Number.isFinite(invoiceTime) || !Number.isFinite(paymentTime)) {
      return { ok: false, reason: 'Falta una fecha de factura o de pago verificable; revise el documento manualmente.' };
    }
    if (new Date(invoiceTime).toISOString().slice(0, 10) > new Date(paymentTime).toISOString().slice(0, 10)) {
      return { ok: false, reason: 'La factura es posterior al movimiento bancario; no puede prepararse como su justificante.' };
    }
  }
  if (!sameExactMetadata(source, wrapper)) {
    return { ok: false, reason: 'El wrapper B4 no coincide exactamente con los metadatos de la propuesta heredada.' };
  }
  if (!fullExactCapacity(wrapper, amount)) {
    return { ok: false, reason: 'El wrapper B4 no conserva capacidad íntegra y exacta para el documento heredado.' };
  }

  // El DTO fuente es preferente; para fuentes antiguas sin versión se usa el
  // wrapper disponible y, sólo si falta también, la versión local 1.
  const versionDocumento = source.version ?? wrapper.version ?? 1;
  return {
    ok: true,
    documento: wrapper,
    versionDocumento,
    lineas: Object.freeze([Object.freeze({
      tipo: 'DOCUMENTO' as const,
      documentoConciliableId: wrapper.id,
      importeCentimos: amount,
    })]),
  };
}
