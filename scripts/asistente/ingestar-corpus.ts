import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { config as cargarEntorno } from 'dotenv'
import type { EvidenciaSnapshotPrivadoTarifas, ReciboDesactivacionTarifas } from '@/lib/asistente/ingesta'

const RUTA_SNAPSHOT_PRIVADO_ANTERIOR = '/home/ubuntu/ia-publico-20261025/corpus/antes-private.json'
const NOMBRE_BD_STAGING = 'io_staging_finanzas'
const USUARIO_INGESTA_STAGING = 'io_staging_finanzas'
const args = new Set(process.argv.slice(2))
const aplicar = args.has('--apply')
const objetivo = [...args].find(arg => arg.startsWith('--target='))?.slice('--target='.length) || 'local'
const reciboRuta = [...args].find(arg => arg.startsWith('--recibo='))?.slice('--recibo='.length)
const rollbackRuta = [...args].find(arg => arg.startsWith('--rollback='))?.slice('--rollback='.length)
const secretoRuta = [...args].find(arg => arg.startsWith('--plan-secret-file='))?.slice('--plan-secret-file='.length)

// Deben ser inyectados por el script padre desde configuración externa de
// confianza antes de que dotenv lea el .env del repositorio. No se registran.
const destinoExterno = {
  sandbox: process.env.FINANCE_STAGING_SANDBOX,
  host: process.env.FINANCE_STAGING_EXPECTED_HOST,
  port: process.env.FINANCE_STAGING_EXPECTED_PORT,
  user: process.env.FINANCE_STAGING_EXPECTED_USER,
}

if (!['local', 'staging'].includes(objetivo)) throw new Error('TARGET_INVALIDO')
if (aplicar && rollbackRuta) throw new Error('APPLY_Y_ROLLBACK_INCOMPATIBLES')
if (objetivo !== 'staging' && (aplicar || rollbackRuta)) throw new Error('SOLO_STAGING_PERMITE_ESCRITURA')
if (objetivo === 'staging' && (aplicar || rollbackRuta) && !args.has('--confirmar-staging')) throw new Error('STAGING_REQUIERE_CONFIRMACION_EXPLICITA')
if (aplicar && !reciboRuta) throw new Error('PLAN_FIRMADO_REQUERIDO')

function salidaEnsayo(datos: unknown): void {
  console.log(JSON.stringify(datos, null, 2))
}

function exigirDestinoStaging(): void {
  // DATABASE_URL puede venir del secreto de despliegue cargado después; las
  // expectativas de identidad, en cambio, deben haber llegado del padre.
  cargarEntorno({ path: path.join(process.cwd(), '.env') })
  if (destinoExterno.sandbox !== '1') throw new Error('STAGING_SANDBOX_GUARD')
  if (!destinoExterno.host || !destinoExterno.port || !destinoExterno.user) throw new Error('STAGING_DESTINO_NO_CONFIGURADO')
  if (destinoExterno.user !== USUARIO_INGESTA_STAGING) throw new Error('STAGING_DB_GUARD')
  let destino: URL
  try { destino = new URL(process.env.DATABASE_URL || '') } catch { throw new Error('STAGING_DB_GUARD') }
  const base = decodeURIComponent(destino.pathname)
  const puerto = destino.port || '5432'
  if (destino.protocol !== 'postgresql:'
    || destino.hostname.toLowerCase() !== destinoExterno.host.toLowerCase()
    || puerto !== destinoExterno.port
    || decodeURIComponent(destino.username) !== USUARIO_INGESTA_STAGING
    || decodeURIComponent(destino.username) !== destinoExterno.user
    || base !== `/${NOMBRE_BD_STAGING}`) throw new Error('STAGING_DB_GUARD')
}

async function leerFicheroPrivado0600(ruta: string, codigo: string): Promise<Buffer> {
  const absoluto = path.resolve(ruta)
  let estado
  try { estado = await fs.lstat(absoluto) } catch { throw new Error(codigo) }
  if (!estado.isFile() || estado.isSymbolicLink() || (estado.mode & 0o777) !== 0o600) throw new Error(codigo)
  try { return await fs.readFile(absoluto) } catch { throw new Error(codigo) }
}

