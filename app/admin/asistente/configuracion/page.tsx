import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import ConfiguracionAsistente from '@/components/asistente-admin/ConfiguracionAsistente'

export const dynamic = 'force-dynamic'

export default async function ConfiguracionAsistentePage() {
  const { puedeEscribir } = await exigirPaginaAsistente('admin.asistente.configuracion')
  return <ConfiguracionAsistente puedeEscribir={puedeEscribir} />
}
