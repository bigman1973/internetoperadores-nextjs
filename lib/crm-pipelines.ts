import { randomUUID } from 'node:crypto'
import prisma from '@/lib/prisma'
import { calcularCambioEtapa, validarNegocioNuevo, type NegocioNuevoInput } from '@/lib/crm-pipelines-core'

export async function listarPipelines() {
  return prisma.area1CrmPipeline.findMany({
    where: { activo: true },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    select: { id: true, nombre: true, producto: true, segmentoCrm: true, _count: { select: { negocios: { where: { activo: true } } } } },
  })
}

export async function obtenerTablero(pipelineId: string) {
  const pipeline = await prisma.area1CrmPipeline.findFirst({
    where: { id: pipelineId, activo: true },
    select: {
      id: true, nombre: true, producto: true, segmentoCrm: true,
      etapas: { where: { activo: true }, orderBy: { orden: 'asc' }, select: { id: true, nombre: true, orden: true, probabilidad: true, resultado: true, criterio: true, requiereMotivo: true } },
    },
  })
  if (!pipeline) return null
  const negocios = await prisma.area1CrmNegocio.findMany({
    where: { pipelineId, activo: true },
    orderBy: [{ updatedAt: 'desc' }],
    take: 1000,
    select: {
      id: true, etapaId: true, nombre: true, importe: true, resultado: true, motivoPerdida: true,
      fechaCierrePrevista: true, propietarioNombre: true, origen: true, updatedAt: true,
      contacto: { select: { id: true, nombre: true, email: true } },
      empresa: { select: { id: true, nombre: true } },
    },
  })
  return {
    pipeline,
    negocios: negocios.map((n) => ({
      ...n,
      importe: n.importe === null ? null : Number(n.importe),
      fechaCierrePrevista: n.fechaCierrePrevista ? n.fechaCierrePrevista.toISOString().slice(0, 10) : null,
      updatedAt: n.updatedAt.toISOString(),
    })),
  }
}

type Actor = { id: number; name: string }

export async function crearNegocio(pipelineId: string, input: NegocioNuevoInput & { etapaId?: string | null; notas?: string | null }, actor: Actor) {
  const valid = validarNegocioNuevo(input)
  if ('error' in valid) return { ok: false as const, status: 400, error: valid.error }
  const etapas = await prisma.area1CrmPipelineEtapa.findMany({ where: { pipelineId, activo: true }, orderBy: { orden: 'asc' } })
  if (etapas.length === 0) return { ok: false as const, status: 404, error: 'Pipeline no encontrado.' }
  const etapa = input.etapaId ? etapas.find((e) => e.id === input.etapaId) : etapas.find((e) => e.resultado === 'ABIERTA')
  if (!etapa) return { ok: false as const, status: 400, error: 'Etapa no válida.' }
  if (etapa.resultado !== 'ABIERTA') return { ok: false as const, status: 400, error: 'Un negocio nuevo empieza en una etapa abierta.' }
  const { data } = valid
  if (data.contactoId && !(await prisma.crmRegistroHubspot.findFirst({ where: { id: data.contactoId, objectTypeId: '0-1' }, select: { id: true } }))) {
    return { ok: false as const, status: 400, error: 'El contacto no existe.' }
  }
  if (data.empresaId && !(await prisma.crmEmpresa.findFirst({ where: { id: data.empresaId, activo: true }, select: { id: true } }))) {
    return { ok: false as const, status: 400, error: 'La empresa no existe.' }
  }
  const id = randomUUID()
  await prisma.$transaction([
    prisma.area1CrmNegocio.create({
      data: {
        id, pipelineId, etapaId: etapa.id, nombre: data.nombre, importe: data.importe, contactoId: data.contactoId,
        empresaId: data.empresaId, fechaCierrePrevista: data.fechaCierrePrevista, propietarioId: actor.id,
        propietarioNombre: actor.name, notas: (input.notas || '').trim().slice(0, 2000) || null, origen: 'PANEL', creadoPor: actor.name,
      },
    }),
    prisma.area1CrmNegocioMovimiento.create({ data: { id: randomUUID(), negocioId: id, etapaDesdeId: null, etapaHastaId: etapa.id, actor: actor.name } }),
  ])
  return { ok: true as const, id }
}

export async function moverNegocio(negocioId: string, etapaId: string, opts: { motivo?: string | null; detalleMotivo?: string | null }, actor: Actor) {
  const negocio = await prisma.area1CrmNegocio.findFirst({ where: { id: negocioId, activo: true }, include: { etapa: true } })
  if (!negocio) return { ok: false as const, status: 404, error: 'Negocio no encontrado.' }
  const destino = await prisma.area1CrmPipelineEtapa.findUnique({ where: { id: etapaId } })
  if (!destino) return { ok: false as const, status: 400, error: 'Etapa no válida.' }
  const cambio = calcularCambioEtapa({ etapaActual: negocio.etapa, etapaDestino: destino, pipelineId: negocio.pipelineId, motivo: opts.motivo, detalleMotivo: opts.detalleMotivo })
  if ('error' in cambio) return { ok: false as const, status: 400, error: cambio.error }
  if (cambio.sinCambios) return { ok: true as const, sinCambios: true }
  await prisma.$transaction([
    prisma.area1CrmNegocio.update({
      where: { id: negocioId },
      data: { etapaId: destino.id, resultado: cambio.resultado, cerradoAt: cambio.cerradoAt, motivoPerdida: cambio.motivoPerdida },
    }),
    prisma.area1CrmNegocioMovimiento.create({
      data: { id: randomUUID(), negocioId, etapaDesdeId: negocio.etapaId, etapaHastaId: destino.id, motivo: cambio.motivoPerdida, actor: actor.name },
    }),
  ])
  return { ok: true as const, sinCambios: false }
}
