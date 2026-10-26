import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import ChatInterno from '@/components/asistente-admin/ChatInterno'

export const dynamic = 'force-dynamic'

export default async function ChatAsistentePage() {
  const { puedeEscribir } = await exigirPaginaAsistente('admin.asistente.chat')
  return <ChatInterno puedeEscribir={puedeEscribir} />
}
