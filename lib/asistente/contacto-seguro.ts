import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export type ReferenciaContactoSeguro = 'LEAD' | 'ESCALADO'
export type DatosContactoSeguro = { nombre?: string; email?: string; telefono?: string; empresa?: string }
export type ContextoContactoSeguro = { referenciaTipo: ReferenciaContactoSeguro; referenciaId: string; conversacionId: string }

type PayloadContactoSeguro = {
  version: 'v1'
  keyVersion: 'contacto-v1'
  iv: string
  etiqueta: string
  contenido: string
}

type ContactoSeguroDelegate = {
  upsert: (args: {
    where: { referenciaTipo_referenciaId: { referenciaTipo: ReferenciaContactoSeguro; referenciaId: string } }
    create: { referenciaTipo: ReferenciaContactoSeguro; referenciaId: string; conversacionId: string; cifrado: string; keyVersion: string; borrarDespues: Date }
    update: { conversacionId: string; cifrado: string; keyVersion: string; borrarDespues: Date }
  }) => Promise<unknown>
  findFirst: (args: {
    where: { referenciaTipo: ReferenciaContactoSeguro; referenciaId: string; conversacionId: string }
    select: { cifrado: true; keyVersion: true }
  }) => Promise<{ cifrado: string; keyVersion: string } | null>
}

type DbContactoSeguro = { asistenteContactoSeguro: ContactoSeguroDelegate }

const VERSION = 'contacto-v1' as const
const DOMINIO_HKDF = 'internetoperadores/asistente/contacto-seguro/aes-256-gcm/v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CAMPOS: Array<keyof DatosContactoSeguro> = ['nombre', 'email', 'telefono', 'empresa']

function base64url(valor: Buffer): string { return valor.toString('base64url') }
function desdeBase64url(valor: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(valor)) throw new Error('CONTACTO_CIFRADO_INVALIDO')
  return Buffer.from(valor, 'base64url')
}

function validarContexto(contexto: ContextoContactoSeguro): void {
  if (!contexto || !['LEAD', 'ESCALADO'].includes(contexto.referenciaTipo) || !UUID.test(contexto.referenciaId) || !UUID.test(contexto.conversacionId)) {
    throw new Error('CONTEXTO_CONTACTO_INVALIDO')
  }
}

function aad(contexto: ContextoContactoSeguro): Buffer {
  validarContexto(contexto)
  return Buffer.from(`${DOMINIO_HKDF}|${contexto.referenciaTipo}|${contexto.referenciaId}|${contexto.conversacionId}`, 'utf8')
}

function claveConfigurada(): Buffer {
  const explicita = process.env.ASSISTANT_CONTACT_ENCRYPTION_KEY?.trim()
  if (explicita) {
    const hexadecimal = /^[a-f0-9]{64}$/i.test(explicita) ? Buffer.from(explicita, 'hex') : null
    const codificada = /^[A-Za-z0-9+/_=-]+$/.test(explicita) ? Buffer.from(explicita, 'base64') : null
    const clave = hexadecimal || codificada
    if (!clave || clave.length !== 32) throw new Error('ASSISTANT_CONTACT_ENCRYPTION_KEY_INVALIDA')
    return clave
  }

  const secreto = process.env.NEXTAUTH_SECRET
  if (!secreto || secreto.length < 16) throw new Error('CONTACTO_CIFRADO_NO_CONFIGURADO')
  return Buffer.from(hkdfSync('sha256', secreto, 'internetoperadores/asistente/contacto-seguro', DOMINIO_HKDF, 32))
}

function normalizarDatos(datos: DatosContactoSeguro): DatosContactoSeguro {
  if (!datos || typeof datos !== 'object') throw new Error('CONTACTO_INVALIDO')
  const resultado: DatosContactoSeguro = {}
  for (const campo of CAMPOS) {
    const valor = datos[campo]
    if (valor === undefined || valor === null || valor === '') continue
    if (typeof valor !== 'string') throw new Error('CONTACTO_INVALIDO')
    const limpio = valor.trim()
    if (!limpio || limpio.length > 254) throw new Error('CONTACTO_INVALIDO')
    resultado[campo] = limpio
  }
  if (!Object.keys(resultado).length) throw new Error('CONTACTO_REQUERIDO')
  return resultado
}

