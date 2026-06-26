'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeftIcon, PencilIcon, DocumentTextIcon,
  MagnifyingGlassIcon, CheckIcon, XMarkIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

interface LineaDetalle {
  descripcion: string;
  cliente: string | null;
  clienteId?: number;
  clienteNombreBd?: string;
  clienteMatch?: boolean;
  cantidad: number;
  precioUnitario: number;
  iva: number;
  importe: number;
}

interface Factura {
  id: string;
  proveedor: string;
  cif: string | null;
  numFactura: string | null;
  fecha: string;
  base: number;
  tipoIva: number;
  importeIva: number;
  tipoIrpf: number;
  importeIrpf: number;
  total: number;
  concepto: string | null;
  estado: string;
  imputacion: string | null;
  clienteImputado: string | null;
  departamento: string | null;
  deducibleIva: boolean;
  archivoOneDrive: string | null;
  oneDriveItemId: string | null;
  carpetaOrigen: string | null;
  ocrCompletado: boolean;
  ocrConfianza: number | null;
  datosOcrRaw: string | null;
  lineasDetalle: string | null;
  formaPago: string | null;
  confirmingProveedor: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Categoria {
  id: string;
  nombre: string;
  descripcion: string | null;
  color: string | null;
  tipo: string;
}

interface ClienteOption {
  cliente: string;
  cif: string | null;
}

interface FacturaEmitida {
  id: string;
  numFactura: string;
  fecha: string;
  concepto: string | null;
  lineas: string | null;
  base: number;
  total: number;
  serie: string | null;
}

interface Vinculacion {
  id: string;
  facturaRecibidaId: string;
  facturaEmitidaId: string;
  porcentaje: number;
  facturaEmitida: FacturaEmitida | null;
}

const ESTADOS = {
  PENDIENTE_REVISION: { label: 'Pendiente de revisión', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  VALIDADA: { label: 'Validada', color: 'bg-green-100 text-green-700 border-green-200' },
  CONTABILIZADA: { label: 'Contabilizada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700 border-red-200' },
};

const DEPARTAMENTOS = [
  'Dirección', 'Administración', 'Comercial', 'Técnico', 'Soporte', 'Marketing'
];

const FORMAS_PAGO = [
  'transferencia', 'confirming', 'domiciliacion', 'tarjeta', 'efectivo', 'compensacion'
];

export default function FacturaDetallePage() {
  const params = useParams();
  const router = useRouter();
  const [factura, setFactura] = useState<Factura | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<Partial<Factura>>({});
  const [showPdf, setShowPdf] = useState(true);

  // OCR
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrResult, setOcrResult] = useState<any>(null);
  const [lineas, setLineas] = useState<LineaDetalle[]>([]);

  // Imputación inteligente
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [selectedCategoria, setSelectedCategoria] = useState<string>('');
  const [showClienteSearch, setShowClienteSearch] = useState(false);
  const [clienteQuery, setClienteQuery] = useState('');
  const [clienteResults, setClienteResults] = useState<ClienteOption[]>([]);
  const [selectedCliente, setSelectedCliente] = useState<string>('');
  const [facturasCliente, setFacturasCliente] = useState<FacturaEmitida[]>([]);
  const [selectedFacturasEmitidas, setSelectedFacturasEmitidas] = useState<string[]>([]);
  const [vinculaciones, setVinculaciones] = useState<Vinculacion[]>([]);
  const [sugerencia, setSugerencia] = useState<any>(null);

  // Modal de aplicar a todas
  const [showModalAplicar, setShowModalAplicar] = useState(false);
  const [facturasProveedorCount, setFacturasProveedorCount] = useState(0);
  const [aplicandoTodas, setAplicandoTodas] = useState(false);

  useEffect(() => {
    fetchFactura();
    fetchCategorias();
  }, [params.id]);

  async function fetchFactura() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finanzas/facturas/${params.id}`);
      const json = await res.json();
      if (json.factura) {
        setFactura(json.factura);
        setEditData(json.factura);
        setSelectedCategoria(json.factura.imputacion || '');
        setSelectedCliente(json.factura.clienteImputado || '');
        // Parsear líneas de detalle
        if (json.factura.lineasDetalle) {
          try {
            setLineas(JSON.parse(json.factura.lineasDetalle));
          } catch { setLineas([]); }
        } else {
          setLineas([]);
        }
        // Buscar sugerencia de imputación
        fetchSugerencia(json.factura.proveedor, json.factura.cif);
        // Buscar vinculaciones existentes
        fetchVinculaciones(json.factura.id);
      }
    } catch (e) {
      console.error('Error:', e);
    }
    setLoading(false);
  }

  async function fetchCategorias() {
    try {
      const res = await fetch('/api/admin/finanzas/imputacion?action=categorias');
      const json = await res.json();
      setCategorias(json.categorias || []);
    } catch (e) {
      console.error('Error:', e);
    }
  }

  async function fetchSugerencia(proveedor: string, cif: string | null) {
    try {
      const params = new URLSearchParams({ action: 'sugerencia', proveedor });
      if (cif) params.set('cif', cif);
      const res = await fetch(`/api/admin/finanzas/imputacion?${params}`);
      const json = await res.json();
      setSugerencia(json.regla);
    } catch (e) {
      console.error('Error:', e);
    }
  }

  async function fetchVinculaciones(facturaId: string) {
    try {
      const res = await fetch(`/api/admin/finanzas/imputacion?action=vinculaciones&facturaRecibidaId=${facturaId}`);
      const json = await res.json();
      setVinculaciones(json.vinculaciones || []);
      setSelectedFacturasEmitidas((json.vinculaciones || []).map((v: any) => v.facturaEmitidaId));
    } catch (e) {
      console.error('Error:', e);
    }
  }

  async function reintentarOcr() {
    setOcrLoading(true);
    setOcrResult(null);
    try {
      const res = await fetch(`/api/admin/finanzas/facturas/${params.id}/ocr`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setOcrResult({ success: true, datos: json.datos });
        // Refrescar la factura con los nuevos datos
        await fetchFactura();
      } else {
        setOcrResult({ success: false, error: json.error });
      }
    } catch (e: any) {
      setOcrResult({ success: false, error: e.message });
    }
    setOcrLoading(false);
  }

  async function buscarClientes(q: string) {
    setClienteQuery(q);
    if (q.length < 2) { setClienteResults([]); return; }
    try {
      const res = await fetch(`/api/admin/finanzas/imputacion?action=buscar-clientes&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      setClienteResults(json.clientes || []);
    } catch (e) {
      console.error('Error:', e);
    }
  }

  async function seleccionarCliente(cliente: string) {
    setSelectedCliente(cliente);
    setShowClienteSearch(false);
    setClienteQuery('');
    setClienteResults([]);
    try {
      const res = await fetch(`/api/admin/finanzas/imputacion?action=facturas-cliente&cliente=${encodeURIComponent(cliente)}`);
      const json = await res.json();
      setFacturasCliente(json.facturas || []);
    } catch (e) {
      console.error('Error:', e);
    }
  }

  async function guardarImputacion() {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/finanzas/imputacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'imputar',
          facturaRecibidaId: factura!.id,
          categoria: selectedCategoria,
          clienteNombre: selectedCategoria === 'Cliente (Ventas)' ? selectedCliente : null,
          facturaEmitidaIds: selectedCategoria === 'Cliente (Ventas)' ? selectedFacturasEmitidas : [],
        }),
      });

      if (res.ok) {
        const countRes = await fetch(`/api/admin/finanzas/facturas?proveedor=${encodeURIComponent(factura!.proveedor)}&sinImputar=true&count=true`);
        const countJson = await countRes.json();
        const count = countJson.total || 0;

        if (count > 0) {
          setFacturasProveedorCount(count);
          setShowModalAplicar(true);
        } else {
          fetchFactura();
          setEditing(false);
        }
      }
    } catch (e) {
      console.error('Error:', e);
    }
    setSaving(false);
  }

  async function aplicarATodas() {
    setAplicandoTodas(true);
    try {
      const res = await fetch('/api/admin/finanzas/imputacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'imputar-todas-proveedor',
          proveedor: factura!.proveedor,
          cif: factura!.cif,
          categoria: selectedCategoria,
          clienteNombre: selectedCategoria === 'Cliente (Ventas)' ? selectedCliente : null,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setShowModalAplicar(false);
        fetchFactura();
        setEditing(false);
        alert(`Imputación aplicada a ${json.actualizadas || 0} facturas de ${factura!.proveedor}`);
      }
    } catch (e) {
      console.error('Error:', e);
    }
    setAplicandoTodas(false);
  }

  async function guardarCambios() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/finanzas/facturas/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proveedor: editData.proveedor,
          cif: editData.cif,
          numFactura: editData.numFactura,
          fecha: editData.fecha,
          base: parseFloat(String(editData.base)) || 0,
          tipoIva: parseFloat(String(editData.tipoIva)) || 21,
          importeIva: parseFloat(String(editData.importeIva)) || 0,
          tipoIrpf: parseFloat(String(editData.tipoIrpf)) || 0,
          importeIrpf: parseFloat(String(editData.importeIrpf)) || 0,
          total: parseFloat(String(editData.total)) || 0,
          concepto: editData.concepto,
          departamento: editData.departamento,
          formaPago: editData.formaPago,
          deducibleIva: editData.deducibleIva,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        setFactura(json.factura);
        setEditing(false);
      }
    } catch (e) {
      console.error('Error guardando:', e);
    }
    setSaving(false);
  }

  async function cambiarEstado(estado: string) {
    try {
      const res = await fetch(`/api/admin/finanzas/facturas/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      });
      if (res.ok) {
        const json = await res.json();
        setFactura(json.factura);
      }
    } catch (e) {
      console.error('Error:', e);
    }
  }

  function formatEUR(n: number) {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  }

  function formatFecha(str: string) {
    return new Date(str).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  function formatFechaCorta(str: string) {
    return new Date(str).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Cargando factura...</div>
      </div>
    );
  }

  if (!factura) {
    return (
      <div className="p-6">
        <p className="text-red-600">Factura no encontrada</p>
        <button onClick={() => router.back()} className="mt-4 text-blue-600 underline">Volver</button>
      </div>
    );
  }

  const estadoInfo = ESTADOS[factura.estado as keyof typeof ESTADOS] || ESTADOS.PENDIENTE_REVISION;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => router.push('/admin/finanzas/facturas')}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{factura.proveedor}</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {factura.numFactura ? `Factura ${factura.numFactura}` : 'Sin número'} · {formatFecha(factura.fecha)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-sm font-medium border ${estadoInfo.color}`}>
            {estadoInfo.label}
          </span>
          {!editing ? (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium"
            >
              <PencilIcon className="h-4 w-4" />
              Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => { setEditing(false); setEditData(factura); }}
                className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={guardarCambios}
                disabled={saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Guardando...' : 'Guardar datos'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Banner OCR */}
      {!factura.ocrCompletado && factura.oneDriveItemId && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-red-800">
              ⚠️ Esta factura no tiene datos OCR extraídos
            </p>
            <p className="text-xs text-red-600 mt-0.5">
              Pulsa &quot;Reintentar OCR&quot; para extraer proveedor, importes y líneas de detalle del PDF
            </p>
          </div>
          <button
            onClick={reintentarOcr}
            disabled={ocrLoading}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${ocrLoading ? 'animate-spin' : ''}`} />
            {ocrLoading ? 'Procesando...' : 'Reintentar OCR'}
          </button>
        </div>
      )}

      {/* Banner OCR completado pero se puede reintentar */}
      {factura.ocrCompletado && factura.oneDriveItemId && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            OCR completado (confianza: {Math.round((factura.ocrConfianza || 0) * 100)}%)
          </p>
          <button
            onClick={reintentarOcr}
            disabled={ocrLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-md hover:bg-gray-100 disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-3.5 w-3.5 ${ocrLoading ? 'animate-spin' : ''}`} />
            {ocrLoading ? 'Procesando...' : 'Reintentar OCR'}
          </button>
        </div>
      )}

      {/* Resultado OCR */}
      {ocrResult && (
        <div className={`rounded-lg p-4 border ${ocrResult.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {ocrResult.success ? (
            <div>
              <p className="text-sm font-medium text-green-800">✓ OCR completado correctamente</p>
              <p className="text-xs text-green-600 mt-1">
                {ocrResult.datos.proveedor} — {formatEUR(ocrResult.datos.total)} — {ocrResult.datos.numLineas} líneas de detalle
              </p>
            </div>
          ) : (
            <p className="text-sm text-red-800">Error: {ocrResult.error}</p>
          )}
        </div>
      )}

      {/* Banner de sugerencia de imputación */}
      {sugerencia && !factura.imputacion && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-800">
              Este proveedor no tiene imputación asignada
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Sugerencia basada en regla existente: <strong>{sugerencia.categoria}</strong>
              {sugerencia.clienteNombre && ` → ${sugerencia.clienteNombre}`}
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedCategoria(sugerencia.categoria);
              if (sugerencia.clienteNombre) {
                setSelectedCliente(sugerencia.clienteNombre);
                seleccionarCliente(sugerencia.clienteNombre);
              }
            }}
            className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700"
          >
            Aplicar sugerencia
          </button>
        </div>
      )}

      {!sugerencia && !factura.imputacion && factura.ocrCompletado && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm font-medium text-yellow-800">
            ⚠️ Esta factura no tiene imputación. Asigna una categoría abajo para clasificarla.
          </p>
        </div>
      )}

      {factura.imputacion && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-green-800">
              Imputada a: <strong>{factura.imputacion}</strong>
              {factura.clienteImputado && ` → ${factura.clienteImputado}`}
            </p>
          </div>
          <span className="text-green-600"><CheckIcon className="h-5 w-5" /></span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda: Datos */}
        <div className="space-y-6">
          {/* Datos del proveedor */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Datos del proveedor</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Proveedor</label>
                {editing ? (
                  <input type="text" value={editData.proveedor || ''} onChange={e => setEditData({...editData, proveedor: e.target.value})} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{factura.proveedor}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">CIF/NIF</label>
                {editing ? (
                  <input type="text" value={editData.cif || ''} onChange={e => setEditData({...editData, cif: e.target.value})} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{factura.cif || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Nº Factura</label>
                {editing ? (
                  <input type="text" value={editData.numFactura || ''} onChange={e => setEditData({...editData, numFactura: e.target.value})} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{factura.numFactura || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Fecha emisión</label>
                {editing ? (
                  <input type="date" value={editData.fecha ? new Date(editData.fecha).toISOString().slice(0, 10) : ''} onChange={e => setEditData({...editData, fecha: e.target.value})} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{formatFecha(factura.fecha)}</p>
                )}
              </div>
            </div>
          </div>

          {/* Desglose económico */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Desglose económico</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Base imponible</span>
                {editing ? (
                  <input type="number" step="0.01" value={editData.base || 0} onChange={e => setEditData({...editData, base: parseFloat(e.target.value)})} className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right" />
                ) : (
                  <span className="text-sm font-medium">{formatEUR(factura.base)}</span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">IVA ({factura.tipoIva}%)</span>
                {editing ? (
                  <input type="number" step="0.01" value={editData.importeIva || 0} onChange={e => setEditData({...editData, importeIva: parseFloat(e.target.value)})} className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right" />
                ) : (
                  <span className="text-sm font-medium text-green-700">+{formatEUR(factura.importeIva)}</span>
                )}
              </div>
              {(factura.importeIrpf > 0 || editing) && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">IRPF ({factura.tipoIrpf}%)</span>
                  {editing ? (
                    <input type="number" step="0.01" value={editData.importeIrpf || 0} onChange={e => setEditData({...editData, importeIrpf: parseFloat(e.target.value)})} className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right" />
                  ) : (
                    <span className="text-sm font-medium text-red-600">-{formatEUR(factura.importeIrpf)}</span>
                  )}
                </div>
              )}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">TOTAL</span>
                {editing ? (
                  <input type="number" step="0.01" value={editData.total || 0} onChange={e => setEditData({...editData, total: parseFloat(e.target.value)})} className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right font-bold" />
                ) : (
                  <span className="text-lg font-bold text-gray-900">{formatEUR(factura.total)}</span>
                )}
              </div>
            </div>
          </div>

          {/* LÍNEAS DE DETALLE */}
          {lineas.length > 0 && (
            <div className="bg-white rounded-xl border p-5">
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
                Líneas de detalle ({lineas.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 font-medium text-gray-500">Descripción</th>
                      <th className="pb-2 font-medium text-gray-500">Cliente detectado</th>
                      <th className="pb-2 font-medium text-gray-500 text-right">Cant.</th>
                      <th className="pb-2 font-medium text-gray-500 text-right">P. Unit.</th>
                      <th className="pb-2 font-medium text-gray-500 text-right">IVA</th>
                      <th className="pb-2 font-medium text-gray-500 text-right">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lineas.map((linea, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="py-2 pr-2 max-w-[200px]">
                          <span className="text-gray-900 line-clamp-2">{linea.descripcion}</span>
                        </td>
                        <td className="py-2 pr-2">
                          {linea.cliente ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                              linea.clienteMatch 
                                ? 'bg-green-100 text-green-700' 
                                : 'bg-blue-100 text-blue-700'
                            }`}>
                              {linea.clienteMatch && <CheckIcon className="h-3 w-3" />}
                              {linea.clienteNombreBd || linea.cliente}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-gray-700">{linea.cantidad}</td>
                        <td className="py-2 text-right text-gray-700">{formatEUR(linea.precioUnitario)}</td>
                        <td className="py-2 text-right text-gray-500">{linea.iva}%</td>
                        <td className="py-2 text-right font-medium text-gray-900">{formatEUR(linea.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-medium">
                      <td colSpan={5} className="pt-2 text-right text-gray-700">Total líneas:</td>
                      <td className="pt-2 text-right text-gray-900">
                        {formatEUR(lineas.reduce((sum, l) => sum + (l.importe || 0), 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {lineas.some(l => l.clienteMatch) && (
                <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs text-green-700">
                    <CheckIcon className="h-3.5 w-3.5 inline mr-1" />
                    {lineas.filter(l => l.clienteMatch).length} líneas coinciden con clientes de la base de datos.
                    Puedes imputar esta factura a &quot;Cliente (Ventas)&quot; y vincularla a las facturas emitidas correspondientes.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* IMPUTACIÓN INTELIGENTE */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Imputación</h2>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Categoría de imputación</label>
                <div className="grid grid-cols-2 gap-2">
                  {categorias.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        setSelectedCategoria(cat.nombre);
                        if (cat.nombre === 'Cliente (Ventas)') {
                          setShowClienteSearch(true);
                        } else {
                          setShowClienteSearch(false);
                          setSelectedCliente('');
                          setFacturasCliente([]);
                        }
                      }}
                      className={`px-3 py-2 text-sm rounded-lg border text-left transition-all ${
                        selectedCategoria === cat.nombre
                          ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium ring-1 ring-blue-500'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <span className="inline-block w-2 h-2 rounded-full mr-2" style={{ backgroundColor: cat.color || '#6B7280' }}></span>
                      {cat.nombre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Búsqueda de cliente */}
              {(showClienteSearch || selectedCategoria === 'Cliente (Ventas)') && (
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500 mb-2 block">Seleccionar cliente</label>
                  {selectedCliente ? (
                    <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                      <span className="text-sm font-medium text-green-800">{selectedCliente}</span>
                      <button onClick={() => { setSelectedCliente(''); setFacturasCliente([]); }} className="text-green-600 hover:text-green-800">
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={clienteQuery}
                        onChange={e => buscarClientes(e.target.value)}
                        placeholder="Buscar cliente..."
                        className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
                      />
                      {clienteResults.length > 0 && (
                        <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {clienteResults.map((c, i) => (
                            <button
                              key={i}
                              onClick={() => seleccionarCliente(c.cliente)}
                              className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
                            >
                              <span className="font-medium">{c.cliente}</span>
                              {c.cif && <span className="text-gray-400 ml-2 text-xs">{c.cif}</span>}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Facturas emitidas del cliente seleccionado */}
                  {facturasCliente.length > 0 && (
                    <div className="mt-3">
                      <label className="text-xs text-gray-500 mb-2 block">
                        Vincular a facturas emitidas ({facturasCliente.length} facturas)
                      </label>
                      <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
                        {facturasCliente.map(fe => (
                          <label key={fe.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedFacturasEmitidas.includes(fe.id)}
                              onChange={e => {
                                if (e.target.checked) {
                                  setSelectedFacturasEmitidas([...selectedFacturasEmitidas, fe.id]);
                                } else {
                                  setSelectedFacturasEmitidas(selectedFacturasEmitidas.filter(id => id !== fe.id));
                                }
                              }}
                              className="rounded border-gray-300"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono text-gray-500">{fe.numFactura}</span>
                                <span className="text-xs text-gray-400">{formatFechaCorta(fe.fecha)}</span>
                                <span className="text-xs font-medium text-gray-700">{formatEUR(fe.total)}</span>
                              </div>
                              {fe.concepto && (
                                <p className="text-xs text-gray-500 truncate mt-0.5">{fe.concepto}</p>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Concepto y otros campos */}
              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500">Concepto</label>
                  {editing ? (
                    <textarea value={editData.concepto || ''} onChange={e => setEditData({...editData, concepto: e.target.value})} rows={2} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" />
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{factura.concepto || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Departamento</label>
                  {editing ? (
                    <select value={editData.departamento || ''} onChange={e => setEditData({...editData, departamento: e.target.value})} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm">
                      <option value="">Sin asignar</option>
                      {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{factura.departamento || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">Forma de pago</label>
                  {editing ? (
                    <select value={editData.formaPago || ''} onChange={e => setEditData({...editData, formaPago: e.target.value})} className="w-full mt-1 px-3 py-2 border rounded-lg text-sm">
                      <option value="">Sin especificar</option>
                      {FORMAS_PAGO.map(fp => <option key={fp} value={fp}>{fp}</option>)}
                    </select>
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{factura.formaPago || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="text-xs text-gray-500">IVA deducible</label>
                  {editing ? (
                    <div className="mt-2">
                      <input type="checkbox" checked={editData.deducibleIva ?? true} onChange={e => setEditData({...editData, deducibleIva: e.target.checked})} className="rounded border-gray-300" />
                      <span className="ml-2 text-sm text-gray-600">Sí</span>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-900 mt-1">{factura.deducibleIva ? 'Sí' : 'No'}</p>
                  )}
                </div>
              </div>

              {/* Botón guardar imputación */}
              {selectedCategoria && selectedCategoria !== factura.imputacion && (
                <div className="border-t pt-4">
                  <button
                    onClick={guardarImputacion}
                    disabled={saving}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm disabled:opacity-50"
                  >
                    {saving ? 'Guardando...' : `Imputar a "${selectedCategoria}"${selectedCliente ? ` → ${selectedCliente}` : ''}`}
                  </button>
                </div>
              )}

              {/* Vinculaciones existentes */}
              {vinculaciones.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500 mb-2 block">Facturas emitidas vinculadas</label>
                  <div className="space-y-2">
                    {vinculaciones.map(v => v.facturaEmitida && (
                      <div key={v.id} className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <div>
                          <span className="text-xs font-mono text-blue-600">{v.facturaEmitida.numFactura}</span>
                        </div>
                        <span className="text-xs font-medium text-blue-700">{formatEUR(v.facturaEmitida.total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Acciones de estado */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Cambiar estado</h2>
            <div className="flex flex-wrap gap-2">
              {Object.entries(ESTADOS).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => cambiarEstado(key)}
                  disabled={factura.estado === key}
                  className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${
                    factura.estado === key 
                      ? `${val.color} cursor-default` 
                      : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-200'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metadatos */}
          <div className="bg-gray-50 rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Información del sistema</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="text-gray-500">Carpeta:</span><span className="ml-2 font-medium">{factura.carpetaOrigen || '—'}</span></div>
              <div><span className="text-gray-500">Archivo:</span><span className="ml-2 font-medium truncate">{factura.archivoOneDrive || '—'}</span></div>
              <div><span className="text-gray-500">OCR:</span><span className="ml-2 font-medium">{factura.ocrCompletado ? <span className="text-green-600">OK ({Math.round((factura.ocrConfianza || 0) * 100)}%)</span> : <span className="text-amber-600">Pendiente</span>}</span></div>
              <div><span className="text-gray-500">Confirming:</span><span className="ml-2 font-medium">{factura.confirmingProveedor || '—'}</span></div>
            </div>
          </div>
        </div>

        {/* Columna derecha: PDF */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border overflow-hidden sticky top-4">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Documento original</h2>
              <div className="flex gap-2">
                <button onClick={() => setShowPdf(!showPdf)} className="text-xs px-3 py-1 border rounded-md hover:bg-gray-100">
                  {showPdf ? 'Ocultar' : 'Mostrar'}
                </button>
                {factura.oneDriveItemId && (
                  <a href={`/api/admin/finanzas/facturas/${factura.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                    Abrir en nueva pestaña
                  </a>
                )}
              </div>
            </div>
            {showPdf && factura.oneDriveItemId ? (
              <div className="w-full" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
                <iframe src={`/api/admin/finanzas/facturas/${factura.id}/pdf`} className="w-full h-full" title="Factura PDF" />
              </div>
            ) : !factura.oneDriveItemId ? (
              <div className="p-8 text-center text-gray-400">
                <DocumentTextIcon className="h-12 w-12 mx-auto mb-3" />
                <p>No hay archivo PDF asociado</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Modal: Aplicar a todas las facturas del proveedor */}
      {showModalAplicar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Aplicar a todas</h3>
            <p className="text-sm text-gray-600 mb-4">
              Hay <strong>{facturasProveedorCount}</strong> facturas más de <strong>{factura.proveedor}</strong> sin imputar.
              ¿Quieres aplicar la imputación <strong>&quot;{selectedCategoria}&quot;</strong> a todas?
            </p>
            <p className="text-xs text-gray-500 mb-6">
              Esto también creará una regla automática para que las futuras facturas de este proveedor se imputen automáticamente.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowModalAplicar(false); fetchFactura(); setEditing(false); }}
                className="flex-1 px-4 py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50"
              >
                Solo esta factura
              </button>
              <button
                onClick={aplicarATodas}
                disabled={aplicandoTodas}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {aplicandoTodas ? 'Aplicando...' : `Aplicar a todas (${facturasProveedorCount})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
