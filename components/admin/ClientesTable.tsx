'use client'
import Link from 'next/link'
import { useState } from 'react'
import { 
  PencilIcon, 
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PhoneIcon,
  DevicePhoneMobileIcon,
  EnvelopeIcon,
  MapPinIcon,
  BuildingOfficeIcon,
  UserIcon,
} from '@heroicons/react/24/outline'
import { formatDate } from '../../lib/utils/format'

interface Cliente {
  id: number
  email: string
  nombre: string
  ispGestionId: string
  newsletterSuscrito: boolean
  ultimoAcceso: Date | null
  createdAt: Date
  updatedAt: Date
  // Nuevos campos ISP Gestión
  clienteIdIsp?: string | null
  codigo?: string | null
  nif?: string | null
  cif?: string | null
  personaFisica?: boolean | null
  nombreComercial?: string | null
  apellidos?: string | null
  nombrePila?: string | null
  telefono?: string | null
  movil?: string | null
  fax?: string | null
  web?: string | null
  movilSms?: string | null
  tipoCalle?: string | null
  domicilio?: string | null
  numero?: string | null
  edificio?: string | null
  bloque?: string | null
  escalera?: string | null
  piso?: string | null
  puerta?: string | null
  municipio?: string | null
  localidad?: string | null
  codigoPostal?: string | null
  provincia?: string | null
  pais?: string | null
  coordenadas?: string | null
  cuentaCargo?: string | null
  cuentaContable?: string | null
  formaPago?: string | null
  tipoIva?: string | null
  facturaElectronica?: boolean | null
  facturaMail?: boolean | null
  facturaPapel?: boolean | null
  alertaFacturacion?: string | null
  representante?: string | null
  cargoRepresentante?: string | null
  nifRepresentante?: string | null
  activo?: boolean | null
  baneado?: boolean | null
  fechaAlta?: Date | null
  fechaBaja?: Date | null
  idioma?: string | null
  categoria?: number | null
  recibePublicidad?: boolean | null
  aceptoLopd?: boolean | null
}

interface ClientesTableProps {
  clientes: Cliente[]
}

function getDireccionCompleta(c: Cliente): string {
  const parts = []
  if (c.tipoCalle && c.tipoCalle !== ' -') parts.push(c.tipoCalle)
  if (c.domicilio) parts.push(c.domicilio)
  if (c.numero) parts.push(c.numero)
  if (c.piso) parts.push(`${c.piso}`)
  if (c.puerta) parts.push(`${c.puerta}`)
  
  const linea1 = parts.join(' ')
  const linea2Parts = []
  if (c.codigoPostal) linea2Parts.push(c.codigoPostal)
  if (c.municipio) linea2Parts.push(c.municipio)
  if (c.provincia) linea2Parts.push(`(${c.provincia})`)
  const linea2 = linea2Parts.join(' ')
  
  return [linea1, linea2].filter(Boolean).join(', ')
}

function getFormaPagoLabel(fp: string | null | undefined): string {
  if (!fp) return '-'
  const map: Record<string, string> = {
    'RB00': 'Recibo bancario',
    'TRANS': 'Transferencia',
    'EFEC': 'Efectivo',
    'TARJ': 'Tarjeta',
  }
  return map[fp] || fp
}

