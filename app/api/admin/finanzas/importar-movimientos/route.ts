import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import crypto from 'node:crypto'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read'
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { validateVividStatement } from '@/lib/finanzas/vivid-statement-validation'
import {
  parseSantanderXLSX,
  parseSantanderTXT,
  parseCaixaBankXLS,
  parseCaixaGuissonaCSV,
  parseBBVACSV,
  parseVividCSV,
  parseWiseXLSX,
  parseNorma43,
  detectarFormato,
  MovimientoParsed,
} from '@/lib/finanzas/parsers'
import {
  analizarCadenaSaldo,
  detectarSolapesExtracto,
  fechaCorteExtracto,
  type AnalisisCadenaSaldo,
} from '@/lib/finanzas/bank-balance-chain'
import {
  detectarComisionEnConcepto,
  presentarCategoriaHistorica,
  presentarTipoMovimientoHistorico,
  validarCategoriaNueva,
  validarTipoMovimientoNuevo,
} from '@/lib/finanzas/movement-catalog'

const AREA_IMPORTAR = 'admin.finanzas.importar'
const ROLES_LEGACY = ['CONTABILIDAD']
const MAX_ARCHIVO_BYTES = 10 * 1024 * 1024
const MAX_FORM_BYTES = MAX_ARCHIVO_BYTES
const FORMATOS_ADMITIDOS = new Set(['santander', 'caixabank', 'guissona', 'bbva', 'vivid', 'wise', 'norma43'])

type CuentaImportacion = {
  id: string
  banco: string
  saldoActual: number | null
  fechaSaldo: Date | null
  fechaCorteExtracto: Date | null
}

function jsonPrivado(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } })
}

/** Los helpers de permisos son reutilizables, pero esta ruta nunca devuelve errores cacheables. */
function denegacionPrivada(denied: Response, tipo: 'lectura' | 'escritura'): NextResponse {
  if (denied.status === 401) return jsonPrivado({ error: 'No autorizado' }, 401)
  return jsonPrivado({ error: `Sin permiso de ${tipo}` }, 403)
}

function fechaIso(fecha: Date | null | undefined): string | null {
  return fecha instanceof Date && Number.isFinite(fecha.getTime()) ? fecha.toISOString() : null
}

function serializarContinuidad(continuidad: AnalisisCadenaSaldo) {
  return {
    estado: continuidad.estado,
    puedeActualizarSaldo: continuidad.puedeActualizarSaldo,
    ultimoSaldoConocido: continuidad.ultimoSaldoConocido,
    fechaUltimoMovimiento: fechaIso(continuidad.fechaUltimoMovimiento),
    avisos: continuidad.avisos.map((aviso) => ({ ...aviso, fecha: fechaIso(aviso.fecha) })),
  }
}

function esCadena(valor: FormDataEntryValue | null): valor is string {
  return typeof valor === 'string'
}

function esNumeroCentimos(valor: unknown): valor is number {
  return typeof valor === 'number'
    && Number.isFinite(valor)
    && Math.abs(valor) <= 1_000_000_000
    && Math.abs(valor * 100 - Math.round(valor * 100)) < 1e-7
}

function movimientosValidosParaPersistir(movimientos: readonly MovimientoParsed[]): boolean {
  return movimientos.every((movimiento) => (
    movimiento.fechaOperacion instanceof Date
    && Number.isFinite(movimiento.fechaOperacion.getTime())
    && esNumeroCentimos(movimiento.importe)
    && (movimiento.saldo === null || esNumeroCentimos(movimiento.saldo))
  ))
}

function mismoDiaUtc(primera: Date, segunda: Date): boolean {
  return primera.getUTCFullYear() === segunda.getUTCFullYear()
    && primera.getUTCMonth() === segunda.getUTCMonth()
    && primera.getUTCDate() === segunda.getUTCDate()
}

/**
 * Acota el cuerpo real, incluso sin Content-Length, antes de pedir a undici que
 * interprete multipart. Nunca se llama a req.formData(): podría reservar un
 * cuerpo ilimitado antes de que comprobemos el fichero.
 */
