/**
 * Lectura (solo SELECT) de los datos que explican una cifra de Rentabilidad.
 * Base aislada io_staging_finanzas o producción expresamente habilitada solo para lectura.
 * No escribe, no recalcula y no toca la foto guardada.
 */
import { Prisma } from '@prisma/client'
import { monthSchema } from './types'
import { shiftMonth } from './engine'
import { assertRentabilidadReadConfiguration, assertRentabilidadReadIdentity } from './store'
import { codigosContratos, construirDesglose, idsFacturasRecibidas, seriesDelProducto, type DatosDesglose, type DesgloseResultado, type DesgloseTipo, type DesgloseVista } from './desglose'

async function db() {
  assertRentabilidadReadConfiguration()
  const prisma = (await import('../prisma')).prisma
  await assertRentabilidadReadIdentity(prisma)
  return prisma
}
const normCif = (v: unknown) => (v === null || v === undefined ? '' : String(v)).toUpperCase().replace(/[^A-Z0-9]/g, '')
const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : String(d ?? '')).slice(0, 10)
const numero = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

/** Misma foto que enseña la pantalla: la última proyección del mes (o la más reciente si no hay). */
export async function fotoCompleta(month: string): Promise<any | null> {
  monthSchema.parse(month)
  const prisma = await db()
  const rows = await prisma.$queryRaw<{ payload: any }[]>(Prisma.sql`
    SELECT payload FROM rentabilidad_snapshots WHERE month = ${month}
    ORDER BY (kind = 'PROYECCION') DESC, version DESC LIMIT 1`)
  return rows[0]?.payload ?? null
}

export async function leerDatos(payload: any, tipo: DesgloseTipo, clave: string, vista: DesgloseVista, month: string): Promise<DatosDesglose> {
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
  } else if (contratos.length) {
    const rows = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT DISTINCT ON (stable_key) stable_key AS codigo, payload FROM rentabilidad_versiones
      WHERE kind = 'contract' AND stable_key = ANY(${contratos}::text[]) ORDER BY stable_key, version DESC`)
    datos.versiones = rows.map(r => ({ codigo: String(r.codigo), payload: r.payload ?? {} }))
  }
  return datos
}

export async function desglose(month: string, tipo: DesgloseTipo, clave: string, vista: DesgloseVista): Promise<DesgloseResultado | null> {
  const payload = await fotoCompleta(month)
  if (!payload) return null
  const datos = await leerDatos(payload, tipo, clave, vista, month)
  return construirDesglose(payload, tipo, clave, vista, month, datos)
}
