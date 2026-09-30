import { SegmentoCrm } from '@prisma/client'

export const TIPOS_EMPRESA = ['SOCIEDAD', 'AUTONOMO', 'OTRA_ENTIDAD'] as const
export const PAPELES_CONTACTO = ['TITULAR', 'EMPLEADO', 'REPRESENTANTE', 'FACTURACION', 'ASESOR', 'OTRO'] as const
export type TipoEmpresa = typeof TIPOS_EMPRESA[number]
export type PapelContacto = typeof PAPELES_CONTACTO[number]

export function normalizarNif(value: string | null | undefined): string | null {
  const normalized = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  return normalized || null
}

function text(value: unknown, max: number): string | null {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || value.trim().length > max) throw new Error(`Valor no válido (máximo ${max} caracteres).`)
  return value.trim() || null
}

export function parseEmpresaFields(input: unknown, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Datos de empresa no válidos.')
  const data = input as Record<string, unknown>
  const keys = ['nombre', 'nombreComercial', 'nif', 'tipo', 'segmentoCrm', 'dominio', 'web', 'telefono', 'email', 'sector', 'direccion', 'codigoPostal', 'localidad', 'provincia', 'pais', 'descripcion']
  if (Object.keys(data).some((key) => !keys.includes(key))) throw new Error('Hay campos desconocidos en la ficha.')
  const result: Record<string, string | null> = {}
  for (const key of keys) {
    if (partial && !Object.prototype.hasOwnProperty.call(data, key)) continue
    result[key] = text(data[key], key === 'descripcion' ? 4000 : key === 'nombre' ? 200 : 320)
  }
  if (!partial || 'nombre' in data) {
    if (!result.nombre || result.nombre.length < 2) throw new Error('Introduce un nombre de empresa de al menos dos caracteres.')
  }
  if (partial && (('tipo' in data && !result.tipo) || ('segmentoCrm' in data && !result.segmentoCrm))) {
    throw new Error('La naturaleza y el segmento de la empresa no se pueden borrar.')
  }
  if (result.tipo != null && !TIPOS_EMPRESA.includes(result.tipo as TipoEmpresa)) throw new Error('La naturaleza de la cuenta no es válida.')
  if (result.segmentoCrm != null && !['EMPRESA', 'PARTNER'].includes(result.segmentoCrm)) throw new Error('La cuenta debe clasificarse como empresa o partner.')
  if (result.nif != null) {
    result.nifNormalizado = normalizarNif(result.nif)
    if (!/^[A-Z0-9]{7,16}$/.test(result.nifNormalizado || '')) throw new Error('Revisa el NIF/CIF; no tiene un formato válido.')
  } else if ('nif' in result) result.nifNormalizado = null
  if (result.dominio != null) {
    result.dominio = result.dominio.toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(result.dominio)) throw new Error('Revisa el dominio de la empresa.')
  }
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error('Revisa el correo electrónico.')
  if (result.web && !/^https?:\/\//i.test(result.web)) result.web = `https://${result.web}`
  if (result.web && !/^https?:\/\/[a-z0-9.-]+(?:\/|$)/i.test(result.web)) throw new Error('Revisa la web de la empresa.')
  if (result.segmentoCrm) result.segmentoCrm = result.segmentoCrm as SegmentoCrm
  return result
}

export function isPapelContacto(value: unknown): value is PapelContacto {
  return typeof value === 'string' && PAPELES_CONTACTO.includes(value as PapelContacto)
}
