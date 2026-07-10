'use client';
import { useState, useEffect } from 'react';
import { PlusIcon, MagnifyingGlassIcon, BuildingOffice2Icon, UserIcon, BuildingLibraryIcon, PencilIcon, TrashIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

interface EntidadFiscal {
  id: string;
  tipo: string;
  razonSocial: string;
  nombreComercial: string | null;
  nifCif: string | null;
  direccionFiscal: string | null;
  codigoPostal: string | null;
  poblacion: string | null;
  provincia: string | null;
  pais: string | null;
  emailFacturacion: string | null;
  emailGeneral: string | null;
  telefono: string | null;
  personaContacto: string | null;
  cuentaContableA3: string | null;
  categoriaInterna: string | null;
  subcategoria: string | null;
  formaPago: string | null;
  diaPago: number | null;
  plazoVencimiento: number | null;
  iban: string | null;
  patronesBancarios: string | null;
  activo: boolean;
  notas: string | null;
  _count: { movimientos: number };
}

const TABS = [
  { id: 'PROVEEDOR', label: 'Proveedores', icon: BuildingOffice2Icon },
  { id: 'PERSONAL', label: 'Personal', icon: UserIcon },
  { id: 'AAPP', label: 'AAPP', icon: BuildingLibraryIcon },
];

const CATEGORIAS_PROVEEDOR = ['Operadora', 'Estructura', 'Draxton', 'Vola', 'Sotic', 'Gastos Financieros', 'Comisiones V-Valley', 'Comisiones Draxton', 'Comisiones Bancos', 'Dietas', 'Desplazamientos', 'ZOOM', 'Hotspot'];
const FORMAS_PAGO = ['domiciliacion', 'transferencia', 'confirming', 'tarjeta', 'efectivo', 'remesa'];

export default function DatosFiscalesPage() {
  const [tab, setTab] = useState('PROVEEDOR');
  const [entidades, setEntidades] = useState<EntidadFiscal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [categorias, setCategorias] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<EntidadFiscal | null>(null);
  const [poblando, setPoblando] = useState(false);
  const [resultadoPoblamiento, setResultadoPoblamiento] = useState<any>(null);

  useEffect(() => {
    fetchEntidades();
  }, [tab, page, filtroCategoria]);

  async function fetchEntidades() {
    setLoading(true);
    const params = new URLSearchParams({ tipo: tab, page: page.toString(), limit: '30' });
    if (buscar) params.set('buscar', buscar);
    if (filtroCategoria) params.set('categoria', filtroCategoria);
    const res = await fetch(`/api/admin/finanzas/datos-fiscales?${params}`);
    const json = await res.json();
    setEntidades(json.entidades || []);
    setTotal(json.total || 0);
    setCategorias(json.categorias || []);
    setLoading(false);
  }

  async function handleBuscar(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchEntidades();
  }

  async function handleGuardar(formData: any) {
    const url = editando
      ? `/api/admin/finanzas/datos-fiscales/${editando.id}`
      : '/api/admin/finanzas/datos-fiscales';
    const method = editando ? 'PATCH' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...formData, tipo: tab }),
    });

    setShowForm(false);
    setEditando(null);
    fetchEntidades();
  }

  async function handleEliminar(id: string) {
    if (!confirm('¿Eliminar esta entidad fiscal?')) return;
    await fetch(`/api/admin/finanzas/datos-fiscales/${id}`, { method: 'DELETE' });
    fetchEntidades();
  }

  async function handlePoblar() {
    if (!confirm('¿Poblar proveedores desde las facturas recibidas existentes? Se crearán los que no existan.')) return;
    setPoblando(true);
    setResultadoPoblamiento(null);
    const res = await fetch('/api/admin/finanzas/datos-fiscales/poblar', { method: 'POST' });
    const json = await res.json();
    setResultadoPoblamiento(json);
    setPoblando(false);
    fetchEntidades();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Datos Fiscales</h1>
          <p className="text-sm text-gray-500">Directorio de proveedores, personal y administraciones públicas</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePoblar}
            disabled={poblando}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${poblando ? 'animate-spin' : ''}`} />
            {poblando ? 'Poblando...' : 'Poblar desde facturas'}
          </button>
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="flex items-center gap-1 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <PlusIcon className="h-4 w-4" />
            Nueva entidad
          </button>
        </div>
      </div>

      {/* Resultado poblamiento */}
      {resultadoPoblamiento && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          <p className="font-medium text-green-800">Poblamiento completado:</p>
          <p className="text-green-700">
            {resultadoPoblamiento.proveedoresCreados} proveedores creados · {resultadoPoblamiento.proveedoresExistentes} ya existían · {resultadoPoblamiento.aappCreadas} AAPP creadas
          </p>
          <button onClick={() => setResultadoPoblamiento(null)} className="text-green-600 underline text-xs mt-1">Cerrar</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setPage(1); setFiltroCategoria(''); }}
              className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-4">
        <form onSubmit={handleBuscar} className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
              placeholder="Buscar por nombre, NIF o cuenta contable..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <button type="submit" className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Buscar</button>
        </form>
        {categorias.length > 0 && (
          <select
            value={filtroCategoria}
            onChange={e => { setFiltroCategoria(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <span className="text-sm text-gray-500">{total} registros</span>
      </div>

      {/* Tabla */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Razón Social</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">NIF/CIF</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Cuenta A3</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Categoría</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Forma Pago</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Movimientos</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
            ) : entidades.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay entidades fiscales registradas</td></tr>
            ) : entidades.map(e => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{e.razonSocial}</p>
                    {e.nombreComercial && <p className="text-xs text-gray-500">{e.nombreComercial}</p>}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{e.nifCif || '—'}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{e.cuentaContableA3 || '—'}</td>
                <td className="px-4 py-3">
                  {e.categoriaInterna && (
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{e.categoriaInterna}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs capitalize">{e.formaPago || '—'}</td>
                <td className="px-4 py-3 text-center">
                  {e._count.movimientos > 0 ? (
                    <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs font-medium">{e._count.movimientos}</span>
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.activo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {e.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => { setEditando(e); setShowForm(true); }}
                      className="p-1 text-gray-400 hover:text-blue-600"
                      title="Editar"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleEliminar(e.id)}
                      className="p-1 text-gray-400 hover:text-red-600"
                      title="Eliminar"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Paginación */}
        {total > 30 && (
          <div className="border-t px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-gray-500">Página {page} · {total} registros</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Anterior</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page * 30 >= total} className="px-3 py-1 text-sm border rounded disabled:opacity-50">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Formulario */}
      {showForm && (
        <FormularioEntidad
          entidad={editando}
          tipo={tab}
          onGuardar={handleGuardar}
          onCerrar={() => { setShowForm(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

function FormularioEntidad({ entidad, tipo, onGuardar, onCerrar }: {
  entidad: EntidadFiscal | null;
  tipo: string;
  onGuardar: (data: any) => void;
  onCerrar: () => void;
}) {
  const [form, setForm] = useState({
    razonSocial: entidad?.razonSocial || '',
    nombreComercial: entidad?.nombreComercial || '',
    nifCif: entidad?.nifCif || '',
    direccionFiscal: entidad?.direccionFiscal || '',
    codigoPostal: entidad?.codigoPostal || '',
    poblacion: entidad?.poblacion || '',
    provincia: entidad?.provincia || '',
    pais: entidad?.pais || 'ES',
    emailFacturacion: entidad?.emailFacturacion || '',
    emailGeneral: entidad?.emailGeneral || '',
    telefono: entidad?.telefono || '',
    personaContacto: entidad?.personaContacto || '',
    cuentaContableA3: entidad?.cuentaContableA3 || '',
    categoriaInterna: entidad?.categoriaInterna || '',
    subcategoria: entidad?.subcategoria || '',
    formaPago: entidad?.formaPago || '',
    diaPago: entidad?.diaPago?.toString() || '',
    plazoVencimiento: entidad?.plazoVencimiento?.toString() || '',
    iban: entidad?.iban || '',
    patronesBancarios: entidad?.patronesBancarios || '',
    notas: entidad?.notas || '',
    activo: entidad?.activo ?? true,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onGuardar(form);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">
            {entidad ? 'Editar' : 'Nueva'} {tipo === 'PROVEEDOR' ? 'Proveedor' : tipo === 'PERSONAL' ? 'Personal' : 'AAPP'}
          </h2>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Datos fiscales */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">Datos Fiscales</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Razón Social *</label>
                <input type="text" required value={form.razonSocial} onChange={e => setForm({...form, razonSocial: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nombre Comercial</label>
                <input type="text" value={form.nombreComercial} onChange={e => setForm({...form, nombreComercial: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">NIF/CIF</label>
                <input type="text" value={form.nifCif} onChange={e => setForm({...form, nifCif: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta Contable A3</label>
                <input type="text" value={form.cuentaContableA3} onChange={e => setForm({...form, cuentaContableA3: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder={tipo === 'PROVEEDOR' ? '400XXXX' : tipo === 'AAPP' ? '475XXXX' : '465XXXX'} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Dirección Fiscal</label>
              <input type="text" value={form.direccionFiscal} onChange={e => setForm({...form, direccionFiscal: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">C.P.</label>
                <input type="text" value={form.codigoPostal} onChange={e => setForm({...form, codigoPostal: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Población</label>
                <input type="text" value={form.poblacion} onChange={e => setForm({...form, poblacion: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
                <input type="text" value={form.provincia} onChange={e => setForm({...form, provincia: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">País</label>
                <input type="text" value={form.pais} onChange={e => setForm({...form, pais: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </fieldset>

          {/* Contacto */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">Contacto</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email Facturación</label>
                <input type="email" value={form.emailFacturacion} onChange={e => setForm({...form, emailFacturacion: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email General</label>
                <input type="email" value={form.emailGeneral} onChange={e => setForm({...form, emailGeneral: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input type="text" value={form.telefono} onChange={e => setForm({...form, telefono: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Persona de Contacto</label>
                <input type="text" value={form.personaContacto} onChange={e => setForm({...form, personaContacto: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
          </fieldset>

          {/* Condiciones comerciales */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">Condiciones Comerciales</legend>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Categoría Interna</label>
                <select value={form.categoriaInterna} onChange={e => setForm({...form, categoriaInterna: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin categoría</option>
                  {CATEGORIAS_PROVEEDOR.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Forma de Pago</label>
                <select value={form.formaPago} onChange={e => setForm({...form, formaPago: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Sin definir</option>
                  {FORMAS_PAGO.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Día de Pago</label>
                <input type="number" min="1" max="31" value={form.diaPago} onChange={e => setForm({...form, diaPago: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="1-31" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Plazo Vencimiento (días)</label>
                <input type="number" min="0" value={form.plazoVencimiento} onChange={e => setForm({...form, plazoVencimiento: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="30, 60, 90..." />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">IBAN</label>
                <input type="text" value={form.iban} onChange={e => setForm({...form, iban: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" placeholder="ES12 1234 5678 1234 5678 12" />
              </div>
            </div>
          </fieldset>

          {/* Conciliación */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">Conciliación Bancaria</legend>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Patrones de Concepto Bancario</label>
              <textarea
                value={form.patronesBancarios}
                onChange={e => setForm({...form, patronesBancarios: e.target.value})}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                rows={3}
                placeholder='["ISPGestion", "ISP Gestion", "ISPGESTION"]'
              />
              <p className="text-xs text-gray-400 mt-1">JSON array de textos que aparecen en el concepto bancario para identificar este proveedor</p>
            </div>
          </fieldset>

          {/* Notas */}
          <fieldset className="space-y-4">
            <legend className="text-sm font-semibold text-gray-700 border-b pb-2 w-full">Notas</legend>
            <textarea
              value={form.notas}
              onChange={e => setForm({...form, notas: e.target.value})}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              placeholder="Observaciones internas..."
            />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="activo" checked={form.activo} onChange={e => setForm({...form, activo: e.target.checked})} className="rounded" />
              <label htmlFor="activo" className="text-sm text-gray-700">Activo</label>
            </div>
          </fieldset>

          {/* Botones */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button type="button" onClick={onCerrar} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              {entidad ? 'Guardar cambios' : 'Crear entidad'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
