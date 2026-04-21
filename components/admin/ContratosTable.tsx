'use client'

interface Contrato {
  id: number
  isp_gestion_contrato_id: number
  cliente_id: string
  titulo: string
  tarifa: string
  precio: string | number
  importe_remesar: string | number | null
  fecha_inicio: string | null
  fecha_baja: string | null
  causa_baja: string | null
  permanencia: number
  telefonos_contrato: string | null
  activo: boolean
}

export default function ContratosTable({ contratos }: { contratos: Contrato[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Título / Servicio</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tarifa</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Importe IVA</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente ID</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Inicio</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha Baja</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teléfonos</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {contratos.map((contrato) => (
            <tr key={contrato.id} className={contrato.activo ? '' : 'bg-gray-50 opacity-60'}>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  contrato.activo 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {contrato.activo ? 'Activo' : 'Baja'}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-900 font-medium max-w-xs truncate" title={contrato.titulo}>
                {contrato.titulo}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={contrato.tarifa}>
                {contrato.tarifa}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                {Number(contrato.precio).toFixed(2)}€
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {contrato.importe_remesar ? `${Number(contrato.importe_remesar).toFixed(2)}€` : '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-mono">
                {contrato.cliente_id}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {contrato.fecha_inicio ? new Date(contrato.fecha_inicio).toLocaleDateString('es-ES') : '-'}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                {contrato.fecha_baja ? (
                  <span className="text-red-600">
                    {new Date(contrato.fecha_baja).toLocaleDateString('es-ES')}
                    {contrato.causa_baja && <span className="block text-xs">{contrato.causa_baja}</span>}
                  </span>
                ) : '-'}
              </td>
              <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                {contrato.telefonos_contrato || '-'}
              </td>
            </tr>
          ))}
          {contratos.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-500">
                No se encontraron contratos. Pulsa &quot;Sincronizar Contratos&quot; para importar desde ISP Gestión.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
