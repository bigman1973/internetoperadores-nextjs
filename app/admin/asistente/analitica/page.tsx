import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import AnaliticaClient from '@/components/asistente-admin/analitica/AnaliticaClient'

export const dynamic = 'force-dynamic'

export default async function PaginaAnalitica() {
  await exigirPaginaAsistente('admin.asistente.analitica')
  return <AnaliticaClient />
}
