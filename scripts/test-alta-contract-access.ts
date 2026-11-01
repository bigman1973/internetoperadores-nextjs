import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { altaContractPublicUrl, hasAltaContractCapability } from '../lib/altas/contrato-access'
import { highRiskApiRequirement } from '../lib/high-risk-api-policy'

const altaId = 'd6a4cc96-396f-4e01-90ea-589602942f5c'
const token = '4cf59bf1-31c9-42b8-8c99-24d4775c8f4a'

function run(): void {
  assert.equal(hasAltaContractCapability(token, token), true, 'La capacidad exacta concede acceso')
  assert.equal(hasAltaContractCapability(token, `${token}x`), false, 'Una capacidad con longitud distinta no concede acceso')
  assert.equal(hasAltaContractCapability(token, token.replace('4', '5')), false, 'Una capacidad distinta no concede acceso')
  assert.equal(hasAltaContractCapability(token, null), false, 'Una petición sin capacidad no concede acceso público')

  const url = new URL(altaContractPublicUrl('https://www.internetoperadores.com/', altaId, token))
  assert.equal(url.pathname, '/api/altas/contrato')
  assert.equal(url.searchParams.get('altaId'), altaId)
  assert.equal(url.searchParams.get('token'), token)
  assert.equal(url.searchParams.get('format'), 'html')

  // La ruta mantiene la política administrativa en middleware y sólo abre el
  // paso público mediante una comprobación de capacidad en ambos límites.
  assert.deepEqual(highRiskApiRequirement('/api/altas/contrato', 'GET') && {
    area: highRiskApiRequirement('/api/altas/contrato', 'GET')!.area,
    action: highRiskApiRequirement('/api/altas/contrato', 'GET')!.action,
  }, { area: 'admin.altas_pendientes', action: 'lectura' })

  const handler = readFileSync('app/api/altas/contrato/route.ts', 'utf8')
  const sender = readFileSync('app/api/altas/[id]/enviar-contrato/route.ts', 'utf8')
  const middleware = readFileSync('middleware.js', 'utf8')
  assert.match(handler, /hasAltaContractCapability\(accessRecord\?\.token, suppliedToken\)/)
  assert.match(handler, /checkAdminAreaRead\('admin\.altas_pendientes', \['VENTAS'\]\)/)
  assert.match(handler, /Cache-Control.*private, no-store/)
  assert.match(sender, /altaContractPublicUrl\(baseUrl, alta\.id, alta\.token\)/)
  assert.match(middleware, /hasPublicAltaContractAccess\(request, prisma\)/)
  console.log(JSON.stringify({ passed: true, publicCapability: true, adminFallback: true, privateCache: true }))
}

run()
