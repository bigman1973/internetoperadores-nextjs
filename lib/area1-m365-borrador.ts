/**
 * Área 1 · «Escribir correo con IA» desde la ficha.
 * El asistente SOLO propone asunto y cuerpo; nunca envía. El usuario revisa y pulsa Enviar en el compositor.
 * Contexto: ficha, empresa, negocios, últimas notas/reuniones/correos y, si hay vínculo con ISP,
 * contratos activos y facturación 2026. Sin márgenes ni rentabilidad (no se exponen al comercial).
 */
import prisma from '@/lib/prisma'
import { leerSubidaCliente, textoSubida } from '@/lib/area1-subida-cliente'

export type ContextoBorrador = {
  contacto: { nombre: string | null; cargo: string | null; empresa: string | null; segmento: string | null; ciudad: string | null }
  negocios: Array<{ nombre: string; etapa: string | null; importe: number | null; resultado: string | null }>
  actividades: Array<{ tipo: string; fecha: string; titulo: string | null; resumen: string }>
  contratos: Array<{ descripcion: string; proveedor: string | null; velocidad: string | null; importe: number | null; permanenciaHasta: string | null }>
  facturacion2026: { meses: number; total: number } | null
  subidaPrecios: string | null
  autor: string
}

export type PeticionBorrador = { objetivo: string; tono: 'cercano' | 'formal' | 'breve' }
export type Borrador = { asunto: string; cuerpo: string; avisos: string[] }

const recorta = (v: string | null | undefined, n: number) => (v || '').replace(/\s+/g, ' ').trim().slice(0, n)
const str = (o: Record<string, unknown>, k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null)

export function limpiarPeticion(objetivo: unknown, tono: unknown): PeticionBorrador | null {
  const o = typeof objetivo === 'string' ? objetivo.trim().slice(0, 600) : ''
  if (o.length < 3) return null
  const t = tono === 'formal' || tono === 'breve' ? tono : 'cercano'
  return { objetivo: o, tono: t }
}

export function construirPromptBorrador(ctx: ContextoBorrador, pet: PeticionBorrador) {
  const lineas: string[] = []
  lineas.push(`Destinatario: ${ctx.contacto.nombre || 'cliente'}${ctx.contacto.cargo ? `, ${ctx.contacto.cargo}` : ''}${ctx.contacto.empresa ? ` (${ctx.contacto.empresa})` : ''}.`)
  if (ctx.contacto.segmento) lineas.push(`Tipo de cliente: ${ctx.contacto.segmento}.`)
  if (ctx.negocios.length) lineas.push(`Negocios: ${ctx.negocios.map((n) => `${n.nombre}${n.etapa ? ` [${n.etapa}]` : ''}${n.importe != null ? ` ${n.importe.toFixed(0)} €` : ''}${n.resultado && n.resultado !== 'ABIERTO' ? ` (${n.resultado})` : ''}`).join('; ')}.`)
  if (ctx.contratos.length) lineas.push(`Servicios contratados: ${ctx.contratos.map((c) => [c.descripcion, c.proveedor, c.velocidad, c.importe != null ? `${c.importe.toFixed(2)} €/mes sin IVA` : null, c.permanenciaHasta ? `permanencia hasta ${c.permanenciaHasta}` : null].filter(Boolean).join(', ')).join(' | ')}.`)
  if (ctx.facturacion2026) lineas.push(`Facturación 2026: ${ctx.facturacion2026.total.toFixed(0)} € en ${ctx.facturacion2026.meses} meses.`)
  if (ctx.subidaPrecios) lineas.push(`Subida de precios: ${ctx.subidaPrecios}`)
  if (ctx.actividades.length) {
    lineas.push('Historial reciente (de más nuevo a más antiguo):')
    for (const a of ctx.actividades) lineas.push(`- ${a.fecha} ${a.tipo}${a.titulo ? ` «${a.titulo}»` : ''}: ${a.resumen}`)
  }
  const system = [
    'Eres el asistente comercial de Internet Operadores (operador de telecomunicaciones e IT para empresas y particulares en España).',
    'Redactas UN borrador de correo en español de España para que un comercial lo revise antes de enviarlo.',
    'Usa solo los datos del contexto; si falta un dato (precio, fecha, condición), NO lo inventes: deja un hueco entre corchetes, p. ej. [fecha], y añádelo a «avisos».',
    'Menciona la subida de precios solo si el objetivo del correo trata de precios, renovación o la propia subida; si la usas, añade a «avisos» que hay que confirmarla con dirección antes de enviar.',
    'Nunca prometas descuentos, precios ni plazos que no estén en el contexto. No incluyas datos internos (márgenes, costes, notas internas literales).',
    'No pongas firma: el sistema añade «Un saludo» y el nombre del remitente.',
    'Responde SOLO con JSON: {"asunto": string (máx. 120 caracteres), "cuerpo": string (texto plano con saltos de línea, sin HTML), "avisos": string[]}.',
  ].join(' ')
  const tono = pet.tono === 'formal' ? 'Tono formal y de usted.' : pet.tono === 'breve' ? 'Muy breve: 3-5 frases.' : 'Tono cercano y profesional.'
  const user = `Objetivo del correo: ${pet.objetivo}\n${tono}\nRemitente: ${ctx.autor}.\n\nContexto de la ficha:\n${lineas.join('\n')}`
  return { system, user }
}

