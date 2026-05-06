"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '../../../../../components/admin/AdminHeader';

interface CategoriaConfig {
  id: number;
  nombre: string;
  subcategorias: { id: number; nombre: string }[];
}

export default function EditarTarifaPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [categoriasConfig, setCategoriasConfig] = useState<CategoriaConfig[]>([]);
  const [formData, setFormData] = useState({
    // Datos básicos
    tipoCliente: 'PARTICULAR',
    categoria: '',
    subcategoria: '',
    nombre: '',
    nombreComercial: '',
    descripcionCorta: '',
    descripcionLarga: '',
    ispGestionId: '',
    
    // Precios
    precioSinIva: '',
    precioConIva: '',
    costeOperador: '',
    precioPeriodo: '',
    precioPeriodoIva: '',
    
    // Tipo de servicio
    esMovil: false,
    esFijo: false,
    esInternet: false,
    esTv: false,
    esCompuesta: false,
    
    // Conectividad
    velocidad: '',
    velocidadBajada: '',
    velocidadSubida: '',
    fibraBajada: '',
    fibraSubida: '',
    datosIncluidos: '',
    minutosIncluidos: '',
    smsIncluidos: '',
    servicioPppoe: '',
    
    // Permanencia
    permanencia: '',
    penalizacion: '',
    duracionPermanenciaMeses: '',
    observacionesPermanencia: '',
    
    // Facturación
    conceptoFacturacion: '',
    tipoPeriodicidad: '1',
    noFacturar: false,
    noProrrateable: false,
    
    // Configuración
    destacada: false,
    activa: true,
    publicarWeb: false,
    publicarWebParticular: false,
    publicarWebEmpresa: false,
    seccionWebParticular: '',
    seccionWebEmpresa: '',
    soloClientesExistentes: false,
    
    // Otros
    garantia: '',
    observaciones: '',
  });

  useEffect(() => {
    // Cargar categorías desde la BD
    fetch('/api/admin/configuracion/categorias')
      .then(res => res.json())
      .then(data => { if (Array.isArray(data)) setCategoriasConfig(data) })
      .catch(() => {});

    const fetchTarifa = async () => {
      try {
        const response = await fetch(`/api/admin/tarifas/${id}`);
        if (response.ok) {
          const data = await response.json();
          setFormData({
            tipoCliente: data.tipoCliente || 'PARTICULAR',
            categoria: data.categoria || '',
            subcategoria: data.subcategoria || '',
            nombre: data.nombre || '',
            nombreComercial: data.nombreComercial || data.nombre || '',
            descripcionCorta: data.descripcionCorta || '',
            descripcionLarga: data.descripcionLarga || '',
            ispGestionId: data.ispGestionId || '',
            precioSinIva: data.precioSinIva?.toString() || '0',
            precioConIva: data.precioConIva?.toString() || '0',
            costeOperador: data.costeOperador?.toString() || '',
            precioPeriodo: data.precioPeriodo?.toString() || '',
            precioPeriodoIva: data.precioPeriodoIva?.toString() || '',
            esMovil: data.esMovil || false,
            esFijo: data.esFijo || false,
            esInternet: data.esInternet || false,
            esTv: data.esTv || false,
            esCompuesta: data.esCompuesta || false,
            velocidad: data.velocidad || '',
            velocidadBajada: data.velocidadBajada || '',
            velocidadSubida: data.velocidadSubida || '',
            fibraBajada: data.fibraBajada || '',
            fibraSubida: data.fibraSubida || '',
            datosIncluidos: data.datosIncluidos || '',
            minutosIncluidos: data.minutosIncluidos || '',
            smsIncluidos: data.smsIncluidos || '',
            servicioPppoe: data.servicioPppoe || '',
            permanencia: data.permanencia || '',
            penalizacion: data.penalizacion || '',
            duracionPermanenciaMeses: data.duracionPermanenciaMeses?.toString() || '',
            observacionesPermanencia: data.observacionesPermanencia || '',
            conceptoFacturacion: data.conceptoFacturacion || '',
            tipoPeriodicidad: data.tipoPeriodicidad?.toString() || '1',
            noFacturar: data.noFacturar || false,
            noProrrateable: data.noProrrateable || false,
            destacada: data.destacada || false,
            activa: data.activa ?? true,
            publicarWeb: data.publicarWeb || false,
            publicarWebParticular: data.publicarWebParticular || false,
            publicarWebEmpresa: data.publicarWebEmpresa || false,
            seccionWebParticular: data.seccionWebParticular || '',
            seccionWebEmpresa: data.seccionWebEmpresa || '',
            soloClientesExistentes: data.soloClientesExistentes || false,
            garantia: data.garantia || '',
            observaciones: data.observaciones || '',
          });
        } else {
          alert('Error al cargar la tarifa');
          router.push('/admin/tarifas');
        }
      } catch (error) {
        console.error('Error fetching tarifa:', error);
        alert('Error al cargar la tarifa');
      } finally {
        setLoading(false);
      }
    };
    fetchTarifa();
  }, [id, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Auto-calcular IVA
    if (name === 'precioSinIva' && value) {
      const precioSinIva = parseFloat(value);
      if (!isNaN(precioSinIva)) {
        setFormData(prev => ({
          ...prev,
          precioSinIva: value,
          precioConIva: (precioSinIva * 1.21).toFixed(2)
        }));
      }
    }

    if (name === 'precioConIva' && value) {
      const precioConIva = parseFloat(value);
      if (!isNaN(precioConIva)) {
        setFormData(prev => ({
          ...prev,
          precioConIva: value,
          precioSinIva: (precioConIva / 1.21).toFixed(2)
        }));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tarifas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoCliente: formData.tipoCliente,
          categoria: formData.categoria,
          subcategoria: formData.subcategoria || null,
          nombre: formData.nombre,
          nombreComercial: formData.nombreComercial || formData.nombre,
          descripcionCorta: formData.descripcionCorta || null,
          descripcionLarga: formData.descripcionLarga || null,
          precioSinIva: parseFloat(formData.precioSinIva) || 0,
          precioConIva: parseFloat(formData.precioConIva) || 0,
          costeOperador: formData.costeOperador ? parseFloat(formData.costeOperador) : null,
          precioPeriodo: formData.precioPeriodo ? parseFloat(formData.precioPeriodo) : null,
          precioPeriodoIva: formData.precioPeriodoIva ? parseFloat(formData.precioPeriodoIva) : null,
          esMovil: formData.esMovil,
          esFijo: formData.esFijo,
          esInternet: formData.esInternet,
          esTv: formData.esTv,
          esCompuesta: formData.esCompuesta,
          velocidad: formData.velocidad || null,
          velocidadBajada: formData.velocidadBajada || null,
          velocidadSubida: formData.velocidadSubida || null,
          fibraBajada: formData.fibraBajada || null,
          fibraSubida: formData.fibraSubida || null,
          datosIncluidos: formData.datosIncluidos || null,
          minutosIncluidos: formData.minutosIncluidos || null,
          smsIncluidos: formData.smsIncluidos || null,
          servicioPppoe: formData.servicioPppoe || null,
          permanencia: formData.permanencia || null,
          penalizacion: formData.penalizacion || null,
          duracionPermanenciaMeses: formData.duracionPermanenciaMeses ? parseInt(formData.duracionPermanenciaMeses) : null,
          observacionesPermanencia: formData.observacionesPermanencia || null,
          conceptoFacturacion: formData.conceptoFacturacion || null,
          tipoPeriodicidad: formData.tipoPeriodicidad ? parseInt(formData.tipoPeriodicidad) : 1,
          noFacturar: formData.noFacturar,
          noProrrateable: formData.noProrrateable,
          destacada: formData.destacada,
          activa: formData.activa,
          publicarWeb: formData.publicarWeb,
          publicarWebParticular: formData.publicarWebParticular,
          publicarWebEmpresa: formData.publicarWebEmpresa,
          seccionWebParticular: formData.seccionWebParticular || null,
          seccionWebEmpresa: formData.seccionWebEmpresa || null,
          soloClientesExistentes: formData.soloClientesExistentes,
          garantia: formData.garantia || null,
          observaciones: formData.observaciones || null,
        }),
      });
      if (response.ok) {
        router.push('/admin/tarifas?success=updated');
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating tarifa:', error);
      alert('Error al actualizar la tarifa');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Cargando tarifa...</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button onClick={() => router.back()} className="text-sm text-gray-600 hover:text-orange-600 flex items-center gap-1">
            ← Volver
          </button>
          <div className="flex items-center justify-between mt-2">
            <h1 className="text-2xl font-bold text-gray-900">Editar Tarifa</h1>
            {formData.ispGestionId && (
              <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                ISP Gestión #{formData.ispGestionId}
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* SECCIÓN 1: Datos Básicos */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              📋 Datos Básicos
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Cliente</label>
                <select name="tipoCliente" value={formData.tipoCliente} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                  <option value="PARTICULAR">Particular</option>
                  <option value="EMPRESA">Empresa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
                <select name="categoria" value={formData.categoria} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                  <option value="">Seleccionar categoría</option>
                  {categoriasConfig.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subcategoría</label>
                {(() => {
                  const catConfig = categoriasConfig.find(c => c.nombre === formData.categoria.toUpperCase());
                  const opciones = catConfig?.subcategorias.map(s => s.nombre) || [];
                  return opciones.length > 0 ? (
                    <select name="subcategoria" value={formData.subcategoria} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                      <option value="">Sin subcategoría</option>
                      {opciones.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <input type="text" name="subcategoria" value={formData.subcategoria} onChange={handleChange} placeholder="Opcional" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
                  );
                })()}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID ISP Gestión</label>
                <input type="text" name="ispGestionId" value={formData.ispGestionId} onChange={handleChange} disabled className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-gray-50 text-gray-500" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la Tarifa</label>
                <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-orange-700 mb-1">Nombre Comercial (Web)</label>
                <input type="text" name="nombreComercial" value={formData.nombreComercial} onChange={handleChange} className="w-full px-3 py-2 border border-orange-300 rounded-md text-sm bg-orange-50" placeholder="Nombre que se mostrará en la web pública" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción Corta</label>
                <input type="text" name="descripcionCorta" value={formData.descripcionCorta} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Resumen breve de la tarifa" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripción Larga</label>
                <textarea name="descripcionLarga" value={formData.descripcionLarga} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Descripción detallada" />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Tipo de Servicio */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              📡 Tipo de Servicio
            </h2>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="esMovil" checked={formData.esMovil} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  Móvil
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="esFijo" checked={formData.esFijo} onChange={handleChange} className="w-4 h-4 text-green-600 rounded border-gray-300" />
                <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className="w-3 h-3 rounded-full bg-green-500"></span>
                  Fijo
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="esInternet" checked={formData.esInternet} onChange={handleChange} className="w-4 h-4 text-purple-600 rounded border-gray-300" />
                <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className="w-3 h-3 rounded-full bg-purple-500"></span>
                  Internet
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="esTv" checked={formData.esTv} onChange={handleChange} className="w-4 h-4 text-orange-600 rounded border-gray-300" />
                <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  TV
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="esCompuesta" checked={formData.esCompuesta} onChange={handleChange} className="w-4 h-4 text-yellow-600 rounded border-gray-300" />
                <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-700">
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  Pack / Compuesta
                </span>
              </label>
            </div>
          </div>

          {/* SECCIÓN 3: Precios */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              💰 Precios
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Sin IVA (€)</label>
                <input type="number" step="0.01" name="precioSinIva" value={formData.precioSinIva} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Con IVA (€)</label>
                <input type="number" step="0.01" name="precioConIva" value={formData.precioConIva} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Coste Operador (€)</label>
                <input type="number" step="0.01" name="costeOperador" value={formData.costeOperador} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Coste para el operador" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Período (€)</label>
                <input type="number" step="0.01" name="precioPeriodo" value={formData.precioPeriodo} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio Período con IVA (€)</label>
                <input type="number" step="0.01" name="precioPeriodoIva" value={formData.precioPeriodoIva} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
          </div>

          {/* SECCIÓN 4: Conectividad */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              🌐 Conectividad
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Velocidad (general)</label>
                <input type="text" name="velocidad" value={formData.velocidad} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 600Mb/600Mb" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Velocidad Bajada (Mbps)</label>
                <input type="text" name="velocidadBajada" value={formData.velocidadBajada} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 600" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Velocidad Subida (Mbps)</label>
                <input type="text" name="velocidadSubida" value={formData.velocidadSubida} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 600" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fibra Bajada</label>
                <input type="text" name="fibraBajada" value={formData.fibraBajada} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="ID perfil fibra bajada" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fibra Subida</label>
                <input type="text" name="fibraSubida" value={formData.fibraSubida} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="ID perfil fibra subida" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Datos Incluidos</label>
                <input type="text" name="datosIncluidos" value={formData.datosIncluidos} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 15GB, Ilimitados" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minutos Incluidos</label>
                <input type="text" name="minutosIncluidos" value={formData.minutosIncluidos} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: Ilimitados, 100min" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SMS Incluidos</label>
                <input type="text" name="smsIncluidos" value={formData.smsIncluidos} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 100, Ilimitados" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Servicio PPPoE</label>
              <input type="text" name="servicioPppoe" value={formData.servicioPppoe} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Nombre del servicio PPPoE" />
            </div>
          </div>

          {/* SECCIÓN 5: Permanencia */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              📅 Permanencia
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Duración Permanencia (meses)</label>
                <input type="number" name="duracionPermanenciaMeses" value={formData.duracionPermanenciaMeses} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 12, 18, 24" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Penalización (€)</label>
                <input type="text" name="penalizacion" value={formData.penalizacion} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: 250" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Permanencia (texto)</label>
                <input type="text" name="permanencia" value={formData.permanencia} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Descripción de permanencia" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones Permanencia</label>
              <textarea name="observacionesPermanencia" value={formData.observacionesPermanencia} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: +100€ de penalización si no se devuelve el router" />
            </div>
          </div>

          {/* SECCIÓN 6: Facturación */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              🧾 Facturación
            </h2>
            <div className="mt-0">
              <label className="block text-sm font-medium text-gray-700 mb-1">Concepto de Facturación</label>
              <input type="text" name="conceptoFacturacion" value={formData.conceptoFacturacion} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" placeholder="Ej: [nombre_tarifa] DE [mes_actual_texto]" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo Periodicidad</label>
                <select name="tipoPeriodicidad" value={formData.tipoPeriodicidad} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                  <option value="1">Mensual</option>
                  <option value="2">Bimestral</option>
                  <option value="3">Trimestral</option>
                  <option value="6">Semestral</option>
                  <option value="12">Anual</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" name="noFacturar" checked={formData.noFacturar} onChange={handleChange} className="w-4 h-4 text-orange-600 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">No Facturar</span>
                </label>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer pb-2">
                  <input type="checkbox" name="noProrrateable" checked={formData.noProrrateable} onChange={handleChange} className="w-4 h-4 text-orange-600 rounded border-gray-300" />
                  <span className="text-sm font-medium text-gray-700">No Prorrateable</span>
                </label>
              </div>
            </div>
          </div>

          {/* SECCIÓN 7: Publicación en Web */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              🌐 Publicación en Web
            </h2>
            <p className="text-sm text-gray-500 mb-4">Estos campos son independientes de ISP Gestión y controlan dónde se muestra esta tarifa en la web pública.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`rounded-lg border-2 p-4 transition-colors ${formData.publicarWebParticular ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="publicarWebParticular" checked={formData.publicarWebParticular} onChange={handleChange} className="w-5 h-5 text-blue-600 rounded border-gray-300" />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">Publicar en Particulares</span>
                    <span className="text-xs text-gray-500">Visible en /tarifas/particular</span>
                  </div>
                </label>
                {formData.publicarWebParticular && (
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Sección del menú</label>
                    <select name="seccionWebParticular" value={formData.seccionWebParticular} onChange={handleChange} className="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500">
                      <option value="">Sin sección específica</option>
                      <option value="internet">Internet</option>
                      <option value="movil">Móvil</option>
                      <option value="packs">Packs</option>
                      <option value="ofertas">Ofertas</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Aparecerá en la página correspondiente del menú de Particulares</p>
                  </div>
                )}
              </div>
              <div className={`rounded-lg border-2 p-4 transition-colors ${formData.publicarWebEmpresa ? 'border-orange-500 bg-orange-50' : 'border-gray-200 bg-gray-50'}`}>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" name="publicarWebEmpresa" checked={formData.publicarWebEmpresa} onChange={handleChange} className="w-5 h-5 text-orange-600 rounded border-gray-300" />
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">Publicar en Empresas</span>
                    <span className="text-xs text-gray-500">Visible en la página de la solución correspondiente</span>
                  </div>
                </label>
                {formData.publicarWebEmpresa && (
                  <div className="mt-3 pt-3 border-t border-orange-200">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Solución <span className="text-red-500">*</span></label>
                    <select name="seccionWebEmpresa" value={formData.seccionWebEmpresa} onChange={handleChange} className="w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-orange-500 focus:ring-orange-500" required>
                      <option value="">Seleccionar solución...</option>
                      <option value="conectividad-avanzada">Conectividad Avanzada</option>
                      <option value="comunicaciones-unificadas">Comunicaciones Unificadas</option>
                      <option value="infraestructura-red">Infraestructura de Red</option>
                      <option value="mantenimiento-it">Mantenimiento IT</option>
                      <option value="moviles">Móviles Empresa</option>
                      <option value="exagrid">ExaGrid Backup</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">El producto aparecerá en la página de esta solución</p>
                    {!formData.seccionWebEmpresa && (
                      <p className="text-xs text-red-500 mt-1">⚠️ Debes seleccionar una solución para publicar en Empresas</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            {formData.publicarWeb && (
              <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md">
                <p className="text-xs text-amber-700">⚠️ El campo "Publicar en Web" de ISP Gestión está activado. Los campos de arriba son independientes y controlan la publicación real en la web.</p>
              </div>
            )}
          </div>

          {/* SECCIÓN 7b: Configuración y Estado */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              ⚙️ Configuración y Estado
            </h2>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="activa" checked={formData.activa} onChange={handleChange} className="w-4 h-4 text-green-600 rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Activa</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="destacada" checked={formData.destacada} onChange={handleChange} className="w-4 h-4 text-yellow-600 rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Destacada</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="publicarWeb" checked={formData.publicarWeb} onChange={handleChange} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Publicar en Web (ISP Gestión)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" name="soloClientesExistentes" checked={formData.soloClientesExistentes} onChange={handleChange} className="w-4 h-4 text-purple-600 rounded border-gray-300" />
                <span className="text-sm font-medium text-gray-700">Solo Clientes Existentes</span>
              </label>
            </div>
          </div>

          {/* SECCIÓN 8: Observaciones */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-200">
              📝 Observaciones
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Garantía</label>
                <input type="text" name="garantia" value={formData.garantia} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observaciones</label>
                <textarea name="observaciones" value={formData.observaciones} onChange={handleChange} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
              </div>
            </div>
          </div>

          {/* Botones */}
          <div className="flex gap-4 pt-2 pb-8">
            <button type="submit" disabled={saving} className="px-8 py-3 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 font-medium">
              {saving ? 'Guardando...' : 'Actualizar Tarifa'}
            </button>
            <button type="button" onClick={() => router.back()} className="px-8 py-3 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