async function leerSecretoPlan(): Promise<Buffer> {
  const secreto = await leerFicheroPrivado0600(secretoRuta!, 'PLAN_SECRETO_NO_VALIDO')
  if (secreto.length < 32 || secreto.length > 4096) throw new Error('PLAN_SECRETO_NO_VALIDO')
  return secreto
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

function esRegistroSnapshot(valor: unknown): valor is EvidenciaSnapshotPrivadoTarifas['docs'][number] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false
  const registro = valor as Record<string, unknown>
  return typeof registro.id === 'string' && typeof registro.espacio === 'string' && typeof registro.estado === 'string'
    && Number.isInteger(registro.version_actual) && (typeof registro.origen === 'string' || registro.origen === null)
    && typeof registro.titulo === 'string' && typeof registro.updated_at === 'string'
}

function esFragmentoSnapshot(valor: unknown): valor is EvidenciaSnapshotPrivadoTarifas['fragments'][number] {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return false
  const fragmento = valor as Record<string, unknown>
  return typeof fragmento.id === 'string' && typeof fragmento.documento_id === 'string' && typeof fragmento.activo === 'boolean'
}

async function cargarSnapshotPrivadoAnterior(): Promise<EvidenciaSnapshotPrivadoTarifas> {
  const bruto = await leerFicheroPrivado0600(RUTA_SNAPSHOT_PRIVADO_ANTERIOR, 'SNAPSHOT_PRIVADO_NO_VALIDO')
  let valor: unknown
  try { valor = JSON.parse(bruto.toString('utf8')) } catch { throw new Error('SNAPSHOT_PRIVADO_NO_VALIDO') }
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('SNAPSHOT_PRIVADO_NO_VALIDO')
  const snapshot = valor as { db?: unknown; docs?: unknown; fragments?: unknown }
  if (snapshot.db !== NOMBRE_BD_STAGING || !Array.isArray(snapshot.docs) || !Array.isArray(snapshot.fragments)
    || !snapshot.docs.every(esRegistroSnapshot) || !snapshot.fragments.every(esFragmentoSnapshot)) throw new Error('SNAPSHOT_PRIVADO_NO_VALIDO')
  const ids = new Set(snapshot.docs.map(documento => documento.id))
  const fragmentos = new Set(snapshot.fragments.map(fragmento => fragmento.id))
  if (ids.size !== snapshot.docs.length || fragmentos.size !== snapshot.fragments.length
    || snapshot.fragments.some(fragmento => !ids.has(fragmento.documento_id))) throw new Error('SNAPSHOT_PRIVADO_NO_VALIDO')
  return { huella: sha256(bruto), docs: snapshot.docs, fragments: snapshot.fragments }
}

