import { Area9Error, confirmedClosedRequest } from './core'

type LinkInput = { publicacionId: string; peticionId: number }
type Actor = { id: number; nombre: string; owner: boolean; acting: boolean }
// Puerto mínimo: las pruebas usan un doble, nunca inicializan Prisma ni una BD.
export interface LinkTransaction {
  area9Publicacion: { findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null> }
  peticionInterna: { findUnique(args: { where: { id: number }; select: { id: true; estado: true; feedbackSatisfecho: true; fechaCierre: true } }): Promise<{ id: number; estado: string; feedbackSatisfecho: boolean | null; fechaCierre: Date | null } | null> }
  area9PublicacionPeticion: {
    findUnique(args: { where: { publicacionId_peticionId: LinkInput } }): Promise<unknown | null>
    create(args: { data: LinkInput & { confirmadoPorInt: number; confirmadoNombre: string } }): Promise<unknown>
  }
}

export async function linkClosedRequest(tx: LinkTransaction, input: LinkInput, actor: Actor) {
  if (!actor.owner || actor.acting) throw new Area9Error(403, 'Solo el propietario real puede confirmar vínculos')
  const publication = await tx.area9Publicacion.findUnique({ where: { id: input.publicacionId }, select: { id: true } })
  if (!publication) throw new Area9Error(404, 'Publicación no encontrada')
  const request = await tx.peticionInterna.findUnique({ where: { id: input.peticionId }, select: { id: true, estado: true, feedbackSatisfecho: true, fechaCierre: true } })
  if (!request) throw new Area9Error(404, 'Petición no encontrada')
  if (!confirmedClosedRequest(request)) throw new Area9Error(409, 'La petición debe estar hecha, con conformidad del solicitante y fecha de cierre')
  const existing = await tx.area9PublicacionPeticion.findUnique({ where: { publicacionId_peticionId: input } })
  if (existing) return { vinculo: existing, creado: false }
  const vinculo = await tx.area9PublicacionPeticion.create({ data: { ...input, confirmadoPorInt: actor.id, confirmadoNombre: actor.nombre.slice(0, 200) } })
  return { vinculo, creado: true }
}
