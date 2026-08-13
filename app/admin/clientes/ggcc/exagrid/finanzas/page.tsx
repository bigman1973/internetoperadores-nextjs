'use client';
import { useState, useEffect, useCallback } from 'react';

interface Proyecto {
  id: string;
  nombreProyecto: string;
  proveedor: string | null;
  archivoFactura: string | null;
  descripcion: string | null;
  costeProveedor: number;
  otrosCostes: number;
  notasCostes: string | null;
  estadoCobro: string;
  importeCobrado: number;
  fechaCobro: string | null;
  estadoPago: string;
  importePagado: number;
  fechaPago: string | null;
  notas: string | null;
}

interface Factura {
  id: string;
  numFactura: string;
  cliente: string;
  fecha: string;
  base: number;
  total: number;
  importeCobrado: number;
  estado: string;
  concepto: string | null;
  idExterno: string | null;
  serie: string | null;
  proyecto: Proyecto | null;
}

interface KPIs {
  totalFacturado: number;
  totalCobrado: number;
  totalPendienteCobro: number;
  totalCoste: number;
  margenTotal: number;
  margenAbsoluto: number;
  totalPagado: number;
  totalPendientePago: number;
  numFacturas: number;
  numConProyecto: number;
}

export default function ExagridFinanzasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedFactura, setSelectedFactura] = useState<Factura | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombreProyecto: '',
    proveedor: 'Consultoria Exagrid',
    descripcion: '',
    costeProveedor: '',
    otrosCostes: '',
    notasCostes: '',
    estadoCobro: 'pendiente',
    importeCobrado: '0',
    fechaCobro: '',
    estadoPago: 'pendiente',
    importePagado: '0',
    fechaPago: '',
    notas: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/clientes/ggcc/exagrid/finanzas');
      const data = await res.json();
      setFacturas(data.facturas || []);
      setKpis(data.kpis || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleEditProyecto = (f: Factura) => {
    setSelectedFactura(f);
    if (f.proyecto) {
      setForm({
        nombreProyecto: f.proyecto.nombreProyecto,
        proveedor: f.proyecto.proveedor || 'Consultoria Exagrid',
        descripcion: f.proyecto.descripcion || '',
        costeProveedor: f.proyecto.costeProveedor ? String(f.proyecto.costeProveedor) : '',
        otrosCostes: f.proyecto.otrosCostes ? String(f.proyecto.otrosCostes) : '',
        notasCostes: f.proyecto.notasCostes || '',
        estadoCobro: f.proyecto.estadoCobro,
        importeCobrado: String(f.proyecto.importeCobrado || 0),
        fechaCobro: f.proyecto.fechaCobro ? f.proyecto.fechaCobro.slice(0, 10) : '',
        estadoPago: f.proyecto.estadoPago,
        importePagado: String(f.proyecto.importePagado || 0),
        fechaPago: f.proyecto.fechaPago ? f.proyecto.fechaPago.slice(0, 10) : '',
        notas: f.proyecto.notas || '',
      });
    } else {
      setForm({
        nombreProyecto: f.concepto || f.numFactura,
        proveedor: 'Consultoria Exagrid',
        descripcion: '',
        costeProveedor: String(Math.round(f.base * 0.92 * 100) / 100),
        otrosCostes: '',
        notasCostes: '',
        estadoCobro: f.importeCobrado >= f.base ? 'cobrado' : 'pendiente',
        importeCobrado: String(f.importeCobrado || 0),
        fechaCobro: '',
        estadoPago: 'pendiente',
        importePagado: '0',
        fechaPago: '',
        notas: '',
      });
    }
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!selectedFactura) return;
    setSaving(true);
    try {
      const isEdit = !!selectedFactura.proyecto;
      const res = await fetch('/api/admin/clientes/ggcc/exagrid/finanzas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isEdit ? 'actualizarProyecto' : 'crearProyecto',
          ...(isEdit ? { id: selectedFactura.proyecto!.id } : { facturaId: selectedFactura.id }),
          ...form,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setSelectedFactura(null);
        fetchData();
      } else {
        alert('Error al guardar');
      }
    } catch {
      alert('Error de conexion');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadFactura = async (f: Factura, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !f.proyecto) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('proyectoId', f.proyecto.id);
      const res = await fetch('/api/admin/clientes/ggcc/exagrid/finanzas', {
        method: 'PUT',
        body: formData,
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Error al subir el archivo');
      }
    } catch {
      alert('Error al subir el archivo');
    }
  };

  const getMargen = (f: Factura) => {
    if (!f.proyecto || !f.proyecto.costeProveedor) return null;
    const costeTotal = f.proyecto.costeProveedor + f.proyecto.otrosCostes;
    const margen = ((f.base - costeTotal) / f.base) * 100;
    return margen;
  };

  if (loading) return <div className="p-6 text-center text-gray-500">Cargando...</div>;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Facturado (BI)</p>
            <p className="text-xl font-bold text-gray-900">{fmt(kpis.totalFacturado)} EUR</p>
            <p className="text-xs text-gray-400">{kpis.numFacturas} facturas</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Cobrado</p>
            <p className="text-xl font-bold text-green-600">{fmt(kpis.totalCobrado)} EUR</p>
            <p className="text-xs text-gray-400">{kpis.totalPendienteCobro > 0 ? `Pdte: ${fmt(kpis.totalPendienteCobro)}` : 'Todo cobrado'}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Coste total</p>
            <p className="text-xl font-bold text-red-600">{fmt(kpis.totalCoste)} EUR</p>
            <p className="text-xs text-gray-400">Pagado: {fmt(kpis.totalPagado)}</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Margen</p>
            <p className={`text-xl font-bold ${kpis.margenTotal >= 20 ? 'text-green-600' : kpis.margenTotal >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
              {kpis.margenTotal}%
            </p>
            <p className="text-xs text-gray-400">{fmt(kpis.margenAbsoluto)} EUR</p>
          </div>
          <div className="bg-white rounded-lg border p-4">
            <p className="text-xs text-gray-500 uppercase">Pdte. pago proveedor</p>
            <p className={`text-xl font-bold ${kpis.totalPendientePago > 0 ? 'text-orange-600' : 'text-green-600'}`}>
              {fmt(kpis.totalPendientePago)} EUR
            </p>
            <p className="text-xs text-gray-400">{kpis.numConProyecto}/{kpis.numFacturas} con coste</p>
          </div>
        </div>
      )}

      {/* Tabla de facturas */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Ventas Exagrid (V-Valley / Arrow)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Factura</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Proyecto</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Cliente</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Fecha</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Base Imp.</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Coste</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Margen %</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Margen EUR</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Cobro</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Pago prov.</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {facturas.map(f => {
                const margen = getMargen(f);
                const costeTotal = f.proyecto ? (f.proyecto.costeProveedor + f.proyecto.otrosCostes) : 0;
                return (
                  <tr key={f.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-900">{f.numFactura}</td>
                    <td className="px-3 py-2 text-gray-700 text-xs max-w-[200px] truncate" title={f.proyecto?.nombreProyecto || '-'}>
                      {f.proyecto?.nombreProyecto || <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600 text-xs">
                      {f.cliente.includes('VALLEY') ? 'V-Valley' : 'Arrow'}
                    </td>
                    <td className="px-3 py-2 text-gray-500 text-xs">
                      {new Date(f.fecha).toLocaleDateString('es-ES')}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmt(f.base)}</td>
                    <td className="px-3 py-2 text-right text-red-600">
                      {f.proyecto ? fmt(costeTotal) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {margen !== null ? (
                        <span className={`font-medium ${margen >= 20 ? 'text-green-600' : margen >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {margen.toFixed(1)}%
                        </span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {f.proyecto ? (
                        <span className="font-semibold text-green-700">
                          {fmt(f.base - costeTotal)}
                        </span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {f.proyecto ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          f.proyecto.estadoCobro === 'cobrado' ? 'bg-green-100 text-green-700' :
                          f.proyecto.estadoCobro === 'parcial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {f.proyecto.estadoCobro === 'cobrado' ? 'Cobrado' : f.proyecto.estadoCobro === 'parcial' ? 'Parcial' : 'Pendiente'}
                        </span>
                      ) : (
                        f.importeCobrado >= f.base ? (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Cobrado</span>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">Pendiente</span>
                        )
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {f.proyecto ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          f.proyecto.estadoPago === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {f.proyecto.estadoPago === 'pagado' ? 'Pagado' : 'Pendiente'}
                        </span>
                      ) : <span className="text-gray-300">-</span>}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {f.proyecto?.archivoFactura ? (
                          <a
                            href={f.proyecto.archivoFactura}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            title="Ver factura subida"
                          >
                            Ver PDF
                          </a>
                        ) : (
                          <label className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer" title="Subir factura PDF">
                            Subir
                            <input
                              type="file"
                              accept=".pdf"
                              className="hidden"
                              onChange={(e) => handleUploadFactura(f, e)}
                            />
                          </label>
                        )}
                        <button
                          onClick={() => handleEditProyecto(f)}
                          className="text-xs text-emerald-600 hover:text-emerald-800 font-medium"
                        >
                          {f.proyecto ? 'Editar' : '+ Proyecto'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr className="font-semibold">
                <td className="px-3 py-2" colSpan={3}>TOTAL</td>
                <td className="px-3 py-2 text-right">{kpis ? fmt(kpis.totalFacturado) : '-'}</td>
                <td className="px-3 py-2 text-right text-red-600">{kpis ? fmt(kpis.totalCoste) : '-'}</td>
                <td className="px-3 py-2 text-right text-green-600">{kpis ? `${kpis.margenTotal}%` : '-'}</td>
                <td className="px-3 py-2" colSpan={3}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal de edicion de proyecto */}
      {showForm && selectedFactura && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">
                {selectedFactura.proyecto ? 'Editar Proyecto' : 'Crear Proyecto'} - {selectedFactura.numFactura}
              </h3>
              <button onClick={() => { setShowForm(false); setSelectedFactura(null); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Info factura */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p><strong>Cliente:</strong> {selectedFactura.cliente}</p>
                <p><strong>Base imponible:</strong> {fmt(selectedFactura.base)} EUR</p>
              </div>

              {/* Nombre proyecto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del proyecto</label>
                <input type="text" value={form.nombreProyecto} onChange={e => setForm({...form, nombreProyecto: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>

              {/* Proveedor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor</label>
                <input type="text" value={form.proveedor} onChange={e => setForm({...form, proveedor: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>

              {/* Descripcion */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
                <textarea value={form.descripcion} onChange={e => setForm({...form, descripcion: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" rows={2} />
              </div>

              {/* Costes */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Coste proveedor (BI)</label>
                  <input type="number" step="0.01" value={form.costeProveedor} onChange={e => setForm({...form, costeProveedor: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Otros costes</label>
                  <input type="number" step="0.01" value={form.otrosCostes} onChange={e => setForm({...form, otrosCostes: e.target.value})}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
              </div>

              {/* Margen calculado */}
              {form.costeProveedor && (
                <div className="bg-emerald-50 rounded-lg p-3 text-sm">
                  <p className="font-medium text-emerald-800">
                    Margen: {((selectedFactura.base - (parseFloat(form.costeProveedor || '0') + parseFloat(form.otrosCostes || '0'))) / selectedFactura.base * 100).toFixed(1)}%
                    ({fmt(selectedFactura.base - (parseFloat(form.costeProveedor || '0') + parseFloat(form.otrosCostes || '0')))} EUR)
                  </p>
                </div>
              )}

              {/* Cobro */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Control de cobro (cliente nos paga)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Estado</label>
                    <select value={form.estadoCobro} onChange={e => setForm({...form, estadoCobro: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                      <option value="pendiente">Pendiente</option>
                      <option value="parcial">Parcial</option>
                      <option value="cobrado">Cobrado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Importe cobrado</label>
                    <input type="number" step="0.01" value={form.importeCobrado} onChange={e => setForm({...form, importeCobrado: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fecha cobro</label>
                    <input type="date" value={form.fechaCobro} onChange={e => setForm({...form, fechaCobro: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                </div>
              </div>

              {/* Pago proveedor */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Control de pago (nosotros pagamos al proveedor)</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Estado</label>
                    <select value={form.estadoPago} onChange={e => setForm({...form, estadoPago: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                      <option value="pendiente">Pendiente</option>
                      <option value="pagado">Pagado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Importe pagado</label>
                    <input type="number" step="0.01" value={form.importePagado} onChange={e => setForm({...form, importePagado: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Fecha pago</label>
                    <input type="date" value={form.fechaPago} onChange={e => setForm({...form, fechaPago: e.target.value})}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                </div>
              </div>

              {/* Notas */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
                <textarea value={form.notas} onChange={e => setForm({...form, notas: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" rows={2} />
              </div>
            </div>

            {/* Botones */}
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => { setShowForm(false); setSelectedFactura(null); }}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