async function leerFormDataAcotado(req: NextRequest): Promise<{ formData: FormData } | { response: NextResponse }> {
  const contentType = req.headers.get('content-type')
  if (!contentType || !/^multipart\/form-data\s*;\s*boundary=/iu.test(contentType)) {
    return { response: jsonPrivado({ error: 'Content-Type de formulario no válido' }, 400) }
  }

  const contentLength = req.headers.get('content-length')
  if (contentLength !== null) {
    if (!/^\d+$/u.test(contentLength)) return { response: jsonPrivado({ error: 'Content-Length no válido' }, 400) }
    const declarado = Number(contentLength)
    if (!Number.isSafeInteger(declarado)) return { response: jsonPrivado({ error: 'Content-Length no válido' }, 400) }
    if (declarado > MAX_FORM_BYTES) return { response: jsonPrivado({ error: 'Formulario demasiado grande' }, 413) }
  }

  const reader = req.body?.getReader()
  if (!reader) return { response: jsonPrivado({ error: 'Formulario de importación no válido' }, 400) }

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const lectura = await reader.read()
      if (lectura.done) break
      if (!lectura.value) continue
      total += lectura.value.byteLength
      if (total > MAX_FORM_BYTES) {
        try { await reader.cancel('Formulario demasiado grande') } catch { /* el flujo ya falló o cerró */ }
        return { response: jsonPrivado({ error: 'Formulario demasiado grande' }, 413) }
      }
      chunks.push(lectura.value)
    }
  } catch {
    return { response: jsonPrivado({ error: 'No se pudo leer el formulario de importación' }, 400) }
  } finally {
    try { reader.releaseLock() } catch { /* no afecta a la respuesta */ }
  }

  let formData: FormData
  try {
    // El Request nuevo sólo ve bytes ya acotados y conserva exactamente el boundary recibido.
    const boundedRequest = new Request(req.url, {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: Buffer.concat(chunks, total),
    })
    formData = await boundedRequest.formData()
  } catch {
    return { response: jsonPrivado({ error: 'Formulario de importación no válido' }, 400) }
  }
  return { formData }
}

/** Lee un formulario pequeño y explícito antes de reservar memoria para el fichero. */
async function leerFormularioImportacion(req: NextRequest): Promise<
  | { ok: true; file: File; bancoManual: string | null; cuentaId: string | null }
  | { ok: false; response: NextResponse }
> {
  const resultado = await leerFormDataAcotado(req)
  if ('response' in resultado) return { ok: false, response: resultado.response }
  const { formData } = resultado

  const claves = Array.from(formData.keys())
  if (claves.length > 3 || claves.some((clave) => !['archivo', 'banco', 'cuentaId'].includes(clave))) {
    return { ok: false, response: jsonPrivado({ error: 'El formulario contiene campos no admitidos' }, 400) }
  }

  const archivo = formData.get('archivo')
  if (!archivo || typeof archivo !== 'object' || !('arrayBuffer' in archivo) || !('size' in archivo)) {
    return { ok: false, response: jsonPrivado({ error: 'No se ha proporcionado un archivo válido' }, 400) }
  }
  const file = archivo as File
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_ARCHIVO_BYTES) {
    return { ok: false, response: jsonPrivado({ error: 'El archivo debe tener entre 1 byte y 10 MB' }, 413) }
  }
  if (!file.name || file.name.length > 180 || /[\u0000-\u001f\\/]/.test(file.name)) {
    return { ok: false, response: jsonPrivado({ error: 'Nombre de archivo no válido' }, 400) }
  }

  const banco = formData.get('banco')
  const cuentaId = formData.get('cuentaId')
  if (banco !== null && (!esCadena(banco) || banco.length > 32)) {
    return { ok: false, response: jsonPrivado({ error: 'Formato bancario no válido' }, 400) }
  }
  if (cuentaId !== null && (!esCadena(cuentaId) || cuentaId.length > 128)) {
    return { ok: false, response: jsonPrivado({ error: 'Identificador de cuenta no válido' }, 400) }
  }

  return {
    ok: true,
    file,
    bancoManual: typeof banco === 'string' && banco ? banco : null,
    cuentaId: typeof cuentaId === 'string' && cuentaId ? cuentaId : null,
  }
}

