import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import prisma from '@/lib/prisma'

const OUTLOOK_SCOPES = ['offline_access', 'User.Read', 'Calendars.ReadWrite'] as const
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'
const ALLOWED_DOMAINS = ['internetoperadores.com', 'lfgd.es', 'farmsplanet.es', 'elypseadvisory.com']
const ALLOWED_PUBLIC_HOSTS = new Set(['www.internetoperadores.com', 'staging.internetoperadores.com'])

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

type OutlookStatePayload = {
  state: string
  verifier: string
  userId: number
  returnTo: string
  createdAt: number
}

export type OutlookConnectionStatus = {
  enabled: boolean
  connected: boolean
  email: string | null
  connectedAt: string | null
  lastError: string | null
}

export function isOutlookUserIntegrationEnabled() {
  return process.env.OUTLOOK_USER_CALENDAR_ENABLED === 'true'
}

export function getOutlookPublicOrigin(requestOrigin: string) {
  const configured = process.env.OUTLOOK_USER_CALENDAR_PUBLIC_ORIGIN?.trim()
  const url = new URL(configured || requestOrigin)
  const localDevelopment = process.env.NODE_ENV !== 'production' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
  if (url.protocol !== 'https:' && !localDevelopment) throw new Error('El origen público de Outlook debe usar HTTPS.')
  if (!ALLOWED_PUBLIC_HOSTS.has(url.hostname) && !localDevelopment) throw new Error('El origen público de Outlook no está autorizado.')
  return url.origin
}

export function getOutlookRedirectUri(origin: string) {
  return `${getOutlookPublicOrigin(origin)}/api/admin/integraciones/outlook/callback`
}

