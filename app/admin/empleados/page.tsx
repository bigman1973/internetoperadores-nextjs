'use client';

import { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
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
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';

const SalarySimulationPanel = dynamic(
  () => import('@/components/empleados/SalarySimulationPanel'),
  {
    ssr: false,
    loading: () => <div className="min-h-[420px] p-6 text-center text-sm text-gray-500">Cargando simulación salarial...</div>,
  },
);

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
  gastosDesplazamiento: number | null;
}

interface EntregaACuenta {
  id: string;
  importe: number;
  tipoEntrega: string | null;
  concepto: string | null;
  fechaOperacion: string;
}

interface CondicionSalarial {
  id: string;
  fechaEfectiva: string;
  brutoAnual: number;
  motivo: string | null;
  notas: string | null;
  creadoPor: string | null;
  createdAt: string;
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
  condicionesSalariales: CondicionSalarial[];
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

const MOTIVOS = [
  { value: 'incorporacion', label: 'Incorporación' },
  { value: 'subida_anual', label: 'Subida anual' },
  { value: 'promocion', label: 'Promoción' },
  { value: 'revision', label: 'Revisión' },
  { value: 'otro', label: 'Otro' },
];

const EUR_FORMATTER = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
const MADRID_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const MONTH_YEAR_DATE_FORMATTER = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' });

function getCondicionAlCierreAnual(emp: Empleado, anio: number, hoyMadrid: string): { condicion: CondicionSalarial; esFutura: boolean } | null {
  if (!emp.condicionesSalariales || emp.condicionesSalariales.length === 0) return null;
  const cierreEjercicio = `${anio}-12-31`;
  // La tabla anual representa la condición que estará vigente al cierre del ejercicio seleccionado.
  const condicion = emp.condicionesSalariales.find(c => c.fechaEfectiva.split('T')[0] <= cierreEjercicio) || null;
  return condicion ? { condicion, esFutura: condicion.fechaEfectiva.split('T')[0] > hoyMadrid } : null;
}

function getEmpleadoTotales(emp: Empleado) {
  if (!emp.nominas || emp.nominas.length === 0) return null;
  // If single month, return first nomina; if multi-month, sum all.
  if (emp.nominas.length === 1) return emp.nominas[0];

  return emp.nominas.reduce((totales, nomina) => ({
    devengadoTotal: totales.devengadoTotal + (nomina.devengadoTotal || 0),
    netoPercibir: totales.netoPercibir + (nomina.netoPercibir || 0),
    irpf: totales.irpf + (nomina.irpf || 0),
    ssTrabajador: totales.ssTrabajador + (nomina.ssTrabajador || 0),
    ssEmpresa: totales.ssEmpresa + (nomina.ssEmpresa || 0),
    costeTotalEmpresa: totales.costeTotalEmpresa + (nomina.costeTotalEmpresa || 0),
  }), {
    devengadoTotal: 0,
    netoPercibir: 0,
    irpf: 0,
    ssTrabajador: 0,
    ssEmpresa: 0,
    costeTotalEmpresa: 0,
  });
}

function getEntregasEmpleado(emp: Empleado) {
  return (emp.entregasACuenta || []).reduce((totales, entrega) => {
    const importe = Math.abs(entrega.importe || 0);
    if (entrega.tipoEntrega === 'coste_empresa') totales.costesEmpresa += importe;
    if (entrega.tipoEntrega === 'anticipo') totales.anticipos += importe;
    return totales;
  }, { costesEmpresa: 0, anticipos: 0 });
}

function getSalarioAnualSinDesplazamiento(emp: Empleado): { salarioAnual: number; meses: number; proyeccion12: number; desplazamientoTotal: number } | null {
  if (!emp.nominas || emp.nominas.length === 0) return null;

  const acumulado = emp.nominas.reduce((totales, nomina) => {
    const coste = nomina.costeTotalEmpresa || 0;
    const desplazamiento = nomina.gastosDesplazamiento || 0;
    totales.salarioAnual += coste - desplazamiento;
    totales.desplazamientoTotal += desplazamiento;
    return totales;
  }, { salarioAnual: 0, desplazamientoTotal: 0 });
  const meses = emp.nominas.length;

  return {
    salarioAnual: acumulado.salarioAnual,
    meses,
    proyeccion12: (acumulado.salarioAnual / meses) * 12,
    desplazamientoTotal: acumulado.desplazamientoTotal,
  };
}

function getBrutoTrabajadorAnual(emp: Empleado): { brutoAnual: number; mesUsado: number; anioUsado: number; proyeccion12: number } | null {
  if (!emp.nominas || emp.nominas.length === 0) return null;
  // Usar la nómina más reciente (último mes disponible) sin copiar ni ordenar el array recibido.
  const ultima = emp.nominas.reduce((masReciente, nomina) => (
    nomina.anio > masReciente.anio || (nomina.anio === masReciente.anio && nomina.mes > masReciente.mes)
      ? nomina
      : masReciente
  ));
  const devengadoMes = ultima.devengadoTotal || 0;
  return {
    brutoAnual: devengadoMes,
    mesUsado: ultima.mes,
    anioUsado: ultima.anio,
    proyeccion12: devengadoMes * 12,
  };
}

function getPeriodoLabel(periodo: Periodo, mesSeleccionado: number): string {
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
  return EUR_FORMATTER.format(val);
}

export default function AdminEmpleadosPage() {
  const { data: session } = useSession();
  const isSuperAdmin = session?.user?.role === 'SUPER_ADMIN';
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [periodo, setPeriodo] = useState<Periodo>('mes');
  const [mesSeleccionado, setMesSeleccionado] = useState(() => {
    // Por defecto mostrar el mes anterior (donde siempre habrá datos)
    const mesActual = new Date().getMonth() + 1; // 1-12
    return mesActual === 1 ? 12 : mesActual - 1;
  });
  const [anioSeleccionado] = useState(2026);
  // Condiciones salariales modal
  const [modalEmpleado, setModalEmpleado] = useState<Empleado | null>(null);

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
      const loadedEmployees: Empleado[] = data.empleados || [];
      setEmpleados(loadedEmployees);
      setModalEmpleado(current => current ? loadedEmployees.find(employee => employee.id === current.id) || null : null);
      setTotales(data.totales || null);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function eliminarCondicion(id: string) {
    if (!confirm('¿Eliminar esta condición salarial?')) return;
    try {
      await fetch(`/api/admin/empleados/condiciones-salariales?id=${id}`, { method: 'DELETE' });
      await fetchEmpleados();
    } catch (e) {
      console.error(e);
    }
  }

  const hoyMadrid = MADRID_DATE_FORMATTER.format(new Date());
  const employeeRows = useMemo(() => empleados.map(emp => {
    const datos = getEmpleadoTotales(emp);
    const entregas = getEntregasEmpleado(emp);
    const isAnnual = periodo === 'anual';

    return {
      emp,
      datos,
      entregas,
      costeTotalConExtras: (datos?.costeTotalEmpresa || 0) + entregas.costesEmpresa,
      bruto: isAnnual ? getBrutoTrabajadorAnual(emp) : null,
      condicionResumen: isAnnual ? getCondicionAlCierreAnual(emp, anioSeleccionado, hoyMadrid) : null,
      salarioAnual: isAnnual ? getSalarioAnualSinDesplazamiento(emp) : null,
    };
  }), [empleados, periodo, anioSeleccionado, hoyMadrid]);

  const annualTotals = useMemo(() => {
    if (periodo !== 'anual') return null;

    return employeeRows.reduce((totales, row) => ({
      brutoTrabajador: totales.brutoTrabajador + (row.bruto?.proyeccion12 || 0),
      brutoPactado: totales.brutoPactado + (row.condicionResumen?.condicion.brutoAnual || 0),
      costeEmpresa: totales.costeEmpresa + (row.salarioAnual?.proyeccion12 || 0),
    }), { brutoTrabajador: 0, brutoPactado: 0, costeEmpresa: 0 });
  }, [employeeRows, periodo]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Costes de Personal</h1>
          <p className="text-sm text-gray-500 mt-1">
            Costes, nóminas y KPIs de empleados — {getPeriodoLabel(periodo, mesSeleccionado)} {anioSeleccionado}
            {totales && totales.mesesConDatos > 0 && periodo !== 'mes' && (
              <span className="ml-2 text-blue-600">({totales.mesesConDatos} meses con datos)</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isSuperAdmin && (
            <Link
              href="/admin/empleados/escenarios-salariales"
              className="flex min-h-11 items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
            >
              <AdjustmentsHorizontalIcon className="h-4 w-4" />
              Escenarios salariales
            </Link>
          )}
          <Link
            href="/admin/empleados/nominas"
            className="flex min-h-11 items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            <CloudArrowUpIcon className="h-4 w-4" />
            Importar Nóminas
          </Link>
          <select
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value as Periodo)}
            className="min-h-11 px-3 py-2 border rounded-lg text-sm"
          >
            {PERIODOS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {periodo === 'mes' && (
            <select
              value={mesSeleccionado}
              onChange={(e) => setMesSeleccionado(parseInt(e.target.value))}
              className="min-h-11 px-3 py-2 border rounded-lg text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                <option key={m} value={m}>{MESES[m]} {anioSeleccionado}</option>
              ))}
            </select>
          )}
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="min-h-11 px-3 py-2 border rounded-lg text-sm"
          >
            <option value="todos">Todos</option>
            <option value="ACTIVO">Activos</option>
            <option value="BAJA">Baja</option>
          </select>
        </div>
      </div>

      {/* KPI Cards - 8 cards */}
      {totales ? (
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
      ) : loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:grid-cols-8" aria-label="Cargando indicadores de personal" role="status">
          {[0, 1, 2, 3, 4, 5, 6, 7].map(item => <div key={item} className="h-28 animate-pulse rounded-xl border bg-white" />)}
        </div>
      ) : null}

      {/* Fórmula verificación */}
      {totales && totales.totalCosteEmpresa > 0 ? (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
          <span className="font-semibold">Verificación:</span>{' '}
          Neto ({formatEur(totales.totalNeto)}) + IRPF ({formatEur(totales.totalIRPF)}) + SS Trab ({formatEur(totales.totalSSTrabajador)}) = Devengado ({formatEur(totales.totalDevengado)})
          {' | '}
          Devengado + SS Empresa ({formatEur(totales.totalSSEmpresa)}) + Otros costes ({formatEur(totales.totalOtrosCostesEmpresa)}) = <span className="font-bold">Coste Total ({formatEur(totales.totalCosteEmpresa)})</span>
        </div>
      ) : loading ? (
        <div className="h-[76px] animate-pulse rounded-xl border border-blue-100 bg-blue-50/60" aria-hidden="true" />
      ) : null}

      {/* Tabla de empleados */}
      <div className={`bg-white rounded-xl border overflow-hidden ${loading ? 'min-h-[560px]' : ''}`}>
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
                {periodo === 'anual' && (
                  <th className="text-right px-4 py-3 font-medium text-green-700">Bruto Trabajador<br/><span className="text-xs font-normal">(devengado)</span></th>
                )}
                {periodo === 'anual' && (
                  <th className="text-right px-4 py-3 font-medium text-orange-700">Bruto Pactado<br/><span className="text-xs font-normal">(condición)</span></th>
                )}
                {periodo === 'anual' && (
                  <th className="text-right px-4 py-3 font-medium text-blue-700">Coste Empresa<br/><span className="text-xs font-normal">(sin desplaz.)</span></th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={periodo === 'anual' ? 13 : 10} className="px-4 py-8 text-center text-gray-400">
                    Cargando...
                  </td>
                </tr>
              ) : empleados.length === 0 ? (
                <tr>
                  <td colSpan={periodo === 'anual' ? 13 : 10} className="px-4 py-8 text-center text-gray-400">
                    No hay empleados
                  </td>
                </tr>
              ) : (
                employeeRows.map(({ emp, datos, entregas, costeTotalConExtras, bruto, condicionResumen, salarioAnual }) => {
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
                      {periodo === 'anual' && (() => {
                        if (!bruto) return <td className="px-4 py-3 text-right text-gray-400">—</td>;
                        return (
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-green-700">{formatEur(bruto.proyeccion12)}</div>
                            <div className="text-xs text-gray-400">base {bruto.mesUsado}/{bruto.anioUsado}</div>
                          </td>
                        );
                      })()}
                      {periodo === 'anual' && (() => {
                        if (!condicionResumen) return (
                          <td className="px-4 py-3 text-right">
                            {isSuperAdmin ? (
                              <button
                                onClick={() => setModalEmpleado(emp)}
                                className="min-h-10 rounded-lg px-2 text-xs text-gray-500 underline hover:bg-orange-50 hover:text-orange-700"
                              >+ Simular</button>
                            ) : '—'}
                          </td>
                        );
                        const { condicion: cond, esFutura } = condicionResumen;
                        const desviacionNomina = bruto ? bruto.proyeccion12 - cond.brutoAnual : 0;
                        return (
                          <td className={`px-4 py-3 text-right ${isSuperAdmin ? 'cursor-pointer hover:bg-orange-50' : ''}`} onClick={() => { if (isSuperAdmin) setModalEmpleado(emp); }}>
                            <div className="flex flex-wrap items-center justify-end gap-1">
                              <span className="font-semibold text-orange-700">{formatEur(cond.brutoAnual)}</span>
                              {esFutura && <span className="rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">Próxima</span>}
                            </div>
                            <div className="text-xs text-gray-400">
                              {esFutura ? 'aplica' : 'vigente desde'} {MONTH_YEAR_DATE_FORMATTER.format(new Date(cond.fechaEfectiva))}
                            </div>
                            {isSuperAdmin && <div className="mt-1 text-xs font-semibold text-indigo-600">Simular cambio</div>}
                            {bruto && Math.abs(desviacionNomina) > 50 && (
                              <div className={`text-xs ${desviacionNomina > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                                {desviacionNomina > 0
                                  ? `Nómina ${formatEur(Math.abs(desviacionNomina))} sobre pactado`
                                  : `Pactado ${formatEur(Math.abs(desviacionNomina))} sobre nómina`}
                              </div>
                            )}
                          </td>
                        );
                      })()}
                      {periodo === 'anual' && (() => {
                        if (!salarioAnual) return <td className="px-4 py-3 text-right text-gray-400">—</td>;
                        return (
                          <td className="px-4 py-3 text-right">
                            <div className="font-semibold text-blue-700">{formatEur(salarioAnual.proyeccion12)}</div>
                            {salarioAnual.meses < 12 && (
                              <div className="text-xs text-gray-400">proy. {salarioAnual.meses} meses</div>
                            )}
                            {salarioAnual.desplazamientoTotal > 0 && (
                              <div className="text-xs text-orange-500">-{formatEur(salarioAnual.desplazamientoTotal)} desplaz.</div>
                            )}
                          </td>
                        );
                      })()}
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
                  {periodo === 'anual' && (
                    <td className="px-4 py-3 text-right text-green-800">
                      {formatEur(annualTotals?.brutoTrabajador)}
                    </td>
                  )}
                  {periodo === 'anual' && (
                    <td className="px-4 py-3 text-right text-orange-800">
                      {formatEur(annualTotals?.brutoPactado)}
                    </td>
                  )}
                  {periodo === 'anual' && (
                    <td className="px-4 py-3 text-right text-blue-800">
                      {formatEur(annualTotals?.costeEmpresa)}
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal Condiciones Salariales */}
      {modalEmpleado && isSuperAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4" onClick={() => setModalEmpleado(null)}>
          <div className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Simulación y condiciones salariales</h3>
                  <p className="text-sm text-gray-500">{modalEmpleado.nombreCompleto}</p>
                </div>
                <button onClick={() => setModalEmpleado(null)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
              </div>
            </div>

            <SalarySimulationPanel
              key={modalEmpleado.id}
              employee={modalEmpleado}
              motivos={MOTIVOS}
              onRegistered={async () => { await fetchEmpleados(); }}
              onDelete={eliminarCondicion}
            />
          </div>
        </div>
      )}
    </div>
  );
}
