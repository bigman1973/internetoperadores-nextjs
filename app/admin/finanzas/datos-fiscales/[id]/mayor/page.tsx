'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArrowLeftIcon, DocumentTextIcon, BanknotesIcon, DocumentDuplicateIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';

interface LineaMayor {
  tipo: 'movimiento' | 'factura_recibida' | 'factura_emitida';
  id: string;
  fecha: string;
  concepto: string;
  debe: number;
  haber: number;
  saldo: number;
  conciliado: boolean;
  vinculadoA: string | null;
  banco: string | null;
}

interface MayorData {
  entidad: {
    id: string;
    razonSocial: string;
    nifCif: string | null;
    tipo: string;
    cuentaContableA3: string | null;
  };
  anio: number;
  lineas: LineaMayor[];
  resumen: {
    totalDebe: number;
    totalHaber: number;
    saldoFinal: number;
    numLineas: number;
    numMovimientos: number;
    numFacturasRecibidas: number;
    numFacturasEmitidas: number;
  };
}

export default function MayorContablePage() {
  const params = useParams();
  const id = params?.id as string;
  const [data, setData] = useState<MayorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear());

  useEffect(() => {
    if (id) fetchMayor();
  }, [id, anio]);

  async function fetchMayor() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/finanzas/datos-fiscales/${id}/mayor?anio=${anio}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Cargando mayor contable...</div>;
  }

  if (!data) {
    return <div className="p-6 text-center text-red-500">Error al cargar datos</div>;
  }

  return (
    <div className="p-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href="/admin/finanzas/datos-fiscales" className="text-gray-400 hover:text-gray-600">
            <ArrowLeftIcon className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Mayor Contable</h1>
            <p className="text-sm text-gray-600">
              {data.entidad.razonSocial}
              {data.entidad.nifCif && <span className="ml-2 text-gray-400">({data.entidad.nifCif})</span>}
              {data.entidad.cuentaContableA3 && <span className="ml-2 text-purple-600">Cta: {data.entidad.cuentaContableA3}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={anio}
            onChange={(e) => setAnio(parseInt(e.target.value))}
            className="px-3 py-1.5 border rounded-lg text-sm text-gray-900 bg-white"
          >
            {[2024, 2025, 2026].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-blue-600 font-medium">Total Debe</p>
          <p className="text-lg font-bold text-blue-800">{data.resumen.totalDebe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
          <p className="text-xs text-blue-500">{data.resumen.numFacturasRecibidas + data.resumen.numFacturasEmitidas} facturas</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-green-600 font-medium">Total Haber</p>
          <p className="text-lg font-bold text-green-800">{data.resumen.totalHaber.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€</p>
          <p className="text-xs text-green-500">{data.resumen.numMovimientos} pagos/cobros</p>
        </div>
        <div className={`border rounded-lg p-3 ${data.resumen.saldoFinal >= 0 ? 'bg-orange-50 border-orange-200' : 'bg-emerald-50 border-emerald-200'}`}>
          <p className={`text-xs font-medium ${data.resumen.saldoFinal >= 0 ? 'text-orange-600' : 'text-emerald-600'}`}>Saldo</p>
          <p className={`text-lg font-bold ${data.resumen.saldoFinal >= 0 ? 'text-orange-800' : 'text-emerald-800'}`}>
            {data.resumen.saldoFinal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}€
          </p>
          <p className={`text-xs ${data.resumen.saldoFinal >= 0 ? 'text-orange-500' : 'text-emerald-500'}`}>
            {data.resumen.saldoFinal >= 0 ? 'Pendiente de pago' : 'A favor'}
          </p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-xs text-gray-600 font-medium">Apuntes</p>
          <p className="text-lg font-bold text-gray-800">{data.resumen.numLineas}</p>
          <p className="text-xs text-gray-500">en {anio}</p>
        </div>
      </div>

      {/* Tabla Mayor */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 w-10">Tipo</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 w-24">Fecha</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600">Concepto</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Debe</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Haber</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 w-28">Saldo</th>
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 w-16">Estado</th>
            </tr>
          </thead>
          <tbody>
            {data.lineas.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No hay movimientos ni facturas en {anio}
                </td>
              </tr>
            ) : (
              data.lineas.map((linea, idx) => (
                <tr key={`${linea.tipo}-${linea.id}-${idx}`} className={`border-b hover:bg-gray-50 ${
                  linea.tipo === 'factura_recibida' ? 'bg-blue-50/30' :
                  linea.tipo === 'factura_emitida' ? 'bg-amber-50/30' :
                  ''
                }`}>
                  <td className="px-3 py-2">
                    {linea.tipo === 'movimiento' && <BanknotesIcon className="w-4 h-4 text-green-600" title="Movimiento bancario" />}
                    {linea.tipo === 'factura_recibida' && <DocumentTextIcon className="w-4 h-4 text-blue-600" title="Factura recibida" />}
                    {linea.tipo === 'factura_emitida' && <DocumentDuplicateIcon className="w-4 h-4 text-amber-600" title="Factura emitida" />}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                    {linea.fecha ? new Date(linea.fecha).toLocaleDateString('es-ES') : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-xs text-gray-800 truncate max-w-[400px]">{linea.concepto}</p>
                    {linea.vinculadoA && (
                      <span className="text-[10px] text-purple-600">↔ {linea.vinculadoA}</span>
                    )}
                    {linea.banco && (
                      <span className="text-[10px] text-gray-400 ml-2">{linea.banco}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono">
                    {linea.debe > 0 ? (
                      <span className="text-blue-700">{linea.debe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                    ) : ''}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-mono">
                    {linea.haber > 0 ? (
                      <span className="text-green-700">{linea.haber.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                    ) : ''}
                  </td>
                  <td className={`px-3 py-2 text-right text-xs font-mono font-semibold ${linea.saldo >= 0 ? 'text-orange-700' : 'text-emerald-700'}`}>
                    {linea.saldo.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {linea.conciliado ? (
                      <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Conciliado"></span>
                    ) : (
                      <span className="inline-block w-2 h-2 rounded-full bg-orange-400" title="Pendiente"></span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {data.lineas.length > 0 && (
            <tfoot className="bg-gray-100 font-semibold">
              <tr>
                <td colSpan={3} className="px-3 py-2 text-xs text-gray-700">TOTALES</td>
                <td className="px-3 py-2 text-right text-xs font-mono text-blue-800">
                  {data.resumen.totalDebe.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                </td>
                <td className="px-3 py-2 text-right text-xs font-mono text-green-800">
                  {data.resumen.totalHaber.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                </td>
                <td className={`px-3 py-2 text-right text-xs font-mono ${data.resumen.saldoFinal >= 0 ? 'text-orange-800' : 'text-emerald-800'}`}>
                  {data.resumen.saldoFinal.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
