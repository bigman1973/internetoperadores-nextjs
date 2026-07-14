'use client';

import { useState, useEffect } from 'react';
import {
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  LinkIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

interface FacturaEmitida {
  id: string;
  cliente: string;
  cif: string | null;
  numFactura: string;
  fecha: string;
  fechaVencimiento: string | null;
  base: number;
  total: number;
  estado: string;
  formaCobro: string | null;
  importeCobrado: number;
  fechaCobro: string | null;
  concepto: string | null;
}

interface MovimientoCobro {
  id: string;
  fechaOperacion: string;
  concepto: string;
  tercero: string | null;
  importe: number;
  cuenta: { banco: string } | null;
  conciliado: boolean;
  facturaEmitidaId: string | null;
  facturaEmitida: { numFactura: string; cliente: string; total: number } | null;
}

interface DocumentoConfirming {
  id: string;
  proveedor: string | null;
  numFactura: string | null;
  fecha: string | null;
  total: number | null;
  base: number | null;
  archivoUrl: string | null;
  archivoOneDrive: string | null;
  carpetaOrigen: string | null;
  estado: string;
}

interface KPIs {
  totalFacturado: number;
  totalCobrado: number;
  pendienteCobro: number;
  totalFacturas: number;
  facturasConCobro: number;
  facturasPendientes: number;
  totalMovimientos: number;
  movimientosSinVincular: number;
  totalIngresado: number;
  totalDocumentosConfirming: number;
}

export default function GGCDraxtonPage() {
  const [facturas, setFacturas] = useState<FacturaEmitida[]>([]);
  const [movimientos, setMovimientos] = useState<MovimientoCobro[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoConfirming[]>([]);
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(2026);
  const [tab, setTab] = useState<'facturas' | 'movimientos' | 'documentos'>('facturas');
  const [busqueda, setBusqueda] = useState('');

  // Modal de vincular
  const [modalVincular, setModalVincular] = useState<{ movimiento: MovimientoCobro } | null>(null);
  const [busquedaFactura, setBusquedaFactura] = useState('');

  useEffect(() => {
    fetchData();
  }, [year]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finanzas/clientes/ggcc-draxton?year=${year}`);
      const data = await res.json();
      setFacturas(data.facturasEmitidas || []);
      setMovimientos(data.movimientosCobro || []);
      setDocumentos(data.documentosConfirming || []);
      setKpis(data.kpis || null);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function vincularMovimiento(movimientoId: string, facturaEmitidaId: string) {
    try {
      const res = await fetch('/api/admin/finanzas/clientes/ggcc-draxton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movimientoId, facturaEmitidaId }),
      });
      if (res.ok) {
        setModalVincular(null);
        fetchData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  const formatMoney = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' }) : '-';

  // Filtrar facturas por búsqueda
  const facturasFiltradas = facturas.filter(f =>
    !busqueda || f.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
    f.numFactura.toLowerCase().includes(busqueda.toLowerCase()) ||
    f.concepto?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Filtrar movimientos por búsqueda
  const movimientosFiltrados = movimientos.filter(m =>
    !busqueda || m.concepto?.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.tercero?.toLowerCase().includes(busqueda.toLowerCase()) ||
    m.facturaEmitida?.numFactura.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Filtrar documentos por búsqueda
  const documentosFiltrados = documentos.filter(d =>
    !busqueda || d.proveedor?.toLowerCase().includes(busqueda.toLowerCase()) ||
    d.numFactura?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // Facturas candidatas para vincular (no cobradas o parcialmente cobradas)
  const facturasCandidatas = facturas.filter(f => {
    const matchBusqueda = !busquedaFactura ||
      f.cliente.toLowerCase().includes(busquedaFactura.toLowerCase()) ||
      f.numFactura.toLowerCase().includes(busquedaFactura.toLowerCase());
    return matchBusqueda && f.estado !== 'COBRADA';
  });

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BuildingOffice2Icon className="h-7 w-7 text-indigo-600" />
            GGCC — Draxton
          </h1>
          <p className="text-sm text-gray-500 mt-1">Conciliación de cobros por confirming</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value={2026}>2026</option>
            <option value={2025}>2025</option>
          </select>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3 mb-6">
          <div className="bg-white rounded-lg border-2 border-indigo-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Facturado</p>
            <p className="text-lg font-bold text-gray-900">{formatMoney(kpis.totalFacturado)}</p>
            <p className="text-xs text-gray-400">{kpis.totalFacturas} facturas</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-green-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Cobrado</p>
            <p className="text-lg font-bold text-green-700">{formatMoney(kpis.totalCobrado)}</p>
            <p className="text-xs text-gray-400">{kpis.facturasConCobro} cobradas</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-orange-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Pendiente</p>
            <p className="text-lg font-bold text-orange-600">{formatMoney(kpis.pendienteCobro)}</p>
            <p className="text-xs text-gray-400">{kpis.facturasPendientes} pendientes</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-blue-100 p-3">
            <p className="text-xs text-gray-500 uppercase">% Cobrado</p>
            <p className="text-lg font-bold text-blue-700">
              {kpis.totalFacturado > 0 ? Math.round((kpis.totalCobrado / kpis.totalFacturado) * 100) : 0}%
            </p>
          </div>
          <div className="bg-white rounded-lg border-2 border-gray-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Ingresado</p>
            <p className="text-lg font-bold text-gray-900">{formatMoney(kpis.totalIngresado)}</p>
            <p className="text-xs text-gray-400">{kpis.totalMovimientos} mov.</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-green-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Vinculados</p>
            <p className="text-lg font-bold text-green-700">{kpis.totalMovimientos - kpis.movimientosSinVincular}</p>
            <p className="text-xs text-gray-400">con factura</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-red-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Sin vincular</p>
            <p className="text-lg font-bold text-red-600">{kpis.movimientosSinVincular}</p>
            <p className="text-xs text-gray-400">sin factura</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-purple-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Docs Confirming</p>
            <p className="text-lg font-bold text-purple-700">{kpis.totalDocumentosConfirming}</p>
            <p className="text-xs text-gray-400">en OneDrive</p>
          </div>
          <div className="bg-white rounded-lg border-2 border-purple-100 p-3">
            <p className="text-xs text-gray-500 uppercase">Diferencia</p>
            <p className={`text-lg font-bold ${kpis.totalIngresado - kpis.totalFacturado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatMoney(kpis.totalIngresado - kpis.totalFacturado)}
            </p>
            <p className="text-xs text-gray-400">ingresado - facturado</p>
          </div>
        </div>
      )}

      {/* Tabs + Búsqueda */}
      <div className="flex items-center gap-4 mb-4">
        <div className="flex border rounded-lg overflow-hidden">
          <button
            onClick={() => setTab('facturas')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'facturas' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Facturas Emitidas ({facturas.length})
          </button>
          <button
            onClick={() => setTab('movimientos')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'movimientos' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Cobros Banco ({movimientos.length})
          </button>
          <button
            onClick={() => setTab('documentos')}
            className={`px-4 py-2 text-sm font-medium ${tab === 'documentos' ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
          >
            Docs Confirming ({documentos.length})
          </button>
        </div>
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
          />
        </div>
      </div>

      {/* Tabla de Facturas Emitidas */}
      {tab === 'facturas' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Nº Factura</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Concepto</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Base</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Total</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Forma Cobro</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Cobrado</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              ) : facturasFiltradas.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No hay facturas</td></tr>
              ) : (
                facturasFiltradas.map(f => (
                  <tr key={f.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600">{formatDate(f.fecha)}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{f.numFactura}</td>
                    <td className="px-3 py-2 text-gray-700">{f.cliente}</td>
                    <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate">{f.concepto || '-'}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{formatMoney(f.base)}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{formatMoney(f.total)}</td>
                    <td className="px-3 py-2">
                      {f.formaCobro && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          f.formaCobro === 'Confirming' ? 'bg-purple-100 text-purple-700' :
                          f.formaCobro === 'Remesa' ? 'bg-blue-100 text-blue-700' :
                          f.formaCobro === 'Transferencia' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {f.formaCobro}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-green-700">{f.importeCobrado > 0 ? formatMoney(f.importeCobrado) : '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        f.estado === 'COBRADA' ? 'bg-green-100 text-green-700' :
                        f.estado === 'EMITIDA' ? 'bg-yellow-100 text-yellow-700' :
                        f.estado === 'VENCIDA' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {f.estado}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {facturasFiltradas.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-500">
              {facturasFiltradas.length} facturas · Total: {formatMoney(facturasFiltradas.reduce((s, f) => s + f.total, 0))}
            </div>
          )}
        </div>
      )}

      {/* Tabla de Movimientos/Cobros */}
      {tab === 'movimientos' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Banco</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Concepto</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Factura vinculada</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Estado</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              ) : movimientosFiltrados.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No hay movimientos</td></tr>
              ) : (
                movimientosFiltrados.map(m => (
                  <tr key={m.id} className={`border-b hover:bg-gray-50 ${!m.facturaEmitidaId ? 'bg-orange-50/50' : ''}`}>
                    <td className="px-3 py-2 text-gray-600">{formatDate(m.fechaOperacion)}</td>
                    <td className="px-3 py-2 text-gray-600">{m.cuenta?.banco || '-'}</td>
                    <td className="px-3 py-2 text-gray-700 max-w-[300px] truncate">{m.concepto}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-700">{formatMoney(Number(m.importe))}</td>
                    <td className="px-3 py-2">
                      {m.facturaEmitida ? (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          {m.facturaEmitida.numFactura}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Sin vincular</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {m.facturaEmitidaId ? (
                        <CheckCircleIcon className="h-5 w-5 text-green-600" />
                      ) : (
                        <ClockIcon className="h-5 w-5 text-orange-500" />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {!m.facturaEmitidaId && (
                        <button
                          onClick={() => { setModalVincular({ movimiento: m }); setBusquedaFactura(''); }}
                          className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-200 flex items-center gap-1"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Vincular
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {movimientosFiltrados.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-500">
              {movimientosFiltrados.length} movimientos · Total ingresado: {formatMoney(movimientosFiltrados.reduce((s, m) => s + Number(m.importe), 0))}
            </div>
          )}
        </div>
      )}

      {/* Tabla de Documentos Confirming */}
      {tab === 'documentos' && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="px-4 py-3 bg-purple-50 border-b">
            <p className="text-sm text-purple-700">
              <DocumentTextIcon className="h-4 w-4 inline mr-1" />
              Documentos de la carpeta &quot;Confirming Draxton 2026&quot; en OneDrive — justificantes de cobro por confirming
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Fecha</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Proveedor/Emisor</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Nº Documento</th>
                <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Estado</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">PDF</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              ) : documentosFiltrados.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No hay documentos</td></tr>
              ) : (
                documentosFiltrados.map(d => (
                  <tr key={d.id} className="border-b hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600">{formatDate(d.fecha)}</td>
                    <td className="px-3 py-2 text-gray-700">{d.proveedor || 'Sin identificar'}</td>
                    <td className="px-3 py-2 font-medium text-gray-900">{d.numFactura || '-'}</td>
                    <td className="px-3 py-2 text-right font-medium text-green-700">
                      {d.total ? formatMoney(d.total) : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        d.estado === 'CONTABILIZADA' ? 'bg-green-100 text-green-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {d.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {(d.archivoUrl || d.archivoOneDrive) && (
                        <a
                          href={d.archivoUrl || d.archivoOneDrive || '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800"
                        >
                          <EyeIcon className="h-5 w-5" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {documentosFiltrados.length > 0 && (
            <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-500">
              {documentosFiltrados.length} documentos · Total: {formatMoney(documentosFiltrados.reduce((s, d) => s + (d.total || 0), 0))}
            </div>
          )}
        </div>
      )}

      {/* Modal de vincular movimiento con factura emitida */}
      {modalVincular && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">Vincular cobro con factura emitida</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Cobro: {formatMoney(Number(modalVincular.movimiento.importe))} — {formatDate(modalVincular.movimiento.fechaOperacion)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">{modalVincular.movimiento.concepto}</p>
              </div>
              <button onClick={() => setModalVincular(null)} className="p-1 hover:bg-gray-100 rounded">
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 border-b">
              <input
                type="text"
                placeholder="Buscar factura por número, cliente..."
                value={busquedaFactura}
                onChange={(e) => setBusquedaFactura(e.target.value)}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                autoFocus
              />
            </div>
            <div className="overflow-y-auto max-h-[50vh] p-4">
              {facturasCandidatas.length === 0 ? (
                <p className="text-center text-gray-400 py-4">No hay facturas candidatas</p>
              ) : (
                <div className="space-y-2">
                  {facturasCandidatas.map(f => {
                    const importeMatch = Math.abs(f.total - Number(modalVincular!.movimiento.importe)) < f.total * 0.05;
                    return (
                      <div
                        key={f.id}
                        className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-indigo-50 ${importeMatch ? 'border-green-300 bg-green-50/50' : ''}`}
                        onClick={() => vincularMovimiento(modalVincular!.movimiento.id, f.id)}
                      >
                        <div>
                          <p className="font-medium text-sm text-gray-900">{f.numFactura} — {f.cliente}</p>
                          <p className="text-xs text-gray-500">{formatDate(f.fecha)} · {f.concepto || 'Sin concepto'}</p>
                        </div>
                        <div className="text-right">
                          <p className={`font-medium text-sm ${importeMatch ? 'text-green-700' : 'text-gray-900'}`}>
                            {formatMoney(f.total)}
                          </p>
                          {importeMatch && (
                            <p className="text-xs text-green-600">✓ Importe coincide</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
