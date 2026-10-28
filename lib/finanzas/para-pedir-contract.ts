export const PARA_PEDIR_ESTADOS = ['TODOS', 'SIN_PEDIR', 'PEDIDO', 'PEDIDO_MAS_15_DIAS'] as const;
export const PARA_PEDIR_MAX_LIMIT = 100;
export const PARA_PEDIR_MAX_OFFSET = 100_000;
export const PARA_PEDIR_MAX_QUERY = 120;
export const PARA_PEDIR_MAX_TERCERO = 320;

export type ParaPedirEstado = typeof PARA_PEDIR_ESTADOS[number];
export type ParaPedirInput = Readonly<{
  estado: ParaPedirEstado;
  limit: number;
  offset: number;
  q?: string;
  tercero?: string;
}>;
export type ParaPedirPedido = Readonly<{ dia: string; actorNombre: string | null; diasTranscurridos: number }>;
export type ParaPedirEstadoFila = 'SIN_PEDIR' | 'PEDIDO' | 'PEDIDO_SIN_AUDITORIA' | 'RECIBIDO';
/** Capacidad efímera de proyección; no incluye ids B4, importes ni fuente documental. */
export type ParaPedirConciliarPedir = Readonly<{ rowId: string; decisionHash: string }>;
export type ParaPedirMovimiento = Readonly<{
  movimientoId: string;
  tab: 'COBROS' | 'PAGOS';
  fecha: string;
  concepto: string;
  banco: string | null;
  cuenta: string | null;
  tercero: string | null;
  grupoTercero: string;
  referenciaDocumento: string | null;
  importeCentimos: number;
  pendienteCentimos: number;
  motivo: string;
  estadoPedido: ParaPedirEstadoFila;
  pedido: ParaPedirPedido | null;
  /** Sólo se emite para una fila roja vigente que no está marcada como PEDIDO. */
  conciliarPedir: ParaPedirConciliarPedir | null;
}>;
export type ParaPedirAgrupacion = Readonly<{
  tercero: string;
  movimientos: number;
  pendienteCentimos: number;
  pedidos: number;
  pedidosMas15Dias: number;
}>;
export type ParaPedirRead = Readonly<{
  stagingOnly: boolean;
  automaticas: false;
  accionExterna: 'NINGUNA';
  criterio: string;
  filtro: Readonly<{ estado: ParaPedirEstado; q: string | null; tercero: string | null }>;
  total: number;
  limit: number;
  offset: number;
  totalPagina: number;
  resumen: Readonly<{ movimientos: number; pendienteCentimos: number }>;
  proyeccion: Readonly<{ actualizadaEn: string; version: number; pendienteActualizacion: boolean }>;
  agrupaciones: readonly ParaPedirAgrupacion[];
  movimientos: readonly ParaPedirMovimiento[];
}>;