function parsearMovimientos(filename: string, buffer: Buffer, bancoManual: string | null): { formato: string; movimientos: MovimientoParsed[] } | { error: string; codigo?: string } {
  const formato = (bancoManual || detectarFormato(filename, buffer.toString('utf-8').substring(0, 500))).toLowerCase()
  if (!FORMATOS_ADMITIDOS.has(formato)) return { error: `Formato no reconocido: ${formato}` }

  switch (formato) {
    case 'santander': {
      if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        return { formato, movimientos: parseSantanderXLSX(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]) }
      }
      return { formato, movimientos: parseSantanderTXT(buffer.toString('utf-8')) }
    }
    case 'caixabank': {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      return { formato, movimientos: parseCaixaBankXLS(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]) }
    }
    case 'guissona': return { formato, movimientos: parseCaixaGuissonaCSV(buffer.toString('utf-8')) }
    case 'bbva': {
      if (filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls')) {
        const workbook = XLSX.read(buffer, { type: 'buffer' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        return { formato, movimientos: parseBBVACSV(XLSX.utils.sheet_to_csv(sheet)) }
      }
      return { formato, movimientos: parseBBVACSV(buffer.toString('utf-8')) }
    }
    case 'vivid': {
      const contenido = buffer.toString('utf-8')
      const validacion = validateVividStatement(contenido)
      if (validacion.ok === false) return { error: validacion.error, codigo: validacion.code }
      return { formato, movimientos: parseVividCSV(contenido) }
    }
    case 'wise': {
      const workbook = XLSX.read(buffer, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      return { formato, movimientos: parseWiseXLSX(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][]) }
    }
    case 'norma43': return { formato, movimientos: parseNorma43(buffer.toString('utf-8')) }
  }
}

function claveMovimiento(fecha: Date, importe: number, concepto: string): string {
  return `${fecha.toISOString().slice(0, 10)}|${importe.toFixed(2)}|${concepto.toLocaleLowerCase('es-ES').replace(/\s+/g, ' ').trim()}`
}

/**
 * El hash legado era global aunque un extracto idéntico es legítimo en dos
 * cuentas. Las filas B3 se aíslan por cuenta sin reescribir ningún histórico.
 */
function hashMovimientoCuenta(cuentaId: string, hashParser: string): string {
  return crypto.createHash('sha256').update(`B3|${cuentaId}|${hashParser}`).digest('hex')
}

function esDestinoFinancieroOComision(categoria: unknown, tipo: unknown): boolean {
  const categoriaNueva = validarCategoriaNueva(categoria)
  const tipoNuevo = tipo === null ? null : validarTipoMovimientoNuevo(tipo)
  return (categoriaNueva.ok && categoriaNueva.valor === 'Gastos Financieros')
    || (categoriaNueva.ok && /^Comisiones /u.test(categoriaNueva.valor))
    || (tipoNuevo !== null && tipoNuevo.ok && tipoNuevo.valor === 'Comisión')
}

/**
 * B3 sólo aplica reglas a lo insertado. Una palabra "comisión" sin importe
 * positivo (incluido 0,00 y -0) no puede arrastrar una regla financiera; una
 * compra normal sí puede seguir una regla no financiera aunque exista otra regla
 * histórica de gastos financieros.
 */
