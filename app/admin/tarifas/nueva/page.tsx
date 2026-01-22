"use client";
export const dynamic = "force-dynamic";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '../../../../components/admin/AdminHeader';

export default function NuevaTarifaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    if (name === 'precioSinIva' && value) {
      const precioSinIva = parseFloat(value);
      if (!isNaN(precioSinIva)) {
        setFormData(prev => ({
          ...prev,
          precioConIva: (precioSinIva * 1.21).toFixed(2)
        }));
      }
    }

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
    setLoading(true);
    try {
      const response = await fetch('/api/admin/tarifas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          precioSinIva: parseFloat(formData.precioSinIva),
          precioConIva: parseFloat(formData.precioConIva),
          costeOperador: formData.costeOperador ? parseFloat(formData.costeOperador) : null,
        }),
      });
      if (response.ok) {
        router.push('/admin/tarifas?success=created');
      } else {
        const error = await response.json();
        alert(`Error: ${error.message}`);
      }
    } catch (error) {
      console.error('Error creando tarifa:', error);
      alert('Error al crear la tarifa');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="text-sm text-gray-600 hover:text-orange-600 flex items-center gap-1"
          >
            ← Volver
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Crear Nueva Tarifa</h1>
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Tipo de Cliente</label>
                <select
                  name="tipoCliente"
                  value={formData.tipoCliente}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="PARTICULAR">Particular</option>
                  <option value="EMPRESA">Empresa</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Categoría</label>
                <input
                  type="text"
                  name="categoria"
                  value={formData.categoria}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la Tarifa</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Precio Sin IVA (€)</label>
                <input
                  type="number"
                  step="0.01"
                  name="precioSinIva"
                  value={formData.precioSinIva}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Precio Con IVA (€)</label>
                <input
                  type="number"
                  step="0.01"
                  name="precioConIva"
                  value={formData.precioConIva}
                  onChange={handleChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? 'Creando...' : 'Crear Tarifa'}
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
