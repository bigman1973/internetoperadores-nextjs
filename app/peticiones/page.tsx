'use client';
import { useState, useEffect, useRef } from 'react';

interface Peticion {
  id: number; tipo: string; seccion: string; titulo: string; descripcion: string;
  prioridad: string; estado: string; captura: string | null; notasAdmin: string | null;
  resueltaPor: string | null; fechaResolucion: string | null;
  createdAt: string; updatedAt: string;
}

export default function PeticionesPage() {
  const [peticiones, setPeticiones] = useState<Peticion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ tipo: 'mejora', seccion: 'panel_admin', titulo: '', descripcion: '', captura: '' });
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch('/api/peticiones');
      const data = await res.json();
      setPeticiones(data.peticiones || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { fetchData(); }, []);

  async function handleSubmit() {
    if (!form.titulo.trim() || !form.descripcion.trim()) {
      alert('El titulo y la descripcion son obligatorios');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/peticiones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (data.success) {
        setShowForm(false);
        setForm({ tipo: 'mejora', seccion: 'panel_admin', titulo: '', descripcion: '', captura: '' });
        fetchData();
      } else {
        alert(data.error || 'Error al crear la peticion');
      }
    } catch (e: any) { alert(e.message); }
    setSaving(false);
  }

  function handleCaptura(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('La imagen no puede superar 5MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, captura: reader.result as string }));
    reader.readAsDataURL(file);
  }

  const estadoBadge = (e: string) => {
    const map: Record<string, { color: string; label: string }> = {
      'pendiente': { color: 'bg-yellow-100 text-yellow-800', label: 'Pendiente' },
      'aprobada': { color: 'bg-blue-100 text-blue-800', label: 'Aprobada' },
      'en_desarrollo': { color: 'bg-indigo-100 text-indigo-800', label: 'En desarrollo' },
      'resuelta': { color: 'bg-green-100 text-green-800', label: 'Resuelta' },
      'descartada': { color: 'bg-gray-100 text-gray-600', label: 'Descartada' },
    };
    const m = map[e] || { color: 'bg-gray-100 text-gray-800', label: e };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>{m.label}</span>;
  };

  const tipoBadge = (t: string) => {
    const map: Record<string, { color: string; icon: string; label: string }> = {
      'error': { color: 'bg-red-100 text-red-800', icon: '!', label: 'Error' },
      'mejora': { color: 'bg-blue-100 text-blue-800', icon: '+', label: 'Mejora' },
      'sugerencia': { color: 'bg-green-100 text-green-800', icon: '?', label: 'Sugerencia' },
    };
    const m = map[t] || { color: 'bg-gray-100', icon: '', label: t };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.color}`}>{m.label}</span>;
  };

  const seccionLabel = (s: string) => {
    const map: Record<string, string> = {
      'panel_admin': 'Panel Admin', 'web_publica': 'Web Publica', 'portal_empleado': 'Portal Empleado'
    };
    return map[s] || s;
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mis Peticiones</h1>
          <p className="text-gray-500 text-sm">Reporta errores, solicita mejoras o haz sugerencias</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 flex items-center gap-2"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nueva peticion
        </button>
      </div>

      {/* Formulario nueva peticion */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Nueva peticion</h2>

            <div className="space-y-4">
              {/* Tipo */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Tipo</label>
                <div className="flex gap-2">
                  {[
                    { v: 'error', l: 'Error / Incidencia', c: 'border-red-300 bg-red-50 text-red-800' },
                    { v: 'mejora', l: 'Mejora', c: 'border-blue-300 bg-blue-50 text-blue-800' },
                    { v: 'sugerencia', l: 'Sugerencia', c: 'border-green-300 bg-green-50 text-green-800' },
                  ].map(t => (
                    <button key={t.v} onClick={() => setForm(f => ({ ...f, tipo: t.v }))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border-2 ${form.tipo === t.v ? t.c : 'border-gray-200 bg-white text-gray-600'}`}>
                      {t.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Seccion */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Seccion afectada</label>
                <div className="flex gap-2">
                  {[
                    { v: 'panel_admin', l: 'Panel Admin' },
                    { v: 'web_publica', l: 'Web Publica' },
                    { v: 'portal_empleado', l: 'Portal Empleado' },
                  ].map(s => (
                    <button key={s.v} onClick={() => setForm(f => ({ ...f, seccion: s.v }))}
                      className={`px-3 py-2 rounded-lg text-sm font-medium border-2 ${form.seccion === s.v ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-gray-200 bg-white text-gray-600'}`}>
                      {s.l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Titulo */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Titulo</label>
                <input type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  placeholder="Describe brevemente el problema o mejora"
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>

              {/* Descripcion */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Descripcion</label>
                <textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Explica con detalle lo que ocurre o lo que necesitas..."
                  rows={4} className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>

              {/* Captura */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Captura de pantalla (opcional)</label>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleCaptura} className="text-sm text-gray-600" />
                {form.captura && (
                  <div className="mt-2 relative">
                    <img src={form.captura} alt="Captura" className="max-h-40 rounded-lg border" />
                    <button onClick={() => setForm(f => ({ ...f, captura: '' }))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">X</button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 disabled:opacity-50">
                {saving ? 'Enviando...' : 'Enviar peticion'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista de peticiones */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando...</div>
      ) : peticiones.length === 0 ? (
        <div className="text-center py-16 bg-white border rounded-xl">
          <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <p className="mt-3 text-gray-500">No tienes peticiones todavia</p>
          <p className="text-sm text-gray-400 mt-1">Pulsa "Nueva peticion" para reportar un error o solicitar una mejora</p>
        </div>
      ) : (
        <div className="space-y-3">
          {peticiones.map(p => (
            <div key={p.id} className={`bg-white border rounded-xl p-4 ${p.estado === 'resuelta' ? 'opacity-70' : ''}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {tipoBadge(p.tipo)}
                    {estadoBadge(p.estado)}
                    <span className="text-xs text-gray-400">{seccionLabel(p.seccion)}</span>
                  </div>
                  <h3 className="font-semibold text-gray-900">{p.titulo}</h3>
                  <p className="text-sm text-gray-600 mt-1">{p.descripcion}</p>
                  {p.notasAdmin && (
                    <div className="mt-2 p-2 bg-blue-50 rounded-lg text-sm text-blue-800">
                      <span className="font-medium">Respuesta:</span> {p.notasAdmin}
                    </div>
                  )}
                  {p.captura && (
                    <img src={p.captura} alt="Captura" className="mt-2 max-h-32 rounded-lg border cursor-pointer" onClick={() => window.open(p.captura!, '_blank')} />
                  )}
                </div>
                <div className="text-right text-xs text-gray-400 whitespace-nowrap">
                  {new Date(p.createdAt).toLocaleDateString('es-ES')}
                  {p.resueltaPor && <p className="mt-1 text-green-600">Resuelta por {p.resueltaPor}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
