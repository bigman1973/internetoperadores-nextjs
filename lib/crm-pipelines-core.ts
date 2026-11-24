/**
 * Área 1 · Reglas puras de los pipelines del CRM del panel (sin BD), para poder probarlas aisladas.
 */
export type EtapaResultado = 'ABIERTA' | 'GANADA' | 'PERDIDA'
export type NegocioResultado = 'ABIERTO' | 'GANADO' | 'PERDIDO'

export const MOTIVOS_PERDIDA = [
  'Precio',
  'Competencia',
  'Sin respuesta',
  'No viable técnicamente',
  'Cliente desiste',
  'Duplicado',
  'Otro',
] as const

export type EtapaRegla = { id: string; pipelineId: string; resultado: string; requiereMotivo: boolean; activo?: boolean }

export type CambioEtapaInput = {
  etapaActual: EtapaRegla | null
  etapaDestino: EtapaRegla
  pipelineId: string
  motivo?: string | null
  detalleMotivo?: string | null
  ahora?: Date
}

export type CambioEtapaResultado =
  | { ok: true; resultado: NegocioResultado; cerradoAt: Date | null; motivoPerdida: string | null; sinCambios: boolean }
  | { ok: false; error: string }

export function resultadoNegocio(etapa: Pick<EtapaRegla, 'resultado'>): NegocioResultado {
  if (etapa.resultado === 'GANADA') return 'GANADO'
  if (etapa.resultado === 'PERDIDA') return 'PERDIDO'
  return 'ABIERTO'
}

export function normalizarMotivo(motivo?: string | null, detalle?: string | null): string | null {
  const base = (motivo || '').trim()
  if (!base) return null
  const canonico = MOTIVOS_PERDIDA.find((m) => m.toLowerCase() === base.toLowerCase())
  if (!canonico) return null
  const extra = (detalle || '').trim().slice(0, 300)
  return extra ? `${canonico}: ${extra}` : canonico
}

/** Valida y calcula el efecto de mover un negocio a otra etapa. */
export function calcularCambioEtapa(input: CambioEtapaInput): CambioEtapaResultado {
  const { etapaActual, etapaDestino, pipelineId } = input
  if (etapaDestino.pipelineId !== pipelineId) return { ok: false, error: 'La etapa no pertenece a este pipeline.' }
  if (etapaDestino.activo === false) return { ok: false, error: 'La etapa está desactivada.' }
  const resultado = resultadoNegocio(etapaDestino)
  const sinCambios = etapaActual?.id === etapaDestino.id
  let motivoPerdida: string | null = null
  if (resultado === 'PERDIDO') {
    motivoPerdida = normalizarMotivo(input.motivo, input.detalleMotivo)
    if (etapaDestino.requiereMotivo && !motivoPerdida) {
      return { ok: false, error: `Indica el motivo de pérdida (${MOTIVOS_PERDIDA.join(', ')}).` }
    }
    if (motivoPerdida?.startsWith('Otro') && !(input.detalleMotivo || '').trim()) {
      return { ok: false, error: 'Con el motivo «Otro» hay que explicar el detalle.' }
    }
  }
  const cerradoAt = resultado === 'ABIERTO' ? null : (input.ahora || new Date())
  return { ok: true, resultado, cerradoAt, motivoPerdida, sinCambios }
}

export type NegocioNuevoInput = {
  nombre?: string | null
  importe?: string | number | null
  fechaCierrePrevista?: string | null
  contactoId?: string | null
  empresaId?: string | null
}

export type NegocioNuevoValidado = {
  nombre: string
  importe: string | null
  fechaCierrePrevista: Date | null
  contactoId: string | null
  empresaId: string | null
}

export function validarNegocioNuevo(input: NegocioNuevoInput): { ok: true; data: NegocioNuevoValidado } | { ok: false; error: string } {
  const nombre = (input.nombre || '').trim().replace(/\s+/g, ' ').slice(0, 200)
  if (nombre.length < 3) return { ok: false, error: 'El nombre del negocio debe tener al menos 3 caracteres.' }
  let importe: string | null = null
  if (input.importe !== undefined && input.importe !== null && String(input.importe).trim() !== '') {
    const n = Number(String(input.importe).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > 999_999_999) return { ok: false, error: 'Importe no válido.' }
    importe = n.toFixed(2)
  }
  let fechaCierrePrevista: Date | null = null
  if (input.fechaCierrePrevista) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaCierrePrevista)) return { ok: false, error: 'Fecha de cierre no válida.' }
    const d = new Date(`${input.fechaCierrePrevista}T00:00:00.000Z`)
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'Fecha de cierre no válida.' }
    fechaCierrePrevista = d
  }
  const contactoId = (input.contactoId || '').trim() || null
  const empresaId = (input.empresaId || '').trim() || null
  if (!contactoId && !empresaId) return { ok: false, error: 'Vincula el negocio a un contacto o a una empresa.' }
  return { ok: true, data: { nombre, importe, fechaCierrePrevista, contactoId, empresaId } }
}

/** Importe ponderado por probabilidad: suma de importe × probabilidad de su etapa. */
export function importePonderado(items: Array<{ importe: number | null; probabilidad: number }>): number {
  return Math.round(items.reduce((acc, it) => acc + (it.importe || 0) * (it.probabilidad / 100), 0) * 100) / 100
}
