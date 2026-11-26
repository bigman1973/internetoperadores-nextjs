/* Área 1 · batería de la ficha de cliente (sin BD, sin red). */
import { readFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import {
  SIN_DATO, normCodigo, iniciales, ultimos12, cuotaMensual, serieMensual, vencimientoTarea, categoriaActividad, fuenteActividad,
  tipoTexto, calcularAvisos, limpiarContextoIa, contextoTieneCostes, interpretarPuntos, haceDias, generarPuntosIa, construirPromptFicha,
  ETIQUETA_RESULTADO_AISLADO, type ContextoResumenIa,
} from '../lib/area1-ficha-cliente'
let ok = 0, ko = 0
const t = (n: string, c: boolean) => { if (c) { ok++; console.log('  ✔', n) } else { ko++; console.log('  ✘', n) } }
const hoy = new Date('2026-11-25T10:00:00Z')

// 1. Helpers puros
t('normCodigo: 006004 y 6004 son el mismo cliente', normCodigo('006004') === normCodigo('6004') && normCodigo('0') === '0')
t('iniciales: quita la forma jurídica', iniciales('Vall Companys, S.A.') === 'VC' && iniciales('Ejemplo') === 'EJ' && iniciales('') === '?')
const m12 = ultimos12(hoy)
t('últimos 12 meses: dic-2025 … nov-2026', m12.length === 12 && m12[0] === '2025-12' && m12[11] === '2026-11')
const cuota = cuotaMensual([{ cuota: 100, estado: 'Activo' }, { cuota: 50.5, estado: 'Activo' }, { cuota: 999, estado: 'Baja' }, { cuota: null, estado: 'Activo' }])
t('cuota mensual: solo activos y cuenta los que no tienen importe', cuota.total === 150.5 && cuota.activos === 3 && cuota.sinImporte === 1)
t('cuota mensual: sin contratos → null (sin dato, nada inventado)', cuotaMensual([]).total === null)
const serie = serieMensual([{ mes: '2026-11', base: 10 }, { mes: '2026-11', base: 5.25 }, { mes: '2025-01', base: 99 }], m12)
t('serie de facturación: suma por mes y descarta fuera de rango', serie[11] === 15.25 && serie.reduce<number>((a, b) => a + (b ?? 0), 0) === 15.25)
t('serie sin facturas no fabrica ceros y conserva un cero acreditado', serie[0] === null && serieMensual([{ mes: '2026-11', base: 0 }], m12)[11] === 0)
t('vencimiento: vencida / hoy / fecha', vencimientoTarea(new Date('2026-11-20T10:00:00Z'), hoy).txt === 'Vencida' && vencimientoTarea(new Date('2026-11-25T18:00:00Z'), hoy).txt === 'Hoy' && vencimientoTarea(new Date('2026-12-01T10:00:00Z'), hoy).txt === '1/12')
t('categorías de actividad', categoriaActividad('CORREO') === 'mail' && categoriaActividad('REUNION') === 'meet' && categoriaActividad('LLAMADA') === 'note')
t('fuente: HubSpot, Outlook y Panel', fuenteActividad('HUBSPOT', null) === 'HubSpot' && fuenteActividad('LOCAL', { guardadoEnEnviados: true }) === 'Outlook' && fuenteActividad('LOCAL', { buzonCalendario: 'x' }) === 'Outlook' && fuenteActividad('LOCAL', {}) === 'Panel')
t('tipo: correo recibido/enviado', tipoTexto('CORREO', 'ENTRANTE') === 'Correo recibido' && tipoTexto('CORREO', 'SALIENTE') === 'Correo enviado')
t('etiqueta opción C: «Pruebas: no creada en Outlook»', ETIQUETA_RESULTADO_AISLADO.CALENDARIO_NO_CREADO_AISLADO === 'Pruebas: no creada en Outlook')
t('hace N días', haceDias(new Date('2026-11-22T10:00:00Z'), hoy) === 'hace 3 días' && haceDias(hoy, hoy) === 'hoy')

// 2. Avisos y visibilidad por rol
const base = { margenPct: 12.3, mesMargen: '2026-10', pendiente: 100, devueltos: 1, devueltoImporte: 100, permanencias: ['2026-12-15', '2028-01-01'], hoy, subida: null }
const avSuper = calcularAvisos({ ...base, verMargen: true })
const avCom = calcularAvisos({ ...base, verMargen: false })
t('avisos: margen bajo solo para quien ve márgenes', avSuper.some((a) => a.titulo === 'Margen bajo') && !avCom.some((a) => /margen/i.test(a.titulo + a.texto)))
t('avisos: recibo devuelto y permanencia en 3 meses', avCom.some((a) => a.titulo === 'Recibo devuelto') && avCom.some((a) => a.titulo === 'Permanencia' && a.texto.startsWith('1 ')))
t('avisos: sin datos → ninguno', calcularAvisos({ margenPct: null, mesMargen: null, verMargen: true, pendiente: null, devueltos: 0, devueltoImporte: 0, permanencias: [], hoy, subida: null }).length === 0)

// 3. IA: sin costes ni márgenes, sin correos ni teléfonos
const ctx: ContextoResumenIa = {
  cliente: 'Empresa de prueba', tipo: 'Empresa', clienteDesde: '2019', contratosActivos: 2, cuotaMensual: 100, productos: ['Fibra'], facturado12m: 1200, pendienteCobro: 0, recibosDevueltos: 0, subida: null, permanenciasProximas: 0,
  ultimasActividades: [
    { fecha: '2026-11-20', tipo: 'Nota', titulo: 'Revisar margen de las líneas', texto: 'el coste ha subido' },
    { fecha: '2026-11-21', tipo: 'Correo enviado', titulo: 'Propuesta', texto: 'Escribir a prueba@ejemplo.com o al 600 000 000' },
  ],
  tareasPendientes: [], negociosAbiertos: [],
}
const limpio = limpiarContextoIa(ctx)
t('contexto IA: quita actividades que hablan de coste o margen', limpio.ultimasActividades.length === 1 && !/margen|coste/i.test(JSON.stringify(limpio)))
t('contexto IA: oculta correos y teléfonos', !/@ejemplo\.com|600 000 000/.test(JSON.stringify(limpio)))
t('contexto IA: no lleva claves de coste ni margen', !contextoTieneCostes(limpio) && contextoTieneCostes({ margen: 1 }))
t('respuesta IA: 4 puntos como máximo y filtra márgenes', JSON.stringify(interpretarPuntos('{"puntos":["a","b","El margen es bajo","c","d"]}')) === '["a","b","c","d"]' && interpretarPuntos('no json') === null)
t('prompt IA: prohíbe costes, márgenes e inventar', /Nunca menciones costes, márgenes ni rentabilidad/.test(construirPromptFicha(limpio)[0].content) && /no lo inventes/.test(construirPromptFicha(limpio)[0].content))
let capturado = ''
const falso = { chat: { completions: { create: async (a: Record<string, unknown>) => { capturado = JSON.stringify(a); return { choices: [{ message: { content: '{"puntos":["uno","dos","tres","cuatro"]}' } }] } } } } }
;(async () => {
  const p = await generarPuntosIa(limpio, falso)
  t('generarPuntosIa: json_object, gpt-4.1-mini por defecto y 4 puntos', p?.length === 4 && /json_object/.test(capturado) && /gpt-4\.1-mini/.test(capturado))
  let lanzo = false
  try { await generarPuntosIa({ ...limpio, margen: 5 } as unknown as ContextoResumenIa, falso) } catch { lanzo = true }
  t('generarPuntosIa: se niega si el contexto lleva márgenes', lanzo)

  // 4. Código: visibilidad, reutilización y literalidad de la maqueta
  const lib = readFileSync('lib/area1-ficha-cliente.ts', 'utf8')
  const comp = readFileSync('components/admin/FichaCliente.tsx', 'utf8')
  const page = readFileSync('app/admin/crm/empresas/[id]/page.tsx', 'utf8')
  const ruta = readFileSync('app/api/admin/crm/empresas/[id]/resumen-ia/route.ts', 'utf8')
  t('servidor: el comercial no consulta Rentabilidad (verMargen = nivel ≠ COMERCIAL)', /const verMargen = nivel !== 'COMERCIAL'/.test(lib) && /if \(verMargen && codigosNorm\.length\)/.test(lib))
  t('servidor: márgenes de contrato a null sin permiso', /margenPct: verMargen &&/.test(lib))
  t('negocios HubSpot: solo cerrados de pipelines de IO (LFDeal fuera)', /!n\.cerrado \|\| !n\.activo \|\| !pipeIo\.has\(n\.pipelineHubspotId\)/.test(lib) && /Negocio de HubSpot \$\{n\.ganado \? 'ganado' : 'perdido'\}/.test(lib))
  t('no crea negocios: el lector no escribe en la BD', !/prisma\.\w+\.(create|update|upsert|delete|createMany|updateMany|deleteMany)\(/.test(lib) && !/\$executeRaw/.test(lib))
  t('ruta IA: contexto con nivel COMERCIAL, caché diaria por empresa y día', /cargarFichaCliente\(id, 'COMERCIAL', hoy\)/.test(ruta) && /empresaId_dia/.test(ruta) && /area1CrmFichaIa\.findUnique/.test(ruta))
  t('ruta IA: bloquea «Actuar como» y exige permiso de Empresas', /bloqueoActuacion\(session\)/.test(ruta) && /authorizeCrmEmpresas\(\)/.test(ruta))
  t('cajón: reutiliza POST /actividades y GET /m365/borrador, «Mi Outlook» por defecto', /\/actividades`/.test(comp) && /\/m365\/borrador\?/.test(comp) && /useState\(m365\.conexion\.enabled\)/.test(comp) && />Otra versión</.test(comp))
  t('cajón: avisos de pruebas literales de la maqueta', comp.includes('Pruebas: los correos se desvían a la dirección de prueba; ningún cliente los recibe.') && comp.includes('Pruebas: los invitados se cambian por la dirección de prueba.'))
  t('la IA nunca envía: Enviar solo en el botón', !/useEffect\(\(\) => \{[^}]*enviar\(\)/.test(comp))
  const maqueta = '/home/ubuntu/upload/maqueta_crm_ficha_cliente_aprobada.html'
  if (existsSync(maqueta)) {
    const m = readFileSync(maqueta, 'utf8')
    const textos = ['Lo que hay que saber', 'Proponer correo de seguimiento', 'Preparar la próxima reunión', 'La IA propone; tú revisas y envías.', 'Próximos pasos', 'Negocios abiertos', 'Datos de la empresa', 'Comunicaciones', 'Toda la actividad', 'Contratos y servicios', 'Buscar contrato, sede o producto', 'Facturado, últimos 12 meses', 'Cobros', 'Personas de contacto', 'Ingreso y coste por mes', 'Subida de precios 2027', 'Abrir en el simulador', 'Preparar aviso con IA', 'Escribir correo', 'Nueva reunión', 'Redactar con IA', 'Crear en mi calendario de Outlook', 'Añadir reunión de Microsoft Teams', 'Queda en tus Enviados de Outlook y en esta ficha. Las respuestas del cliente aparecen en la actividad.', 'Base legal registrada con fecha y origen. Pendiente de validar con el asesor de protección de datos.']
    t('textos de la maqueta presentes en la ficha', textos.every((x) => m.includes(x) && comp.includes(x)))
    const clases = [...new Set([...m.slice(m.indexOf('<header'), m.indexOf('<script>')).matchAll(/class="([^"]+)"/g)].flatMap((x) => x[1].split(/\s+/)))].filter((c) => !['ex', 'E', 'ok'].includes(c))
    const faltan = clases.filter((c) => !new RegExp(`["\` ]${c.replace('.', '\\.')}["\` ]|className="[^"]*\\b${c}\\b`).test(comp))
    t('estado «Cliente activo» con pill ok dinámica', /className=\{`pill \$\{e\.estado\.tono\}`\}/.test(comp) && /txt: 'Cliente activo', tono: 'ok'/.test(lib))
    t(`clases del marcado de la maqueta usadas en la ficha${faltan.length ? ` (faltan: ${faltan.join(', ')})` : ''}`, faltan.length === 0)
  } else console.log('  · maqueta no disponible: se omite la comparación literal')
  const css = readFileSync('app/admin/crm/empresas/[id]/area1-ficha.css', 'utf8')
  t('CSS generado: todo bajo .io-ui.area1-ficha y con cabecera de generador', css.includes('scripts/area1-ficha-css.py') && css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((r) => r.trim()).filter((r) => r && !r.startsWith('@media')).every((r) => /^(\.io-ui\.area1-ficha|@media)/.test(r.replace(/^[^{]*\{/, (h) => h).trim()) || r.startsWith('.io-ui.area1-ficha') || /^\s*\.io-ui\.area1-ficha/.test(r) || r.includes('{') === false))
  t('página: raíz io-ui area1-ficha con fuentes y editor antiguo con ?editar=1', /io-ui area1-ficha \$\{ioFontClasses\}/.test(page) && /editar === '1'/.test(page) && /CrmCompanyWorkspace/.test(page))
  const reg = readFileSync('lib/area4/section-registry.ts', 'utf8')
  t('registry del Área 4: ruta resumen-ia en crm.empresas', /\/api\/admin\/crm\/empresas\/\[id\]\/resumen-ia/.test(reg))
  const mig = readFileSync('prisma/migrations/20261201_area1_crm_ficha_ia/migration.sql', 'utf8')
  t('migración aditiva con prefijo area1_ y down.sql', /CREATE TABLE (IF NOT EXISTS )?"?area1_crm_ficha_ia/.test(mig) && !/\b(DROP|ALTER TABLE (?!"?area1_)|DELETE|UPDATE)\b/i.test(mig) && existsSync('prisma/migrations/20261201_area1_crm_ficha_ia/down.sql'))
  const diff = execSync('git diff --name-only HEAD', { encoding: 'utf8' })
  t('no toca ficheros comunes de otras áreas (audit, live-admin, kit io-ui)', !/lib\/area4\/(audit|live-admin)\.ts|components\/io-ui\//.test(diff))
  console.log(`\nFicha de cliente: ${ok}/${ok + ko}`)
  if (ko) process.exit(1)
})()
void SIN_DATO
