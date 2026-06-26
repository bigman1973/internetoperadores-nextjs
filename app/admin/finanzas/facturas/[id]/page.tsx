'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  ArrowLeftIcon, CheckCircleIcon, XCircleIcon, PencilIcon,
  DocumentTextIcon, ClockIcon
} from '@heroicons/react/24/outline';

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
  formaPago: string | null;
  confirmingProveedor: string | null;
  createdAt: string;
  updatedAt: string;
}

const ESTADOS = {
  PENDIENTE_REVISION: { label: 'Pendiente de revisión', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  VALIDADA: { label: 'Validada', color: 'bg-green-100 text-green-700 border-green-200' },
  CONTABILIZADA: { label: 'Contabilizada', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  RECHAZADA: { label: 'Rechazada', color: 'bg-red-100 text-red-700 border-red-200' },
};

const IMPUTACIONES = [
  'Estructura', 'Operadora', 'Draxton', 'Comercial', 'Técnico', 
  'Administración', 'Marketing', 'I+D', 'Formación', 'Vehículos',
  'Dietas', 'Desplazamientos', 'Material oficina', 'Seguros'
];

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

  useEffect(() => {
    fetchFactura();
  }, [params.id]);

  async function fetchFactura() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finanzas/facturas/${params.id}`);
      const json = await res.json();
      if (json.factura) {
        setFactura(json.factura);
        setEditData(json.factura);
      }
    } catch (e) {
      console.error('Error:', e);
    }
    setLoading(false);
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
          imputacion: editData.imputacion,
          clienteImputado: editData.clienteImputado,
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
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          )}
        </div>
      </div>

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
                  <input
                    type="text"
                    value={editData.proveedor || ''}
                    onChange={e => setEditData({...editData, proveedor: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{factura.proveedor}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">CIF/NIF</label>
                {editing ? (
                  <input
                    type="text"
                    value={editData.cif || ''}
                    onChange={e => setEditData({...editData, cif: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{factura.cif || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Nº Factura</label>
                {editing ? (
                  <input
                    type="text"
                    value={editData.numFactura || ''}
                    onChange={e => setEditData({...editData, numFactura: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">{factura.numFactura || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Fecha emisión</label>
                {editing ? (
                  <input
                    type="date"
                    value={editData.fecha ? new Date(editData.fecha).toISOString().slice(0, 10) : ''}
                    onChange={e => setEditData({...editData, fecha: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
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
                  <input
                    type="number"
                    step="0.01"
                    value={editData.base || 0}
                    onChange={e => setEditData({...editData, base: parseFloat(e.target.value)})}
                    className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right"
                  />
                ) : (
                  <span className="text-sm font-medium">{formatEUR(factura.base)}</span>
                )}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  IVA ({editing ? (
                    <input
                      type="number"
                      step="0.5"
                      value={editData.tipoIva || 21}
                      onChange={e => setEditData({...editData, tipoIva: parseFloat(e.target.value)})}
                      className="w-14 px-2 py-0.5 border rounded text-xs text-center"
                    />
                  ) : (
                    `${factura.tipoIva}%`
                  )})
                </span>
                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editData.importeIva || 0}
                    onChange={e => setEditData({...editData, importeIva: parseFloat(e.target.value)})}
                    className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right"
                  />
                ) : (
                  <span className="text-sm font-medium text-green-700">+{formatEUR(factura.importeIva)}</span>
                )}
              </div>
              {(factura.tipoIrpf > 0 || factura.importeIrpf > 0 || editing) && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    IRPF ({editing ? (
                      <input
                        type="number"
                        step="0.5"
                        value={editData.tipoIrpf || 0}
                        onChange={e => setEditData({...editData, tipoIrpf: parseFloat(e.target.value)})}
                        className="w-14 px-2 py-0.5 border rounded text-xs text-center"
                      />
                    ) : (
                      `${factura.tipoIrpf}%`
                    )})
                  </span>
                  {editing ? (
                    <input
                      type="number"
                      step="0.01"
                      value={editData.importeIrpf || 0}
                      onChange={e => setEditData({...editData, importeIrpf: parseFloat(e.target.value)})}
                      className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right"
                    />
                  ) : (
                    <span className="text-sm font-medium text-red-600">-{formatEUR(factura.importeIrpf)}</span>
                  )}
                </div>
              )}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-sm font-semibold text-gray-900">TOTAL</span>
                {editing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editData.total || 0}
                    onChange={e => setEditData({...editData, total: parseFloat(e.target.value)})}
                    className="w-32 px-3 py-1.5 border rounded-lg text-sm text-right font-bold"
                  />
                ) : (
                  <span className="text-lg font-bold text-gray-900">{formatEUR(factura.total)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Clasificación e imputación */}
          <div className="bg-white rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Clasificación e imputación</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500">Concepto</label>
                {editing ? (
                  <textarea
                    value={editData.concepto || ''}
                    onChange={e => setEditData({...editData, concepto: e.target.value})}
                    rows={2}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{factura.concepto || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Imputación</label>
                {editing ? (
                  <select
                    value={editData.imputacion || ''}
                    onChange={e => setEditData({...editData, imputacion: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Sin imputar</option>
                    {IMPUTACIONES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                ) : (
                  <p className="text-sm font-medium text-gray-900 mt-1">
                    {factura.imputacion ? (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs">{factura.imputacion}</span>
                    ) : '—'}
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Departamento</label>
                {editing ? (
                  <select
                    value={editData.departamento || ''}
                    onChange={e => setEditData({...editData, departamento: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Sin asignar</option>
                    {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{factura.departamento || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Cliente imputado</label>
                {editing ? (
                  <input
                    type="text"
                    value={editData.clienteImputado || ''}
                    onChange={e => setEditData({...editData, clienteImputado: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                    placeholder="Nombre del cliente"
                  />
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{factura.clienteImputado || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-500">Forma de pago</label>
                {editing ? (
                  <select
                    value={editData.formaPago || ''}
                    onChange={e => setEditData({...editData, formaPago: e.target.value})}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
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
                    <input
                      type="checkbox"
                      checked={editData.deducibleIva ?? true}
                      onChange={e => setEditData({...editData, deducibleIva: e.target.checked})}
                      className="rounded border-gray-300"
                    />
                    <span className="ml-2 text-sm text-gray-600">Sí, deducible</span>
                  </div>
                ) : (
                  <p className="text-sm text-gray-900 mt-1">{factura.deducibleIva ? 'Sí' : 'No'}</p>
                )}
              </div>
            </div>
          </div>

          {/* Metadatos */}
          <div className="bg-gray-50 rounded-xl border p-5">
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Información del sistema</h2>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-500">Carpeta origen:</span>
                <span className="ml-2 font-medium">{factura.carpetaOrigen || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Archivo:</span>
                <span className="ml-2 font-medium truncate">{factura.archivoOneDrive || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">OCR:</span>
                <span className="ml-2 font-medium">
                  {factura.ocrCompletado ? (
                    <span className="text-green-600">Completado ({Math.round((factura.ocrConfianza || 0) * 100)}%)</span>
                  ) : (
                    <span className="text-amber-600">Pendiente</span>
                  )}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Confirming:</span>
                <span className="ml-2 font-medium">{factura.confirmingProveedor || '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Creada:</span>
                <span className="ml-2 font-medium">{new Date(factura.createdAt).toLocaleString('es-ES')}</span>
              </div>
              <div>
                <span className="text-gray-500">Actualizada:</span>
                <span className="ml-2 font-medium">{new Date(factura.updatedAt).toLocaleString('es-ES')}</span>
              </div>
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
        </div>

        {/* Columna derecha: PDF */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <h2 className="text-sm font-semibold text-gray-900">Documento original</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowPdf(!showPdf)}
                  className="text-xs px-3 py-1 border rounded-md hover:bg-gray-100"
                >
                  {showPdf ? 'Ocultar' : 'Mostrar'}
                </button>
                {factura.oneDriveItemId && (
                  <a
                    href={`/api/admin/finanzas/facturas/${factura.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Abrir en nueva pestaña
                  </a>
                )}
              </div>
            </div>
            {showPdf && factura.oneDriveItemId ? (
              <div className="w-full" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
                <iframe
                  src={`/api/admin/finanzas/facturas/${factura.id}/pdf`}
                  className="w-full h-full"
                  title="Factura PDF"
                />
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
    </div>
  );
}
