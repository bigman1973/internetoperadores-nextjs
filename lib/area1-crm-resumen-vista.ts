/**
 * Área 1 · Resumen del CRM: regla de visibilidad por rol (pura, sin BD).
 *
 * - Comercial: solo lo suyo (reuniones, tareas, leads, pipeline). «Clientes a cuidar» sin márgenes.
 *   No ve consentimiento, limpieza, importación ni vínculos. Siempre en alcance «Mío».
 * - Gerente: «Mío» o «Equipo», pipelines por comercial, avisos de margen (sin importes);
 *   ve consentimiento y limpieza. No importa de ISP ni confirma vínculos.
 * - Superadmin: todo, importes de margen y rentabilidad, importar de ISP y vínculos, y «Ver como».
 *
 * «Ver como» solo lo puede usar un superadmin real; para cualquier otro usuario se ignora en servidor.
 */
export type NivelResumen = 'SUPERADMIN' | 'GERENTE' | 'COMERCIAL'
export type AlcanceResumen = 'MIO' | 'EQUIPO'

export type PrincipalResumen = { id: number; nombre: string; rol: string | null; roles?: string[] | null }

export type VistaResumen = {
  real: { id: number; nombre: string; nivel: NivelResumen }
  /** Usuario cuyos datos se muestran en «Mío» (el real o el elegido en «Ver como»). */
  usuarioId: number
  usuarioNombre: string
  nivel: NivelResumen
  alcance: AlcanceResumen
  verComoActivo: boolean
  puede: {
    alternarAlcance: boolean
    verComo: boolean
    pipelinesPorComercial: boolean
    avisosMargen: boolean
    importesMargen: boolean
    consentimiento: boolean
    limpieza: boolean
    importarIsp: boolean
    vinculosIsp: boolean
  }
}

export function nivelDe(rol: string | null | undefined, roles?: string[] | null): NivelResumen {
  const todos = new Set([rol, ...(roles || [])].filter(Boolean) as string[])
  if (todos.has('SUPER_ADMIN')) return 'SUPERADMIN'
  if (todos.has('GERENTE')) return 'GERENTE'
  return 'COMERCIAL'
}

export function resolverVista(
  real: PrincipalResumen,
  params: { alcance?: string | null; verComo?: string | null },
  verComoCandidato?: PrincipalResumen | null,
): VistaResumen {
  const nivelReal = nivelDe(real.rol, real.roles)
  let objetivo = { id: real.id, nombre: real.nombre, nivel: nivelReal }
  let verComoActivo = false
  if (nivelReal === 'SUPERADMIN' && params.verComo && verComoCandidato && verComoCandidato.id !== real.id
      && String(verComoCandidato.id) === String(params.verComo)) {
    objetivo = { id: verComoCandidato.id, nombre: verComoCandidato.nombre, nivel: nivelDe(verComoCandidato.rol, verComoCandidato.roles) }
    verComoActivo = true
  }
  const nivel = objetivo.nivel
  const alternarAlcance = nivel !== 'COMERCIAL'
  const alcance: AlcanceResumen = alternarAlcance && params.alcance === 'equipo' ? 'EQUIPO' : 'MIO'
  return {
    real: { id: real.id, nombre: real.nombre, nivel: nivelReal },
    usuarioId: objetivo.id,
    usuarioNombre: objetivo.nombre,
    nivel,
    alcance,
    verComoActivo,
    puede: {
      alternarAlcance,
      verComo: nivelReal === 'SUPERADMIN',
      pipelinesPorComercial: nivel !== 'COMERCIAL' && alcance === 'EQUIPO',
      avisosMargen: nivel !== 'COMERCIAL',
      importesMargen: nivel === 'SUPERADMIN',
      consentimiento: nivel !== 'COMERCIAL',
      limpieza: nivel !== 'COMERCIAL',
      importarIsp: nivel === 'SUPERADMIN',
      vinculosIsp: nivel === 'SUPERADMIN',
    },
  }
}

/** Etiqueta legible del formulario de origen de una captación web. */
export function etiquetaOrigen(formulario: string): string {
  if (formulario === '/api/contacto') return 'Formulario de contacto'
  if (formulario === '/api/demo') return 'Solicitud de demo'
  if (formulario === '/api/guias-lead') return 'Descarga de guías'
  if (formulario === '/api/newsletter/subscribe') return 'Newsletter'
  if (formulario === '/api/partners') return 'Partner / gestoría'
  if (formulario === '/api/soporte') return 'Soporte'
  if (formulario === '/api/altas/crear') return 'Alta de servicio'
  if (formulario === '/api/admin/crm/leads') return 'Alta manual en el panel'
  if (formulario.startsWith('/api/contrata/')) return 'Contratación web'
  return 'Otros'
}

/** Clase de vencimiento de una tarea, como en la maqueta (vencida / hoy / próxima). */
export function vencimiento(vence: Date, ahora: Date): { clase: '' | 'today' | 'ok'; texto: string } {
  const d0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
  const v0 = new Date(vence.getFullYear(), vence.getMonth(), vence.getDate())
  const dias = Math.round((v0.getTime() - d0.getTime()) / 86400000)
  if (dias < 0) return { clase: '', texto: dias === -1 ? 'Vencida ayer' : `Vencida hace ${-dias} días` }
  if (dias === 0) return { clase: 'today', texto: 'Hoy' }
  if (dias === 1) return { clase: 'ok', texto: 'Mañana' }
  if (dias < 7) {
    const t = vence.toLocaleDateString('es-ES', { weekday: 'long', timeZone: 'Europe/Madrid' })
    return { clase: 'ok', texto: t.charAt(0).toUpperCase() + t.slice(1) }
  }
  return { clase: 'ok', texto: vence.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }) }
}

/** Nombre del cliente a partir del título de un aviso de rentabilidad («NOMBRE: texto»). */
export function nombreDeAviso(titulo: string): string {
  const i = titulo.indexOf(':')
  return (i > 0 ? titulo.slice(0, i) : titulo).trim()
}
