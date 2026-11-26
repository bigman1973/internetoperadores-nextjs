/**
 * Tanda pequeña (26/11/2026) · tres detalles vistos en producción:
 *  1) «ISP Gestión» (menú) y los accesos «Importar de ISP», «Revisar» y «Simular» del Resumen CRM se ocultan con la puerta cerrada.
 *  2) «Conectar mi Outlook» no se ofrece si Microsoft 365 está cerrado (m365Habilitado() falso).
 *  3) «Margen por mes» del Dashboard: solo los meses de fiabilidad baja (<60 %) son provisionales.
 * Sin red ni BD.
 */
import { readFileSync } from 'node:fs'
import { getSidebarNavigation, filterAuthorizedSidebarNavigation, isSidebarNavigationGroup, type SidebarNavigationEntry } from '../components/admin/sidebar-navigation'
import { importacionesCrmCerradas } from '../lib/area1-puertas-produccion'
import { m365Habilitado } from '../lib/area1-m365'
import { esFiabilidadBaja } from '../lib/area4/dashboard-native-projection'
let ok = 0, ko = 0
const caso = (n: string, c: boolean) => { if (c) { ok++; console.log(`  ✓ ${n}`) } else { ko++; console.log(`  ✗ ${n}`) } }
const src = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const hrefs = (nav: SidebarNavigationEntry[]): string[] => nav.flatMap(e => isSidebarNavigationGroup(e) ? hrefs(e.children) : [e.href, ...hrefs((e.subitems ?? []) as unknown as SidebarNavigationEntry[])])
const tiene = (nav: SidebarNavigationEntry[]) => hrefs(nav).includes('/admin/crm/isp')

console.log('1) Menú: ISP Gestión')
for (const pres of ['historico', 'agrupado'] as const) {
  caso(`${pres}: abierto por defecto (staging)`, tiene(getSidebarNavigation('staging', true, pres)))
  caso(`${pres}: abierto si la puerta está abierta`, tiene(getSidebarNavigation('production', false, pres, false, { crmImportacionesCerradas: false })))
  caso(`${pres}: oculto con la puerta cerrada`, !tiene(getSidebarNavigation('production', false, pres, false, { crmImportacionesCerradas: true })))
  const filtrado = filterAuthorizedSidebarNavigation('production', () => true, false, pres, () => true, false, { crmImportacionesCerradas: true })
  caso(`${pres}: el filtro de permisos tampoco lo recupera`, !tiene(filtrado))
  caso(`${pres}: el resto del menú CRM sigue (Partners)`, hrefs(getSidebarNavigation('production', false, pres, false, { crmImportacionesCerradas: true })).includes('/admin/crm/partners'))
  // Main conserva su disponibilidad read-only como argumento separado, no como un grant.
  const coexistentes = getSidebarNavigation('production', true, pres, true, { crmImportacionesCerradas: true })
  caso(`${pres}: CRM cerrado y Rentabilidad read-only coexisten`, !tiene(coexistentes) && hrefs(coexistentes).includes('/admin/rentabilidad'))
  caso(`${pres}: Sistemas, Impuestos y Presupuesto siguen fuera`, !hrefs(coexistentes).some(h => ['/admin/sistemas', '/admin/finanzas/impuestos', '/admin/finanzas/presupuesto'].some(p => h === p || h.startsWith(p + '/'))))
}
caso('La puerta de producción cierra y la de preview abre', importacionesCrmCerradas({ VERCEL_ENV: 'production' }) && !importacionesCrmCerradas({ VERCEL_ENV: 'preview' }))
const layout = src('app/admin/layout.tsx')
caso('El layout calcula la puerta en servidor y la pasa al menú SSR y al de cliente', /importacionesCrmCerradas\(\)/.test(layout) && /crmImportacionesCerradas=\{importacionesCrmCerradas\(\)\}/.test(layout) && /\{ crmImportacionesCerradas: importacionesCrmCerradas\(\) \}/.test(layout))
caso('El menú de cliente usa el booleano del servidor, no process.env', /crmImportacionesCerradas/.test(src('components/admin/lazy/InteractiveAdminSidebarMenu.tsx')) && !/process\.env/.test(src('components/admin/lazy/InteractiveAdminSidebarMenu.tsx')))

console.log('1b) Resumen CRM: Importar / Revisar / Simular')
const crm = src('app/admin/crm/page.tsx')
caso('«Importar de ISP» depende de la puerta', /vista\.puede\.importarIsp && importacionesAbiertas && <Link href="\/admin\/crm\/isp">/.test(crm))
caso('«Revisar» depende de la puerta', /vista\.puede\.vinculosIsp && importacionesAbiertas \?/.test(crm))
caso('«Simular» depende de la puerta', /vista\.puede\.importarIsp && importacionesAbiertas \? <Link className="btn small" href="\/admin\/crm\/hubspot-historial"/.test(crm))
caso('importacionesAbiertas sale de importacionesCrmCerradas()', /const importacionesAbiertas = !importacionesCrmCerradas\(\)/.test(crm))

console.log('2) Conectar mi Outlook')
caso('M365 cerrado en producción => no se ofrece', m365Habilitado({ VERCEL_ENV: 'production' }) === false)
caso('M365 abierto en staging => se ofrece', m365Habilitado({ VERCEL_ENV: 'preview' }) === true)
caso('Resumen CRM: puedeConectar exige m365Habilitado()', /const puedeConectar = m365Habilitado\(\) &&/.test(crm))
caso('Compositor de actividad: exige m365 !== false', /outlookConnection\.enabled && outlookConnection\.m365 !== false && !outlookConnection\.connected/.test(src('components/admin/CrmActivityComposer.tsx')))
caso('Ficha M365 (contacto): exige m365 !== false', /conexion\.enabled && conexion\.m365 !== false && !conexion\.connected/.test(src('components/admin/Area1M365.tsx')))
caso('Ficha de cliente: exige m365 !== false', /m365\.conexion\.enabled && m365\.conexion\.m365 !== false && !m365\.conexion\.connected/.test(src('components/admin/FichaCliente.tsx')))
caso('Cajón de correo de la ficha: también exige m365 !== false', /viaOutlook && m365\.conexion\.enabled && m365\.conexion\.m365 !== false && !outlookListo/.test(src('components/admin/FichaCliente.tsx')))

console.log('3) Margen por mes: provisional solo con fiabilidad baja')
const serie: Record<string, number> = { '2026-01': 90.6, '2026-02': 89.5, '2026-03': 91.1, '2026-04': 86.2, '2026-05': 80.4, '2026-06': 87.2, '2026-07': 69.8, '2026-08': 75.1, '2026-09': 77.1, '2026-10': 57.1 }
caso('Solo octubre es provisional en la serie de referencia', Object.entries(serie).filter(([, q]) => esFiabilidadBaja(q)).map(([m]) => m).join() === '2026-10')
caso('Sin dato de calidad no se marca', esFiabilidadBaja(null) === false)
caso('La proyección ya no marca por «hay algo estimado o pendiente»', !/total\.estimated \|\| products\.some/.test(src('lib/area4/dashboard-native-projection.ts')))

console.log(`\n${ok} correctos, ${ko} fallos`)
process.exit(ko ? 1 : 0)
