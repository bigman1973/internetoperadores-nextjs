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
  BanknotesIcon,
  HandRaisedIcon,
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

interface EntregaACuenta {
  id: string;
  importe: number;
  tipoEntrega: string | null;
  concepto: string | null;
  fechaOperacion: string;
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
  entregasACuenta: EntregaACuenta[];
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
  totalOtrosCostesEmpresa: number;
  totalAnticipos: number;
  mesesConDatos: number;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type Periodo = 'mes' | 'T1' | 'T2' | 'T3' | 'T4' | 'anual';

const PERIODOS: { value: Periodo; label: string }[] = [
  { value: 'mes', label: 'Mes individual' },
  { value: 'T1', label: 'T1 (Ene-Mar)' },
  { value: 'T2', label: 'T2 (Abr-Jun)' },
  { value: 'T3', label: 'T3 (Jul-Sep)' },
  { value: 'T4', label: 'T4 (Oct-Dic)' },
  { value: 'anual', label: 'Acumulado Anual' },
];

export default function AdminEmpleadosPage() {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [mesSeleccionado, setMesSeleccionado] = useState(new Date().getMonth() + 1);
  const [anioSeleccionado] = useState(2026);

  useEffect(() => {
    fetchEmpleados();
  }, [filtroEstado, periodo, mesSeleccionado]);

  async function fetchEmpleados() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        estado: filtroEstado,
        anio: anioSeleccionado.toString(),
        periodo,
        ...(periodo === 'mes' ? { mes: mesSeleccionado.toString() } : {}),
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

  function getEmpleadoTotales(emp: Empleado) {
    if (!emp.nominas || emp.nominas.length === 0) return null;
    // If single month, return first nomina; if multi-month, sum all
    if (emp.nominas.length === 1) return emp.nominas[0];
    return {
      devengadoTotal: emp.nominas.reduce((s, n) => s + (n.devengadoTotal || 0), 0),
      netoPercibir: emp.nominas.reduce((s, n) => s + (n.netoPercibir || 0), 0),
      irpf: emp.nominas.reduce((s, n) => s + (n.irpf || 0), 0),
      ssTrabajador: emp.nominas.reduce((s, n) => s + (n.ssTrabajador || 0), 0),
      ssEmpresa: emp.nominas.reduce((s, n) => s + (n.ssEmpresa || 0), 0),
      costeTotalEmpresa: emp.nominas.reduce((s, n) => s + (n.costeTotalEmpresa || 0), 0),
    };
  }

  function getEntregasEmpleado(emp: Empleado) {
    const costesEmpresa = (emp.entregasACuenta || [])
      .filter(e => e.tipoEntrega === 'coste_empresa')
      .reduce((s, e) => s + Math.abs(e.importe || 0), 0);
    const anticipos = (emp.entregasACuenta || [])
      .filter(e => e.tipoEntrega === 'anticipo')
      .reduce((s, e) => s + Math.abs(e.importe || 0), 0);
    return { costesEmpresa, anticipos };
  }

  function getPeriodoLabel(): string {
    switch (periodo) {
      case 'T1': return 'T1 (Ene-Mar)';
      case 'T2': return 'T2 (Abr-Jun)';
      case 'T3': return 'T3 (Jul-Sep)';
      case 'T4': return 'T4 (Oct-Dic)';
      case 'anual': return 'Acumulado Anual';
      default: return MESES[mesSeleccionado];
    }
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
          <h1 className="text-2xl font-bold text-gray-900">Costes de Personal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Costes, nóminas y KPIs de empleados — {getPeriodoLabel()} {anioSeleccionado}
            {totales && totales.mesesConDatos > 0 && periodo !== 'mes' && (
              <span className="ml-2 text-blue-600">({totales.mesesConDatos} meses con datos)</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/empleados/nominas"
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <CloudArrowUpIcon className="h-4 w-4" />
            Importar Nóminas
          </Link>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="px-3 py-2 border rounded-lg text-sm"
          >
            {PERIODOS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {periodo === 'mes' && (
            <select
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(parseInt(e.target.value))}
              className="px-3 py-2 border rounded-lg text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{MESES[m]} {anioSeleccionado}</option>
              ))}
            </select>
          )}
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

      {/* KPI Cards - 8 cards */}
      {totales && (
        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-3">
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
            <p className="text-xs text-gray-400">{periodo === 'mes' ? 'nóminas + otros costes' : `acumulado ${totales.mesesConDatos} meses`}</p>
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

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-teal-50 rounded-lg">
                <BanknotesIcon className="h-4 w-4 text-teal-600" />
              </div>
              <p className="text-xs text-gray-500">Otros Costes</p>
            </div>
            <p className="text-xl font-bold text-teal-700">{formatEur(totales.totalOtrosCostesEmpresa)}</p>
            <p className="text-xs text-gray-400">SS autón., seguros</p>
          </div>

          <div className="bg-white rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 bg-amber-50 rounded-lg">
                <HandRaisedIcon className="h-4 w-4 text-amber-600" />
              </div>
              <p className="text-xs text-gray-500">Anticipos</p>
            </div>
            <p className="text-xl font-bold text-amber-700">{formatEur(totales.totalAnticipos)}</p>
            <p className="text-xs text-gray-400">no suma a costes</p>
          </div>
        </div>
      )}

      {/* Fórmula verificación */}
      {totales && totales.totalCosteEmpresa > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <span className="font-semibold">Verificación:</span>{' '}
          Neto ({formatEur(totales.totalNeto)}) + IRPF ({formatEur(totales.totalIRPF)}) + SS Trab ({formatEur(totales.totalSSTrabajador)}) = Devengado ({formatEur(totales.totalDevengado)})
          {' | '}
          Devengado + SS Empresa ({formatEur(totales.totalSSEmpresa)}) + Otros costes ({formatEur(totales.totalOtrosCostesEmpresa)}) = <span className="font-bold">Coste Total ({formatEur(totales.totalCosteEmpresa)})</span>
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
                <th className="text-right px-4 py-3 font-medium text-gray-600">SS Emp.</th>
                <th className="text-right px-4 py-3 font-medium text-teal-700">Otros Costes</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Coste Total</th>
                <th className="text-right px-4 py-3 font-medium text-amber-700">Anticipos</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">€/hora</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    Cargando...
                  </td>
                </tr>
              ) : empleados.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">
                    No hay empleados
                  </td>
                </tr>
              ) : (
                empleados.map((emp) => {
                  const datos = getEmpleadoTotales(emp);
                  const entregas = getEntregasEmpleado(emp);
                  const costeTotalConExtras = (datos?.costeTotalEmpresa || 0) + entregas.costesEmpresa;
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
                        {datos ? formatEur(datos.devengadoTotal) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700">
                        {datos ? formatEur(datos.netoPercibir) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-purple-700">
                        {datos?.ssEmpresa ? formatEur(datos.ssEmpresa) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-teal-700 font-medium">
                        {entregas.costesEmpresa > 0 ? formatEur(entregas.costesEmpresa) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {datos || entregas.costesEmpresa > 0 ? formatEur(costeTotalConExtras) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700">
                        {entregas.anticipos > 0 ? formatEur(entregas.anticipos) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-indigo-700 font-medium">
                        {emp.costeHoraActual ? `${emp.costeHoraActual.toFixed(2)} €` : '—'}
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
                  <td className="px-4 py-3 text-right text-purple-800">{formatEur(totales.totalSSEmpresa)}</td>
                  <td className="px-4 py-3 text-right text-teal-800">{formatEur(totales.totalOtrosCostesEmpresa)}</td>
                  <td className="px-4 py-3 text-right text-gray-900">{formatEur(totales.totalCosteEmpresa)}</td>
                  <td className="px-4 py-3 text-right text-amber-800">{formatEur(totales.totalAnticipos)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
