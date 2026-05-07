export const dynamic = "force-dynamic";
import { requireAuth } from '../../../lib/middleware/auth'
import ConfigCategoriasClient from '../../../components/admin/ConfigCategoriasClient'
import EstrategiasComerciales from '../../../components/admin/EstrategiasComerciales'

export default async function ConfiguracionPage() {
  await requireAuth('admin')
  
  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">CONFIGURACIÓN</h1>
          <p className="mt-1 text-sm text-gray-500">Gestión de parámetros del sistema</p>
        </div>
      </div>

      {/* Categorías y Subcategorías */}
      <div className="rounded-lg bg-white shadow border border-gray-200 p-6">
        <ConfigCategoriasClient />
      </div>

      {/* Estrategias Comerciales */}
      <div className="rounded-lg bg-white shadow border border-gray-200 p-6">
        <EstrategiasComerciales />
      </div>
    </div>
  )
}
