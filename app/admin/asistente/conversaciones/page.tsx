import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import ExploradorConversaciones from '@/components/asistente-admin/ExploradorConversaciones'
import BandejaEscalados from '@/components/asistente-admin/BandejaEscalados'

export const dynamic = 'force-dynamic'

export default async function ConversacionesAsistentePage() {
  await exigirPaginaAsistente('admin.asistente.conversaciones')
  return <div className="space-y-10"><ExploradorConversaciones /><BandejaEscalados /></div>
}
