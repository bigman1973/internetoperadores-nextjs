'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  UsersIcon,
  CurrencyEuroIcon,
  ArrowTrendingUpIcon,
  BuildingOfficeIcon,
  ShieldCheckIcon,
  ReceiptPercentIcon,
  CloudArrowUpIcon,
} from '@heroicons/react/24/outline';

interface Nomina {
  id: string;
  mes: number;
  anio: number;
  devengadoTotal: number;
  netoPercibir: number;
  ssEmpresa: number | null;
  ssTrabajador: number | null;
  irpf: number | null;
  costeTotalEmpresa: number | null;
  complementoEspecie: number | null;
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
  costeHoraActual: number | null;
  nominas: Nomina[];
  _count: { imputaciones: number; asignaciones: number };
}

interface Totales {
  totalEmpleados: number;
  totalActivos: number;
  totalCosteEmpresa: number;
  totalDevengado: number;
  totalNeto: number;
  totalIRPF: number;
  totalSSTrabajador: number;
  totalSSEmpresa: number;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTO = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function AdminEmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [mesSeleccionado, setMesSeleccionado] = useState(5); // Mayo por defecto (último con datos)
  const [anioSeleccionado] = useState(2026);

  useEffect(() => {
    fetchEmpleados();
  }, [filtroEstado, mesSeleccionado]);

  async function fetchEmpleados() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        estado: filtroEstado,
        anio: anioSeleccionado.toString(),
        ...(mesSeleccionado > 0 ? { mes: mesSeleccionado.toString() } : {}),
      });
      const res = await fetch(`/api/admin/empleados?${params}`);
      const data = await res.json();
      setEmpleados(data.empleados || []);
      setTotales(data.totales || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function getUltimaNomina(emp: Empleado): Nomina | null {
    if (!emp.nominas || emp.nominas.length === 0) return null;
    return emp.nominas[0];
  }

  function formatEur(val: number | null | undefined): string {
    if (val === null || val === undefined) return '—';
    return val.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Personal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Costes, nóminas y KPIs de empleados — {mesSeleccionado > 0 ? MESES[mesSeleccionado] : 'Todos los meses'} {anioSeleccionado}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/empleados/nominas"
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <CloudArrowUpIcon className="h-4 w-4" />
            Importar Nóminas
          </Link>
          <select
            value={mesSeleccionado}
            onChange={(e) => setMesSeleccionado(parseInt(e.target.value))}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {[1, 2, 3, 4, 5].map(m => (
              <option key={m} value={m}>{MESES[m]} 2026</option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            <option value="todos">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="BAJA">Baja</option>
          </select>
        </div>
      </div>

      {/* KPI Cards - 6 cards en 2 filas */}
      {totales && (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-blue-50 rounded-lg">
                <UsersIcon className="h-4 w-4 text-blue-600" />
              </div>
              <p className="text-xs text-gray-500">Empleados</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{totales.totalActivos}</p>
            <p className="text-xs text-gray-400">activos</p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-red-50 rounded-lg">
                <CurrencyEuroIcon className="h-4 w-4 text-red-600" />
              </div>
              <p className="text-xs text-gray-500">Coste Empresa</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatEur(totales.totalCosteEmpresa)}</p>
            <p className="text-xs text-gray-400">bruto + SS empresa</p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-green-50 rounded-lg">
                <ArrowTrendingUpIcon className="h-4 w-4 text-green-600" />
              </div>
              <p className="text-xs text-gray-500">Neto Total</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatEur(totales.totalNeto)}</p>
            <p className="text-xs text-gray-400">líquido percibido</p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-orange-50 rounded-lg">
                <ReceiptPercentIcon className="h-4 w-4 text-orange-600" />
              </div>
              <p className="text-xs text-gray-500">IRPF</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatEur(totales.totalIRPF)}</p>
            <p className="text-xs text-gray-400">retención total</p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-yellow-50 rounded-lg">
                <ShieldCheckIcon className="h-4 w-4 text-yellow-600" />
              </div>
              <p className="text-xs text-gray-500">SS Trabajador</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatEur(totales.totalSSTrabajador)}</p>
            <p className="text-xs text-gray-400">cuota empleado</p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-purple-50 rounded-lg">
                <BuildingOfficeIcon className="h-4 w-4 text-purple-600" />
              </div>
              <p className="text-xs text-gray-500">SS Empresa</p>
            </div>
            <p className="text-xl font-bold text-gray-900">{formatEur(totales.totalSSEmpresa)}</p>
            <p className="text-xs text-gray-400">cuota patronal</p>
          </div>
        </div>
      )}

      {/* Fórmula verificación */}
      {totales && totales.totalCosteEmpresa > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <span className="font-semibold">Verificación:</span>{' '}
          Neto ({formatEur(totales.totalNeto)}) + IRPF ({formatEur(totales.totalIRPF)}) + SS Trab ({formatEur(totales.totalSSTrabajador)}) = Devengado ({formatEur(totales.totalDevengado)})
          {' | '}
          Devengado + SS Empresa ({formatEur(totales.totalSSEmpresa)}) = <span className="font-bold">Coste Total ({formatEur(totales.totalCosteEmpresa)})</span>
        </div>
      )}

      {/* Tabla de empleados */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Empleado</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Categoría</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Devengado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Neto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">IRPF</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">SS Trab.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">SS Emp.</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Coste Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    Cargando...
                  </td>
                </tr>
              ) : empleados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No hay empleados
                  </td>
                </tr>
              ) : (
                empleados.map((emp) => {
                  const nomina = getUltimaNomina(emp);
                  return (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/empleados/${emp.id}`} className="hover:text-orange-600">
                          <div className="font-medium text-gray-900">{emp.nombreCompleto}</div>
                          <div className="text-xs text-gray-500">{emp.email || emp.nif}</div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{emp.categoria || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          emp.estado === 'ACTIVO' ? 'bg-green-100 text-green-700' :
                          emp.estado === 'BAJA' ? 'bg-red-100 text-red-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>
                          {emp.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {nomina ? formatEur(nomina.devengadoTotal) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {nomina ? formatEur(nomina.netoPercibir) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-orange-700">
                        {nomina?.irpf ? formatEur(nomina.irpf) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-yellow-700">
                        {nomina?.ssTrabajador ? formatEur(nomina.ssTrabajador) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-purple-700">
                        {nomina?.ssEmpresa ? formatEur(nomina.ssEmpresa) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {nomina ? formatEur(nomina.costeTotalEmpresa) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!loading && empleados.length > 0 && totales && (
              <tfoot className="bg-gray-50 border-t font-semibold">
                <tr>
                  <td className="px-4 py-3 text-gray-900" colSpan={3}>TOTAL ({totales.totalActivos} activos)</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatEur(totales.totalDevengado)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatEur(totales.totalNeto)}</td>
                  <td className="px-4 py-3 text-right text-orange-800">{formatEur(totales.totalIRPF)}</td>
                  <td className="px-4 py-3 text-right text-yellow-800">{formatEur(totales.totalSSTrabajador)}</td>
                  <td className="px-4 py-3 text-right text-purple-800">{formatEur(totales.totalSSEmpresa)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatEur(totales.totalCosteEmpresa)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
