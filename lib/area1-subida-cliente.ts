/**
 * Área 1 · Lector por cliente de la Subida de precios (dueña: integradora / Área 2).
 * Contrato acordado con la integradora (25/11):
 *  - Solo SELECT del último escenario APROBADO de area2_subida_escenarios (estado_aprobacion, no «estado»).
 *  - Usa resultado->'precios' y resultado->'avisos' (FilaPrecio / FilaAviso de lib/subida-precios/export.ts),
 *    sin importar nada de lib/subida-precios.
 *  - Campos permitidos: avisos (cliente, cif, subidaMes, subidaAnio, pctMedio, fechaLimiteAviso, fechaEfecto) y
 *    precios (contrato, producto, precioHoyMes, precioNuevoMes, subidaPct). NUNCA costeMes ni márgenes:
 *    la proyección se hace en SQL para que esos campos no salgan de la BD.
 *  - Se cruza primero por código de contrato ISP y después por CIF. Si un contrato no aparece, no tiene subida.
 */
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export type FilaPrecioSubida = { contrato: string; producto: string; cliente: string; cif: string; precioHoyMes: number; precioNuevoMes: number; subidaPct: number }
export type FilaAvisoSubida = { cliente: string; cif: string; subidaMes: number; subidaAnio: number; pctMedio: number; fechaLimiteAviso: string; fechaEfecto: string }
export type SubidaCliente = {
  fechaEfecto: string | null
  fechaLimiteAviso: string | null
  pctMedio: number | null
  subidaMes: number
  subidaAnio: number | null
  cruce: 'CONTRATO' | 'CIF'
  contratos: Array<{ contrato: string; producto: string; precioHoyMes: number; precioNuevoMes: number; subidaPct: number }>
}

export const CAMPOS_PRECIO = ['contrato', 'producto', 'cliente', 'cif', 'precioHoyMes', 'precioNuevoMes', 'subidaPct'] as const
export const CAMPOS_AVISO = ['cliente', 'cif', 'subidaMes', 'subidaAnio', 'pctMedio', 'fechaLimiteAviso', 'fechaEfecto'] as const

export const normCif = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '') : '')
const n = (v: unknown) => { const x = typeof v === 'number' ? v : Number(v); return Number.isFinite(x) ? x : 0 }
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

/** Lógica pura: dado el resultado congelado (ya proyectado) y los datos de la ficha, devuelve la subida del cliente. */
export function extraerSubidaCliente(
  datos: { precios: unknown[]; avisos: unknown[]; fechaEfecto?: string | null },
  ficha: { codigosContrato: string[]; cif: string | null },
): SubidaCliente | null {
  const precios: FilaPrecioSubida[] = (Array.isArray(datos.precios) ? datos.precios : []).map((p: any) => ({
    contrato: s(p?.contrato), producto: s(p?.producto), cliente: s(p?.cliente), cif: s(p?.cif),
    precioHoyMes: n(p?.precioHoyMes), precioNuevoMes: n(p?.precioNuevoMes), subidaPct: n(p?.subidaPct),
  }))
  const avisos: FilaAvisoSubida[] = (Array.isArray(datos.avisos) ? datos.avisos : []).map((a: any) => ({
    cliente: s(a?.cliente), cif: s(a?.cif), subidaMes: n(a?.subidaMes), subidaAnio: n(a?.subidaAnio), pctMedio: n(a?.pctMedio),
    fechaLimiteAviso: s(a?.fechaLimiteAviso), fechaEfecto: s(a?.fechaEfecto),
  }))
  const codigos = new Set(ficha.codigosContrato.map((c) => c.trim()).filter(Boolean))
  const cif = normCif(ficha.cif)

  let cruce: SubidaCliente['cruce'] = 'CONTRATO'
  let mios = precios.filter((p) => p.contrato && codigos.has(p.contrato.trim()))
  let aviso: FilaAvisoSubida | undefined
  if (mios.length) {
    const claves = new Set(mios.map((p) => `${p.cliente}|${normCif(p.cif)}`))
    aviso = avisos.find((a) => claves.has(`${a.cliente}|${normCif(a.cif)}`)) || (cif ? avisos.find((a) => normCif(a.cif) === cif) : undefined)
  } else if (cif) {
    cruce = 'CIF'
    aviso = avisos.find((a) => normCif(a.cif) === cif)
    mios = precios.filter((p) => normCif(p.cif) === cif)
  }
  if (!mios.length && !aviso) return null
  const sumaMes = r2(mios.reduce((t, p) => t + (p.precioNuevoMes - p.precioHoyMes), 0))
  return {
    fechaEfecto: aviso?.fechaEfecto || datos.fechaEfecto || null,
    fechaLimiteAviso: aviso?.fechaLimiteAviso || null,
    pctMedio: aviso ? aviso.pctMedio : null,
    subidaMes: aviso ? aviso.subidaMes : sumaMes,
    subidaAnio: aviso ? aviso.subidaAnio : null,
    cruce,
    contratos: mios.slice(0, 15).map(({ contrato, producto, precioHoyMes, precioNuevoMes, subidaPct }) => ({ contrato, producto, precioHoyMes, precioNuevoMes, subidaPct })),
  }
}

