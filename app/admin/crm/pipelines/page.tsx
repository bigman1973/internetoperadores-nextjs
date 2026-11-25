import { FunnelIcon } from '@heroicons/react/24/outline'
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import { registrarArea } from '@/lib/permisos'
import { listarPipelines } from '@/lib/crm-pipelines'
import { MOTIVOS_PERDIDA } from '@/lib/crm-pipelines-core'
import CrmPipelineKanban from '@/components/admin/CrmPipelineKanban'

export const dynamic = 'force-dynamic'

export default async function CrmPipelinesPage() {
  await requireAdminAreaRead('admin.crm.empresas', ['MARKETING', 'VENTAS'])
  const [, pipelines] = await Promise.all([
    registrarArea('admin.crm.pipelines', 'CRM > Pipelines', 'admin.crm'),
    listarPipelines(),
  ])
  return <main className="-m-3 min-h-screen bg-[#f4f6f8] px-4 py-6 sm:-m-5 sm:px-6 lg:-m-6 lg:px-8">
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6 flex items-start gap-3">
        <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-sm"><FunnelIcon className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900">Pipelines de venta</h1>
          <p className="mt-1 text-sm text-slate-600">Los 8 pipelines de Internet Operadores, con sus etapas y criterios de ganado y perdido. Arrastra cada negocio de etapa o usa su selector; para cerrarlo como perdido se pide el motivo.</p>
        </div>
      </div>
      {pipelines.length === 0
        ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Aún no hay pipelines: falta aplicar la migración <code>20261126_area1_crm_pipelines</code>.</div>
        : <CrmPipelineKanban
            pipelines={pipelines.map((p) => ({ id: p.id, nombre: p.nombre, producto: p.producto, segmentoCrm: p.segmentoCrm, negocios: p._count.negocios }))}
            motivosPerdida={[...MOTIVOS_PERDIDA]}
          />}
    </div>
  </main>
}
