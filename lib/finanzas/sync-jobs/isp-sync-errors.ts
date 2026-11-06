/** Technical metadata only: no query text, invoice payloads, URLs or credentials. */
export type SyncFailureDetail = {
  code: string
  name: string
  operation: string
  sqlState: string | null
  constraint: string | null
  message: string
}
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,119}$/
const CODE = /^[A-Z0-9_]{2,64}$/
const OPERATIONS = new Set(['Factura.findUnique','Factura.create','Factura.update','FacturaEmitida.findUnique','FacturaEmitida.create','FacturaEmitida.update','B7.create','DocumentoConciliable.findFirst','DocumentoConciliable.create'])
const ERROR_NAMES = new Set(['PrismaClientKnownRequestError','PrismaClientUnknownRequestError','PrismaClientValidationError','PrismaClientInitializationError','DatabaseError','Error'])
const MESSAGES: Record<string,string> = {
  P2000: 'Un campo supera la longitud permitida en la base de datos.',
  P2002: 'Ya existe un registro con la misma clave única.',
  P2003: 'La referencia a otro registro no existe o no es válida.',
  P2004: 'La base de datos ha rechazado una restricción de integridad.',
  P2010: 'La base de datos ha rechazado la operación SQL.',
  P2028: 'La transacción ha caducado o se ha cerrado.',
  P2034: 'Conflicto de concurrencia; la operación puede reintentarse.',
  P1001: 'No se puede conectar con la base de datos.',
  P1002: 'La conexión con la base de datos ha agotado su tiempo.',
  ISP_VALIDATION_ERROR: 'Los argumentos de persistencia no cumplen el esquema Prisma.',
  ISP_DATABASE_ERROR: 'Fallo de persistencia de la factura ISP; se conserva la operación que falló.',
}

export function describeIspDatabaseFailure(error: unknown, operation: string): SyncFailureDetail {
  const e = error && typeof error === 'object' ? error as Record<string,unknown> : {}
  const meta = e.meta && typeof e.meta === 'object' ? e.meta as Record<string,unknown> : {}
  // These strings are scanned only for technical identifiers; they are never stored.
  const original = [e.message,meta.database_error,meta.message].filter(x=>typeof x==='string').join('\n')
  const name = typeof e.name==='string' && ERROR_NAMES.has(e.name) ? e.name : 'Error'
  const code = typeof e.code==='string' && CODE.test(e.code) ? e.code : name==='PrismaClientValidationError' ? 'ISP_VALIDATION_ERROR' : 'ISP_DATABASE_ERROR'
  const candidate = typeof e.constraint==='string' ? e.constraint : original.match(/(?:check |unique |foreign key )?constraint\s+["']([A-Za-z_][A-Za-z0-9_]{0,119})["']/i)?.[1] ?? original.match(/constraint:\s*Some\("([A-Za-z_][A-Za-z0-9_]{0,119})"\)/)?.[1]
  const constraint = candidate && IDENTIFIER.test(candidate) ? candidate : null
  const stateCandidate = [e.sqlState,meta.code,e.code].find(x=>typeof x==='string' && /^[0-9]{2}[0-9A-Z]{3}$/.test(x))
  const sqlState = typeof stateCandidate==='string' ? stateCandidate : original.match(/(?:code|SQLSTATE)\s*[:=]\s*["']?([0-9]{2}[0-9A-Z]{3})/)?.[1] ?? null
  const op = OPERATIONS.has(operation) ? operation : 'ISP.persistence'
  const field = name==='PrismaClientValidationError' ? original.match(/Argument [`']([A-Za-z_][A-Za-z0-9_]{0,80})[`'] is missing/)?.[1] : null
  const message = (MESSAGES[code] ?? (sqlState==='23514' ? 'Restricción de integridad incumplida.' : 'Fallo de persistencia de la factura ISP.')) + (constraint ? ` Restricción: ${constraint}.` : '') + (field ? ` Falta el argumento ${field}.` : '')
  return {code,name,operation:op,sqlState,constraint,message}
}

/** A provider may attach only an already-sanitized diagnostic. Revalidate at persistence. */
export function syncFailureDetail(error: unknown): SyncFailureDetail | null {
  if (!error || typeof error!=='object' || !('diagnostic' in error)) return null
  const v = (error as {diagnostic:unknown}).diagnostic
  if (!v || typeof v!=='object') return null
  const d = v as Record<string,unknown>
  if (typeof d.code!=='string' || !CODE.test(d.code) || typeof d.name!=='string' || !ERROR_NAMES.has(d.name)
    || typeof d.operation!=='string' || (!OPERATIONS.has(d.operation) && d.operation!=='ISP.persistence')
    || (d.constraint!==null && (typeof d.constraint!=='string' || !IDENTIFIER.test(d.constraint)))
    || (d.sqlState!==null && (typeof d.sqlState!=='string' || !/^[0-9A-Z]{5}$/.test(d.sqlState)))
    || typeof d.message!=='string' || d.message.length>500 || /[\r\n<>]|https?:|bearer|token|@/i.test(d.message)) return null
  return {code:d.code,name:d.name,operation:d.operation,sqlState:d.sqlState as string|null,constraint:d.constraint as string|null,message:d.message}
}