const eur = (v: number) => `${v.toFixed(2).replace('.', ',')} €`
const pct = (v: number) => `${(Math.round(v * 10) / 10).toString().replace('.', ',')} %`

/** Texto para el prompt del borrador: solo precios al cliente; nada de costes ni márgenes. */
export function textoSubida(sc: SubidaCliente | null): string | null {
  if (!sc || (!sc.contratos.length && !sc.subidaMes)) return null
  const partes: string[] = ['escenario APROBADO internamente (confirmar con dirección antes de comunicarlo)']
  if (sc.fechaEfecto) partes.push(`entra en vigor el ${sc.fechaEfecto}`)
  if (sc.fechaLimiteAviso) partes.push(`hay que avisar al cliente antes del ${sc.fechaLimiteAviso}`)
  if (sc.pctMedio != null) partes.push(`subida media ${pct(sc.pctMedio)}`)
  partes.push(`+${eur(sc.subidaMes)}/mes${sc.subidaAnio != null ? ` (+${eur(sc.subidaAnio)}/año)` : ''} sin IVA`)
  let t = partes.join('; ') + '.'
  if (sc.contratos.length) t += ' Por servicio: ' + sc.contratos.map((c) => `${c.producto || 'servicio'} ${eur(c.precioHoyMes)} → ${eur(c.precioNuevoMes)}/mes (+${pct(c.subidaPct)})`).join(' | ') + '.'
  return t
}

/** Solo lectura. La proyección SQL deja fuera costeMes, margenHoyPct, margenNuevoPct y cualquier otro campo. */
export async function leerSubidaCliente(ficha: { codigosContrato: string[]; cif: string | null }): Promise<SubidaCliente | null> {
  const codigos = ficha.codigosContrato.map((c) => c.trim()).filter(Boolean).slice(0, 50)
  const cif = normCif(ficha.cif)
  if (!codigos.length && !cif) return null
  const filas = await prisma.$queryRaw<Array<{ precios: unknown[] | null; avisos: unknown[] | null; fecha_efecto: string | null }>>(Prisma.sql`
    WITH e AS (
      SELECT resultado, fecha_efecto FROM area2_subida_escenarios
      WHERE estado_aprobacion = 'APROBADO'
      ORDER BY aprobado_at DESC NULLS LAST LIMIT 1
    ), p AS (
      SELECT x FROM e, jsonb_array_elements(COALESCE(e.resultado->'precios', '[]'::jsonb)) x
      WHERE (x->>'contrato') = ANY(${codigos}::text[])
         OR (${cif} <> '' AND upper(regexp_replace(COALESCE(x->>'cif', ''), '[^A-Za-z0-9]', '', 'g')) = ${cif})
    ), a AS (
      SELECT y FROM e, jsonb_array_elements(COALESCE(e.resultado->'avisos', '[]'::jsonb)) y
      WHERE (${cif} <> '' AND upper(regexp_replace(COALESCE(y->>'cif', ''), '[^A-Za-z0-9]', '', 'g')) = ${cif})
         OR ((y->>'cliente'), COALESCE(y->>'cif', '')) IN (SELECT (x->>'cliente'), COALESCE(x->>'cif', '') FROM p)
    )
    SELECT
      (SELECT jsonb_agg(jsonb_build_object('contrato', x->'contrato', 'producto', x->'producto', 'cliente', x->'cliente', 'cif', x->'cif',
        'precioHoyMes', x->'precioHoyMes', 'precioNuevoMes', x->'precioNuevoMes', 'subidaPct', x->'subidaPct')) FROM p) AS precios,
      (SELECT jsonb_agg(jsonb_build_object('cliente', y->'cliente', 'cif', y->'cif', 'subidaMes', y->'subidaMes', 'subidaAnio', y->'subidaAnio',
        'pctMedio', y->'pctMedio', 'fechaLimiteAviso', y->'fechaLimiteAviso', 'fechaEfecto', y->'fechaEfecto')) FROM a) AS avisos,
      (SELECT to_char(fecha_efecto, 'YYYY-MM-DD') FROM e) AS fecha_efecto
  `)
  const f = filas[0]
  if (!f) return null
  return extraerSubidaCliente({ precios: f.precios || [], avisos: f.avisos || [], fechaEfecto: f.fecha_efecto }, { codigosContrato: codigos, cif })
}