export default function ClientesTable({ clientes }: ClientesTableProps) {
  const [localClientes, setLocalClientes] = useState(clientes)
  const [expandedId, setExpandedId] = useState<number | null>(null)

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente?')) return
    try {
      const response = await fetch(`/api/admin/clientes/${id}`, { method: 'DELETE' })
      if (response.ok) {
        setLocalClientes(prev => prev.filter(c => c.id !== id))
      } else {
        alert('Error al eliminar cliente')
      }
    } catch (error) {
      console.error('Error deleting cliente:', error)
      alert('Error al eliminar cliente')
    }
  }

  return (
    <div className="bg-white shadow border border-gray-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cliente</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NIF/CIF</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contacto</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Municipio</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Forma Pago</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Alta</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {localClientes.map((cliente) => (
              <>
                <tr key={cliente.id} className={`hover:bg-gray-50 cursor-pointer ${!cliente.activo ? 'opacity-60' : ''}`} onClick={() => setExpandedId(expandedId === cliente.id ? null : cliente.id)}>
                  <td className="px-4 py-3">
                    {expandedId === cliente.id ? (
                      <ChevronUpIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {cliente.activo !== false ? (
                      <span className="inline-flex items-center gap-x-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <CheckCircleIcon className="h-3 w-3" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-x-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        <XCircleIcon className="h-3 w-3" /> Baja
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      <div className={`flex h-9 w-9 items-center justify-center rounded-full text-white font-bold text-xs ${cliente.activo !== false ? 'bg-orange-500' : 'bg-gray-400'}`}>
                        {cliente.personaFisica === false ? (
                          <BuildingOfficeIcon className="h-5 w-5" />
                        ) : (
                          cliente.nombre.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-medium text-gray-900">{cliente.nombre}</div>
                        {cliente.nombreComercial && (
                          <div className="text-xs text-orange-600">{cliente.nombreComercial}</div>
                        )}
                        <div className="text-xs text-gray-500">{cliente.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {cliente.cif || cliente.nif || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-x-1 rounded-md px-2 py-0.5 text-xs font-medium ${
                      cliente.personaFisica === false 
                        ? 'bg-blue-100 text-blue-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {cliente.personaFisica === false ? (
                        <><BuildingOfficeIcon className="h-3 w-3" /> Empresa</>
                      ) : (
                        <><UserIcon className="h-3 w-3" /> Particular</>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5">
                      {cliente.telefono && (
                        <div className="flex items-center gap-x-1 text-xs text-gray-600">
                          <PhoneIcon className="h-3 w-3" /> {cliente.telefono}
                        </div>
                      )}
                      {cliente.movil && (
                        <div className="flex items-center gap-x-1 text-xs text-gray-600">
                          <DevicePhoneMobileIcon className="h-3 w-3" /> {cliente.movil}
                        </div>
                      )}
                      {!cliente.telefono && !cliente.movil && (
                        <span className="text-xs text-gray-400">-</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                    {cliente.municipio || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                    {getFormaPagoLabel(cliente.formaPago)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {cliente.fechaAlta ? formatDate(cliente.fechaAlta) : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-x-2">
                      <Link href={`/admin/clientes/${cliente.id}/editar`} className="text-orange-600 hover:text-orange-900">
                        <PencilIcon className="h-5 w-5" />
                      </Link>
                      <button onClick={() => handleDelete(cliente.id)} className="text-red-600 hover:text-red-900">
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedId === cliente.id && (
                  <tr key={`${cliente.id}-detail`} className="bg-gray-50">
                    <td colSpan={10} className="px-6 py-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Identificación */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-x-1">
                            <UserIcon className="h-4 w-4" /> Identificación
                          </h4>
                          <dl className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <dt className="text-gray-500">ID ISP Gestión:</dt>
                              <dd className="text-gray-900 font-medium">{cliente.ispGestionId}</dd>
                            </div>
                            {cliente.clienteIdIsp && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Cliente ID:</dt>
                                <dd className="text-gray-900">{cliente.clienteIdIsp}</dd>
                              </div>
                            )}
                            {cliente.codigo && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Código:</dt>
                                <dd className="text-gray-900">{cliente.codigo}</dd>
                              </div>
                            )}
                            {cliente.nif && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">NIF:</dt>
                                <dd className="text-gray-900">{cliente.nif}</dd>
                              </div>
                            )}
                            {cliente.cif && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">CIF:</dt>
                                <dd className="text-gray-900">{cliente.cif}</dd>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Tipo:</dt>
                              <dd className="text-gray-900">{cliente.personaFisica === false ? 'Persona Jurídica' : 'Persona Física'}</dd>
                            </div>
                            {cliente.nombreComercial && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Nombre Comercial:</dt>
                                <dd className="text-gray-900">{cliente.nombreComercial}</dd>
                              </div>
                            )}
                            {cliente.idioma && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Idioma:</dt>
                                <dd className="text-gray-900">{cliente.idioma === 'ca_es' ? 'Catalán' : cliente.idioma === 'es_es' ? 'Castellano' : cliente.idioma}</dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Dirección */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-x-1">
                            <MapPinIcon className="h-4 w-4" /> Dirección
                          </h4>
                          <dl className="space-y-1 text-xs">
                            {getDireccionCompleta(cliente) && (
                              <div>
                                <dt className="text-gray-500">Dirección:</dt>
                                <dd className="text-gray-900 mt-0.5">{getDireccionCompleta(cliente)}</dd>
                              </div>
                            )}
                            {cliente.municipio && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Municipio:</dt>
                                <dd className="text-gray-900">{cliente.municipio}</dd>
                              </div>
                            )}
                            {cliente.localidad && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Localidad:</dt>
                                <dd className="text-gray-900">{cliente.localidad}</dd>
                              </div>
                            )}
                            {cliente.codigoPostal && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">C.P.:</dt>
                                <dd className="text-gray-900">{cliente.codigoPostal}</dd>
                              </div>
                            )}
                            {cliente.pais && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">País:</dt>
                                <dd className="text-gray-900">{cliente.pais}</dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Facturación */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-x-1">
                            <BuildingOfficeIcon className="h-4 w-4" /> Facturación
                          </h4>
                          <dl className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Forma de pago:</dt>
                              <dd className="text-gray-900">{getFormaPagoLabel(cliente.formaPago)}</dd>
                            </div>
                            {cliente.tipoIva && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Tipo IVA:</dt>
                                <dd className="text-gray-900">{cliente.tipoIva}</dd>
                              </div>
                            )}
                            {cliente.cuentaCargo && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Cuenta cargo:</dt>
                                <dd className="text-gray-900">{cliente.cuentaCargo}</dd>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Factura email:</dt>
                              <dd className="text-gray-900">{cliente.facturaMail ? 'Sí' : 'No'}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Factura papel:</dt>
                              <dd className="text-gray-900">{cliente.facturaPapel ? 'Sí' : 'No'}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Factura electrónica:</dt>
                              <dd className="text-gray-900">{cliente.facturaElectronica ? 'Sí' : 'No'}</dd>
                            </div>
                            {cliente.representante && (
                              <>
                                <div className="border-t border-gray-200 pt-1 mt-1">
                                  <dt className="text-gray-500">Representante:</dt>
                                  <dd className="text-gray-900">{cliente.representante}</dd>
                                </div>
                                {cliente.nifRepresentante && (
                                  <div className="flex justify-between">
                                    <dt className="text-gray-500">NIF Rep.:</dt>
                                    <dd className="text-gray-900">{cliente.nifRepresentante}</dd>
                                  </div>
                                )}
                              </>
                            )}
                          </dl>
                        </div>

                        {/* Fechas y estado */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">Fechas y Estado</h4>
                          <dl className="space-y-1 text-xs">
                            {cliente.fechaAlta && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Fecha alta:</dt>
                                <dd className="text-gray-900">{formatDate(cliente.fechaAlta)}</dd>
                              </div>
                            )}
                            {cliente.fechaBaja && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Fecha baja:</dt>
                                <dd className="text-red-600 font-medium">{formatDate(cliente.fechaBaja)}</dd>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Newsletter:</dt>
                              <dd className="text-gray-900">{cliente.newsletterSuscrito ? 'Suscrito' : 'No suscrito'}</dd>
                            </div>
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Recibe publicidad:</dt>
                              <dd className="text-gray-900">{cliente.recibePublicidad ? 'Sí' : 'No'}</dd>
                            </div>
                            {cliente.baneado && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Baneado:</dt>
                                <dd className="text-red-600 font-medium">Sí</dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        {/* Contacto completo */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-x-1">
                            <EnvelopeIcon className="h-4 w-4" /> Contacto
                          </h4>
                          <dl className="space-y-1 text-xs">
                            <div className="flex justify-between">
                              <dt className="text-gray-500">Email:</dt>
                              <dd className="text-gray-900">{cliente.email}</dd>
                            </div>
                            {cliente.telefono && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Teléfono:</dt>
                                <dd className="text-gray-900">{cliente.telefono}</dd>
                              </div>
                            )}
                            {cliente.movil && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Móvil:</dt>
                                <dd className="text-gray-900">{cliente.movil}</dd>
                              </div>
                            )}
                            {cliente.movilSms && cliente.movilSms !== cliente.movil && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Móvil SMS:</dt>
                                <dd className="text-gray-900">{cliente.movilSms}</dd>
                              </div>
                            )}
                            {cliente.fax && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Fax:</dt>
                                <dd className="text-gray-900">{cliente.fax}</dd>
                              </div>
                            )}
                            {cliente.web && (
                              <div className="flex justify-between">
                                <dt className="text-gray-500">Web:</dt>
                                <dd className="text-gray-900">{cliente.web}</dd>
                              </div>
                            )}
                          </dl>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {localClientes.length === 0 && (
              <tr>
                <td colSpan={10} className="px-6 py-12 text-center text-sm text-gray-500">
                  No se encontraron clientes con los filtros seleccionados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
