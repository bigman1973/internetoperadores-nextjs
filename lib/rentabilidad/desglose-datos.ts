/**
 * Lectura (solo SELECT) de los datos que explican una cifra de Rentabilidad.
 * Misma protección que el resto del módulo: solo la base aislada de staging.
 * No escribe, no recalcula y no toca la foto guardada.
 */
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { monthSchema, RentabilidadError } from './types'
import { shiftMonth } from './engine'
import { assertRentabilidadConfiguration } from './store'
import { codigosContratos, construirDesglose, idsFacturasRecibidas, seriesDelProducto, type DatosDesglose, type DesgloseTipo, type DesgloseVista } from './desglose'
import { conFoto, fechaFoto, metadataFoto, type DesgloseConFoto, type FotoMetadata } from './desglose-foto'

async function db() {
  assertRentabilidadConfiguration()
  const prisma = (await import('../prisma')).prisma
  const rows = await prisma.$queryRaw<{ db: string; usuario: string }[]>(Prisma.sql`SELECT current_database() AS db, current_user AS usuario LIMIT 1`)
  if (rows.length !== 1 || rows[0].db !== 'io_staging_finanzas' || rows[0].usuario !== 'io_staging_finanzas') throw new RentabilidadError('RENTABILIDAD_STAGING_REQUIRED', 404)
  return prisma
}
const normCif = (v: unknown) => (v === null || v === undefined ? '' : String(v)).toUpperCase().replace(/[^A-Z0-9]/g, '')
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d ?? '')).slice(0, 10)
const numero = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

type FotoRow = FotoMetadata & { payload: any }
/** Un id solicitado jamás cae a la última foto, ni siquiera si pertenece a otro mes. */
export async function leerFoto(month: string, snapshotId?: string): Promise<{ payload: any; snapshot: FotoMetadata } | null> {
  monthSchema.parse(month)
  if (snapshotId !== undefined) z.string().uuid().parse(snapshotId)
  const prisma = await db()
  const rows = snapshotId !== undefined
    ? await prisma.$queryRaw<FotoRow[]>(Prisma.sql`
      SELECT id, month, version, kind, source_hash AS "sourceHash", created_at AS "createdAt", payload
      FROM rentabilidad_snapshots WHERE id = ${snapshotId} AND month = ${month} LIMIT 1`)
    : await prisma.$queryRaw<FotoRow[]>(Prisma.sql`
    SELECT id, month, version, kind, source_hash AS "sourceHash", created_at AS "createdAt", payload
    FROM rentabilidad_snapshots WHERE month = ${month}
    ORDER BY (kind = 'PROYECCION') DESC, version DESC LIMIT 1`)
  const row = rows[0]
  if (!row?.payload || row.month !== month || (snapshotId !== undefined && row.id !== snapshotId)) {
    if (snapshotId !== undefined) throw new RentabilidadError('FOTO_DESGLOSE_NO_DISPONIBLE', 404)
    return null
  }
  return { payload: row.payload, snapshot: metadataFoto(row) }
}

/** Compatibilidad para callers antiguos que solo necesitan el payload completo. */
export async function fotoCompleta(month: string): Promise<any | null> {
  return (await leerFoto(month))?.payload ?? null
}