export class ParaPedirValidationError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function fail(status: number, code: string, message: string): never {
  throw new ParaPedirValidationError(status, code, message);
}
function calendarDay(value: string | null | undefined, field: string): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, 'VALIDATION_ERROR', `${field} debe usar YYYY-MM-DD.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, 'VALIDATION_ERROR', `${field} no es una fecha válida.`);
  return value;
}
function boundedInteger(value: string | null | undefined, field: string, min: number, max: number, fallback: number): number {
  const source = value === null || value === undefined || value === '' ? String(fallback) : value;
  if (!/^\d{1,6}$/.test(source)) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`);
  const parsed = Number(source);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`);
  return parsed;
}
function optionalText(value: string | null | undefined, field: string, max: number): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = value.trim();
  if (!parsed || parsed.length > max) fail(400, 'VALIDATION_ERROR', `${field} no es válido.`);
  return parsed;
}

/** Sólo admite filtros de lectura; no acepta identidad de documento, actor ni importes. */
export function parseParaPedirInput(raw: Readonly<Record<string, string | null | undefined>>): ParaPedirInput {
  const allowed = ['estado', 'q', 'tercero', 'limit', 'offset'];
  if (Object.keys(raw).some((key) => !allowed.includes(key))) fail(400, 'VALIDATION_ERROR', 'La consulta contiene campos no admitidos.');
  const estado = raw.estado ?? 'TODOS';
  if (!(PARA_PEDIR_ESTADOS as readonly string[]).includes(estado)) fail(400, 'VALIDATION_ERROR', 'El filtro de pedido no es válido.');
  const q = optionalText(raw.q, 'q', PARA_PEDIR_MAX_QUERY);
  const tercero = optionalText(raw.tercero, 'tercero', PARA_PEDIR_MAX_TERCERO);
  return {
    estado: estado as ParaPedirEstado,
    limit: boundedInteger(raw.limit, 'limit', 1, PARA_PEDIR_MAX_LIMIT, 50),
    offset: boundedInteger(raw.offset, 'offset', 0, PARA_PEDIR_MAX_OFFSET, 0),
    ...(q ? { q } : {}),
    ...(tercero ? { tercero } : {}),
  };
}

type JsonRecord = Record<string, unknown>;
function record(value: unknown, field: string): JsonRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return value as JsonRecord;
}
function text(value: unknown, field: string, max = 2_000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return value;
}
function nullableText(value: unknown, field: string, max = 2_000): string | null {
  return value === null ? null : text(value, field, max);
}
function integer(value: unknown, field: string, nonNegative = false): number {
  if (!Number.isSafeInteger(value) || (nonNegative && Number(value) < 0)) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return Number(value);
}
function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return value;
}
function day(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return calendarDay(value, field) ?? (() => { throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`); })();
}
function paraPedirEstado(value: unknown, field: string): ParaPedirEstado {
  if (!(PARA_PEDIR_ESTADOS as readonly string[]).includes(String(value))) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return value as ParaPedirEstado;
}
function estadoFila(value: unknown, field: string): ParaPedirEstadoFila {
  if (!['SIN_PEDIR', 'PEDIDO', 'PEDIDO_SIN_AUDITORIA', 'RECIBIDO'].includes(String(value))) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return value as ParaPedirEstadoFila;
}
function decisionHash(value: unknown, field: string): string {
  const parsed = text(value, field, 64).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(parsed)) throw new Error(`La respuesta de Para pedir no incluye ${field} verificable.`);
  return parsed;
}

