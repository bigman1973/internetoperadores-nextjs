import type { SegmentoCrm } from '@prisma/client'

export const SEGMENTOS_CRM = ['PARTICULAR', 'EMPRESA', 'PARTNER'] as const

export type SegmentoCrmValue = (typeof SEGMENTOS_CRM)[number]

export const SEGMENTO_CRM_CONFIG: Record<SegmentoCrmValue, {
  label: string
  descripcion: string
  badgeClass: string
}> = {
  PARTICULAR: {
    label: 'Particular',
    descripcion: 'Persona o unidad familiar que contrata servicios residenciales.',
    badgeClass: 'bg-slate-100 text-slate-700 ring-slate-200',
  },
  EMPRESA: {
    label: 'Empresa',
    descripcion: 'Empresa o profesional atendido directamente por Internet Operadores.',
    badgeClass: 'bg-blue-100 text-blue-700 ring-blue-200',
  },
  PARTNER: {
    label: 'Partner',
    descripcion: 'Empresa colaboradora que presenta o comercializa servicios para sus clientes.',
    badgeClass: 'bg-purple-100 text-purple-700 ring-purple-200',
  },
}

export function esSegmentoCrm(value: unknown): value is SegmentoCrmValue {
  return typeof value === 'string' && SEGMENTOS_CRM.includes(value as SegmentoCrmValue)
}

export function segmentoDesdePersonaFisica(personaFisica: boolean | null | undefined): SegmentoCrm {
  return personaFisica === false ? 'EMPRESA' : 'PARTICULAR'
}
