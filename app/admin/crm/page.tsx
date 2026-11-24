import Link from 'next/link'
import { requireAuth } from '../../../lib/middleware/auth'
import { registrarArea } from '../../../lib/permisos'
import prisma from '../../../lib/prisma'
import { cargarResumenCrm, fmtEur } from '../../../lib/area1-crm-resumen'
import { nivelDe, resolverVista, type NivelResumen } from '../../../lib/area1-crm-resumen-vista'
import { AlcanceSeg, TareaHecho, VerComo } from './ResumenControles'
import '@/components/io-ui/io-ui.css'
import { ioFontClasses } from '@/components/io-ui/fonts'
import './area1-resumen.css'

export const dynamic = 'force-dynamic'

/*
 * Área 1 · Resumen del CRM (/admin/crm). Marcado copiado de maqueta_crm_resumen_aprobada.html.
 * Los datos son los reales del panel y se filtran en servidor según el rol (lib/area1-crm-resumen-vista.ts).
 * Donde aún no hay dato se muestra un estado vacío con el motivo; nunca cifras de ejemplo.
 */

const NIVEL_TXT: Record<NivelResumen, string> = { SUPERADMIN: 'superadmin', GERENTE: 'gerente', COMERCIAL: 'comercial' }
const n0 = (v: number) => v.toLocaleString('es-ES')
const COLORES_ETAPA = ['var(--before)', '#F3A37A', 'var(--accent)', '#C23F00', '#8F2E00', '#6B2200', '#4A1800']

type Busqueda = { alcance?: string; verComo?: string }

