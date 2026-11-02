import { createHash, randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'

export type SegmentoCaptacion = 'PARTICULAR' | 'EMPRESA' | 'PARTNER'
export type TipoLeadExistente = 'MIGRACION' | 'SOLUCION' | 'PARTNER'
export type EntradaCaptacionWeb = {
  formulario: string
  segmentoCrm: SegmentoCaptacion
  nombre: string
  email: string
  telefono?: string | null
  empresa?: string | null
  datos: Record<string, unknown>
  /** Full request body used only to hash retries, never retained in the capture. */
  datosIdempotencia?: Record<string, unknown>
  newsletter: boolean
  privacidad: boolean | null
  consentimientoVersion?: string | null
  referenciaTipo?: string
  persistir?: (tx: Prisma.TransactionClient, contactoId: string) => Promise<any>
}
export type ResultadoCaptacionWeb = {
  contactoId: string
  captacionId: string
  registro: any
  repetido: boolean
}

type DbCaptacion = Pick<PrismaClient, '$transaction'>
const SEGMENTOS = new Set(['PARTICULAR', 'EMPRESA', 'PARTNER'])
const REINTENTO_MS = 10 * 60 * 1000
export const CONSENTIMIENTO_WEB_VERSION = 'area1-web-2026-11-02'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const texto = (value: unknown) => typeof value === 'string' ? value.trim() : ''

/** Sort recursively: equivalent JSON bodies produce the same retry fingerprint. */
function estable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(estable)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, estable((value as any)[key])]))
  }
  return value === undefined ? null : value
}

/** Remove query strings, credentials and fragments; never retain IP/tracking tokens. */
export function origenCaptacion(request: Request) {
  const endpoint = new URL(request.url)
  let page: URL | null = null
  try {
    const referer = request.headers.get('referer')
    if (referer) {
      const candidate = new URL(referer)
      const host = candidate.hostname.toLowerCase()
      const allowed = candidate.origin === endpoint.origin || host === 'internetoperadores.com'
        || host === 'www.internetoperadores.com' || host === 'staging.internetoperadores.com'
      if (allowed && ['https:', 'http:'].includes(candidate.protocol) && !candidate.username && !candidate.password) page = candidate
    }
  } catch { /* Untrusted or absent referrer: keep only this server's origin. */ }
  return { webOrigen: page?.origin || endpoint.origin, paginaOrigen: page?.pathname || null }
}

function tipoReferencia(formulario: string) {
  if (formulario === '/api/partners') return 'PARTNER'
  if (formulario === '/api/altas/crear') return 'ALTA'
  if (formulario.includes('/migracion-web') || formulario.includes('/auditoria-web-rapida')) return 'MIGRACION'
  if (formulario.startsWith('/api/contrata/')) return 'SOLUCION'
  return null
}

async function leerDetalle(tx: Prisma.TransactionClient, tipo: string | null, id: string | null) {
  if (!id) return null
  switch (tipo) {
    case 'MIGRACION': return tx.leadMigracionWeb.findUnique({ where: { id } })
    case 'SOLUCION': return tx.leadSolucion.findUnique({ where: { id } })
    case 'PARTNER': return tx.leadPartner.findUnique({ where: { id } })
    case 'ALTA': return tx.altaServicio.findUnique({ where: { id } })
    default: return null
  }
}

async function crearContacto(tx: Prisma.TransactionClient, input: EntradaCaptacionWeb) {
  // Deliberately do not match by email/NIF/phone: a human must confirm identity.
  return tx.crmRegistroHubspot.create({
    data: {
      hubspotId: null,
      objectTypeId: '0-1',
      nombre: texto(input.nombre),
      email: texto(input.email).toLowerCase() || null,
      telefono: texto(input.telefono) || null,
      empresa: texto(input.empresa) || null,
      segmentoCrm: input.segmentoCrm,
      unidadesNegocio: ['Internet Operadores'],
      propiedadesLocales: {
        firstname: texto(input.nombre), email: texto(input.email).toLowerCase(),
        phone: texto(input.telefono), company: texto(input.empresa),
      },
      // No customer/company association or commercial conversion is automatic.
    },
  })
}

