"use client";
export const dynamic = "force-dynamic";


import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '@/components/admin/AdminHeader';

export default function EditarTarifaPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    tipoCliente: 'PARTICULAR',
    categoria: '',
    nombre: '',
    descripcionCorta: '',
    descripcionLarga: '',
    velocidad: '',
    precioSinIva: '',
    precioConIva: '',
    costeOperador: '',
    permanencia: '',
    penalizacion: '',
    garantia: '',
    observaciones: '',
    destacada: false,
    activa: true,
  });

  useEffect(() => {
    const fetchTarifa = async () => {
      try {
        const response = await fetch(`/api/admin/tarifas/${id}`);
        if (response.ok) {
          const data = await response.json();
          setFormData({
            tipoCliente: data.tipoCliente,
            categoria: data.categoria,
            nombre: data.nombre,
            descripcionCorta: data.descripcionCorta || '',
            descripcionLarga: data.descripcionLarga || '',
            velocidad: data.velocidad || '',
            precioSinIva: data.precioSinIva.toString(),
            precioConIva: data.precioConIva.toString(),
            costeOperador: data.costeOperador ? data.costeOperador.toString() : '',
            permanencia: data.permanencia || '',
            penalizacion: data.penalizacion || '',
            garantia: data.garantia || '',
            observaciones: data.observaciones || '',
            destacada: data.destacada,
            activa: data.activa,
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

    // Auto-calcular precio con IVA
    if (name === 'precioSinIva' && value) {
      const precioSinIva = parseFloat(value);
      if (!isNaN(precioSinIva)) {
        setFormData(prev => ({
          ...prev,
          precioConIva: (precioSinIva * 1.21).toFixed(2)
        }));
      }
    }

    // Auto-calcular precio sin IVA
    if (name === 'precioConIva' && value) {
      const precioConIva = parseFloat(value);
      if (!isNaN(precioConIva)) {
        setFormData(prev => ({
          ...prev,
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
          ...formData,
          precioSinIva: parseFloat(formData.precioSinIva),
          precioConIva: parseFloat(formData.precioConIva),
          costeOperador: formData.costeOperador ? parseFloat(formData.costeOperador) : null,
        }),
      });

      if (response.ok) {
        router.push('/admin/tarifas?success=updated');
      } else {
        const error = await response.json();
        alert(`Error: ${error.message || 'Error al actualizar'}`);
      }
    } catch (error) {
      console.error('Error actualizando tarifa:', error);
      alert('Error al actualizar la tarifa');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">Cargando tarifa...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-900 flex items-center gap-2"
          >
            ← Volver
          </button>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold mb-6">Editar Tarifa</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tipo Cliente y Categoría */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo Cliente *
                </label>
                <select
                  name="tipoCliente"
                  value={formData.tipoCliente}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="PARTICULAR">Particular</option>
                  <option value="EMPRESA">Empresa</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Categoría *
                </label>
                <input
                  type="text"
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleChange}
                  required
                  placeholder="ej: FIBRA, WIMAX, MÓVIL"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nombre de la Tarifa *
              </label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required
                placeholder="ej: Perdiu 1, Trencalos 12"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Descripciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción Corta
              </label>
              <input
                type="text"
                name="descripcionCorta"
                value={formData.descripcionCorta}
                onChange={handleChange}
                placeholder="Breve descripción para listados"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Descripción Larga
              </label>
              <textarea
                name="descripcionLarga"
                value={formData.descripcionLarga}
                onChange={handleChange}
                rows={3}
                placeholder="Descripción detallada para la página de la tarifa"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Velocidad y Precios */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Velocidad
                </label>
                <input
                  type="text"
                  name="velocidad"
                  value={formData.velocidad}
                  onChange={handleChange}
                  placeholder="ej: 100Mb/100Mb"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio sin IVA * (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="precioSinIva"
                  value={formData.precioSinIva}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Precio con IVA * (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="precioConIva"
                  value={formData.precioConIva}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Coste Operador */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Coste Operador (€)
                </label>
                <input
                  type="number"
                  step="0.01"
                  name="costeOperador"
                  value={formData.costeOperador}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Permanencia
                </label>
                <input
                  type="text"
                  name="permanencia"
                  value={formData.permanencia}
                  onChange={handleChange}
                  placeholder="ej: 12 meses"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Garantía
                </label>
                <input
                  type="text"
                  name="garantia"
                  value={formData.garantia}
                  onChange={handleChange}
                  placeholder="ej: 0.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {/* Penalización */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Penalización
              </label>
              <input
                type="text"
                name="penalizacion"
                value={formData.penalizacion}
                onChange={handleChange}
                placeholder="ej: 150€ + 100€ Equipo"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Observaciones
              </label>
              <textarea
                name="observaciones"
                value={formData.observaciones}
                onChange={handleChange}
                rows={2}
                placeholder="Notas internas"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>

            {/* Checkboxes */}
            <div className="flex gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="destacada"
                  checked={formData.destacada}
                  onChange={handleChange}
                  className="w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Destacada</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="activa"
                  checked={formData.activa}
                  onChange={handleChange}
                  className="w-4 h-4 text-orange-600 focus:ring-orange-500 border-gray-300 rounded"
                />
                <span className="text-sm text-gray-700">Activa</span>
              </label>
            </div>

            {/* Botones */}
            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Guardando...' : 'Actualizar Tarifa'}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
