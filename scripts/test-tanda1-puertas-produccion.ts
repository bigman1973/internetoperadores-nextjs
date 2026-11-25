/**
 * Tanda 1 de producción (25/11/2026) · puertas que dejan fuera de producción lo que no entra:
 * Microsoft 365 en la ficha, ficha de cliente nueva e importaciones del CRM (ISP/HubSpot/vínculos).
 * Pruebas puras (entorno simulado) y estáticas (cada ruta comprueba la puerta antes de trabajar).
 * Sin red ni BD.
 */
import { readFileSync } from 'node:fs'
import { m365Habilitado, canalCorreoInicial, m365Modo } from '../lib/area1-m365'
import { fichaNuevaHabilitada, importacionesCrmCerradas } from '../lib/area1-puertas-produccion'

let ok = 0, ko = 0
function caso(nombre: string, cond: boolean) {
  if (cond) { ok++; console.log(`  ✓ ${nombre}`) } else { ko++; console.log(`  ✗ ${nombre}`) }
}
const PROD = { VERCEL_ENV: 'production' }
const PREVIEW = { VERCEL_ENV: 'preview', FINANCE_STAGING_SANDBOX: '1' }

console.log('Puertas (entorno)')
caso('M365 apagado en producción por defecto', m365Habilitado(PROD) === false)
caso('M365 solo se abre en producción con AREA1_M365_PRODUCCION=1', m365Habilitado({ ...PROD, AREA1_M365_PRODUCCION: '1' }) === true && m365Habilitado({ ...PROD, AREA1_M365_PRODUCCION: 'true' }) === false)
caso('M365 sin cambios en staging/preview/local', m365Habilitado(PREVIEW) && m365Habilitado({}) && m365Habilitado({ VERCEL_ENV: 'development' }))
caso('Staging sigue en modo aislado', m365Modo(PREVIEW) === 'aislado')
caso('Ficha nueva apagada en producción por defecto', fichaNuevaHabilitada(PROD) === false)
caso('Ficha nueva solo con AREA1_FICHA_NUEVA_PRODUCCION=1', fichaNuevaHabilitada({ ...PROD, AREA1_FICHA_NUEVA_PRODUCCION: '1' }) === true)
caso('Ficha nueva sin cambios en staging', fichaNuevaHabilitada(PREVIEW) === true)
caso('Importaciones CRM cerradas en producción por defecto', importacionesCrmCerradas(PROD) === true)
caso('Importaciones abiertas en producción solo con AREA1_IMPORTACIONES_PRODUCCION=1', importacionesCrmCerradas({ ...PROD, AREA1_IMPORTACIONES_PRODUCCION: '1' }) === false)
caso('Importaciones sin cambios en staging (las sigue cerrando su contrato del Área 4)', importacionesCrmCerradas(PREVIEW) === false)
caso('Canal por defecto corporativo si M365 está apagado', canalCorreoInicial({ enabled: true, connected: true, mail: true, m365: false }) === 'corporativo')
caso('Canal por defecto Mi Outlook si M365 está encendido (staging)', canalCorreoInicial({ enabled: true, connected: true, mail: true, m365: true }) === 'outlook')

