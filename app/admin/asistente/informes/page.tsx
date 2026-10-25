import prisma from '@/lib/prisma'
import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import { generarInformeSiProcede } from '@/lib/asistente/informes'
import InformesClient from '@/components/asistente-admin/informes/InformesClient'

export const dynamic = 'force-dynamic'

export default async function PaginaInformes() {
  const { actor, puedeEscribir } = await exigirPaginaAsistente('admin.asistente.propuestas')
  await generarInformeSiProcede('DIARIO', new Date(), actor)
  const informe = await prisma.asistenteInforme.findFirst({
    orderBy: [{ fechaLocal: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true, tipo: true, fechaLocal: true, periodoInicio: true, periodoFin: true, datos: true, createdAt: true,
      propuestas: { orderBy: [{ prioridad: 'desc' }, { id: 'asc' }], take: 50, select: { id: true, titulo: true, detalle: true, impacto: true, esfuerzo: true, prioridad: true, estado: true } },
    },
  })
  return <InformesClient puedeEscribir={puedeEscribir} informeInicial={informe ? JSON.parse(JSON.stringify(informe)) : null} />
}
