'use client'

import { useState, useEffect, Fragment } from 'react'
import { ClockIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon, CheckCircleIcon, ArrowTrendingDownIcon } from '@heroicons/react/24/outline'

interface DetallePersona {
  nombre: string;
  dedicacion: number;
  nivel: number;
  diasActivos: number;
  diasTotales: number;
  horasBase: number;
  horasEquiv: number;
  activo: boolean;
}

interface BalanceMes {
  mes: number;
  mesNombre: string;
  anio: number;
  horasComprometidas: number;
  horasCubiertas: number;
  horasEquivalentes: number;
  saldoMes: number;
  saldoAcumulado: number;
  diasLaborables: number;
  detalle: DetallePersona[];
}

interface ContratoBalance {
  contrato: {
    id: string;
    titulo: string;
    horasContratadas: number;
    nivelContratado: number;
    importeMensual: number;
  };
  meses: BalanceMes[];
  totalComprometidas: number;
  totalCubiertas: number;
  totalEquivalentes: number;
  saldoFinal: number;
}

export default function DraxtonSeguimientoPage() {
  const [data, setData] = useState<ContratoBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [expandedMeses, setExpandedMeses] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchBalance();
  }, [anio]);

  const fetchBalance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clientes/ggcc/draxton/seguimiento/balance-mensual?anio=${anio}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleMes = (key: string) => {
    setExpandedMeses(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const formatHoras = (h: number) => `${h >= 0 ? '' : ''}${h.toFixed(1)}h`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClockIcon className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Seguimiento de Contratos — Balance de Horas</h2>
              <p className="text-sm text-gray-500">Desglose mensual de horas comprometidas vs cubiertas por contrato</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={anio}
              onChange={e => setAnio(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value={2026}>2026</option>
              <option value={2025}>2025</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
        <strong>Cálculo:</strong> 1 persona al 100% = 128.67 h/mes netas (1544h/año descontando 22 días vacaciones ÷ 12 meses).
        Si la persona tiene nivel técnico superior al contratado, sus horas se multiplican (N2 = ×2, N3 = ×3).
        Los días parciales (altas/bajas a mitad de mes) se calculan proporcionalmente a los días laborables activos.
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando balance de horas...</div>
      ) : data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No hay contratos por horas activos.</div>
      ) : (
        data.map(item => (
          <div key={item.contrato.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Cabecera del contrato */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900">{item.contrato.titulo}</h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {item.contrato.horasContratadas}h/mes contratadas · Nivel {item.contrato.nivelContratado} · {item.contrato.importeMensual.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €/mes
                  </p>
                </div>
                <div className={`text-right px-4 py-2 rounded-lg ${item.saldoFinal >= 0 ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                  <div className="text-xs text-gray-500">Saldo Acumulado {anio}</div>
                  <div className={`text-lg font-bold ${item.saldoFinal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {item.saldoFinal >= 0 ? '+' : ''}{item.saldoFinal.toFixed(1)}h
                  </div>
                </div>
              </div>

              {/* KPIs resumen */}
              <div className="grid grid-cols-4 gap-4 mt-4">
                <div className="text-center">
                  <div className="text-xs text-gray-500">Comprometidas</div>
                  <div className="text-sm font-bold text-gray-900">{item.totalComprometidas.toFixed(0)}h</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Cubiertas (base)</div>
                  <div className="text-sm font-bold text-indigo-700">{item.totalCubiertas.toFixed(1)}h</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">Equivalentes (nivel)</div>
                  <div className="text-sm font-bold text-purple-700">{item.totalEquivalentes.toFixed(1)}h</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-gray-500">% Cobertura</div>
                  <div className={`text-sm font-bold ${item.totalEquivalentes >= item.totalComprometidas ? 'text-green-700' : 'text-red-700'}`}>
                    {item.totalComprometidas > 0 ? ((item.totalEquivalentes / item.totalComprometidas) * 100).toFixed(1) : 0}%
                  </div>
                </div>
              </div>
            </div>

            {/* Tabla mensual */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 w-8"></th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Mes</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Días Lab.</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Comprometidas</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Cubiertas</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Equivalentes</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo Mes</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Saldo Acumulado</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {item.meses.map(m => {
                    const key = `${item.contrato.id}-${m.mes}`;
                    const expanded = expandedMeses[key];
                    const isDeficit = m.saldoMes < -10;
                    const isSuperavit = m.saldoMes > 10;

                    return (
                      <Fragment key={m.mes}>
                        <tr
                          className={`cursor-pointer hover:bg-gray-50 ${isDeficit ? 'bg-red-50/50' : ''}`}
                          onClick={() => toggleMes(key)}
                        >
                          <td className="px-4 py-3">
                            {expanded ? (
                              <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                            ) : (
                              <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-900">{m.mesNombre}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{m.diasLaborables}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{m.horasComprometidas}h</td>
                          <td className="px-4 py-3 text-right text-indigo-700 font-medium">{m.horasCubiertas}h</td>
                          <td className="px-4 py-3 text-right text-purple-700 font-medium">{m.horasEquivalentes}h</td>
                          <td className={`px-4 py-3 text-right font-bold ${m.saldoMes >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {m.saldoMes >= 0 ? '+' : ''}{m.saldoMes}h
                          </td>
                          <td className={`px-4 py-3 text-right font-bold ${m.saldoAcumulado >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {m.saldoAcumulado >= 0 ? '+' : ''}{m.saldoAcumulado}h
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isDeficit ? (
                              <span className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                <ExclamationTriangleIcon className="w-3 h-3" /> Déficit
                              </span>
                            ) : isSuperavit ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                <CheckCircleIcon className="w-3 h-3" /> Over
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                                OK
                              </span>
                            )}
                          </td>
                        </tr>
                        {/* Detalle expandido */}
                        {expanded && (
                          <tr>
                            <td colSpan={9} className="px-6 py-3 bg-gray-50">
                              <div className="text-xs">
                                <div className="font-semibold text-gray-700 mb-2">Detalle de personal — {m.mesNombre} {m.anio}</div>
                                <table className="w-full">
                                  <thead>
                                    <tr className="text-gray-500">
                                      <th className="text-left py-1">Persona</th>
                                      <th className="text-center py-1">Dedicación</th>
                                      <th className="text-center py-1">Nivel</th>
                                      <th className="text-center py-1">Días Activos</th>
                                      <th className="text-right py-1">Horas Base</th>
                                      <th className="text-right py-1">Horas Equiv.</th>
                                      <th className="text-center py-1">Estado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {m.detalle.map((d, i) => (
                                      <tr key={i} className={`${!d.activo ? 'text-amber-700' : 'text-gray-700'}`}>
                                        <td className="py-1 font-medium">{d.nombre}</td>
                                        <td className="py-1 text-center">{d.dedicacion}%</td>
                                        <td className="py-1 text-center">N{d.nivel}</td>
                                        <td className="py-1 text-center">
                                          {d.diasActivos}/{d.diasTotales}
                                          {d.diasActivos < d.diasTotales && (
                                            <span className="ml-1 text-amber-600">⚠</span>
                                          )}
                                        </td>
                                        <td className="py-1 text-right">{d.horasBase}h</td>
                                        <td className="py-1 text-right font-medium">{d.horasEquiv}h</td>
                                        <td className="py-1 text-center">
                                          {d.activo ? (
                                            <span className="text-green-600">Completo</span>
                                          ) : d.diasActivos > 0 ? (
                                            <span className="text-amber-600">Parcial</span>
                                          ) : (
                                            <span className="text-red-600">Inactivo</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                  <tfoot className="border-t border-gray-200 font-semibold">
                                    <tr>
                                      <td className="py-1">TOTAL</td>
                                      <td></td>
                                      <td></td>
                                      <td></td>
                                      <td className="py-1 text-right">{m.horasCubiertas}h</td>
                                      <td className="py-1 text-right">{m.horasEquivalentes}h</td>
                                      <td></td>
                                    </tr>
                                  </tfoot>
                                </table>
                                {m.detalle.some(d => !d.activo) && (
                                  <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-amber-800">
                                    <ExclamationTriangleIcon className="w-3 h-3 inline mr-1" />
                                    Hay personal con cobertura parcial este mes. Los días no cubiertos generan déficit de horas.
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {/* Fila total */}
                  <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-gray-900">TOTAL {anio}</td>
                    <td className="px-4 py-3"></td>
                    <td className="px-4 py-3 text-right text-gray-900">{item.totalComprometidas.toFixed(0)}h</td>
                    <td className="px-4 py-3 text-right text-indigo-700">{item.totalCubiertas.toFixed(1)}h</td>
                    <td className="px-4 py-3 text-right text-purple-700">{item.totalEquivalentes.toFixed(1)}h</td>
                    <td className={`px-4 py-3 text-right ${item.saldoFinal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {item.saldoFinal >= 0 ? '+' : ''}{item.saldoFinal.toFixed(1)}h
                    </td>
                    <td className={`px-4 py-3 text-right ${item.saldoFinal >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {item.saldoFinal >= 0 ? '+' : ''}{item.saldoFinal.toFixed(1)}h
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.saldoFinal < -50 ? (
                        <ArrowTrendingDownIcon className="w-5 h-5 text-red-600 inline" />
                      ) : item.saldoFinal >= 0 ? (
                        <CheckCircleIcon className="w-5 h-5 text-green-600 inline" />
                      ) : (
                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 inline" />
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Nota explicativa si hay déficit */}
            {item.saldoFinal < 0 && (
              <div className="px-6 py-3 bg-red-50 border-t border-red-200">
                <div className="flex items-start gap-2 text-xs text-red-800">
                  <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>Déficit de {Math.abs(item.saldoFinal).toFixed(1)}h acumuladas.</strong> Se deben horas a Draxton.
                    Esto puede deberse a bajas de personal, periodos sin cobertura completa, o asignaciones parciales.
                    Valorar: asignar recurso adicional, compensar con horas extra, o renegociar condiciones.
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* Info de cálculo */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-500">
        <strong className="text-gray-700">Notas sobre el cálculo:</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li><strong>Horas comprometidas:</strong> horas/mes del contrato (lo que se factura)</li>
          <li><strong>Horas cubiertas (base):</strong> horas netas que cada persona aporta según su dedicación y días activos</li>
          <li><strong>Horas equivalentes (nivel):</strong> horas ajustadas por multiplicador de nivel técnico (N2=×2, N3=×3 respecto al nivel contratado)</li>
          <li><strong>Saldo:</strong> horas equivalentes − horas comprometidas. Positivo = over-delivery, Negativo = se deben horas</li>
          <li><strong>128.67h/mes:</strong> jornada completa neta (8h × 193 días laborables/año = 1544h ÷ 12 meses)</li>
        </ul>
      </div>
    </div>
  )
}