/** Atomic canonical ficha + specialised detail + immutable evidence of this submission. */
export async function guardarCaptacionWebEn(
  db: DbCaptacion,
  request: Request,
  input: EntradaCaptacionWeb,
  ahora = new Date(),
): Promise<ResultadoCaptacionWeb> {
  if (!SEGMENTOS.has(input.segmentoCrm) || !input.formulario.startsWith('/api/')) throw new Error('CAPTACION_INVALIDA')
  if (!texto(input.nombre) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(input.email))) throw new Error('CAPTACION_CONTACTO_INVALIDO')
  const origin = origenCaptacion(request)
  const newsletter = input.newsletter === true
  const privacidad = typeof input.privacidad === 'boolean' ? input.privacidad : null
  const normalized = { ...input, nombre: texto(input.nombre), email: texto(input.email).toLowerCase(), persistir: undefined }
  const huella = hash(JSON.stringify(estable({ ...normalized, ...origin, newsletter, privacidad })))
  const explicit = texto(request.headers.get('idempotency-key'))
  if (explicit.length > 200) throw new Error('CAPTACION_IDEMPOTENCIA_INVALIDA')
  const claveExplicita = explicit ? hash(`${origin.webOrigen}|${input.formulario}|${explicit}`) : null
  // Concurrent retries are serialized, including retries across clock boundaries.
  const lock = claveExplicita || huella
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `area1-captacion:${lock}`)
    const existing = claveExplicita
      ? await tx.crmCaptacionWeb.findUnique({ where: { claveIdempotencia: claveExplicita } })
      : await tx.crmCaptacionWeb.findFirst({
        where: { huella, fechaEnvio: { gte: new Date(ahora.getTime() - REINTENTO_MS) } },
        orderBy: { fechaEnvio: 'desc' },
      })
    if (existing) {
      if (existing.huella !== huella) throw new Error('CAPTACION_REINTENTO_CON_DATOS_DISTINTOS')
      return {
        contactoId: existing.contactoId, captacionId: existing.id, repetido: true,
        registro: await leerDetalle(tx, existing.referenciaTipo, existing.referenciaId),
      }
    }
    const contacto = await crearContacto(tx, input)
    const registro = input.persistir ? await input.persistir(tx, contacto.id) : null
    const captacion = await tx.crmCaptacionWeb.create({
      data: {
        contactoId: contacto.id, formulario: input.formulario, ...origin,
        fechaEnvio: ahora, segmentoCrm: input.segmentoCrm,
        consentimientoPrivacidad: privacidad, consentimientoNewsletter: newsletter,
        consentimientoVersion: (privacidad !== null || newsletter) ? (input.consentimientoVersion || CONSENTIMIENTO_WEB_VERSION) : null,
        datos: JSON.parse(JSON.stringify(input.datos || {})),
        referenciaTipo: registro ? (input.referenciaTipo || tipoReferencia(input.formulario)) : null,
        referenciaId: registro?.id || null,
        huella, claveIdempotencia: claveExplicita || randomUUID(),
      },
    })
    return { contactoId: contacto.id, captacionId: captacion.id, registro, repetido: false }
  }, { timeout: 15_000 })
}

/** Explicit user action, not a historical migration and never an email-based merge. */
export async function vincularLeadExistenteEn(db: DbCaptacion, tipo: TipoLeadExistente, id: string) {
  if (!['MIGRACION', 'SOLUCION', 'PARTNER'].includes(tipo) || !id) throw new Error('LEAD_INVALIDO')
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', `area1-lead:${tipo}:${id}`)
    const lead = tipo === 'MIGRACION'
      ? await tx.leadMigracionWeb.findUnique({ where: { id } })
      : tipo === 'SOLUCION'
        ? await tx.leadSolucion.findUnique({ where: { id } })
        : await tx.leadPartner.findUnique({ where: { id } })
    if (!lead) throw new Error('LEAD_NO_ENCONTRADO')
    if (lead.crmContactoId) return { contactoId: lead.crmContactoId, repetido: true }
    const contacto = await crearContacto(tx, {
      formulario: '/api/admin/crm/leads', segmentoCrm: lead.segmentoCrm || (tipo === 'PARTNER' ? 'PARTNER' : 'EMPRESA'),
      nombre: 'contacto' in lead ? lead.contacto : lead.nombre, email: lead.email, telefono: lead.telefono,
      empresa: 'nombreEmpresa' in lead ? lead.nombreEmpresa : lead.empresa, datos: {}, newsletter: false, privacidad: null,
    })
    const data = { crmContactoId: contacto.id }
    switch (tipo) {
      case 'MIGRACION': await tx.leadMigracionWeb.update({ where: { id }, data }); break
      case 'SOLUCION': await tx.leadSolucion.update({ where: { id }, data }); break
      case 'PARTNER': await tx.leadPartner.update({ where: { id }, data }); break
    }
    // Only the link changes; all existing notes, questionnaires, dates and files stay intact.
    return { contactoId: contacto.id, repetido: false }
  }, { timeout: 15_000 })
}