async function escribirRecibo(ruta: string, recibo: unknown): Promise<void> {
  const absoluto = path.resolve(ruta)
  await fs.mkdir(path.dirname(absoluto), { recursive: true, mode: 0o700 })
  try {
    const previo = await fs.lstat(absoluto)
    if (!previo.isFile() || previo.isSymbolicLink()) throw new Error('RECIBO_RUTA_NO_VALIDA')
  } catch (error) {
    if (error instanceof Error && error.message === 'RECIBO_RUTA_NO_VALIDA') throw error
  }
  try {
    await fs.writeFile(absoluto, `${JSON.stringify(recibo, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
    await fs.chmod(absoluto, 0o600)
  } catch { throw new Error('RECIBO_ESCRITURA_FALLIDA') }
}

async function leerRecibo(ruta: string): Promise<ReciboDesactivacionTarifas> {
  const contenido = await leerFicheroPrivado0600(ruta, 'RECIBO_TARIFAS_INVALIDO')
  try { return JSON.parse(contenido.toString('utf8')) as ReciboDesactivacionTarifas } catch { throw new Error('RECIBO_TARIFAS_INVALIDO') }
}

async function corpusLocal() {
  const { fuenteAptaParaPublico, motivoFuenteNoAptaParaPublico } = await import('@/lib/asistente/public-policy')
  const { coberturaManifestCorpusPublico, extraerCorpusPublicoLocal } = await import('@/lib/asistente/web-corpus')
  const corpusExtraido = await extraerCorpusPublicoLocal()
  const fuentes = corpusExtraido.filter(fuente => fuenteAptaParaPublico(fuente))
  const excluidas = corpusExtraido
    .filter(fuente => !fuenteAptaParaPublico(fuente))
    .map(fuente => ({ ruta: fuente.urlFuente, huella: fuente.huella, motivo: motivoFuenteNoAptaParaPublico(fuente) }))
  return { fuentes, excluidas, cobertura: coberturaManifestCorpusPublico() }
}

async function ensayoLocal(): Promise<void> {
  const { fuentes, excluidas, cobertura } = await corpusLocal()
  salidaEnsayo({
    modo: 'ENSAYO_LOCAL_SIN_BD',
    red: 'NO_USADA',
    baseDatos: 'NO_USADA',
    cobertura: cobertura.map(entrada => ({ ...entrada, estado: entrada.dinamica ? 'PENDIENTE_DE_LISTA_POSITIVA_EN_STAGING' : 'EXTRAIDA_LOCALMENTE' })),
    fuentes: fuentes.map(fuente => ({ tipo: fuente.tipo, titulo: fuente.titulo, ruta: fuente.urlFuente, huella: fuente.huella })),
    excluidas,
    tarifas: { estado: 'NO_CONSULTADAS_SIN_BD', rutas: cobertura.filter(entrada => entrada.tipo === 'TARIFA').map(entrada => entrada.ruta) },
    desactivacionTarifas: { estado: 'NO_CALCULADA_SIN_BD' },
  })
}

async function prepararPlanStaging(secreto: Buffer): Promise<void> {
  if (!reciboRuta) throw new Error('RECIBO_REQUERIDO')
  const evidencia = await cargarSnapshotPrivadoAnterior()
  const { default: prisma } = await import('@/lib/prisma')
  const { Prisma } = await import('@prisma/client')
  const { crearReciboDesactivacionTarifas, identificadorPlanDesactivacionTarifas, planificarDesactivacionTarifasNoElegibles, tarifasPublicas } = await import('@/lib/asistente/ingesta')
  const preparado = await prisma.$transaction(async tx => {
    await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`)
    const tarifas = await tarifasPublicas(tx)
    const plan = await planificarDesactivacionTarifasNoElegibles(tarifas.map(tarifa => tarifa.origen), evidencia, tx)
    return { tarifasElegibles: tarifas.length, plan, recibo: crearReciboDesactivacionTarifas(plan, secreto) }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30_000 })
  await escribirRecibo(reciboRuta, preparado.recibo)
  salidaEnsayo({
    modo: 'ENSAYO_STAGING_SOLO_LECTURA',
    target: 'staging',
    tarifasElegibles: preparado.tarifasElegibles,
    candidatasDesactivacion: preparado.plan.candidatas,
    ignoradasNoAcreditadas: preparado.plan.ignoradasNoAcreditadas,
    motivos: preparado.plan.motivos,
    planId: identificadorPlanDesactivacionTarifas(preparado.plan),
    estadoPlan: preparado.recibo.estado,
  })
}

