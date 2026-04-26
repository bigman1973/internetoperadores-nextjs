'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function EditarClientePage() {
  const router = useRouter()
  const params = useParams()
  const clienteId = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState<any>({})

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
      setTimeout(() => router.push('/admin/clientes'), 1500)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

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
          ← Volver a clientes
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <Link href="/admin/clientes" className="text-gray-500 hover:text-gray-700 text-sm">
        ← Volver
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mt-2 mb-6">Editar Cliente</h1>

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

      <form onSubmit={handleSubmit} className="space-y-8">

        {/* Estado y ISP Gestión */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-orange-500">●</span> Estado y Referencia
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
            <span className="text-blue-500">●</span> Datos del Cliente
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
            <span className="text-green-500">●</span> Contacto
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
            <span className="text-purple-500">●</span> Dirección
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
            <span className="text-yellow-500">●</span> Facturación
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
            <span className="text-red-500">●</span> Representante Legal
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
            <span className="text-indigo-500">●</span> Preferencias y Comunicaciones
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
    </div>
  )
}