async function aplicarReglasImputacion(idsNuevos: string[]): Promise<number> {
  if (idsNuevos.length === 0) return 0
  const reglas = await prisma.reglaImputacion.findMany({ where: { activa: true }, orderBy: { confianza: 'desc' } })
  if (reglas.length === 0) return 0
  const movimientos = await prisma.movimientoBancario.findMany({
    where: { id: { in: idsNuevos }, categoria: null },
    select: { id: true, concepto: true },
  })
  let aplicadas = 0
  for (const movimiento of movimientos) {
    const comision = detectarComisionEnConcepto(movimiento.concepto)
    for (const regla of reglas) {
      if (!movimiento.concepto.toLocaleLowerCase('es-ES').includes(regla.patron.toLocaleLowerCase('es-ES'))) continue
      if (comision.motivo !== 'SIN_TEXTO_COMISION' && !comision.esComisionPositiva
        && esDestinoFinancieroOComision(regla.imputacion, regla.tipoPago)) continue

      const categoria = validarCategoriaNueva(regla.imputacion)
      const tipoPago = regla.tipoPago === null ? null : validarTipoMovimientoNuevo(regla.tipoPago)
      if (categoria.ok === false || (tipoPago !== null && tipoPago.ok === false)) continue
      const tipoPagoCanonico = tipoPago === null ? null : (tipoPago as Extract<typeof tipoPago, { ok: true }>).valor
      await prisma.movimientoBancario.update({
        where: { id: movimiento.id },
        data: { categoria: categoria.valor, tipoPago: tipoPagoCanonico },
      })
      await prisma.reglaImputacion.update({ where: { id: regla.id }, data: { vecesUsada: { increment: 1 } } })
      aplicadas++
      break
    }
  }
  return aplicadas
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') return jsonPrivado({ error: 'No autorizado' }, 401)
  const denied = await checkAdminAreaWrite(AREA_IMPORTAR, ROLES_LEGACY, session)
  if (denied) return denegacionPrivada(denied, 'escritura')
  if (req.headers.get('origin') !== req.nextUrl.origin) return jsonPrivado({ error: 'Origen de la solicitud no válido' }, 403)

  const formulario = await leerFormularioImportacion(req)
  if (formulario.ok === false) return formulario.response

  try {
    // La verificación fail-closed ocurre antes de cualquier create/update de B3.
    await assertFinanceRuntimeReady()

    const buffer = Buffer.from(await formulario.file.arrayBuffer())
    if (buffer.byteLength > MAX_ARCHIVO_BYTES) return jsonPrivado({ error: 'El archivo supera el límite permitido' }, 413)
    const parseado = parsearMovimientos(formulario.file.name, buffer, formulario.bancoManual)
    if ('error' in parseado) return jsonPrivado({ error: parseado.error, ...(parseado.codigo ? { codigo: parseado.codigo } : {}) }, 400)
    if (parseado.movimientos.length === 0) return jsonPrivado({ error: 'No se pudieron extraer movimientos del archivo' }, 400)
    // Ninguna fila parcialmente válida llega a DML: NaN nunca se sustituye por 0.
    if (!movimientosValidosParaPersistir(parseado.movimientos)) {
      return jsonPrivado({ error: 'El extracto contiene fecha, importe o saldo no válido para céntimos exactos' }, 400)
    }

    const bancoMap: Record<string, string> = {
      santander: 'Santander', caixabank: 'CaixaBank', bbva: 'BBVA', guissona: 'Caixa Guissona', vivid: 'Vivid', wise: 'Wise',
    }
    const bancoEsperado = bancoMap[parseado.formato]
    let cuenta: CuentaImportacion | null = null
    if (formulario.cuentaId) {
      cuenta = await (prisma.cuentaBancaria as any).findUnique({ where: { id: formulario.cuentaId } }) as CuentaImportacion | null
      // Norma 43 no identifica banco: permanece deliberadamente neutral.
      if (cuenta && bancoEsperado && cuenta.banco !== bancoEsperado) {
        return jsonPrivado({ error: 'La cuenta indicada no corresponde al formato bancario del extracto' }, 400)
      }
    } else if (bancoEsperado) {
      const candidatas = await (prisma.cuentaBancaria as any).findMany({
        where: { banco: bancoEsperado, activa: true },
        take: 2,
      }) as CuentaImportacion[]
      if (candidatas.length > 1) return jsonPrivado({ error: 'Hay varias cuentas activas para este banco; indique cuentaId' }, 400)
      cuenta = candidatas[0] ?? null
    }
    if (!cuenta) return jsonPrivado({ error: 'No se pudo determinar la cuenta bancaria' }, 400)

    const fechas = parseado.movimientos.map((movimiento) => movimiento.fechaOperacion).filter((fecha) => fecha instanceof Date && Number.isFinite(fecha.getTime()))
    if (fechas.length === 0) return jsonPrivado({ error: 'El extracto no contiene fechas de operación válidas' }, 400)
    const fechaMin = new Date(Math.min(...fechas.map((fecha) => fecha.getTime())))
    const fechaMax = new Date(Math.max(...fechas.map((fecha) => fecha.getTime())))

    const [historicos, puentes] = await Promise.all([
      prisma.movimientoBancario.findMany({
        where: { cuentaId: cuenta.id, fechaOperacion: { gte: fechaMin, lte: fechaMax } },
        select: { fechaOperacion: true, importe: true, saldo: true, concepto: true, referencia: true, hashUnico: true },
      }),
      prisma.movimientoBancario.findMany({
        where: { cuentaId: cuenta.id, fechaOperacion: { lt: fechaMin }, saldo: { not: null } },
        orderBy: { fechaOperacion: 'desc' },
        take: 2,
        select: { fechaOperacion: true, saldo: true },
      }),
    ])

    // Dos saldos posibles del último día anterior no proporcionan secuencia intradía.
    const puente = puentes.length > 1 && mismoDiaUtc(puentes[0].fechaOperacion, puentes[1].fechaOperacion)
      ? null
      : puentes[0] ?? null

    // Los parsers actuales no exponen una secuencia intradía fiable: no se inventa con el id o el concepto.
    const cadenaEntrada = parseado.movimientos.map((movimiento) => ({
      ...movimiento,
      ordenBancario: typeof (movimiento as any).ordenBancario === 'number' ? (movimiento as any).ordenBancario : null,
    }))
    const continuidad = analizarCadenaSaldo(
      cadenaEntrada,
      puente?.saldo === null || puente?.saldo === undefined ? null : { fecha: puente.fechaOperacion, saldo: puente.saldo },
    )
    const solapes = detectarSolapesExtracto(cadenaEntrada, historicos)

    // Sólo el hash de esta cuenta detiene una inserción. Se aceptan hashes legacy
    // sólo si pertenecen a esta cuenta, y nunca bloquean otra cuenta.
    const hashesExistentes = new Set(historicos.map((movimiento) => movimiento.hashUnico))
    const posiblesIguales = new Map<string, number>()
    for (const movimiento of parseado.movimientos) {
      const clave = claveMovimiento(movimiento.fechaOperacion, movimiento.importe, movimiento.concepto)
      posiblesIguales.set(clave, (posiblesIguales.get(clave) || 0) + 1)
    }

    let insertados = 0
    let duplicadosHash = 0
    const errores: string[] = []
    const idsNuevos: string[] = []
    for (const movimiento of parseado.movimientos) {
      const hashCuenta = hashMovimientoCuenta(cuenta.id, movimiento.hashUnico)
      if (hashesExistentes.has(movimiento.hashUnico) || hashesExistentes.has(hashCuenta)) {
        duplicadosHash++
        continue
      }
      try {
        const creado = await prisma.movimientoBancario.create({
          data: {
            cuentaId: cuenta.id,
            fechaOperacion: movimiento.fechaOperacion,
            fechaValor: movimiento.fechaValor,
            concepto: movimiento.concepto,
            importe: movimiento.importe,
            saldo: movimiento.saldo,
            referencia: movimiento.referencia,
            codigoOperacion: movimiento.codigoOperacion,
            infoAdicional: movimiento.infoAdicional,
            tercero: movimiento.tercero,
            hashUnico: hashCuenta,
            origenArchivo: formulario.file.name,
          },
          select: { id: true },
        })
        idsNuevos.push(creado.id)
        insertados++
        hashesExistentes.add(hashCuenta)
      } catch (error: any) {
        if (error?.code === 'P2002') duplicadosHash++
        else errores.push(`No se pudo conservar un movimiento del ${fechaIso(movimiento.fechaOperacion) || 'extracto'}`)
      }
    }

    const reglasAplicadas = await aplicarReglasImputacion(idsNuevos)
    const cortePropuesto = fechaCorteExtracto(parseado.movimientos)
    let fechaCorteResultante = cuenta.fechaCorteExtracto instanceof Date ? cuenta.fechaCorteExtracto : null
    let saldoActualizado = false

    // Las filas ya conservadas se auditan, pero una inserción parcial no acredita
    // cobertura: no se publica éxito ni se mueve corte/saldo.
    if (errores.length === 0 && cortePropuesto) {
      // Corte y saldo se protegen independientemente: una carrera sólo puede
      // conservar el valor más reciente, nunca retrocederlo.
      await (prisma.cuentaBancaria as any).updateMany({
        where: {
          id: cuenta.id,
          OR: [
            { fechaCorteExtracto: null },
            { fechaCorteExtracto: { lt: cortePropuesto } },
          ],
        },
        data: { fechaCorteExtracto: cortePropuesto },
      })

      if (continuidad.puedeActualizarSaldo && continuidad.ultimoSaldoConocido !== null) {
        const saldo = await (prisma.cuentaBancaria as any).updateMany({
          where: {
            id: cuenta.id,
            OR: [
              { fechaSaldo: null },
              { fechaSaldo: { lt: cortePropuesto } },
            ],
          },
          data: { saldoActual: continuidad.ultimoSaldoConocido, fechaSaldo: cortePropuesto },
        })
        saldoActualizado = saldo.count > 0
      }

      const final = await (prisma.cuentaBancaria as any).findUnique({
        where: { id: cuenta.id },
        select: { fechaCorteExtracto: true },
      }) as Pick<CuentaImportacion, 'fechaCorteExtracto'> | null
      fechaCorteResultante = final?.fechaCorteExtracto instanceof Date ? final.fechaCorteExtracto : fechaCorteResultante
    }

    const fechaPrimerMov = new Date(Math.min(...fechas.map((fecha) => fecha.getTime())))
    const fechaUltimoMov = new Date(Math.max(...fechas.map((fecha) => fecha.getTime())))
    await prisma.importacionExtracto.create({
      data: {
        cuentaId: cuenta.id,
        nombreArchivo: formulario.file.name,
        // B3 no publica el extracto ni realiza tráfico externo; se preserva el registro sin URL pública.
        archivoUrl: null,
        formato: parseado.formato,
        movImportados: insertados,
        movDuplicados: duplicadosHash,
        fechaPrimerMov,
        fechaUltimoMov,
      },
    })

    const continuidadSerializada = serializarContinuidad(continuidad)
    return jsonPrivado({
      success: errores.length === 0,
      resumen: {
        archivo: formulario.file.name,
        formato: parseado.formato,
        banco: cuenta.banco,
        totalParseados: parseado.movimientos.length,
        insertados,
        duplicadosHash,
        solapesDetectados: solapes.length,
        posiblesMovimientosIgualesEnArchivo: Array.from(posiblesIguales.values()).filter((cantidad) => cantidad > 1).reduce((total, cantidad) => total + cantidad, 0),
        errores: errores.length,
        reglasAplicadas,
        saldoActualizado,
      },
      avisosSaldo: continuidadSerializada.avisos,
      continuidadSaldo: continuidadSerializada,
      fechaCorteExtracto: fechaIso(fechaCorteResultante),
      errores: errores.length ? errores.slice(0, 10) : undefined,
    }, errores.length === 0 ? 200 : 207)
  } catch (error: any) {
    const codigo = error instanceof Error ? error.message : 'IMPORTACION_FALLIDA'
    const status = codigo === 'STAGING_ISOLATION_REQUIRED' ? 503 : 500
    const mensaje = codigo === 'STAGING_ISOLATION_REQUIRED' ? 'Staging aislado no verificado' : 'No se pudo importar el extracto'
    return jsonPrivado({ error: mensaje }, status)
  }
}