async function aplicarPlanStaging(secreto: Buffer): Promise<void> {
  const { fuentes } = await corpusLocal()
  const recibo = await leerRecibo(reciboRuta!)
  const evidencia = await cargarSnapshotPrivadoAnterior()
  const { default: prisma } = await import('@/lib/prisma')
  const { Prisma } = await import('@prisma/client')
  const {
    aplicarDesactivacionTarifas, confirmarReciboAplicado, identificadorPlanDesactivacionTarifas, indexarFuente,
    huellaOrigenesAptosTarifas, verificarReciboDesactivacionTarifas,
  } = await import('@/lib/asistente/ingesta')
  verificarReciboDesactivacionTarifas(recibo, secreto)
  if (recibo.plan.snapshotPrivadoHuella !== evidencia.huella) throw new Error('PLAN_TARIFAS_SNAPSHOT_DISTINTO')
  const resultado = await prisma.$transaction(async tx => {
    const tarifas = await (await import('@/lib/asistente/ingesta')).tarifasPublicas(tx)
    if (huellaOrigenesAptosTarifas(tarifas.map(tarifa => tarifa.origen)) !== recibo.plan.origenesAptosHuella) throw new Error('PLAN_TARIFAS_OBSOLETO')
    const indexadasEstaticas = []
    const indexadasTarifas = []
    // La primera ejecución crea fuentes; una fuente ya existente no se actualiza
    // ni se reactiva. El snapshot completo previo permite revisar manualmente
    // cualquier alta si fuese necesario; el rollback automático no es total.
    for (const fuente of fuentes) indexadasEstaticas.push(await indexarFuente(fuente, undefined, { espacio: 'PUBLICO', estado: 'PUBLICADO', soloCrearSiNoExiste: true }, tx))
    for (const tarifa of tarifas) indexadasTarifas.push(await indexarFuente(tarifa, undefined, { espacio: 'PUBLICO', estado: 'PUBLICADO', soloCrearSiNoExiste: true }, tx))
    const desactivacion = await aplicarDesactivacionTarifas(recibo, secreto, tx)
    return { indexadasEstaticas, indexadasTarifas, tarifasElegibles: tarifas.length, desactivacion }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 900_000 })
  const confirmado = confirmarReciboAplicado(recibo, resultado.desactivacion, secreto)
  await escribirRecibo(reciboRuta!, confirmado)
  salidaEnsayo({
    modo: 'APLICADO_STAGING',
    target: 'staging',
    planId: identificadorPlanDesactivacionTarifas(confirmado.plan),
    fuentesEstaticas: { total: fuentes.length, creadas: resultado.indexadasEstaticas.filter(resultadoIndice => resultadoIndice.creado).length },
    tarifas: { elegibles: resultado.tarifasElegibles, creadas: resultado.indexadasTarifas.filter(resultadoIndice => resultadoIndice.creado).length },
    desactivacion: { desactivados: resultado.desactivacion.desactivados, fragmentosDesactivados: resultado.desactivacion.fragmentosDesactivados },
    rollback: 'LIMITADO_A_DESACTIVACION_TARIFAS',
    estadoPlan: confirmado.estado,
  })
}

async function rollbackDesactivacionStaging(secreto: Buffer): Promise<void> {
  const recibo = await leerRecibo(rollbackRuta!)
  const { default: prisma } = await import('@/lib/prisma')
  const { Prisma } = await import('@prisma/client')
  const { confirmarReciboRevertido, identificadorPlanDesactivacionTarifas, revertirDesactivacionTarifas, verificarReciboDesactivacionTarifas } = await import('@/lib/asistente/ingesta')
  verificarReciboDesactivacionTarifas(recibo, secreto)
  const resultado = await prisma.$transaction(tx => revertirDesactivacionTarifas(recibo, secreto, tx), {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    timeout: 30_000,
  })
  const confirmado = confirmarReciboRevertido(recibo, resultado, secreto)
  await escribirRecibo(rollbackRuta!, confirmado)
  salidaEnsayo({
    modo: 'ROLLBACK_DESACTIVACION_TARIFAS_STAGING',
    target: 'staging',
    planId: identificadorPlanDesactivacionTarifas(confirmado.plan),
    restaurados: resultado.restaurados,
    fragmentosRestaurados: resultado.fragmentosRestaurados,
    rollback: 'LIMITADO_A_DESACTIVACION_TARIFAS',
    estadoPlan: confirmado.estado,
  })
}

async function main() {
  if (objetivo === 'local') return ensayoLocal()
  // Se ejecuta antes de importar Prisma o la implementación de ingesta.
  exigirDestinoStaging()
  if (!secretoRuta) throw new Error('PLAN_SECRETO_REQUERIDO')
  const secreto = await leerSecretoPlan()
  if (rollbackRuta) return rollbackDesactivacionStaging(secreto)
  if (aplicar) return aplicarPlanStaging(secreto)
  return prepararPlanStaging(secreto)
}

main().catch(error => { console.error(error instanceof Error ? error.message : 'INGESTA_FALLIDA'); process.exitCode = 1 })