export function createOutlookAuthorization(origin: string, userId: number, loginHint: string | null, returnTo: string) {
  const publicOrigin = getOutlookPublicOrigin(origin)
  if (new URL(origin).origin !== publicOrigin) throw new Error('Abre el CRM desde su dominio público antes de conectar Outlook.')
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const state = randomBytes(32).toString('base64url')
  const payload: OutlookStatePayload = { state, verifier, userId, returnTo: safeReturnTo(returnTo), createdAt: Date.now() }
  const url = new URL(`${authorityRoot()}/oauth2/v2.0/authorize`)
  url.searchParams.set('client_id', clientId())
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', getOutlookRedirectUri(publicOrigin))
  url.searchParams.set('response_mode', 'query')
  url.searchParams.set('scope', OUTLOOK_SCOPES.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('prompt', 'select_account')
  if (loginHint && isAllowedCorporateEmail(loginHint)) url.searchParams.set('login_hint', loginHint.trim().toLowerCase())
  return { url: url.toString(), cookie: encrypt(JSON.stringify(payload)) }
}

export function readOutlookAuthorizationCookie(value: string) {
  const parsed = JSON.parse(decrypt(value)) as Partial<OutlookStatePayload>
  if (!parsed.state || !parsed.verifier || !Number.isInteger(parsed.userId) || !parsed.createdAt) throw new Error('Estado OAuth incompleto.')
  if (Date.now() - parsed.createdAt > 10 * 60 * 1000) throw new Error('La autorización de Outlook ha caducado.')
  return {
    state: parsed.state,
    verifier: parsed.verifier,
    userId: parsed.userId as number,
    returnTo: safeReturnTo(parsed.returnTo),
  }
}

export async function exchangeOutlookAuthorizationCode(code: string, verifier: string, redirectUri: string) {
  const response = await fetch(`${authorityRoot()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      scope: OUTLOOK_SCOPES.join(' '),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const token = await response.json() as TokenResponse
  if (!response.ok || !token.access_token || !token.refresh_token) throw new Error(normalizeTokenError(token))
  const grantedScopes = new Set((token.scope || '').split(/\s+/).filter(Boolean).map((scope) => scope.toLowerCase()))
  if (!grantedScopes.has('user.read') || !grantedScopes.has('calendars.readwrite')) {
    throw new Error('Microsoft no ha concedido todos los permisos necesarios para la agenda.')
  }
  return { accessToken: token.access_token, refreshToken: token.refresh_token, scopes: token.scope || OUTLOOK_SCOPES.join(' ') }
}

export async function getMicrosoftUserIdentity(accessToken: string) {
  const response = await fetch(`${GRAPH_ROOT}/me?$select=id,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const profile = await response.json().catch(() => ({})) as { id?: string | null; mail?: string | null; userPrincipalName?: string | null }
  if (!response.ok) throw new Error('No se pudo comprobar la identidad de Outlook.')
  const email = (profile.mail || profile.userPrincipalName || '').trim().toLowerCase()
  if (!isAllowedCorporateEmail(email)) throw new Error('La cuenta de Outlook no pertenece a un dominio corporativo autorizado.')
  if (!profile.id) throw new Error('Microsoft no ha devuelto una identidad verificable.')
  const tenantId = process.env.AZURE_AD_TENANT_ID || process.env.AZURE_TENANT_ID
  if (!tenantId) throw new Error('Falta configurar el tenant de Microsoft 365.')
  return { email, objectId: profile.id, tenantId }
}

export async function saveOutlookUserConnection(
  userId: number,
  expectedEmail: string,
  identity: { email: string; objectId: string; tenantId: string },
  refreshToken: string,
  scopes: string,
) {
  const normalizedExpected = expectedEmail.trim().toLowerCase()
  const normalizedEmail = identity.email.trim().toLowerCase()
  if (normalizedExpected !== normalizedEmail) throw new Error('Conecta la misma cuenta de Microsoft con la que accedes al panel.')
  await prisma.outlookConexion.upsert({
    where: { usuarioId: userId },
    update: {
      email: normalizedEmail,
      microsoftObjectId: identity.objectId,
      tenantId: identity.tenantId,
      refreshTokenCifrado: encrypt(refreshToken),
      scopes,
      conectadoAt: new Date(),
      ultimoError: null,
      revocadoAt: null,
    },
    create: {
      usuarioId: userId,
      email: normalizedEmail,
      microsoftObjectId: identity.objectId,
      tenantId: identity.tenantId,
      refreshTokenCifrado: encrypt(refreshToken),
      scopes,
    },
  })
}

export async function getOutlookConnectionStatus(userId: number): Promise<OutlookConnectionStatus> {
  const connection = await prisma.outlookConexion.findUnique({
    where: { usuarioId: userId },
    select: { email: true, conectadoAt: true, ultimoError: true, revocadoAt: true },
  })
  return {
    enabled: isOutlookUserIntegrationEnabled(),
    connected: Boolean(connection && !connection.revocadoAt),
    email: connection && !connection.revocadoAt ? connection.email : null,
    connectedAt: connection && !connection.revocadoAt ? connection.conectadoAt.toISOString() : null,
    lastError: connection?.ultimoError || null,
  }
}

export async function getOutlookUserAccessToken(userId: number, expectedEmail: string) {
  const connection = await prisma.outlookConexion.findUnique({ where: { usuarioId: userId } })
  if (!connection || connection.revocadoAt) throw new Error('Conecta tu cuenta de Outlook antes de crear la reunión.')
  if (connection.email !== expectedEmail.trim().toLowerCase()) throw new Error('La conexión de Outlook no corresponde al usuario autenticado.')

  let refreshToken: string
  try {
    refreshToken = decrypt(connection.refreshTokenCifrado)
  } catch {
    await markConnectionRevoked(userId, 'No se pudo descifrar la conexión. Vuelve a conectar Outlook.')
    throw new Error('La conexión de Outlook debe renovarse.')
  }

  const response = await fetch(`${authorityRoot()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: OUTLOOK_SCOPES.join(' '),
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  const token = await response.json() as TokenResponse
  if (!response.ok || !token.access_token) {
    const revoked = token.error === 'invalid_grant' || token.error === 'interaction_required'
    const message = revoked
      ? 'La autorización de Outlook ha caducado o se ha revocado. Vuelve a conectar la cuenta.'
      : 'Microsoft no ha podido renovar la conexión de Outlook. Inténtalo de nuevo.'
    if (revoked) await markConnectionRevoked(userId, message)
    else await prisma.outlookConexion.update({ where: { usuarioId: userId }, data: { ultimoError: message } })
    throw new Error(message)
  }

  await prisma.outlookConexion.update({
    where: { usuarioId: userId },
    data: {
      ...(token.refresh_token ? { refreshTokenCifrado: encrypt(token.refresh_token) } : {}),
      scopes: token.scope || connection.scopes,
      ultimoUsoAt: new Date(),
      ultimoError: null,
    },
  })
  return { accessToken: token.access_token, mailbox: connection.email }
}

export async function disconnectOutlookUser(userId: number) {
  await markConnectionRevoked(userId, null)
}

export function isAllowedCorporateEmail(value: string) {
  const email = value.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && ALLOWED_DOMAINS.some((domain) => email.endsWith(`@${domain}`))
}

async function markConnectionRevoked(userId: number, error: string | null) {
  await prisma.outlookConexion.updateMany({
    where: { usuarioId: userId, revocadoAt: null },
    data: { revocadoAt: new Date(), refreshTokenCifrado: encrypt(randomBytes(48).toString('base64url')), ultimoError: error },
  })
}

function safeReturnTo(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000 || value.includes('\\')) return '/admin/crm/contactos'
  try {
    const url = new URL(value, 'https://internal.invalid')
    if (url.origin !== 'https://internal.invalid' || !url.pathname.startsWith('/admin/') || url.pathname.includes('/../') || url.pathname.includes('/./')) return '/admin/crm/contactos'
    return `${url.pathname}${url.search}`
  } catch {
    return '/admin/crm/contactos'
  }
}

function authorityRoot() {
  const tenantId = process.env.AZURE_AD_TENANT_ID || process.env.AZURE_TENANT_ID
  if (!tenantId) throw new Error('Falta configurar el tenant de Microsoft 365.')
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}`
}

function clientId() {
  const value = process.env.AZURE_AD_CLIENT_ID || process.env.AZURE_CLIENT_ID
  if (!value) throw new Error('Falta configurar la aplicación de Microsoft 365.')
  return value
}

function clientSecret() {
  const value = process.env.AZURE_AD_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET
  if (!value) throw new Error('Falta configurar el secreto de Microsoft 365.')
  return value
}

function encryptionKey() {
  const value = process.env.OUTLOOK_TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET
  if (!value) throw new Error('Falta configurar la clave de cifrado de Outlook.')
  return createHash('sha256').update(`outlook-tokens:v1\0${value}`).digest()
}

function encrypt(plainText: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`
}

function decrypt(value: string) {
  const [version, ivValue, tagValue, cipherValue] = value.split('.')
  if (version !== 'v1' || !ivValue || !tagValue || !cipherValue) throw new Error('Formato cifrado no válido.')
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(cipherValue, 'base64url')), decipher.final()]).toString('utf8')
}

function normalizeTokenError(token: TokenResponse) {
  if (token.error === 'invalid_grant' || token.error === 'interaction_required') return 'La autorización de Microsoft ha caducado o requiere nueva interacción.'
  if (token.error === 'invalid_scope' || token.error === 'consent_required') return 'Microsoft no ha concedido los permisos necesarios para la agenda.'
  return 'Microsoft no ha podido completar la autorización de Outlook.'
}