export async function leerDatos(payload: any, tipo: DesgloseTipo, clave: string, vista: DesgloseVista, month: string, createdAt?: unknown): Promise<DatosDesglose> {
  const datos: DatosDesglose = { lineas: [], emitidas: [], recibidas: [], series: [], versiones: [] }
  const prisma = await db()
  const contratos = codigosContratos(payload, tipo, clave)
  if (vista === 'facturado') {
    if (contratos.length) {
      const desde = shiftMonth(month, -11)
      const lineas = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT codigo_contrato_isp AS contrato, fecha_fuente AS fecha, mes_servicio AS mes, importe_base_decimal AS base,
               payload->>'concept' AS concepto, payload->>'tariff' AS tarifa, payload->>'cif' AS cif, payload->'periodMonths' AS "periodMonths"
        FROM rentabilidad_lineas
        WHERE codigo_contrato_isp = ANY(${contratos}::text[]) AND mes_servicio <= ${month} AND mes_servicio >= ${desde}`)
      datos.lineas = lineas.map(l => ({ contrato: String(l.contrato), fecha: iso(l.fecha), mes: String(l.mes), base: numero(l.base), concepto: String(l.concepto ?? ''), tarifa: String(l.tarifa ?? ''), cif: normCif(l.cif) || null, periodMonths: l.periodMonths }))
      const cifs = Array.from(new Set(datos.lineas.map(l => l.cif).filter((x): x is string => !!x)))
      if (cifs.length && datos.lineas.length) {
        const f0 = datos.lineas.reduce((m, l) => (l.fecha < m ? l.fecha : m), '9999-12-31'), f1 = datos.lineas.reduce((m, l) => (l.fecha > m ? l.fecha : m), '0000-01-01')
        const em = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT cif, fecha, num_factura, base FROM facturas_emitidas
          WHERE regexp_replace(upper(cif), '[^A-Z0-9]', '', 'g') = ANY(${cifs}::text[])
            AND fecha >= ${f0}::date AND fecha < (${f1}::date + 1) AND num_factura IS NOT NULL`)
        datos.emitidas = em.map(e => ({ cif: normCif(e.cif) || null, fecha: iso(e.fecha), numero: String(e.num_factura), base: numero(e.base) }))
      }
    }
    if (tipo === 'producto') {
      const series = seriesDelProducto(payload, clave)
      if (series.length) {
        const ini = `${month}-01`
        const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
          SELECT serie_factura AS serie, numero_documento AS numero, fecha, nombre_completo AS cliente, base FROM facturas
          WHERE serie_factura = ANY(${series}::text[]) AND fecha >= ${ini}::date AND fecha < (${ini}::date + interval '1 month')`)
        datos.series = rows.map(r => ({ serie: String(r.serie), numero: r.numero ? String(r.numero) : null, fecha: iso(r.fecha), cliente: r.cliente ? String(r.cliente) : null, base: numero(r.base) }))
      }
    }
  } else if (vista === 'coste') {
    const ids = idsFacturasRecibidas(payload, tipo, clave)
    if (ids.length) {
      const rows = await prisma.$queryRaw<any[]>(Prisma.sql`SELECT id, proveedor, num_factura, fecha, base, concepto FROM facturas_recibidas WHERE id = ANY(${ids}::text[])`)
      datos.recibidas = rows.map(r => ({ id: String(r.id), proveedor: r.proveedor ?? null, numero: r.num_factura ?? null, fecha: r.fecha ? iso(r.fecha) : null, base: r.base === null ? null : numero(r.base), concepto: r.concepto ?? null }))
    }
  } else if (contratos.length && fechaFoto(createdAt)) {
    // created_at existe en el almacén de versiones (TIMESTAMP(3)); sin fecha, sin dato.
    const corte = fechaFoto(createdAt)!
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT ON (stable_key) stable_key AS codigo, payload FROM rentabilidad_versiones
      WHERE kind = 'contract' AND stable_key = ANY(${contratos}::text[]) AND created_at <= ${corte}::timestamp
      ORDER BY stable_key, version DESC LIMIT ${contratos.length}`)
    datos.versiones = rows.map(r => ({ codigo: String(r.codigo), payload: r.payload ?? {} }))
  }
  return datos
}

export async function desglose(month: string, tipo: DesgloseTipo, clave: string, vista: DesgloseVista, snapshotId?: string): Promise<DesgloseConFoto | null> {
  const foto = await leerFoto(month, snapshotId)
  if (!foto) return null
  const datos = await leerDatos(foto.payload, tipo, clave, vista, month, foto.snapshot.createdAt)
  return conFoto(construirDesglose(foto.payload, tipo, clave, vista, month, datos), foto.snapshot)
}