function payloadDesde(valor: string): PayloadContactoSeguro {
  let payload: unknown
  try { payload = JSON.parse(valor) } catch { throw new Error('CONTACTO_CIFRADO_INVALIDO') }
  if (!payload || typeof payload !== 'object') throw new Error('CONTACTO_CIFRADO_INVALIDO')
  const candidato = payload as Partial<PayloadContactoSeguro>
  if (candidato.version !== 'v1' || candidato.keyVersion !== VERSION || typeof candidato.iv !== 'string' || typeof candidato.etiqueta !== 'string' || typeof candidato.contenido !== 'string') {
    throw new Error('CONTACTO_CIFRADO_INVALIDO')
  }
  return candidato as PayloadContactoSeguro
}

/** Cifra el contacto consentido exclusivamente para la referencia y conversación indicadas. */
export function cifrarContacto(datos: DatosContactoSeguro, contexto: ContextoContactoSeguro): string {
  const limpio = normalizarDatos(datos)
  const iv = randomBytes(12)
  const cifrador = createCipheriv('aes-256-gcm', claveConfigurada(), iv)
  cifrador.setAAD(aad(contexto))
  const contenido = Buffer.concat([cifrador.update(JSON.stringify(limpio), 'utf8'), cifrador.final()])
  const payload: PayloadContactoSeguro = { version: 'v1', keyVersion: VERSION, iv: base64url(iv), etiqueta: base64url(cifrador.getAuthTag()), contenido: base64url(contenido) }
  return JSON.stringify(payload)
}

/** Descifra sólo si el contexto autorizado coincide exactamente con el AAD del registro. */
export function descifrarContacto(payload: string, contexto: ContextoContactoSeguro): DatosContactoSeguro {
  const cifrado = payloadDesde(payload)
  const iv = desdeBase64url(cifrado.iv)
  const etiqueta = desdeBase64url(cifrado.etiqueta)
  const contenido = desdeBase64url(cifrado.contenido)
  if (iv.length !== 12 || etiqueta.length !== 16 || contenido.length === 0) throw new Error('CONTACTO_CIFRADO_INVALIDO')
  try {
    const descifrador = createDecipheriv('aes-256-gcm', claveConfigurada(), iv)
    descifrador.setAAD(aad(contexto))
    descifrador.setAuthTag(etiqueta)
    const texto = Buffer.concat([descifrador.update(contenido), descifrador.final()]).toString('utf8')
    return normalizarDatos(JSON.parse(texto) as DatosContactoSeguro)
  } catch (error) {
    if (error instanceof Error && ['CONTACTO_INVALIDO', 'CONTACTO_REQUERIDO', 'CONTACTO_CIFRADO_NO_CONFIGURADO', 'ASSISTANT_CONTACT_ENCRYPTION_KEY_INVALIDA'].includes(error.message)) throw error
    throw new Error('CONTACTO_CIFRADO_NO_VERIFICADO')
  }
}

/** Inserta o actualiza el único contacto seguro de una referencia de forma idempotente. */
export async function guardarContactoSeguro(db: DbContactoSeguro, { referenciaTipo, referenciaId, conversacionId, datos, borrarDespues }: ContextoContactoSeguro & { datos: DatosContactoSeguro; borrarDespues: Date }): Promise<void> {
  const contexto = { referenciaTipo, referenciaId, conversacionId }
  if (!(borrarDespues instanceof Date) || Number.isNaN(borrarDespues.valueOf())) throw new Error('CADUCIDAD_CONTACTO_INVALIDA')
  const cifrado = cifrarContacto(datos, contexto)
  await db.asistenteContactoSeguro.upsert({
    where: { referenciaTipo_referenciaId: { referenciaTipo, referenciaId } },
    create: { referenciaTipo, referenciaId, conversacionId, cifrado, keyVersion: VERSION, borrarDespues },
    update: { conversacionId, cifrado, keyVersion: VERSION, borrarDespues },
  })
}

/** Recupera y verifica un contacto cifrado de la misma referencia y conversación, o null si no existe. */
export async function leerContactoSeguro(db: DbContactoSeguro, { referenciaTipo, referenciaId, conversacionId }: ContextoContactoSeguro): Promise<DatosContactoSeguro | null> {
  validarContexto({ referenciaTipo, referenciaId, conversacionId })
  const registro = await db.asistenteContactoSeguro.findFirst({
    where: { referenciaTipo, referenciaId, conversacionId },
    select: { cifrado: true, keyVersion: true },
  })
  if (!registro) return null
  if (registro.keyVersion !== VERSION) throw new Error('CONTACTO_KEY_VERSION_NO_SOPORTADA')
  return descifrarContacto(registro.cifrado, { referenciaTipo, referenciaId, conversacionId })
}
