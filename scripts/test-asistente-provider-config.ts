import assert from 'node:assert/strict'
import http from 'node:http'
import dns from 'node:dns/promises'
import { proveedorPara, LocalProvider } from '@/lib/asistente/provider'
import { fetchInterno, urlInternaSegura, direccionInternaSegura } from '@/lib/asistente/network'

async function main() {
  const solicitudes: any[] = []
  let escenario: 'normal' | 'redirect' | 'invalido' = 'normal'
  const server = http.createServer((req, res) => {
    const partes: Buffer[] = []
    req.on('data', p => partes.push(p))
    req.on('end', () => {
      solicitudes.push(JSON.parse(Buffer.concat(partes).toString() || '{}'))
      if (escenario === 'redirect') { res.writeHead(302, { location: 'https://example.test/forbidden' }); res.end(); return }
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ choices: [{ message: { content: escenario === 'invalido' ? 'El coste inventado es 99999 euros. [8]' : 'Conectividad para empresas documentada. [1]' } }] }))
    })
  })
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
  const puerto = (server.address() as { port: number }).port
  process.env.ASSISTANT_LOCAL_BASE_URL = `http://127.0.0.1:${puerto}/v1`
  process.env.ASSISTANT_LOCAL_MODEL = 'modelo-env-fixture'
  const fragmentos: any[] = [{ titulo: 'Fuente de prueba sintética', urlFuente: '/empresa', contenido: 'Conectividad para empresas documentada. El informe cuesta 790 euros.', documentoId: 'fixture-documento', versionId: 'fixture-version', puntuacion: 1 }]
  try {
    const proveedor = proveedorPara('local', { modelo: 'modelo-panel-fixture', tono: 'Estilo sintético claro' })!
    const resultado = await proveedor.responder('Pregunta sintética sin PII', fragmentos)
    assert.equal(resultado.modo, 'local')
    assert.equal(solicitudes[0].model, 'modelo-panel-fixture')
    assert.match(solicitudes[0].messages[0].content, /Estilo sintético claro/)
    assert.match(solicitudes[0].messages[0].content, /sólo con las fuentes/)
    assert.equal(solicitudes[0].stream, false)
    escenario = 'redirect'
    await assert.rejects(fetchInterno(new URL(process.env.ASSISTANT_LOCAL_BASE_URL), { method: 'POST', body: '{}' }), /REDIRECT_FORBIDDEN/)
    const fallback = await proveedor.responder('Prueba', fragmentos)
    assert.equal(fallback.modo, 'extractivo')
    escenario = 'invalido'
    assert.equal((await proveedor.responder('Prueba', fragmentos)).modo, 'extractivo')
    assert.equal(proveedorPara('desactivado'), null)
    assert.equal((await proveedorPara('extractivo')!.responder('Prueba', fragmentos)).modo, 'extractivo')
    process.env.ASSISTANT_LOCAL_BASE_URL = 'https://example.test/v1'
    assert.equal((await new LocalProvider().responder('Prueba', fragmentos)).modo, 'extractivo')
    assert.equal(urlInternaSegura('https://example.test/v1'), null)
    assert.equal(urlInternaSegura('http://169.254.169.254/latest'), null)
    assert.equal(direccionInternaSegura('::1'), true)
    assert.equal(direccionInternaSegura('::ffff:127.0.0.1'), true)
    assert.equal(direccionInternaSegura('1.1.1.1'), false)
    process.env.ASSISTANT_INTERNAL_HOST_ALLOWLIST = 'fixture.internal'
    const original = dns.lookup
    try {
      ;(dns as any).lookup = async () => [{ address: '1.1.1.1', family: 4 }]
      await assert.rejects(fetchInterno(new URL('https://fixture.internal/v1'), {}), /DNS_NOT_PRIVATE/)
    } finally { (dns as any).lookup = original }
    console.log('TEST_ASISTENTE_PROVIDER_CONFIG_OK: modelo/tono de panel, fallback real, IP privada fijada, sin redirección ni proveedor externo')
  } finally { await new Promise<void>(r => server.close(() => r())) }
}
main().catch(() => { console.error('TEST_ASISTENTE_PROVIDER_CONFIG_FAILED'); process.exitCode = 1 })
