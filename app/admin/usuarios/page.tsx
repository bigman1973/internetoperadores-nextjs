export const dynamic = "force-dynamic";
import { requireAuth } from '../../../lib/middleware/auth'

export default async function UsuariosPage() {
  await requireAuth('admin')
  
  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">USUARIOS ADMIN</h1>
          <p className="mt-1 text-sm text-gray-500">Esta sección está actualmente en desarrollo.</p>
        </div>
      </div>
      <div className="rounded-lg bg-white shadow border border-gray-200 p-12 text-center">
        <h3 className="mt-2 text-sm font-semibold text-gray-900">Próximamente</h3>
        <p className="mt-1 text-sm text-gray-500">Estamos trabajando para traerte esta funcionalidad lo antes posible.</p>
      </div>
    </div>
  )
}
