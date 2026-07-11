'use client';
import { useState, useEffect } from 'react';
import { MagnifyingGlassIcon, ExclamationTriangleIcon, ClockIcon, BanknotesIcon, UserGroupIcon } from '@heroicons/react/24/outline';

interface Factura {
  id: string;
  cliente: string;
  cif: string | null;
  numFactura: string;
  fecha: string;
  fechaVencimiento: string | null;
  total: number;
  importeCobrado: number;
  importePendiente: number;
  estado: string;
  formaCobro: string | null;
  imputacion: string | null;
  concepto: string | null;
  diasPendiente: number;
}

interface ClienteResumen {
  cliente: string;
  numFacturas: number;
  totalFacturado: number;
  totalCobrado: number;
  pendiente: number;
}

export default function CobrosPendientesPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [total, setTotal] = useState(0);
  const [resumen, setResumen] = useState<any>(null);
  const [porCliente, setPorCliente] = useState<ClienteResumen[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [formaCobro, setFormaCobro] = useState('todas');
  const [diasMin, setDiasMin] = useState('0');
  const [page, setPage] = useState(1);
  const [vista, setVista] = useState<'facturas' | 'clientes'>('facturas');

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '100',
        buscar,
        formaCobro,
        diasMin,
      });
      const res = await fetch(`/api/admin/finanzas/cobros-pendientes?${params}`);
      const data = await res.json();
      setFacturas(data.facturas || []);
      setTotal(data.total || 0);
      setResumen(data.resumen || null);
      setPorCliente(data.porCliente || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [page, formaCobro, diasMin]);

  const handleBuscar = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  const estadoColor = (dias: number) => {
    if (dias > 60) return 'bg-red-50 text-red-700 border-red-200';
    if (dias > 30) return 'bg-orange-50 text-orange-700 border-orange-200';
    if (dias > 0) return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-green-50 text-green-700 border-green-200';
  };

  const estadoLabel = (dias: number) => {
    if (dias > 60) return 'Muy vencida';
    if (dias > 30) return 'Vencida';
    if (dias > 0) return `${dias}d`;
    return 'En plazo';
  };

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobros Pendientes</h1>
          <p className="text-sm text-gray-500 mt-1">Facturas emitidas pendientes de cobro (excluye remesas)</p>
        </div>
      </div>

      {/* KPIs */}
      {resumen && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <BanknotesIcon className="h-4 w-4 text-blue-600" />
              <p className="text-[10px] text-gray-500 uppercase font-medium">Total Pendiente</p>
            </div>
            <p className="text-2xl font-bold text-blue-700">{resumen.totalPendiente.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
            <p className="text-xs text-gray-400 mt-1">{resumen.numFacturas} facturas</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <UserGroupIcon className="h-4 w-4 text-indigo-600" />
              <p className="text-[10px] text-gray-500 uppercase font-medium">Clientes</p>
            </div>
            <p className="text-2xl font-bold text-indigo-700">{resumen.numClientes}</p>
            <p className="text-xs text-gray-400 mt-1">Con facturas pendientes</p>
          </div>
          <div className="bg-white border border-orange-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ClockIcon className="h-4 w-4 text-orange-600" />
              <p className="text-[10px] text-orange-600 uppercase font-medium">Vencidas (&gt;30d)</p>
            </div>
            <p className="text-2xl font-bold text-orange-700">{resumen.importeVencido.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
            <p className="text-xs text-gray-400 mt-1">{resumen.numVencidas} facturas</p>
          </div>
          <div className="bg-white border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <ExclamationTriangleIcon className="h-4 w-4 text-red-600" />
              <p className="text-[10px] text-red-600 uppercase font-medium">Muy vencidas (&gt;60d)</p>
            </div>
            <p className="text-2xl font-bold text-red-700">{resumen.importeMuyVencido.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</p>
            <p className="text-xs text-gray-400 mt-1">{resumen.numMuyVencidas} facturas</p>
          </div>
          <div className="bg-white border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] text-gray-500 uppercase font-medium">% Vencido</p>
            </div>
            <p className="text-2xl font-bold text-gray-700">
              {resumen.totalPendiente > 0 ? Math.round((resumen.importeVencido / resumen.totalPendiente) * 100) : 0}%
            </p>
            <p className="text-xs text-gray-400 mt-1">Del total pendiente</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="flex items-center gap-4 flex-wrap">
          <form onSubmit={handleBuscar} className="flex items-center gap-2">
            <div className="relative">
              <MagnifyingGlassIcon className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={buscar}
                onChange={e => setBuscar(e.target.value)}
                placeholder="Buscar cliente, factura o CIF..."
                className="pl-9 pr-3 py-2 border rounded-lg text-sm w-64"
              />
            </div>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700">Buscar</button>
          </form>
          <select value={formaCobro} onChange={e => { setFormaCobro(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
            <option value="todas">Todas las formas de cobro</option>
            <option value="Transferencia">Transferencia</option>
            <option value="Confirming">Confirming</option>
            <option value="">Sin forma de cobro</option>
          </select>
          <select value={diasMin} onChange={e => { setDiasMin(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2 text-sm">
            <option value="0">Todas las antigüedades</option>
            <option value="15">Más de 15 días</option>
            <option value="30">Más de 30 días</option>
            <option value="60">Más de 60 días</option>
            <option value="90">Más de 90 días</option>
          </select>
          <div className="ml-auto flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setVista('facturas')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${vista === 'facturas' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Por factura</button>
            <button onClick={() => setVista('clientes')} className={`px-3 py-1.5 rounded-md text-xs font-medium ${vista === 'clientes' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>Por cliente</button>
          </div>
        </div>
      </div>

      {/* Vista por facturas */}
      {vista === 'facturas' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nº Factura</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Pendiente</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Forma Cobro</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Antigüedad</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : facturas.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No hay facturas pendientes de cobro</td></tr>
              ) : facturas.map(f => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 text-xs">{f.cliente}</p>
                    {f.cif && <p className="text-[10px] text-gray-400">{f.cif}</p>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{f.numFactura}</td>
                  <td className="px-4 py-3 text-xs text-gray-600">{new Date(f.fecha).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3 text-right text-xs font-medium text-gray-900">{f.total.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</td>
                  <td className="px-4 py-3 text-right text-xs font-bold text-red-700">{f.importePendiente.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px]">{f.formaCobro || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${f.estado === 'IMPAGADA' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                      {f.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded border text-[10px] font-medium ${estadoColor(f.diasPendiente)}`}>
                      {estadoLabel(f.diasPendiente)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Paginación */}
          {total > 100 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
              <p className="text-xs text-gray-500">{total} facturas total</p>
              <div className="flex gap-2">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded text-xs disabled:opacity-40">Anterior</button>
                <button onClick={() => setPage(p => p + 1)} disabled={page * 100 >= total} className="px-3 py-1 border rounded text-xs disabled:opacity-40">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vista por clientes */}
      {vista === 'clientes' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Facturas</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total Facturado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Cobrado</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Pendiente</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr>
              ) : porCliente.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No hay clientes con cobros pendientes</td></tr>
              ) : porCliente.map((c, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{c.cliente}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{c.numFacturas}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{c.totalFacturado.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</td>
                  <td className="px-4 py-3 text-right text-green-700">{c.totalCobrado.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</td>
                  <td className="px-4 py-3 text-right font-bold text-red-700">{c.pendiente.toLocaleString('es-ES', {style:'currency',currency:'EUR'})}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