export default async function CrmPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const session = await requireAuth('admin')
  await Promise.all([
    registrarArea('admin.crm', 'CRM', 'admin'),
    registrarArea('admin.crm.particulares', 'CRM > Particulares', 'admin.crm'),
    registrarArea('admin.crm.empresas', 'CRM > Empresas', 'admin.crm'),
    registrarArea('admin.crm.partners', 'CRM > Partners', 'admin.crm'),
    registrarArea('admin.crm.contactos', 'CRM > Contactos', 'admin.crm'),
    registrarArea('admin.crm.listas', 'CRM > Listas y segmentos', 'admin.crm'),
  ])
  const params = await searchParams
  const userId = Number(session.user.id)
  const yo = await prisma.usuarioAdmin.findUnique({ where: { id: userId }, select: { id: true, nombre: true, rol: true, roles: true } })
  const real = yo || { id: userId, nombre: session.user.name || 'Usuario', rol: (session.user as { role?: string }).role || null, roles: [] as string[] }
  const esSuper = nivelDe(real.rol, real.roles) === 'SUPERADMIN'
  // «Ver como» solo existe para el superadmin real: para el resto ni se consultan los usuarios.
  const usuarios = esSuper
    ? await prisma.usuarioAdmin.findMany({ where: { activo: true, id: { not: real.id } }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, rol: true, roles: true } })
    : []
  const candidato = esSuper && params.verComo ? usuarios.find((u) => String(u.id) === String(params.verComo)) || null : null
  const vista = resolverVista(real, { alcance: params.alcance, verComo: params.verComo }, candidato)
  const d = await cargarResumenCrm(vista)
  const hoyTxt = d.fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' })
  const mesTxt = d.fecha.toLocaleDateString('es-ES', { month: 'long', timeZone: 'Europe/Madrid' })
  const enVerComo = vista.verComoActivo

  const kpis: Array<[string, string, string]> = [
    vista.nivel === 'COMERCIAL'
      ? ['Mis clientes activos', '—', 'falta enlazar tu código de comercial de ISP con tu usuario']
      : ['Clientes activos', d.kpis.clientesActivos == null ? '—' : n0(d.kpis.clientesActivos), d.kpis.clientesActivos == null ? 'pendiente de importar de ISP Gestión' : `de ISP Gestión, ${n0(d.kpis.clientesConFicha)} con ficha`],
    ['Leads abiertos', n0(d.kpis.leadsAbiertos), d.kpis.leadsAbiertos ? `${n0(d.kpis.leadsSinContactar)} sin contactar en 7 días` : (vista.alcance === 'MIO' ? 'ninguno asignado a ti' : 'ninguno abierto')],
    ['Pipeline ponderado', fmtEur(d.kpis.ponderado), d.pipelines.some((p) => p.total) ? 'importe × probabilidad de la etapa' : 'sin negocios abiertos todavía'],
    [`Ganado en ${mesTxt}`, n0(d.kpis.ganadosMes), d.kpis.ganadosMes ? `${fmtEur(d.kpis.ganadosImporte)} de importe` : 'ningún negocio ganado este mes'],
    ['Reuniones esta semana', n0(d.kpis.reunionesSemana), 'del CRM · Outlook al conectar Microsoft 365'],
    d.kpis.vinculosPendientes !== undefined
      ? ['Vínculos ISP por confirmar', d.kpis.vinculosPendientes == null ? '—' : n0(d.kpis.vinculosPendientes), d.kpis.vinculosPendientes == null ? 'aún no se ha importado ISP' : 'fichas propuestas al importar']
      : ['Tareas vencidas', n0(d.kpis.tareasVencidas), vista.alcance === 'MIO' ? 'tuyas, sin completar' : 'del equipo, sin completar'],
  ]

  const maxOrigen = Math.max(1, ...d.origenes.map((s) => s.n))
  const W = 380, rh = 26, pl = 170
  const maxEtapas = Math.max(0, ...d.pipelines.map((p) => p.etapas.length))
  const verComoOpciones = [
    { id: null, etiqueta: `Ver como: ${real.nombre} (${NIVEL_TXT[vista.real.nivel]})` },
    ...usuarios.map((u) => ({ id: u.id, etiqueta: `Ver como: ${u.nombre} (${NIVEL_TXT[nivelDe(u.rol, u.roles)]})` })),
  ]

  // Misma raíz que <IoShell> (io-ui + fuentes de next/font) con la clase propia del Resumen
  return (
    <div className={`io-ui area1-resumen ${ioFontClasses}`}>
      <header className="top">
        <div className="wrap">
          <div className="bar">
            <div className="brand"><b>internet<i>operadores</i></b><span className="eyebrow">CRM · <span>{hoyTxt}</span></span></div>
            <div className="scn">
              <AlcanceSeg alcance={vista.alcance} habilitado={vista.puede.alternarAlcance} />
              {vista.puede.verComo && <VerComo opciones={verComoOpciones} actual={enVerComo ? vista.usuarioId : null} />}
              <button className="btn primary" type="button" disabled title="Hoy los leads entran por los formularios de la web; el alta manual desde aquí llega en la próxima tanda">+ Nuevo lead</button>
              <Link className="btn" href="/admin/crm/contactos" title="Abre la ficha y registra la reunión desde su actividad">Nueva reunión</Link>
              <button className="btn" type="button" disabled title="Llega con la integración de Microsoft 365 (borrador con IA, nunca envío automático)">Escribir correo con IA</button>
            </div>
          </div>
          <form className="row" style={{ paddingBottom: 10 }} action="/admin/crm/contactos" method="get" role="search">
            <input className="searchbig" type="search" name="search" placeholder="Buscar contacto, empresa, NIF, teléfono o contrato" aria-label="Buscar en el CRM" />
          </form>
          <nav className="subnav" aria-label="Secciones del CRM">
            <Link href="/admin/crm/contactos">Contactos <b>{n0(d.subnav.contactos)}</b></Link>
            <Link href="/admin/crm/empresas">Empresas y autónomos <b>{n0(d.subnav.empresas)}</b></Link>
            <Link href="/admin/clientes">Clientes <b>{d.subnav.clientes == null ? '—' : n0(d.subnav.clientes)}</b></Link>
            <Link href="/admin/leads">Leads <b>{n0(d.subnav.leads)}</b></Link>
            <Link href="/admin/crm/pipelines">Pipelines <b>{n0(d.subnav.pipelines)}</b></Link>
            <Link href="/admin/crm/listas">Listas <b>{n0(d.subnav.listas)} activas</b></Link>
            <Link href="/admin/crm/partners">Partners <b>{n0(d.subnav.partners)}</b></Link>
            {vista.puede.importarIsp && <Link href="/admin/crm/isp">Importar de ISP</Link>}
          </nav>
        </div>
        <div className="kpis">
          {kpis.map(([l, v, s]) => <div className="kpi" key={l}><div className="eyebrow">{l}</div><div className="v">{v}</div><div className="s">{s}</div></div>)}
        </div>
      </header>

      <main className="wrap">
        {enVerComo
          ? <p className="small muted" style={{ margin: 0 }}>Viendo como <b>{vista.usuarioNombre}</b> ({NIVEL_TXT[vista.nivel]}): ves exactamente lo que ve su perfil. Sin cambios de datos en este modo.</p>
          : <p className="small muted" style={{ margin: 0 }}>{vista.alcance === 'MIO' ? 'Lo tuyo' : 'Todo el equipo'} · perfil {NIVEL_TXT[vista.nivel]}. Datos reales del panel; donde aún no hay dato se indica el motivo.</p>}

        <div className="g2">
          <div className="panel">
            <h2>Mi día</h2>
            <p className="help">Reuniones del CRM (las de tu Outlook aparecerán al conectar Microsoft 365) y tareas del CRM. Pulsa una para abrir la ficha.</p>
            <h3>Reuniones de hoy</h3>
            {d.reunionesHoy.length === 0
              ? <div className="empty">Sin reuniones registradas para hoy.</div>
              : d.reunionesHoy.map((m) => (
                <div className="item" key={m.id}><span className="time">{m.hora}</span><div><div className="t">{m.quien}</div><div className="w">{m.que}</div></div><Link className="btn small" href={`/admin/crm/contactos/${m.contactoId}`}>Abrir</Link></div>
              ))}
            <h3>Tareas y seguimientos</h3>
            {d.tareas.length === 0
              ? <div className="empty">{vista.alcance === 'MIO' ? 'No tienes tareas pendientes.' : 'El equipo no tiene tareas pendientes.'}</div>
              : d.tareas.map((t) => (
                <div className="item" key={t.id}><span className={`due ${t.clase}`.trim()}>{t.texto}</span><div><Link href={`/admin/crm/contactos/${t.contactoId}`} style={{ color: 'inherit', textDecoration: 'none' }}><div className="t">{t.titulo}</div><div className="w">{t.detalle}</div></Link></div><TareaHecho id={t.id} deshabilitado={enVerComo} /></div>
              ))}
          </div>
          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>
            <div className="panel">
              <h2>Clientes a cuidar</h2>
              {d.cuidar == null ? (
                <>
                  <p className="help">{vista.puede.avisosMargen ? 'Cruce con Rentabilidad.' : 'Tus clientes con avisos pendientes.'}</p>
                  <div className="empty">{vista.puede.avisosMargen
                    ? 'Rentabilidad aún no tiene un cálculo guardado.'
                    : 'Aún no hay clientes asignados a tu usuario: falta enlazar el comercial de ISP Gestión con los usuarios del panel.'}</div>
                </>
              ) : (
                <>
                  <p className="help">Cruce con Rentabilidad (cálculo de {d.cuidar.mes}).{vista.puede.importesMargen ? '' : ' Sin importes: los márgenes los ve el superadmin.'}</p>
                  {d.cuidar.items.length === 0
                    ? <div className="empty">Ningún aviso de margen ni de vigencia en el último cálculo.</div>
                    : d.cuidar.items.map((r, i) => (
                      <div className="item" key={i}><span className={`m ${r.nivel === 'bad' ? 'bad' : 'low'}`}>{r.nivel === 'bad' ? 'riesgo' : 'atención'}</span><div><div className="t">{r.nombre}</div><div className="w">{r.texto}</div></div>
                        {vista.puede.importesMargen ? <Link className="btn small" href="/admin/rentabilidad">Ver rentabilidad</Link> : <Link className="btn small" href={`/admin/crm/contactos?search=${encodeURIComponent(r.nombre)}`}>Ver ficha</Link>}
                      </div>
                    ))}
                </>
              )}
            </div>
            <div className="panel">
              <h2>Leads nuevos por origen</h2>
              <p className="help">Últimos 30 días.{vista.alcance === 'MIO' ? ' Los asignados a ti.' : ' Todo lo que entra por la web y el asistente.'}</p>
              {d.origenes.length === 0
                ? <div className="empty">Sin leads nuevos en los últimos 30 días.</div>
                : (
                  <div className="chart">
                    <svg viewBox={`0 0 ${W} ${d.origenes.length * rh + 8}`} role="img" aria-label="Leads por origen">
                      {d.origenes.map((s, k) => {
                        const y = k * rh + 4, w = (W - pl - 40) * s.n / maxOrigen
                        return (<g key={s.etiqueta}><text x={pl - 8} y={y + 14} textAnchor="end" className="lbl">{s.etiqueta}</text><rect x={pl} y={y + 3} width={w} height={14} rx={3} fill="var(--accent)" /><text x={pl + w + 6} y={y + 14}>{s.n}</text></g>)
                      })}
                    </svg>
                  </div>
                )}
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>Pipelines de venta</h2>
          <p className="help">Valor en negociación por producto y etapa{vista.alcance === 'MIO' ? ' (tus negocios)' : ''}. Pulsa un pipeline para abrir su tablero Kanban.</p>
          <div className="pipe">
            {d.pipelines.length === 0 && <div className="empty">Aún no hay pipelines en el panel.</div>}
            {d.pipelines.map((p) => {
              const tot = p.total + p.ganados
              return (
                <Link className="prow" key={p.id} href={`/admin/crm/pipelines?pipeline=${encodeURIComponent(p.id)}`} style={{ cursor: 'pointer', color: 'inherit', textDecoration: 'none' }} title="Abrir tablero">
                  <span>{p.nombre} <span className="muted">· {p.total}</span></span>
                  <div className="pbar">
                    {tot > 0 && p.etapas.map((e, i) => e.n > 0 && <span key={i} style={{ width: `${100 * e.n / tot}%`, background: COLORES_ETAPA[Math.min(i, COLORES_ETAPA.length - 1)] }} title={`${e.nombre}: ${e.n}`} />)}
                    {p.ganados > 0 && <span style={{ width: `${100 * p.ganados / tot}%`, background: 'var(--good)' }} title={`Ganado este mes: ${p.ganados}`} />}
                  </div>
                  <span className="n">{fmtEur(p.valor)}</span>
                </Link>
              )
            })}
          </div>
          <div className="stages">
            {COLORES_ETAPA.slice(0, Math.max(1, Math.min(maxEtapas, 4))).map((c, i, a) => <span key={i}><i style={{ background: c }} />{i === 0 ? 'Primera etapa' : i === a.length - 1 ? 'Etapas finales' : `Etapa ${i + 1}`}</span>)}
            <span><i style={{ background: 'var(--good)' }} />Ganado este mes</span>
            <span style={{ marginLeft: 'auto' }}>Importe: valor del negocio en negociación</span>
          </div>
          {d.porComercial && (
            <>
              <h3>Por comercial</h3>
              {d.porComercial.length === 0
                ? <div className="empty">Sin negocios abiertos en el equipo.</div>
                : (
                  <div className="tablewrap"><table><thead><tr><th>Comercial</th><th className="n">Abiertos</th><th className="n">En negociación</th><th className="n">Ponderado</th></tr></thead>
                    <tbody>{d.porComercial.map((c) => <tr key={c.nombre}><td>{c.nombre}</td><td className="n">{c.n}</td><td className="n">{fmtEur(c.valor)}</td><td className="n">{fmtEur(c.ponderado)}</td></tr>)}</tbody></table></div>
                )}
            </>
          )}
        </div>

        <div className="g3">
          <div className="panel">
            <h2>Base de contactos</h2>
            <div className="seg3"><div><span className="small muted">Particulares</span><b>{n0(d.base.particulares)}</b></div><div><span className="small muted">Empresas</span><b>{n0(d.base.empresas)}</b></div><div><span className="small muted">Partners</span><b>{n0(d.base.partners)}</b></div></div>
            <p className="small muted" style={{ margin: '10px 0 0' }}>Clientes con ficha tipificada. Los {n0(d.subnav.contactos)} contactos incluyen leads y antiguos de HubSpot.</p>
          </div>
          {vista.puede.consentimiento && (
            <div className="panel">
              <h2>Newsletter y consentimiento</h2>
              {!d.consentimiento || d.consentimiento.total === 0
                ? <div className="empty">El consentimiento de HubSpot aún no está importado (se importa en producción con el OK de Víctor).</div>
                : (
                  <>
                    {([
                      [n0(d.consentimiento.consentimiento), 'Con consentimiento registrado', 'Se les puede enviar newsletter'],
                      [d.clientesActuales == null ? '—' : n0(d.clientesActuales), 'Clientes actuales', d.clientesActuales == null ? 'Pendiente de importar de ISP Gestión' : 'Se les puede enviar sobre servicios parecidos, con baja en cada envío'],
                      [n0(d.consentimiento.sinBase), 'Sin base legal registrada', 'No se les puede escribir; el permiso se recoge en formularios y llamadas'],
                      [n0(d.consentimiento.rebote), 'Correos que rebotan', 'Fuera de todos los envíos'],
                    ] as const).map(([v, t, s]) => (
                      <div className="q" key={t}><span className="big">{v}</span><div><div className="t" style={{ fontWeight: 500 }}>{t}</div><div className="small muted">{s}</div></div><span /></div>
                    ))}
                    <p className="small muted" style={{ margin: '8px 0 0' }}>Pendiente de validar con el asesor de protección de datos.</p>
                  </>
                )}
            </div>
          )}
          {vista.puede.limpieza && d.limpieza && (
            <div className="panel">
              <h2>Limpieza de datos pendiente</h2>
              <div className="q"><span className="big">{d.limpieza.vinculos == null ? '—' : n0(d.limpieza.vinculos)}</span><div className="small">{d.limpieza.vinculos == null ? 'Vínculos ISP ↔ ficha: aún no se ha importado ISP' : 'Vínculos ISP ↔ ficha por confirmar'}</div>{vista.puede.vinculosIsp ? <Link className="btn small" href="/admin/crm/isp">Revisar</Link> : <span />}</div>
              <div className="q"><span className="big">{d.limpieza.sinEmail == null ? '—' : n0(d.limpieza.sinEmail)}</span><div className="small">{d.limpieza.sinEmail == null ? 'Clientes sin correo: se calcula al importar ISP' : 'Clientes sin correo electrónico'}</div>{d.limpieza.sinEmail ? <Link className="btn small" href="/admin/clientes">Completar</Link> : <span />}</div>
              <div className="q"><span className="big">—</span><div className="small">Notas, reuniones y tareas de HubSpot sin ficha: se cuentan al simular el historial</div>{vista.puede.importarIsp ? <Link className="btn small" href="/admin/crm/hubspot-historial">Simular</Link> : <span />}</div>
              <div className="q"><span className="big">{d.brevoListasIO}</span><div className="small">Listas de Brevo marcadas como de IO; el resto de la cuenta del grupo queda bloqueado hasta clasificarlo</div><span /></div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
