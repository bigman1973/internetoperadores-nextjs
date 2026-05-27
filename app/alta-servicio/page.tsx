'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useCart } from '@/components/CartProvider'

type TipoCliente = 'PARTICULAR' | 'EMPRESA'
type MetodoPago = 'SEPA_DOMICILIACION' | 'TARJETA_VIVID' | 'CRYPTO_TRIPLE_A'

interface TarifaPublica {
  id: number
  nombre: string
  nombreComercial: string
  descripcionCorta: string
  precioConIva: number
  precioSinIva: number
  cuotaAlta: number | null
  categoria: string
  tipoCliente: string
  destacada: boolean
}

interface FormData {
  tipoCliente: TipoCliente
  nombre: string
  apellidos: string
  dni: string
  razonSocial: string
  cif: string
  nombreApoderado: string
  dniApoderado: string
  email: string
  telefono: string
  direccionFacturacion: string
  localidadFacturacion: string
  provinciaFacturacion: string
  cpFacturacion: string
  instalacionDiferente: boolean
  direccionInstalacion: string
  localidadInstalacion: string
  provinciaInstalacion: string
  cpInstalacion: string
  metodoPago: MetodoPago
  iban: string
  esPortabilidad: boolean
  numeroPortar: string
  operadorActual: string
  titularLineaDiferente: boolean
  observaciones: string
}

function validarIBAN(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase()
  if (cleaned.length !== 24 || !cleaned.startsWith('ES')) return false
  const rearranged = cleaned.slice(4) + cleaned.slice(0, 4)
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString())
  let remainder = numeric.slice(0, 9)
  for (let i = 9; i < numeric.length; i += 7) {
    remainder = (parseInt(remainder) % 97).toString() + numeric.slice(i, i + 7)
  }
  return parseInt(remainder) % 97 === 1
}

function formatIBAN(value: string): string {
  const cleaned = value.replace(/\s/g, '').toUpperCase().slice(0, 24)
  return cleaned.replace(/(.{4})/g, '$1 ').trim()
}

function AltaServicioContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { items: cartItems, clearCart } = useCart()
  const fromCart = searchParams.get('fromCart') === 'true'
  const tarifaIdParam = searchParams.get('tarifaId')
  const tipoParam = searchParams.get('tipo') as TipoCliente | null

  // Determinar tipo de cliente según la procedencia
  const inferTipoCliente = (): TipoCliente => {
    if (tipoParam) return tipoParam
    if (fromCart && cartItems.length > 0) {
      // Inferir del primer item del carrito
      const cat = cartItems[0].categoria?.toUpperCase() || ''
      if (cat.includes('EMPRESA') || cat.includes('PROFESIONAL')) return 'EMPRESA'
    }
    return 'PARTICULAR'
  }

  const [paso, setPaso] = useState(fromCart || tarifaIdParam ? 1 : 0) // 0 = selector tarifas
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tarifasDisponibles, setTarifasDisponibles] = useState<TarifaPublica[]>([])
  const [tarifasSeleccionadas, setTarifasSeleccionadas] = useState<TarifaPublica[]>([])
  const [tipoClienteSelector, setTipoClienteSelector] = useState<TipoCliente>(inferTipoCliente())
  const [formData, setFormData] = useState<FormData>({
    tipoCliente: inferTipoCliente(),
    nombre: '',
    apellidos: '',
    dni: '',
    razonSocial: '',
    cif: '',
    nombreApoderado: '',
    dniApoderado: '',
    email: '',
    telefono: '',
    direccionFacturacion: '',
    localidadFacturacion: '',
    provinciaFacturacion: '',
    cpFacturacion: '',
    instalacionDiferente: false,
    direccionInstalacion: '',
    localidadInstalacion: '',
    provinciaInstalacion: '',
    cpInstalacion: '',
    metodoPago: 'SEPA_DOMICILIACION',
    iban: '',
    esPortabilidad: false,
    numeroPortar: '',
    operadorActual: '',
    titularLineaDiferente: false,
    observaciones: '',
  })

  // Cargar tarifas si estamos en paso 0 (selector)
  useEffect(() => {
    if (paso === 0) {
      fetch(`/api/tarifas?tipoCliente=${tipoClienteSelector}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setTarifasDisponibles(data)
          else if (data.tarifas) setTarifasDisponibles(data.tarifas)
        })
        .catch(() => {})
    }
  }, [paso, tipoClienteSelector])

  // Si viene del carrito, usar items del carrito como tarifas seleccionadas
  useEffect(() => {
    if (fromCart && cartItems.length > 0) {
      const tarifasFromCart: TarifaPublica[] = cartItems.map(item => ({
        id: item.tarifaId,
        nombre: item.nombre,
        nombreComercial: item.nombre,
        descripcionCorta: item.descripcion || '',
        precioConIva: item.precioConIva,
        precioSinIva: item.precioSinIva,
        cuotaAlta: item.cuotaAlta || null,
        categoria: item.categoria || '',
        tipoCliente: formData.tipoCliente,
        destacada: false,
      }))
      setTarifasSeleccionadas(tarifasFromCart)
    }
  }, [fromCart, cartItems])

  // Si viene con tarifaId, cargar esa tarifa
  useEffect(() => {
    if (tarifaIdParam) {
      fetch(`/api/tarifas/${tarifaIdParam}`)
        .then(r => r.json())
        .then(data => {
          if (!data.error) {
            setTarifasSeleccionadas([data])
          }
        })
        .catch(() => {})
    }
  }, [tarifaIdParam])

  const toggleTarifa = (tarifa: TarifaPublica) => {
    setTarifasSeleccionadas(prev => {
      const exists = prev.find(t => t.id === tarifa.id)
      if (exists) return prev.filter(t => t.id !== tarifa.id)
      return [...prev, tarifa]
    })
  }

  const totalMensual = tarifasSeleccionadas.reduce((sum, t) => sum + Number(t.precioConIva || 0), 0)
  const totalAltas = tarifasSeleccionadas.reduce((sum, t) => sum + Number(t.cuotaAlta || 0), 0)

  const updateField = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const validarPaso1 = () => {
    if (formData.metodoPago === 'SEPA_DOMICILIACION') {
      if (!formData.iban.replace(/\s/g, '')) {
        setError('Introduce tu número de cuenta IBAN')
        return false
      }
      if (!validarIBAN(formData.iban)) {
        setError('El IBAN introducido no es válido. Debe empezar por ES y tener 24 caracteres.')
        return false
      }
    }
    return true
  }

  const validarPaso2 = () => {
    if (formData.tipoCliente === 'PARTICULAR') {
      if (!formData.nombre || !formData.apellidos || !formData.dni) {
        setError('Completa nombre, apellidos y DNI')
        return false
      }
    } else {
      if (!formData.razonSocial || !formData.cif) {
        setError('Completa razón social y CIF')
        return false
      }
    }
    if (!formData.email || !formData.direccionFacturacion || !formData.localidadFacturacion || !formData.provinciaFacturacion || !formData.cpFacturacion) {
      setError('Completa todos los campos obligatorios')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.email)) {
      setError('Introduce un email válido')
      return false
    }
    return true
  }

  const handleSubmit = async () => {
    if (!validarPaso2()) return
    
    // Verificar checkbox de condiciones
    const checkbox = document.getElementById('aceptar-condiciones') as HTMLInputElement
    if (!checkbox?.checked) {
      setError('Debes aceptar las condiciones generales y la política de privacidad')
      return
    }

    if (tarifasSeleccionadas.length === 0) {
      setError('No hay servicios seleccionados')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Crear un alta por la primera tarifa (principal)
      // Las adicionales se añaden como observaciones
      const tarifaPrincipal = tarifasSeleccionadas[0]
      const tarifasAdicionales = tarifasSeleccionadas.slice(1)
      
      const obsAdicionales = tarifasAdicionales.length > 0
        ? `Servicios adicionales: ${tarifasAdicionales.map(t => `${t.nombreComercial || t.nombre} (${t.precioConIva}€/mes)`).join(', ')}`
        : ''
      const observaciones = [obsAdicionales, formData.observaciones].filter(Boolean).join('\n') || undefined

      const res = await fetch('/api/altas/crear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          tarifaId: tarifaPrincipal.id,
          iban: formData.iban.replace(/\s/g, ''),
          direccionInstalacion: formData.instalacionDiferente ? formData.direccionInstalacion : null,
          localidadInstalacion: formData.instalacionDiferente ? formData.localidadInstalacion : null,
          provinciaInstalacion: formData.instalacionDiferente ? formData.provinciaInstalacion : null,
          cpInstalacion: formData.instalacionDiferente ? formData.cpInstalacion : null,
          observaciones,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Limpiar carrito si venía del carrito
      if (fromCart) clearCart()

      // Si hay pago de alta pendiente, redirigir a pago
      if (data.pagoUrl) {
        window.location.href = data.pagoUrl
      } else {
        // Redirigir a documentación
        router.push(`/alta-servicio/documentacion?token=${data.token}`)
      }
    } catch (err: any) {
      setError(err.message || 'Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center gap-3">
            <img src="/images/logo-internetoperadores.png" alt="Internet Operadores" className="h-10 w-auto" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Alta de Servicio</h1>
              <p className="text-sm text-gray-500">Internet Operadores</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-3xl mx-auto px-4 py-4">
        <div className="flex items-center gap-2">
          {(paso === 0 ? ['Servicios', 'Método de pago', 'Tus datos', 'Confirmación'] : ['Método de pago', 'Tus datos', 'Confirmación']).map((label, idx) => {
            const stepNum = paso === 0 ? idx : idx + 1
            const isActive = paso === 0 ? idx === 0 : paso >= idx + 1
            const totalSteps = paso === 0 ? 4 : 3
            return (
              <div key={idx} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  isActive ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-500'
                }`}>{idx + 1}</div>
                <span className={`text-xs hidden sm:inline ${isActive ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                  {label}
                </span>
                {idx < (paso === 0 ? 3 : 2) && <div className={`flex-1 h-0.5 ${
                  (paso === 0 && idx < 0) || (paso > 0 && paso > idx + 1) ? 'bg-orange-500' : 'bg-gray-200'
                }`} />}
              </div>
            )
          })}
        </div>
      </div>

      {/* Servicios seleccionados (resumen lateral) */}
      {paso > 0 && tarifasSeleccionadas.length > 0 && (
        <div className="max-w-3xl mx-auto px-4 mb-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="text-sm text-orange-700 font-medium mb-2">
              {tarifasSeleccionadas.length === 1 ? 'Servicio seleccionado' : `${tarifasSeleccionadas.length} servicios seleccionados`}
            </p>
            {tarifasSeleccionadas.map(t => (
              <div key={t.id} className="flex justify-between items-center py-1">
                <p className="text-sm font-medium text-gray-900">{t.nombreComercial || t.nombre}</p>
                <p className="text-sm font-bold text-orange-600">{Number(t.precioConIva).toFixed(2)}€/mes</p>
              </div>
            ))}
            {tarifasSeleccionadas.length > 1 && (
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-orange-200">
                <p className="text-sm font-bold text-gray-900">Total mensual</p>
                <p className="text-lg font-bold text-orange-600">{totalMensual.toFixed(2)}€/mes</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Formulario */}
      <div className="max-w-3xl mx-auto px-4 pb-12">
        <div className="bg-white rounded-xl shadow-sm border p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* PASO 0: Selector de tarifas */}
          {paso === 0 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Selecciona tus servicios</h2>
              <p className="text-sm text-gray-500 mb-6">Elige uno o varios servicios para dar de alta</p>

              {/* Selector tipo cliente */}
              <div className="flex gap-2 mb-6">
                <button onClick={() => { setTipoClienteSelector('PARTICULAR'); setTarifasSeleccionadas([]); updateField('tipoCliente', 'PARTICULAR') }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                    tipoClienteSelector === 'PARTICULAR' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>Particular</button>
                <button onClick={() => { setTipoClienteSelector('EMPRESA'); setTarifasSeleccionadas([]); updateField('tipoCliente', 'EMPRESA') }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                    tipoClienteSelector === 'EMPRESA' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>Empresa</button>
              </div>

              {/* Grid de tarifas */}
              {tarifasDisponibles.length === 0 ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-3"></div>
                  <p className="text-sm text-gray-500">Cargando tarifas...</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                  {tarifasDisponibles.map(tarifa => {
                    const isSelected = tarifasSeleccionadas.some(t => t.id === tarifa.id)
                    return (
                      <div
                        key={tarifa.id}
                        onClick={() => toggleTarifa(tarifa)}
                        className={`p-4 border-2 rounded-lg cursor-pointer transition ${
                          isSelected ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                              isSelected ? 'border-orange-500 bg-orange-500' : 'border-gray-300'
                            }`}>
                              {isSelected && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">{tarifa.nombreComercial || tarifa.nombre}</p>
                              {tarifa.descripcionCorta && (
                                <p className="text-xs text-gray-500 mt-0.5">{tarifa.descripcionCorta}</p>
                              )}
                              {tarifa.categoria && (
                                <span className="text-xs text-orange-600 font-medium">{tarifa.categoria}</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{Number(tarifa.precioConIva).toFixed(2)}€<span className="text-xs font-normal text-gray-500">/mes</span></p>
                            {tarifa.cuotaAlta && Number(tarifa.cuotaAlta) > 0 && (
                              <p className="text-xs text-gray-500">Alta: {Number(tarifa.cuotaAlta).toFixed(2)}€</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Resumen selección */}
              {tarifasSeleccionadas.length > 0 && (
                <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-green-800 font-medium">
                      {tarifasSeleccionadas.length} {tarifasSeleccionadas.length === 1 ? 'servicio seleccionado' : 'servicios seleccionados'}
                    </p>
                    <p className="text-sm font-bold text-green-800">{totalMensual.toFixed(2)}€/mes</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  if (tarifasSeleccionadas.length === 0) {
                    setError('Selecciona al menos un servicio')
                    return
                  }
                  setError('')
                  setPaso(1)
                }}
                disabled={tarifasSeleccionadas.length === 0}
                className="mt-6 w-full bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continuar con el alta
              </button>
            </div>
          )}

          {/* PASO 1: Método de pago */}
          {paso === 1 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Método de pago recurrente</h2>
              <p className="text-sm text-gray-500 mb-6">Selecciona cómo quieres realizar los pagos mensuales del servicio</p>

              <div className="space-y-3 mb-6">
                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                  formData.metodoPago === 'SEPA_DOMICILIACION' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="metodoPago" value="SEPA_DOMICILIACION"
                    checked={formData.metodoPago === 'SEPA_DOMICILIACION'}
                    onChange={() => updateField('metodoPago', 'SEPA_DOMICILIACION')}
                    className="mt-1 accent-orange-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏦</span>
                      <p className="font-medium text-gray-900">Domiciliación bancaria (SEPA)</p>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Cargo automático mensual en tu cuenta bancaria. Método más habitual en telecomunicaciones.</p>
                    <span className="inline-block mt-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Recomendado</span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                  formData.metodoPago === 'TARJETA_VIVID' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="metodoPago" value="TARJETA_VIVID"
                    checked={formData.metodoPago === 'TARJETA_VIVID'}
                    onChange={() => updateField('metodoPago', 'TARJETA_VIVID')}
                    className="mt-1 accent-orange-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">💳</span>
                      <p className="font-medium text-gray-900">Tarjeta de crédito/débito</p>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Recibirás un enlace de pago mensual. Visa, Mastercard, Apple Pay, Google Pay.</p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition ${
                  formData.metodoPago === 'CRYPTO_TRIPLE_A' ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
                }`}>
                  <input type="radio" name="metodoPago" value="CRYPTO_TRIPLE_A"
                    checked={formData.metodoPago === 'CRYPTO_TRIPLE_A'}
                    onChange={() => updateField('metodoPago', 'CRYPTO_TRIPLE_A')}
                    className="mt-1 accent-orange-500" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🪙</span>
                      <p className="font-medium text-gray-900">Criptomonedas</p>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Paga con Bitcoin, Ethereum u otras criptomonedas. 1% de descuento.</p>
                  </div>
                </label>
              </div>

              {/* IBAN si es SEPA */}
              {formData.metodoPago === 'SEPA_DOMICILIACION' && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg border">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Número de cuenta (IBAN) *
                  </label>
                  <input
                    type="text"
                    value={formData.iban}
                    onChange={(e) => updateField('iban', formatIBAN(e.target.value))}
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg text-lg font-mono tracking-wider focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    maxLength={29}
                  />
                  <p className="text-xs text-gray-500 mt-2">El IBAN español tiene 24 caracteres y empieza por ES</p>
                  {formData.iban.replace(/\s/g, '').length === 24 && (
                    <p className={`text-sm mt-2 font-medium ${validarIBAN(formData.iban) ? 'text-green-600' : 'text-red-600'}`}>
                      {validarIBAN(formData.iban) ? '✓ IBAN válido' : '✗ IBAN no válido — revisa los dígitos'}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-3">
                    Al proporcionar tu IBAN autorizas a Internet Operadores SL a emitir adeudos SEPA en tu cuenta.
                    Los cargos se iniciarán únicamente tras la activación efectiva del servicio.
                  </p>
                </div>
              )}

              {formData.metodoPago !== 'SEPA_DOMICILIACION' && (
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    {formData.metodoPago === 'TARJETA_VIVID'
                      ? 'Cada mes recibirás un enlace de pago por email para abonar tu cuota mensual.'
                      : 'Cada mes recibirás un enlace de pago por email para abonar tu cuota en criptomonedas (1% de descuento aplicado).'}
                  </p>
                </div>
              )}

              <div className="flex gap-3 mt-6">
                {paso === 1 && !fromCart && !tarifaIdParam && (
                  <button onClick={() => setPaso(0)}
                    className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
                    Atrás
                  </button>
                )}
                <button
                  onClick={() => { if (validarPaso1()) setPaso(2) }}
                  className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* PASO 2: Datos personales */}
          {paso === 2 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Datos del titular</h2>
              <p className="text-sm text-gray-500 mb-6">Introduce los datos del titular del servicio</p>

              {/* Selector tipo cliente (solo si viene del selector de tarifas) */}
              {!fromCart && !tipoParam && (
                <div className="flex gap-2 mb-6">
                  <button onClick={() => updateField('tipoCliente', 'PARTICULAR')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                      formData.tipoCliente === 'PARTICULAR' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>Particular</button>
                  <button onClick={() => updateField('tipoCliente', 'EMPRESA')}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                      formData.tipoCliente === 'EMPRESA' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}>Empresa</button>
                </div>
              )}

              {/* Campos particular */}
              {formData.tipoCliente === 'PARTICULAR' && (
                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                      <input type="text" value={formData.nombre} onChange={e => updateField('nombre', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Apellidos *</label>
                      <input type="text" value={formData.apellidos} onChange={e => updateField('apellidos', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">DNI / NIE *</label>
                    <input type="text" value={formData.dni} onChange={e => updateField('dni', e.target.value.toUpperCase())}
                      placeholder="12345678A" maxLength={9}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                </div>
              )}

              {/* Campos empresa */}
              {formData.tipoCliente === 'EMPRESA' && (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social *</label>
                    <input type="text" value={formData.razonSocial} onChange={e => updateField('razonSocial', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CIF *</label>
                    <input type="text" value={formData.cif} onChange={e => updateField('cif', e.target.value.toUpperCase())}
                      placeholder="B12345678" maxLength={9}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del apoderado</label>
                      <input type="text" value={formData.nombreApoderado} onChange={e => updateField('nombreApoderado', e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">DNI del apoderado</label>
                      <input type="text" value={formData.dniApoderado} onChange={e => updateField('dniApoderado', e.target.value.toUpperCase())}
                        maxLength={9}
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                  </div>
                </div>
              )}

              {/* Contacto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={formData.email} onChange={e => updateField('email', e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono de contacto</label>
                  <input type="tel" value={formData.telefono} onChange={e => updateField('telefono', e.target.value)}
                    placeholder="600 000 000"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                </div>
              </div>

              {/* Dirección facturación */}
              <h3 className="text-sm font-bold text-gray-700 mb-3 border-t pt-4">Dirección de facturación</h3>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dirección completa *</label>
                  <input type="text" value={formData.direccionFacturacion} onChange={e => updateField('direccionFacturacion', e.target.value)}
                    placeholder="Calle, número, piso, puerta"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Localidad *</label>
                    <input type="text" value={formData.localidadFacturacion} onChange={e => updateField('localidadFacturacion', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Provincia *</label>
                    <input type="text" value={formData.provinciaFacturacion} onChange={e => updateField('provinciaFacturacion', e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">C.P. *</label>
                    <input type="text" value={formData.cpFacturacion} onChange={e => updateField('cpFacturacion', e.target.value)}
                      maxLength={5}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                </div>
              </div>

              {/* Dirección instalación */}
              <div className="mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.instalacionDiferente}
                    onChange={e => updateField('instalacionDiferente', e.target.checked)}
                    className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm text-gray-700">La dirección de instalación es diferente a la de facturación</span>
                </label>
              </div>

              {formData.instalacionDiferente && (
                <div className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <h3 className="text-sm font-bold text-gray-700">Dirección de instalación</h3>
                  <input type="text" value={formData.direccionInstalacion} onChange={e => updateField('direccionInstalacion', e.target.value)}
                    placeholder="Dirección completa" className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  <div className="grid grid-cols-3 gap-3">
                    <input type="text" value={formData.localidadInstalacion} onChange={e => updateField('localidadInstalacion', e.target.value)}
                      placeholder="Localidad" className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    <input type="text" value={formData.provinciaInstalacion} onChange={e => updateField('provinciaInstalacion', e.target.value)}
                      placeholder="Provincia" className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    <input type="text" value={formData.cpInstalacion} onChange={e => updateField('cpInstalacion', e.target.value)}
                      placeholder="C.P." maxLength={5} className="px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                </div>
              )}

              {/* Portabilidad */}
              <div className="border-t pt-4 mb-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={formData.esPortabilidad}
                    onChange={e => updateField('esPortabilidad', e.target.checked)}
                    className="w-4 h-4 accent-orange-500" />
                  <span className="text-sm text-gray-700">Deseo portar mi número de otro operador</span>
                </label>
              </div>

              {formData.esPortabilidad && (
                <div className="space-y-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Número a portar</label>
                      <input type="tel" value={formData.numeroPortar} onChange={e => updateField('numeroPortar', e.target.value)}
                        placeholder="600 000 000"
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Operador actual</label>
                      <input type="text" value={formData.operadorActual} onChange={e => updateField('operadorActual', e.target.value)}
                        placeholder="Movistar, Vodafone..."
                        className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={formData.titularLineaDiferente}
                      onChange={e => updateField('titularLineaDiferente', e.target.checked)}
                      className="w-4 h-4 accent-orange-500" />
                    <span className="text-sm text-gray-700">El titular actual de la línea es otra persona/empresa</span>
                  </label>
                  {formData.titularLineaDiferente && (
                    <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                      En el siguiente paso te pediremos documentación adicional del titular actual de la línea.
                    </p>
                  )}
                </div>
              )}

              {/* Observaciones */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea
                  value={formData.observaciones}
                  onChange={(e) => updateField('observaciones', e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  placeholder="Indica cualquier información adicional relevante para tu alta (horario preferido de instalación, instrucciones de acceso, etc.)"
                />
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setPaso(1)}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
                  Atrás
                </button>
                <button onClick={() => { if (validarPaso2()) setPaso(3) }}
                  className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition">
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* PASO 3: Resumen y confirmación */}
          {paso === 3 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Resumen de tu contratación</h2>
              <p className="text-sm text-gray-500 mb-6">Revisa los datos antes de continuar con la documentación</p>

              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Titular</h3>
                  <p className="text-sm font-medium text-gray-900">
                    {formData.tipoCliente === 'EMPRESA' ? formData.razonSocial : `${formData.nombre} ${formData.apellidos}`}
                  </p>
                  <p className="text-sm text-gray-600">
                    {formData.tipoCliente === 'EMPRESA' ? `CIF: ${formData.cif}` : `DNI: ${formData.dni}`}
                  </p>
                  <p className="text-sm text-gray-600">{formData.email} {formData.telefono && `· ${formData.telefono}`}</p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Dirección</h3>
                  <p className="text-sm text-gray-900">{formData.direccionFacturacion}</p>
                  <p className="text-sm text-gray-600">{formData.cpFacturacion} {formData.localidadFacturacion}, {formData.provinciaFacturacion}</p>
                  {formData.instalacionDiferente && formData.direccionInstalacion && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-500">Instalación:</p>
                      <p className="text-sm text-gray-900">{formData.direccionInstalacion}</p>
                      <p className="text-sm text-gray-600">{formData.cpInstalacion} {formData.localidadInstalacion}, {formData.provinciaInstalacion}</p>
                    </div>
                  )}
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-xs font-bold text-gray-500 uppercase mb-2">Método de pago recurrente</h3>
                  <p className="text-sm font-medium text-gray-900">
                    {formData.metodoPago === 'SEPA_DOMICILIACION' && `🏦 Domiciliación SEPA: ${formatIBAN(formData.iban)}`}
                    {formData.metodoPago === 'TARJETA_VIVID' && '💳 Tarjeta de crédito/débito (link mensual)'}
                    {formData.metodoPago === 'CRYPTO_TRIPLE_A' && '🪙 Criptomonedas (link mensual, -1%)'}
                  </p>
                </div>

                {/* Servicios contratados */}
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <h3 className="text-xs font-bold text-orange-600 uppercase mb-2">
                    {tarifasSeleccionadas.length === 1 ? 'Servicio contratado' : 'Servicios contratados'}
                  </h3>
                  {tarifasSeleccionadas.map(t => (
                    <div key={t.id} className="flex justify-between items-center py-1">
                      <p className="text-sm font-medium text-gray-900">{t.nombreComercial || t.nombre}</p>
                      <p className="text-sm font-bold text-orange-600">{Number(t.precioConIva).toFixed(2)}€/mes</p>
                    </div>
                  ))}
                  {tarifasSeleccionadas.length > 1 && (
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-orange-200">
                      <p className="text-sm font-bold text-gray-900">Total mensual</p>
                      <p className="text-lg font-bold text-orange-600">{totalMensual.toFixed(2)}€/mes</p>
                    </div>
                  )}
                  {totalAltas > 0 && (
                    <p className="text-sm text-gray-600 mt-1">Cuota de alta: {totalAltas.toFixed(2)}€ (pago único)</p>
                  )}
                </div>

                {formData.esPortabilidad && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="text-xs font-bold text-blue-600 uppercase mb-2">Portabilidad</h3>
                    <p className="text-sm text-gray-900">Número: {formData.numeroPortar || 'No indicado'}</p>
                    <p className="text-sm text-gray-600">Operador: {formData.operadorActual || 'No indicado'}</p>
                  </div>
                )}
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Siguiente paso:</strong> Tras confirmar, te pediremos la documentación necesaria para tramitar el alta.
                  {formData.metodoPago === 'SEPA_DOMICILIACION'
                    ? ' No se realizará ningún cargo hasta que el servicio esté activo.'
                    : ' Si hay cuota de alta, se te redirigirá al pago.'}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" id="aceptar-condiciones" className="mt-1 w-4 h-4 accent-orange-500" />
                  <span className="text-xs text-gray-600">
                    He leído y acepto las{' '}
                    <a href="/condiciones-generales" target="_blank" className="text-orange-600 underline">Condiciones Generales del Servicio</a>
                    {' '}y la{' '}
                    <a href="/politica-privacidad" target="_blank" className="text-orange-600 underline">Política de Privacidad</a>.
                    {formData.metodoPago === 'SEPA_DOMICILIACION' && ' Autorizo la domiciliación SEPA en la cuenta indicada.'}
                  </span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setPaso(2)}
                  className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition">
                  Atrás
                </button>
                <button onClick={handleSubmit} disabled={loading}
                  className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-medium hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed">
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Procesando...
                    </span>
                  ) : 'Confirmar y continuar con documentación'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info legal */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Internet Operadores SL · CIF B25808619 · Paseo De La Habana 26 1-1, 28036 Madrid
        </p>
      </div>
    </div>
  )
}

export default function AltaServicioPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
      </div>
    }>
      <AltaServicioContent />
    </Suspense>
  )
}
