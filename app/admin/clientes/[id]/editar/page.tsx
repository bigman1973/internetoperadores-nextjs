'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

interface Contrato {
  id: number
  isp_gestion_contrato_id: number
  cliente_id: string
  titulo: string
  tarifa: string
  precio: string | number
  importe_remesar: string | number | null
  descuento_total: string | number | null
  fecha_inicio: string | null
  fecha_baja: string | null
  causa_baja: string | null
  concepto_facturacion: string | null
  permanencia: number
  fecha_permanencia: string | null
  categoria: string | null
  telefonos_contrato: string | null
  observaciones: string | null
  activo: boolean
}

export default function EditarClientePage() {
  const router = useRouter()
  const params = useParams()
  const clienteId = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<any>({})
  const [activeTab, setActiveTab] = useState<'datos' | 'contratos'>('datos')
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratosLoading, setContratosLoading] = useState(false)
  const [contratosFilter, setContratosFilter] = useState<'todos' | 'activos' | 'bajas'>('activos')

  useEffect(() => {
    const fetchCliente = async () => {
      try {
        const res = await fetch(`/api/admin/clientes/${clienteId}`)
        if (!res.ok) throw new Error('Cliente no encontrado')
        const data = await res.json()
        setForm(data)
      } catch (err: any) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchCliente()
  }, [clienteId])

  // Fetch contratos when tab changes or client loads
  useEffect(() => {
    if (form.ispGestionId && activeTab === 'contratos' && contratos.length === 0) {
      fetchContratos()
    }
  }, [form.ispGestionId, activeTab])

  const fetchContratos = async () => {
    if (!form.ispGestionId) return
    setContratosLoading(true)
    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}/contratos`)
      if (!res.ok) throw new Error('Error al cargar contratos')
      const data = await res.json()
      setContratos(data.contratos || [])
    } catch (err: any) {
      console.error('Error fetching contratos:', err)
    } finally {
      setContratosLoading(false)
    }
  }

  const handleChange = (field: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const res = await fetch(`/api/admin/clientes/${clienteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al actualizar')
      }

      setSuccess('Cliente actualizado correctamente')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredContratos = contratos.filter(c => {
    if (contratosFilter === 'activos') return c.activo
    if (contratosFilter === 'bajas') return !c.activo
    return true
  })

  const contratosActivos = contratos.filter(c => c.activo)
  const contratosBajas = contratos.filter(c => !c.activo)
  const facturacionMensual = contratosActivos.reduce((sum, c) => sum + Number(c.precio || 0), 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    )
  }

  if (error && !form.id) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
        <Link href="/admin/clientes" className="text-orange-600 hover:underline mt-4 inline-block">
          &larr; Volver a clientes
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/admin/clientes" className="text-gray-500 hover:text-gray-700 text-sm">
        &larr; Volver a clientes
      </Link>

      {/* Cabecera del cliente */}
      <div className="mt-2 mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{form.nombre || 'Cliente'}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {form.ispGestionId && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs mr-2">ISP: {form.ispGestionId}</span>}
            {form.codigo && <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs mr-2">Cód: {form.codigo}</span>}
            {form.nif && <span className="text-xs mr-2">NIF: {form.nif}</span>}
            {form.cif && <span className="text-xs">CIF: {form.cif}</span>}
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
          form.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {form.activo ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {/* Pestañas */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('datos')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'datos'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Datos del Cliente
          </button>
          <button
            onClick={() => setActiveTab('contratos')}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === 'contratos'
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Contratos / Servicios
            {contratos.length > 0 && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                activeTab === 'contratos' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {contratosActivos.length} activos
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* TAB: Datos del Cliente */}
      {activeTab === 'datos' && (
        <form onSubmit={handleSubmit} className="space-y-8">

          {/* Estado y ISP Gestión */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-orange-500">&#9679;</span> Estado y Referencia
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID ISP Gestión</label>
                <input type="text" value={form.ispGestionId || ''} disabled
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
                <input type="text" value={form.codigo || ''} disabled
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select value={form.activo ? 'true' : 'false'}
                  onChange={(e) => handleChange('activo', e.target.value === 'true')}
                  className="w-full border rounded-md px-3 py-2">
                  <option value="true">Activo</option>
                  <option value="false">Inactivo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Baneado</label>
                <select value={form.baneado ? 'true' : 'false'}
                  onChange={(e) => handleChange('baneado', e.target.value === 'true')}
                  className="w-full border rounded-md px-3 py-2">
                  <option value="false">No</option>
                  <option value="true">Sí</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Alta</label>
                <input type="text" value={form.fechaAlta ? new Date(form.fechaAlta).toLocaleDateString('es-ES') : 'N/A'} disabled
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Baja</label>
                <input type="text" value={form.fechaBaja ? new Date(form.fechaBaja).toLocaleDateString('es-ES') : 'Sin baja'} disabled
                  className="w-full border rounded-md px-3 py-2 bg-gray-100 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origen</label>
                <input type="text" value={form.origen || ''} onChange={(e) => handleChange('origen', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </section>

          {/* Datos Personales / Empresa */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-blue-500">&#9679;</span> Datos del Cliente
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select value={form.personaFisica ? 'true' : 'false'}
                  onChange={(e) => handleChange('personaFisica', e.target.value === 'true')}
                  className="w-full border rounded-md px-3 py-2">
                  <option value="true">Persona Física</option>
                  <option value="false">Persona Jurídica (Empresa)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIF</label>
                <input type="text" value={form.nif || ''} onChange={(e) => handleChange('nif', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CIF</label>
                <input type="text" value={form.cif || ''} onChange={(e) => handleChange('cif', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
                <input type="text" value={form.nombre || ''} onChange={(e) => handleChange('nombre', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de Pila</label>
                <input type="text" value={form.nombrePila || ''} onChange={(e) => handleChange('nombrePila', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos</label>
                <input type="text" value={form.apellidos || ''} onChange={(e) => handleChange('apellidos', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre Comercial</label>
                <input type="text" value={form.nombreComercial || ''} onChange={(e) => handleChange('nombreComercial', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={form.email || ''} onChange={(e) => handleChange('email', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </section>

          {/* Contacto */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-green-500">&#9679;</span> Contacto
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                <input type="text" value={form.telefono || ''} onChange={(e) => handleChange('telefono', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Móvil</label>
                <input type="text" value={form.movil || ''} onChange={(e) => handleChange('movil', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Móvil SMS</label>
                <input type="text" value={form.movilSms || ''} onChange={(e) => handleChange('movilSms', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fax</label>
                <input type="text" value={form.fax || ''} onChange={(e) => handleChange('fax', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Web</label>
                <input type="text" value={form.web || ''} onChange={(e) => handleChange('web', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
                <input type="text" value={form.idioma || ''} onChange={(e) => handleChange('idioma', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </section>

          {/* Dirección */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-purple-500">&#9679;</span> Dirección
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Calle</label>
                <input type="text" value={form.tipoCalle || ''} onChange={(e) => handleChange('tipoCalle', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Domicilio</label>
                <input type="text" value={form.domicilio || ''} onChange={(e) => handleChange('domicilio', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                <input type="text" value={form.numero || ''} onChange={(e) => handleChange('numero', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Edificio</label>
                <input type="text" value={form.edificio || ''} onChange={(e) => handleChange('edificio', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bloque</label>
                <input type="text" value={form.bloque || ''} onChange={(e) => handleChange('bloque', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalera</label>
                <input type="text" value={form.escalera || ''} onChange={(e) => handleChange('escalera', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Piso</label>
                <input type="text" value={form.piso || ''} onChange={(e) => handleChange('piso', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Puerta</label>
                <input type="text" value={form.puerta || ''} onChange={(e) => handleChange('puerta', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Municipio</label>
                <input type="text" value={form.municipio || ''} onChange={(e) => handleChange('municipio', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Localidad</label>
                <input type="text" value={form.localidad || ''} onChange={(e) => handleChange('localidad', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Código Postal</label>
                <input type="text" value={form.codigoPostal || ''} onChange={(e) => handleChange('codigoPostal', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provincia</label>
                <input type="text" value={form.provincia || ''} onChange={(e) => handleChange('provincia', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">País</label>
                <input type="text" value={form.pais || ''} onChange={(e) => handleChange('pais', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coordenadas</label>
                <input type="text" value={form.coordenadas || ''} onChange={(e) => handleChange('coordenadas', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </section>

          {/* Facturación */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-yellow-500">&#9679;</span> Facturación
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de Cargo (IBAN)</label>
                <input type="text" value={form.cuentaCargo || ''} onChange={(e) => handleChange('cuentaCargo', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta Contable</label>
                <input type="text" value={form.cuentaContable || ''} onChange={(e) => handleChange('cuentaContable', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pago</label>
                <input type="text" value={form.formaPago || ''} onChange={(e) => handleChange('formaPago', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo IVA</label>
                <input type="text" value={form.tipoIva || ''} onChange={(e) => handleChange('tipoIva', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input type="checkbox" checked={form.facturaElectronica || false}
                  onChange={(e) => handleChange('facturaElectronica', e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded" />
                <label className="text-sm text-gray-700">Factura Electrónica</label>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input type="checkbox" checked={form.facturaMail || false}
                  onChange={(e) => handleChange('facturaMail', e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded" />
                <label className="text-sm text-gray-700">Factura por Email</label>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <input type="checkbox" checked={form.facturaPapel || false}
                  onChange={(e) => handleChange('facturaPapel', e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded" />
                <label className="text-sm text-gray-700">Factura en Papel</label>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Alerta Facturación</label>
              <input type="text" value={form.alertaFacturacion || ''} onChange={(e) => handleChange('alertaFacturacion', e.target.value)}
                className="w-full border rounded-md px-3 py-2" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Oficina Contable</label>
                <input type="text" value={form.oficinaContable || ''} onChange={(e) => handleChange('oficinaContable', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Órgano Gestor</label>
                <input type="text" value={form.organoGestor || ''} onChange={(e) => handleChange('organoGestor', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unidad Tramitadora</label>
                <input type="text" value={form.unidadTramitadora || ''} onChange={(e) => handleChange('unidadTramitadora', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </section>

          {/* Representante Legal */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-red-500">&#9679;</span> Representante Legal
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
                <input type="text" value={form.representante || ''} onChange={(e) => handleChange('representante', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                <input type="text" value={form.cargoRepresentante || ''} onChange={(e) => handleChange('cargoRepresentante', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">NIF Representante</label>
                <input type="text" value={form.nifRepresentante || ''} onChange={(e) => handleChange('nifRepresentante', e.target.value)}
                  className="w-full border rounded-md px-3 py-2" />
              </div>
            </div>
          </section>

          {/* Preferencias y Comunicaciones */}
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-indigo-500">&#9679;</span> Preferencias y Comunicaciones
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={form.newsletterSuscrito || false}
                  onChange={(e) => handleChange('newsletterSuscrito', e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded" />
                <label className="text-sm text-gray-700">Newsletter</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={form.recibePublicidad || false}
                  onChange={(e) => handleChange('recibePublicidad', e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded" />
                <label className="text-sm text-gray-700">Recibe Publicidad</label>
              </div>
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={form.aceptoLopd || false}
                  onChange={(e) => handleChange('aceptoLopd', e.target.checked)}
                  className="h-4 w-4 text-orange-600 rounded" />
                <label className="text-sm text-gray-700">Acepta LOPD</label>
              </div>
            </div>
          </section>

          {/* Botones */}
          <div className="flex gap-4">
            <button type="submit" disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2 rounded-md font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : 'Actualizar Cliente'}
            </button>
            <Link href="/admin/clientes"
              className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-md font-medium">
              Cancelar
            </Link>
          </div>
        </form>
      )}

      {/* TAB: Contratos */}
      {activeTab === 'contratos' && (
        <div className="space-y-6">
          {/* Resumen de contratos */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-sm font-medium text-gray-500">Total Contratos</dt>
              <dd className="mt-1 text-2xl font-semibold text-gray-900">{contratos.length}</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-sm font-medium text-gray-500">Activos</dt>
              <dd className="mt-1 text-2xl font-semibold text-green-600">{contratosActivos.length}</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-sm font-medium text-gray-500">Dados de Baja</dt>
              <dd className="mt-1 text-2xl font-semibold text-red-600">{contratosBajas.length}</dd>
            </div>
            <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-4">
              <dt className="text-sm font-medium text-gray-500">Facturación Mensual</dt>
              <dd className="mt-1 text-2xl font-semibold text-orange-600">
                {facturacionMensual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&euro;
              </dd>
            </div>
          </div>

          {/* Filtro */}
          <div className="flex gap-2">
            {(['activos', 'todos', 'bajas'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setContratosFilter(f)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  contratosFilter === f
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {f === 'activos' ? `Activos (${contratosActivos.length})` :
                 f === 'bajas' ? `Dados de Baja (${contratosBajas.length})` :
                 `Todos (${contratos.length})`}
              </button>
            ))}
          </div>

          {contratosLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              <span className="ml-3 text-gray-500">Cargando contratos...</span>
            </div>
          ) : filteredContratos.length === 0 ? (
            <div className="bg-white rounded-lg shadow border border-gray-200 p-8 text-center text-gray-500">
              No se encontraron contratos {contratosFilter !== 'todos' ? `con estado "${contratosFilter}"` : ''} para este cliente.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredContratos.map((contrato) => (
                <div key={contrato.id} className={`bg-white rounded-lg shadow border ${contrato.activo ? 'border-gray-200' : 'border-gray-200 opacity-70'} overflow-hidden`}>
                  <div className="px-5 py-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            contrato.activo ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {contrato.activo ? 'Activo' : 'Baja'}
                          </span>
                          {contrato.categoria && (
                            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              {contrato.categoria}
                            </span>
                          )}
                          {contrato.permanencia > 0 && (
                            <span className="inline-flex items-center rounded-full bg-yellow-50 px-2.5 py-0.5 text-xs font-medium text-yellow-700">
                              Permanencia: {contrato.permanencia} meses
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 truncate">{contrato.titulo}</h3>
                        <p className="text-sm text-gray-500 mt-0.5">{contrato.tarifa}</p>
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <p className="text-lg font-bold text-gray-900">
                          {Number(contrato.precio).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}&euro;
                          <span className="text-xs font-normal text-gray-500">/mes</span>
                        </p>
                        {contrato.importe_remesar && Number(contrato.importe_remesar) > 0 && (
                          <p className="text-xs text-gray-500">
                            Remesar: {Number(contrato.importe_remesar).toLocaleString('es-ES', { minimumFractionDigits: 2 })}&euro;
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                      {contrato.fecha_inicio && (
                        <span>Inicio: <span className="font-medium text-gray-700">{new Date(contrato.fecha_inicio).toLocaleDateString('es-ES')}</span></span>
                      )}
                      {contrato.fecha_baja && (
                        <span>Baja: <span className="font-medium text-red-600">{new Date(contrato.fecha_baja).toLocaleDateString('es-ES')}</span>
                          {contrato.causa_baja && <span className="ml-1">({contrato.causa_baja})</span>}
                        </span>
                      )}
                      {contrato.telefonos_contrato && (
                        <span>Tel: <span className="font-medium text-gray-700">{contrato.telefonos_contrato}</span></span>
                      )}
                      {contrato.concepto_facturacion && (
                        <span>Concepto: <span className="font-medium text-gray-700">{contrato.concepto_facturacion}</span></span>
                      )}
                      {contrato.fecha_permanencia && (
                        <span>Fin permanencia: <span className="font-medium text-gray-700">{new Date(contrato.fecha_permanencia).toLocaleDateString('es-ES')}</span></span>
                      )}
                    </div>
                    {contrato.observaciones && (
                      <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 italic">
                        {contrato.observaciones}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
