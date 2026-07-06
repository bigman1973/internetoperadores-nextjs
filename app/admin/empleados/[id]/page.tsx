'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  UserIcon,
  DocumentTextIcon,
  CurrencyEuroIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface Nomina {
  id: string;
  mes: number;
  anio: number;
  salarioBase: number | null;
  devengadoTotal: number;
  complementoEspecie: number | null;
  irpf: number | null;
  porcentajeIrpf: number | null;
  ssTrabajador: number | null;
  netoPercibir: number;
  baseIrpf: number | null;
  baseSS: number | null;
  ssEmpresa: number | null;
  ssTCI: number | null;
  costeTotalEmpresa: number | null;
  archivoUrl: string | null;
}

interface Proyecto {
  id: string;
  nombre: string;
  codigo: string | null;
}

interface Asignacion {
  id: string;
  rol: string | null;
  porcentaje: number | null;
  proyecto: Proyecto;
}

interface Empleado {
  id: string;
  codigoNomina: string | null;
  nombreCompleto: string;
  nif: string;
  email: string | null;
  departamento: string | null;
  categoria: string | null;
  estado: string;
  fechaAlta: string | null;
  fechaBaja: string | null;
  costeHoraActual: number | null;
  numAfiliacionSS: string | null;
  nominas: Nomina[];
  asignaciones: Asignacion[];
}

interface ResumenAnual {
  mesesRegistrados: number;
  totalCosteEmpresa: number;
  totalNeto: number;
  totalSSEmpresa: number;
  totalIRPF: number;
  promedioCosteEmpresaMensual: number;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function EmpleadoDetallePage() {
  const params = useParams();
  const router = useRouter();
  const [empleado, setEmpleado] = useState<Empleado | null>(null);
  const [resumenAnual, setResumenAnual] = useState<ResumenAnual | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) fetchEmpleado();
  }, [params.id]);

  async function fetchEmpleado() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/empleados/${params.id}`);
      if (!res.ok) throw new Error('No encontrado');
      const data = await res.json();
      setEmpleado(data.empleado);
      setResumenAnual(data.resumenAnual);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function formatEur(val: number | null | undefined): string {
    if (val === null || val === undefined) return '—';
    return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Cargando...</div>;
  }

  if (!empleado) {
    return <div className="flex items-center justify-center py-20 text-gray-400">Empleado no encontrado</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeftIcon className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{empleado.nombreCompleto}</h1>
          <p className="text-sm text-gray-500">
            {empleado.categoria} · {empleado.departamento} · NIF: {empleado.nif}
          </p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
          empleado.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' :
          empleado.estado === 'BAJA' ? 'bg-red-100 text-red-700' :
          'bg-yellow-100 text-yellow-700'
        }`}>
          {empleado.estado}
        </span>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <UserIcon className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Email</span>
          </div>
          <p className="text-sm font-medium text-gray-900">{empleado.email || 'Sin email'}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <ClockIcon className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Coste/Hora</span>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {empleado.costeHoraActual ? `${empleado.costeHoraActual.toFixed(2)} €/h` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <CurrencyEuroIcon className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Coste empresa promedio/mes</span>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {resumenAnual ? formatEur(resumenAnual.promedioCosteEmpresaMensual) : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-2">
            <DocumentTextIcon className="h-4 w-4 text-gray-400" />
            <span className="text-xs text-gray-500">Nóminas registradas (2026)</span>
          </div>
          <p className="text-sm font-medium text-gray-900">
            {resumenAnual?.mesesRegistrados || 0} meses
          </p>
        </div>
      </div>

      {/* Resumen anual */}
      {resumenAnual && resumenAnual.mesesRegistrados > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumen Anual 2026</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <p className="text-xs text-gray-500">Total Coste Empresa</p>
              <p className="text-lg font-bold text-gray-900">{formatEur(resumenAnual.totalCosteEmpresa)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total Neto</p>
              <p className="text-lg font-bold text-gray-900">{formatEur(resumenAnual.totalNeto)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total SS Empresa</p>
              <p className="text-lg font-bold text-gray-900">{formatEur(resumenAnual.totalSSEmpresa)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Total IRPF</p>
              <p className="text-lg font-bold text-gray-900">{formatEur(resumenAnual.totalIRPF)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Meses registrados</p>
              <p className="text-lg font-bold text-gray-900">{resumenAnual.mesesRegistrados}</p>
            </div>
          </div>
        </div>
      )}

      {/* Proyectos asignados */}
      {empleado.asignaciones.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Proyectos Asignados</h2>
          <div className="space-y-2">
            {empleado.asignaciones.map((asig) => (
              <div key={asig.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <span className="font-medium text-gray-900">{asig.proyecto.nombre}</span>
                  {asig.proyecto.codigo && (
                    <span className="ml-2 text-xs text-gray-500">({asig.proyecto.codigo})</span>
                  )}
                  {asig.rol && <span className="ml-2 text-xs text-blue-600">· {asig.rol}</span>}
                </div>
                <span className="text-sm text-gray-600">{asig.porcentaje}% dedicación</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historial de nóminas */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Historial de Nóminas</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Período</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Devengado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">IRPF</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">SS Trab.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Neto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">SS Empresa</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Coste Empresa</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {empleado.nominas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No hay nóminas registradas
                  </td>
                </tr>
              ) : (
                empleado.nominas.map((nom) => (
                  <tr key={nom.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {MESES[nom.mes]} {nom.anio}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatEur(nom.devengadoTotal)}</td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {nom.irpf ? `-${formatEur(nom.irpf)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-red-600">
                      {nom.ssTrabajador ? `-${formatEur(nom.ssTrabajador)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-green-700">{formatEur(nom.netoPercibir)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{formatEur(nom.ssEmpresa)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatEur(nom.costeTotalEmpresa)}</td>
                    <td className="px-4 py-3 text-center">
                      {nom.archivoUrl ? (
                        <a href={nom.archivoUrl} target="_blank" rel="noopener" className="text-orange-600 hover:underline">
                          <DocumentTextIcon className="h-4 w-4 inline" />
                        </a>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
