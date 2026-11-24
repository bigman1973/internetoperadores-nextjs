export const dynamic = 'force-dynamic'
import { requireArea8Auth } from '@/lib/area8/auth'
import HistorialDesarrollosClient from '@/components/admin/HistorialDesarrollosClient'

export default async function HistorialPage() {
  const auth = await requireArea8Auth({ management: true, area: 'admin.historial' })
  if ('error' in auth) {
    return <div role="alert" className="rounded-lg border border-orange-200 bg-orange-50 p-6 text-[#2D2A26]">
      <h1 className="text-xl font-semibold">Historial no disponible</h1>
      <p className="mt-2">{auth.error.status === 401 ? 'Inicia sesión con tu cuenta de empleado para consultar el historial.' : auth.error.status === 403 ? 'No tienes acceso de gestión al historial o estás en «Actuar como».' : 'No se pudo comprobar el acceso. Inténtalo de nuevo.'}</p>
    </div>
  }
  return <HistorialDesarrollosClient canManage={auth.owner && !auth.acting} />
}