/** Rechaza respuestas parciales para que una auditoría ausente no se presente como un pedido válido. */
export function parseParaPedirRead(value: unknown): ParaPedirRead {
  const raw = record(value, 'respuesta');
  if (typeof raw.stagingOnly !== 'boolean' || raw.automaticas !== false || raw.accionExterna !== 'NINGUNA') {
    throw new Error('La respuesta no confirma una lectura manual sin acciones externas.');
  }
  const filtro = record(raw.filtro, 'filtro');
  const resumen = record(raw.resumen, 'resumen');
  const proyeccion = record(raw.proyeccion, 'proyeccion');
  const agrupaciones = array(raw.agrupaciones, 'agrupaciones').map((valueForGroup, index): ParaPedirAgrupacion => {
    const group = record(valueForGroup, `agrupaciones[${index}]`);
    return {
      tercero: text(group.tercero, `agrupaciones[${index}].tercero`, PARA_PEDIR_MAX_TERCERO),
      movimientos: integer(group.movimientos, `agrupaciones[${index}].movimientos`, true),
      pendienteCentimos: integer(group.pendienteCentimos, `agrupaciones[${index}].pendienteCentimos`),
      pedidos: integer(group.pedidos, `agrupaciones[${index}].pedidos`, true),
      pedidosMas15Dias: integer(group.pedidosMas15Dias, `agrupaciones[${index}].pedidosMas15Dias`, true),
    };
  });
  const movimientos = array(raw.movimientos, 'movimientos').map((valueForMovement, index): ParaPedirMovimiento => {
    const movement = record(valueForMovement, `movimientos[${index}]`);
    const tab = movement.tab;
    if (tab !== 'COBROS' && tab !== 'PAGOS') throw new Error(`La respuesta de Para pedir no incluye movimientos[${index}].tab verificable.`);
    const pedidoRaw = movement.pedido;
    const pedido = pedidoRaw === null ? null : (() => {
      const parsed = record(pedidoRaw, `movimientos[${index}].pedido`);
      return {
        dia: day(parsed.dia, `movimientos[${index}].pedido.dia`),
        actorNombre: nullableText(parsed.actorNombre, `movimientos[${index}].pedido.actorNombre`, 300),
        diasTranscurridos: integer(parsed.diasTranscurridos, `movimientos[${index}].pedido.diasTranscurridos`, true),
      };
    })();
    const currentState = estadoFila(movement.estadoPedido, `movimientos[${index}].estadoPedido`);
    if ((currentState === 'PEDIDO') !== (pedido !== null)) throw new Error(`La respuesta de Para pedir no conserva una auditoría coherente para movimientos[${index}].pedido.`);
    const conciliarPedir = movement.conciliarPedir === null ? null : (() => {
      const parsed = record(movement.conciliarPedir, `movimientos[${index}].conciliarPedir`);
      if (currentState !== 'SIN_PEDIR') throw new Error(`La respuesta de Para pedir no puede permitir una solicitud duplicada para movimientos[${index}].`);
      return {
        rowId: text(parsed.rowId, `movimientos[${index}].conciliarPedir.rowId`, 240),
        decisionHash: decisionHash(parsed.decisionHash, `movimientos[${index}].conciliarPedir.decisionHash`),
      };
    })();
    return {
      movimientoId: text(movement.movimientoId, `movimientos[${index}].movimientoId`, 240),
      tab,
      fecha: day(movement.fecha, `movimientos[${index}].fecha`),
      concepto: text(movement.concepto, `movimientos[${index}].concepto`, 1_600),
      banco: nullableText(movement.banco, `movimientos[${index}].banco`, 320),
      cuenta: nullableText(movement.cuenta, `movimientos[${index}].cuenta`, 320),
      tercero: nullableText(movement.tercero, `movimientos[${index}].tercero`, PARA_PEDIR_MAX_TERCERO),
      grupoTercero: text(movement.grupoTercero, `movimientos[${index}].grupoTercero`, PARA_PEDIR_MAX_TERCERO),
      referenciaDocumento: nullableText(movement.referenciaDocumento, `movimientos[${index}].referenciaDocumento`, 320),
      importeCentimos: integer(movement.importeCentimos, `movimientos[${index}].importeCentimos`),
      pendienteCentimos: integer(movement.pendienteCentimos, `movimientos[${index}].pendienteCentimos`),
      motivo: text(movement.motivo, `movimientos[${index}].motivo`, 1_200),
      estadoPedido: currentState,
      pedido,
      conciliarPedir,
    };
  });
  const limit = integer(raw.limit, 'limit', true);
  if (limit < 1 || limit > PARA_PEDIR_MAX_LIMIT || movimientos.length > limit) throw new Error('El tamaño de página de Para pedir no es válido.');
  return {
    stagingOnly: raw.stagingOnly,
    automaticas: false,
    accionExterna: 'NINGUNA',
    criterio: text(raw.criterio, 'criterio', 1_200),
    filtro: {
      estado: paraPedirEstado(filtro.estado, 'filtro.estado'),
      q: filtro.q === null ? null : text(filtro.q, 'filtro.q', PARA_PEDIR_MAX_QUERY),
      tercero: filtro.tercero === null ? null : text(filtro.tercero, 'filtro.tercero', PARA_PEDIR_MAX_TERCERO),
    },
    total: integer(raw.total, 'total', true),
    limit,
    offset: integer(raw.offset, 'offset', true),
    totalPagina: integer(raw.totalPagina, 'totalPagina', true),
    resumen: { movimientos: integer(resumen.movimientos, 'resumen.movimientos', true), pendienteCentimos: integer(resumen.pendienteCentimos, 'resumen.pendienteCentimos') },
    proyeccion: {
      actualizadaEn: text(proyeccion.actualizadaEn, 'proyeccion.actualizadaEn', 80),
      version: integer(proyeccion.version, 'proyeccion.version', true),
      pendienteActualizacion: typeof proyeccion.pendienteActualizacion === 'boolean' ? proyeccion.pendienteActualizacion : (() => { throw new Error('La respuesta de Para pedir no incluye proyeccion.pendienteActualizacion verificable.'); })(),
    },
    agrupaciones,
    movimientos,
  };
}