export function interpretarRespuesta(texto: string): Borrador | null {
  let data: unknown
  try { data = JSON.parse(texto.replace(/^```(?:json)?\s*|\s*```$/g, '')) } catch { return null }
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const asunto = recorta(str(o, 'asunto'), 250)
  const cuerpo = (str(o, 'cuerpo') || '').trim().slice(0, 20_000)
  if (!asunto || !cuerpo) return null
  const avisos = Array.isArray(o.avisos) ? o.avisos.filter((a): a is string => typeof a === 'string').map((a) => recorta(a, 200)).slice(0, 8) : []
  return { asunto, cuerpo, avisos }
}

export async function cargarContextoBorrador(contactoId: string, autor: string): Promise<ContextoBorrador | null> {
  const contacto = await prisma.crmRegistroHubspot.findFirst({
    where: { id: contactoId, objectTypeId: '0-1' },
    select: { id: true, nombre: true, propiedades: true, propiedadesLocales: true, segmentoCrm: true },
  })
  if (!contacto) return null
  const p = { ...(contacto.propiedades as Record<string, unknown> | null || {}), ...(contacto.propiedadesLocales as Record<string, unknown> | null || {}) }

  const [negociosA1, actividades, isp] = await Promise.all([
    prisma.area1CrmNegocio.findMany({
      where: { contactoId, activo: true },
      select: { nombre: true, importe: true, resultado: true, etapa: { select: { nombre: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 6,
    }),
    prisma.crmActividad.findMany({
      where: { OR: [{ contactoId }, { contactos: { some: { contactoId } } }], tipo: { in: ['NOTA', 'REUNION', 'CORREO', 'LLAMADA'] } },
      select: { tipo: true, fechaActividad: true, titulo: true, descripcion: true },
      orderBy: { fechaActividad: 'desc' },
      take: 8,
    }),
    prisma.ispClienteArea1.findFirst({
      where: { crmContactoId: contactoId },
      select: { codigo: true, nombre: true, personaFisica: true, cif: true, nif: true, contratos: { where: { activo: true }, select: { codigoContratoIsp: true, descripcion: true, tarifa: true, proveedor: true, velocidad: true, importeSinIva: true, permanenciaHasta: true }, take: 10 } },
    }).catch(() => null),
  ])

  let facturacion2026: ContextoBorrador['facturacion2026'] = null
  if (isp?.codigo) {
    const filas = await prisma.ispFacturacionMensualArea1.findMany({ where: { codigoCliente: isp.codigo, anio: 2026 }, select: { importeBase: true }, take: 12 })
    if (filas.length) facturacion2026 = { meses: filas.length, total: filas.reduce((s, f) => s + Number(f.importeBase), 0) }
  }

  const subidaPrecios = isp
    ? textoSubida(await leerSubidaCliente({ codigosContrato: isp.contratos.map((c) => c.codigoContratoIsp), cif: isp.cif || isp.nif || null }).catch(() => null))
    : null
  return {
    contacto: {
      nombre: contacto.nombre || [str(p, 'firstname'), str(p, 'lastname')].filter(Boolean).join(' ') || null,
      cargo: str(p, 'jobtitle'),
      empresa: str(p, 'company') || (isp && !isp.personaFisica ? isp.nombre : null),
      segmento: contacto.segmentoCrm ? String(contacto.segmentoCrm) : null,
      ciudad: str(p, 'city'),
    },
    negocios: negociosA1.map((n) => ({ nombre: recorta(n.nombre, 120), etapa: n.etapa?.nombre || null, importe: n.importe == null ? null : Number(n.importe), resultado: n.resultado })),
    actividades: actividades.map((a) => ({ tipo: a.tipo, fecha: a.fechaActividad.toISOString().slice(0, 10), titulo: a.titulo ? recorta(a.titulo, 120) : null, resumen: recorta(a.descripcion, 350) })),
    contratos: (isp?.contratos || []).map((c) => ({
      descripcion: recorta(c.descripcion || c.tarifa || 'Servicio', 120),
      proveedor: c.proveedor || null,
      velocidad: c.velocidad || null,
      importe: c.importeSinIva == null ? null : Number(c.importeSinIva),
      permanenciaHasta: c.permanenciaHasta ? c.permanenciaHasta.toISOString().slice(0, 10) : null,
    })),
    facturacion2026,
    // Subida: último escenario APROBADO (lector del Área 1, solo lectura, sin coste ni margen). Sin dato, no se menciona.
    subidaPrecios,
    autor,
  }
}

type ClienteLlm = { chat: { completions: { create: (args: Record<string, unknown>) => Promise<{ choices: Array<{ message?: { content?: string | null } }> }> } } }

export async function generarBorrador(ctx: ContextoBorrador, pet: PeticionBorrador, cliente: ClienteLlm): Promise<Borrador | null> {
  const { system, user } = construirPromptBorrador(ctx, pet)
  const r = await cliente.chat.completions.create({
    model: process.env.AREA1_CRM_IA_MODEL || 'gpt-4.1-mini',
    temperature: 0.4,
    max_tokens: 900,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
  })
  return interpretarRespuesta(r.choices[0]?.message?.content || '')
}
