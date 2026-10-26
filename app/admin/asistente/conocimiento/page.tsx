import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import GestionConocimiento from '@/components/asistente-admin/GestionConocimiento'

export const dynamic = 'force-dynamic'

export default async function ConocimientoAsistentePage() {
  const { puedeEscribir } = await exigirPaginaAsistente('admin.asistente.conocimiento')
  return <GestionConocimiento puedeEscribir={puedeEscribir} />
}
