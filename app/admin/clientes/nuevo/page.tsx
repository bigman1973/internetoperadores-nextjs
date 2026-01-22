"use client";
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminHeader from '../../../../components/admin/AdminHeader';

export default function NuevoClientePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    password: '',
    ispGestionId: '',
    newsletterSuscrito: false,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const response = await fetch('/api/admin/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (response.ok) {
        router.push('/admin/clientes');
        router.refresh();
      } else {
        const error = await response.json();
        alert('Error al crear cliente: ' + (error.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error creating cliente:', error);
      alert('Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminHeader />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Cliente</h1>
          <p className="text-sm text-gray-500">Registra un nuevo cliente en la plataforma web</p>
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre Completo</label>
                <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Correo Electrónico</label>
                <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contraseña (Temporal)</label>
                <input type="password" name="password" value={formData.password} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ID ISPGestión (Opcional)</label>
                <input type="text" name="ispGestionId" value={formData.ispGestionId} onChange={handleChange} className="w-full px-3 py-2 border border-gray-300 rounded-md" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="newsletterSuscrito" id="newsletterSuscrito" checked={formData.newsletterSuscrito} onChange={handleChange} className="w-4 h-4 text-orange-600 border-gray-300 rounded" />
              <label htmlFor="newsletterSuscrito" className="text-sm text-gray-700">Suscribir al newsletter</label>
            </div>
            <div className="flex gap-4 pt-4">
              <button type="submit" disabled={saving} className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Crear Cliente'}
              </button>
              <button type="button" onClick={() => router.back()} className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
