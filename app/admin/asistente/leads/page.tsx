import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import BandejaLeads from '@/components/asistente-admin/BandejaLeads'

export const dynamic = 'force-dynamic'

export default async function LeadsAsistentePage() {
  const { puedeEscribir } = await exigirPaginaAsistente('admin.asistente.leads')
  return <BandejaLeads puedeEscribir={puedeEscribir} />
}
