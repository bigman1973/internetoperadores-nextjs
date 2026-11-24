import { resumenIspParaFicha } from '@/lib/crm-isp-import'

const eur = (v: number | null) => (v === null ? '—' : v.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }))
const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const MARKETING: Record<string, string> = { APTO: 'Acepta publicidad', BAJA: 'Baja de comunicaciones', SIN_CONSENTIMIENTO: 'Sin consentimiento', SIN_EMAIL: 'Sin email' }

/** Bloque de servidor: datos de ISP Gestión (contratos y facturación 2026) en la ficha CRM. */
export default async function CrmIspFichaResumen(props: { crmEmpresaId?: string; crmContactoId?: string; clienteWebIds?: number[] }) {
  const r = await resumenIspParaFicha(props)
  if (!r) return null
  return (
    <section className="mx-4 my-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:mx-6 lg:mx-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">ISP Gestión · contratos y facturación {r.anio}</h2>
        <p className="text-xs text-gray-500">ISP Gestión manda en estos datos. Margen: pendiente de integrar el módulo de Rentabilidad (clave nº de contrato).</p>
      </div>
      {r.clientes.map((c) => (
        <div key={c.id} className="space-y-2">
          <p className="text-sm text-gray-700"><strong>{c.nombre}</strong> · código {c.codigo} · {MARKETING[c.estadoMarketing] || c.estadoMarketing}{c.fechaFin ? ` · baja en ISP ${c.fechaFin}` : ''}{!c.presente ? ' · ya no figura en el último fichero' : ''}</p>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500"><tr><th className="px-3 py-2">Nº</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Tarifa</th><th className="px-3 py-2">Descripción</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Velocidad</th><th className="px-3 py-2 text-right">Importe</th><th className="px-3 py-2">Alta / baja</th><th className="px-3 py-2 text-right">Margen</th></tr></thead>
              <tbody className="divide-y divide-gray-100">
                {c.contratos.map((k) => (
                  <tr key={k.id} className={k.activo ? '' : 'text-gray-400'}>
                    <td className="px-3 py-1.5">{k.numero}</td><td className="px-3 py-1.5">{k.estado}</td><td className="px-3 py-1.5">{k.tarifa || '—'}</td>
                    <td className="px-3 py-1.5">{k.descripcion || '—'}</td><td className="px-3 py-1.5">{k.proveedor || '—'}</td><td className="px-3 py-1.5">{k.velocidad || '—'}</td>
                    <td className="px-3 py-1.5 text-right">{eur(k.importe)}{k.periodicidad && k.periodicidad !== 'Mensual' ? ` · ${k.periodicidad}` : ''}</td>
                    <td className="px-3 py-1.5 text-xs">{k.fechaAlta || '—'}{k.fechaBaja ? ` → ${k.fechaBaja}` : ''}</td>
                    <td className="px-3 py-1.5 text-right text-xs text-gray-400">{k.margen === null ? 'pendiente' : eur(k.margen)}</td>
                  </tr>
                ))}
                {!c.contratos.length && <tr><td colSpan={9} className="px-3 py-3 text-center text-gray-500">Sin contratos en el fichero de ISP.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">Facturación {r.anio} (base sin IVA): <strong>{eur(r.facturacion.total)}</strong></p>
        <div className="grid grid-cols-6 gap-2 text-center text-xs sm:grid-cols-12">
          {r.facturacion.meses.map((m) => <div key={m.mes} className="rounded bg-slate-50 px-1 py-1.5"><div className="text-gray-500">{MESES[m.mes - 1]}</div><div className="font-semibold text-gray-900">{m.importe ? m.importe.toLocaleString('es-ES', { maximumFractionDigits: 0 }) : '—'}</div></div>)}
        </div>
      </div>
    </section>
  )
}
