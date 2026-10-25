import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import ExploradorConversaciones from '@/components/asistente-admin/ExploradorConversaciones'

export const dynamic = 'force-dynamic'

export default async function ConversacionesAsistentePage() {
  await exigirPaginaAsistente('admin.asistente.conversaciones')
  return <ExploradorConversaciones />
}
