import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import AprendizajeClient from '@/components/asistente-admin/aprendizaje/AprendizajeClient'

export const dynamic = 'force-dynamic'

export default async function PaginaAprendizaje() {
  const { puedeEscribir } = await exigirPaginaAsistente('admin.asistente.aprendizaje')
  return <AprendizajeClient puedeEscribir={puedeEscribir} />
}