console.log('Rutas (estático: la puerta va antes de cualquier trabajo)')
const leer = (p: string) => readFileSync(p, 'utf8')
function primeraLinea(p: string, fn: RegExp, puerta: string) {
  const s = leer(p); const m = fn.exec(s)
  if (!m) return false
  const cuerpo = s.slice(m.index + m[0].length).split('\n').map((l) => l.trim()).filter(Boolean)
  return cuerpo[0]?.includes(puerta) ?? false
}
const IMPORT = 'importacionesCrmCerradas()'
caso('ISP importar POST', primeraLinea('app/api/admin/crm/isp/importar/route.ts', /export async function POST\(request: Request\) \{/, IMPORT))
caso('HubSpot historial POST', primeraLinea('app/api/admin/crm/hubspot/historial/route.ts', /export async function POST\(request: Request\) \{/, IMPORT))
caso('HubSpot historial GET (simular también lee HubSpot)', primeraLinea('app/api/admin/crm/hubspot/historial/route.ts', /export async function GET\(\) \{/, IMPORT))
caso('ISP vínculos GET', primeraLinea('app/api/admin/crm/isp/vinculos/route.ts', /export async function GET\(request: Request\) \{/, IMPORT))
caso('ISP vínculos POST', primeraLinea('app/api/admin/crm/isp/vinculos/route.ts', /export async function POST\(request: Request\) \{/, IMPORT))
caso('Página ISP', primeraLinea('app/admin/crm/isp/page.tsx', /export default async function \w+\(\) \{/, IMPORT))
caso('Página HubSpot historial', primeraLinea('app/admin/crm/hubspot-historial/page.tsx', /export default async function \w+\(\) \{/, IMPORT))
caso('Borrador IA M365', primeraLinea('app/api/admin/crm/contactos/[id]/m365/borrador/route.ts', /export async function GET\([^)]*\)[^{]*\{/, 'm365Habilitado()'))
caso('Actualizar/ver respuestas M365', primeraLinea('app/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365/route.ts', /async function cargar\([^)]*\) \{/, 'm365Habilitado()'))
caso('Resumen IA de la ficha nueva', primeraLinea('app/api/admin/crm/empresas/[id]/resumen-ia/route.ts', /export async function GET\([^)]*\)[^{]*\{/, 'fichaNuevaHabilitada()'))
const act = leer('app/api/admin/crm/contactos/[id]/actividades/route.ts')
const iVia = act.indexOf("const viaOutlookMail = type === 'CORREO' && body.viaOutlook === true")
const iPuerta = act.indexOf('if (viaOutlookMail && !m365Habilitado())')
const iToken = act.indexOf("getOutlookUserAccessToken(authorId, authorEmail, 'correo')")
const iEnvio = act.indexOf('enviarCorreoComoUsuario(')
caso('Correo por Mi Outlook bloqueado antes de pedir token o enviar', iVia > 0 && iPuerta > iVia && iToken > iPuerta && iEnvio > iPuerta)
caso('Ficha de empresa usa el editor anterior si la nueva está apagada', /const editar = \(await searchParams\)\?\.editar === '1' \|\| !fichaNuevaHabilitada\(\)/.test(leer('app/admin/crm/empresas/[id]/page.tsx')))
const con = leer('lib/outlook-user-connection.ts')
caso('Con M365 apagado solo se piden scopes de calendario', /m365Habilitado\(\) \? M365_SCOPES_TODOS : M365_SCOPES_CALENDARIO/.test(con) && !/OUTLOOK_SCOPES/.test(con))
caso('Estado de conexión: mail=false si M365 apagado', /mail: m365Habilitado\(\) && /.test(con))
caso('Compositor oculta canal Mi Outlook/IA si M365 apagado', /outlookConnection\.m365 !== false && <Area1M365Correo/.test(leer('components/admin/CrmActivityComposer.tsx')))
{
  const w = leer('components/admin/CrmContactoWorkspace.tsx')
  caso('Cronología oculta acciones M365 si apagado (prop m365Activo, sin variable fuera de ámbito)',
    /m365Activo=\{outlookConnection\.m365 !== false\}/.test(w) && /canWrite && m365Activo && \(activity\.type === 'CORREO'/.test(w) && /function ActivityCard\(\{[^}]*m365Activo/.test(w))
  const cuerpo = w.slice(w.indexOf('function ActivityCard('), w.indexOf('function ActivityCard(') + 6000)
  caso('ActivityCard no usa outlookConnection directamente', !/outlookConnection/.test(cuerpo.split('\nfunction ', 2)[0]))
}

console.log(`\n${ok}/${ok + ko} correctas`)
if (ko) process.exit(1)