// GET legado de sólo lectura; la whitelist B3 no habilita ninguna mutación adicional en esta ruta.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || session.user.userType !== 'admin') return jsonPrivado({ error: 'No autorizado' }, 401)
    const denied = await checkAdminAreaRead(AREA_IMPORTAR, ROLES_LEGACY, session)
    if (denied) return denegacionPrivada(denied, 'lectura')

    const { searchParams } = new URL(req.url)
    const cuentaId = searchParams.get('cuentaId')
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')
    const categoria = searchParams.get('categoria')
    const conciliado = searchParams.get('conciliado')
    const page = Math.max(1, Math.min(100000, Number.parseInt(searchParams.get('page') || '1', 10) || 1))
    const limit = Math.max(1, Math.min(100, Number.parseInt(searchParams.get('limit') || '50', 10) || 50))
    const where: any = {}
    if (cuentaId) where.cuentaId = cuentaId
    if (desde) where.fechaOperacion = { ...where.fechaOperacion, gte: new Date(desde) }
    if (hasta) where.fechaOperacion = { ...where.fechaOperacion, lte: new Date(hasta) }
    if (categoria) where.categoria = categoria
    if (conciliado === 'true') where.conciliado = true
    if (conciliado === 'false') where.conciliado = false
    const [movimientos, total] = await Promise.all([
      prisma.movimientoBancario.findMany({ where, include: { cuenta: true, factura: true, gasto: true }, orderBy: { fechaOperacion: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.movimientoBancario.count({ where }),
    ])
    return jsonPrivado({
      movimientos: movimientos.map((movimiento: any) => normalizarMovimientoLectura(movimiento)),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    })
  } catch {
    return jsonPrivado({ error: 'No se pudieron consultar los movimientos' }, 500)
  }
}

function normalizarMovimientoLectura(movimiento: any) {
  const categoria = presentarCategoriaHistorica(movimiento.categoria)
  const tipoPago = presentarTipoMovimientoHistorico(movimiento.tipoPago)
  const metodoPago = presentarTipoMovimientoHistorico(movimiento.metodoPago)
  return {
    ...movimiento,
    categoria: categoria.valor,
    tipoPago: tipoPago.valor,
    metodoPago: metodoPago.valor,
    catalogo: {
      categoriaOriginal: categoria.valorOriginal,
      categoriaEsLegacy: categoria.esLegacy,
      tipoPagoOriginal: tipoPago.valorOriginal,
      tipoPagoEsLegacy: tipoPago.esLegacy,
      metodoPagoOriginal: metodoPago.valorOriginal,
      metodoPagoEsLegacy: metodoPago.esLegacy,
    },
  }
}
