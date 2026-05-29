'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowTrendingUpIcon, ArrowTrendingDownIcon, ChartBarIcon, UsersIcon, BanknotesIcon, DocumentTextIcon } from '@heroicons/react/24/outline'

declare global {
  interface Window {
    Chart: any
  }
}

interface DatosMensuales {
  mes: number
  facturas: number
  total_sin_iva: number
  total_con_iva: number
  clientes_unicos: number
}

interface Totales {
  total_sin_iva: number
  total_con_iva: number
  facturas: number
  clientes: number
}

interface ClienteData {
  codigo_cliente: number
  nombre_cliente: string
  total_periodo: number
  total_anual?: number
  meses_activo: number
  meses: { mes: number; total: number }[]
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export default function EstadisticasClient() {
  const [tab, setTab] = useState<'mensual' | 'clientes' | 'categorias'>('mensual')
  const [loading, setLoading] = useState(true)
  const [datosMensual, setDatosMensual] = useState<any>(null)
  const [datosClientes, setDatosClientes] = useState<any>(null)
  const [datosCategorias, setDatosCategorias] = useState<any>(null)
  const [chartLoaded, setChartLoaded] = useState(false)
  
  const chartEvolucionRef = useRef<HTMLCanvasElement>(null)
  const chartFacturasRef = useRef<HTMLCanvasElement>(null)
  const chartClientesRef = useRef<HTMLCanvasElement>(null)
  const chartSegmentosRef = useRef<HTMLCanvasElement>(null)
  const chartsRef = useRef<any[]>([])

  // Cargar Chart.js
  useEffect(() => {
    if (typeof window !== 'undefined' && !window.Chart) {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
      script.onload = () => setChartLoaded(true)
      document.head.appendChild(script)
    } else {
      setChartLoaded(true)
    }
  }, [])

  const fetchData = async (tipo: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/estadisticas?tipo=${tipo}`)
      if (!res.ok) throw new Error('Error')
      const data = await res.json()
      if (tipo === 'mensual') setDatosMensual(data)
      if (tipo === 'clientes') setDatosClientes(data)
      if (tipo === 'categorias') setDatosCategorias(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData(tab) }, [tab])

  // Destruir charts anteriores
  const destroyCharts = () => {
    chartsRef.current.forEach(c => c?.destroy())
    chartsRef.current = []
  }

  // Renderizar gráficos mensuales
  useEffect(() => {
    if (!chartLoaded || !datosMensual || tab !== 'mensual') return
    destroyCharts()

    const Chart = window.Chart
    const { datos2025, datos2026 } = datosMensual

    // Gráfico evolución facturación
    if (chartEvolucionRef.current) {
      const ctx = chartEvolucionRef.current.getContext('2d')
      const chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: MESES,
          datasets: [
            {
              label: '2025 (sin IVA)',
              data: MESES.map((_, i) => {
                const d = datos2025.find((m: any) => m.mes === i + 1)
                return d ? d.total_sin_iva : null
              }),
              borderColor: '#6b7280',
              backgroundColor: 'rgba(107, 114, 128, 0.1)',
              borderWidth: 2,
              tension: 0.3,
              fill: true
            },
            {
              label: '2026 (sin IVA)',
              data: MESES.map((_, i) => {
                const d = datos2026.find((m: any) => m.mes === i + 1)
                return d ? d.total_sin_iva : null
              }),
              borderColor: '#f97316',
              backgroundColor: 'rgba(249, 115, 22, 0.1)',
              borderWidth: 3,
              tension: 0.3,
              fill: true
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Facturación Mensual (Base Imponible)', font: { size: 14 } }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v: number) => v >= 1000 ? (v/1000).toFixed(0) + 'K €' : v + ' €' }
            }
          }
        }
      })
      chartsRef.current.push(chart)
    }

    // Gráfico nº facturas
    if (chartFacturasRef.current) {
      const ctx = chartFacturasRef.current.getContext('2d')
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: MESES,
          datasets: [
            {
              label: '2025',
              data: MESES.map((_, i) => {
                const d = datos2025.find((m: any) => m.mes === i + 1)
                return d ? d.facturas : 0
              }),
              backgroundColor: 'rgba(107, 114, 128, 0.6)',
              borderColor: '#6b7280',
              borderWidth: 1
            },
            {
              label: '2026',
              data: MESES.map((_, i) => {
                const d = datos2026.find((m: any) => m.mes === i + 1)
                return d ? d.facturas : 0
              }),
              backgroundColor: 'rgba(249, 115, 22, 0.6)',
              borderColor: '#f97316',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: 'Número de Facturas por Mes', font: { size: 14 } }
          },
          scales: { y: { beginAtZero: true } }
        }
      })
      chartsRef.current.push(chart)
    }
  }, [chartLoaded, datosMensual, tab])

  // Renderizar gráfico clientes
  useEffect(() => {
    if (!chartLoaded || !datosClientes || tab !== 'clientes') return
    destroyCharts()

    const Chart = window.Chart
    const { clientes2025, clientes2026, periodoComparado } = datosClientes

    if (chartClientesRef.current && clientes2025.length > 0) {
      const ctx = chartClientesRef.current.getContext('2d')
      const topN = clientes2025.slice(0, 10)
      const labels = topN.map((c: ClienteData) => c.nombre_cliente.length > 25 ? c.nombre_cliente.slice(0, 25) + '...' : c.nombre_cliente)
      
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label: `2025 (${periodoComparado})`,
              data: topN.map((c: ClienteData) => c.total_periodo),
              backgroundColor: 'rgba(107, 114, 128, 0.6)',
              borderColor: '#6b7280',
              borderWidth: 1
            },
            {
              label: `2026 (${periodoComparado})`,
              data: topN.map((c: ClienteData) => {
                const c26 = clientes2026.find((x: ClienteData) => x.codigo_cliente === c.codigo_cliente)
                return c26 ? c26.total_periodo : 0
              }),
              backgroundColor: 'rgba(249, 115, 22, 0.6)',
              borderColor: '#f97316',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: `Top 10 Clientes: Mismo período (${periodoComparado})`, font: { size: 14 } }
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { callback: (v: number) => v >= 1000 ? (v/1000).toFixed(0) + 'K €' : v + ' €' }
            }
          }
        }
      })
      chartsRef.current.push(chart)
    }
  }, [chartLoaded, datosClientes, tab])

  // Renderizar gráfico categorías/segmentos
  useEffect(() => {
    if (!chartLoaded || !datosCategorias || tab !== 'categorias') return
    destroyCharts()

    const Chart = window.Chart
    const { distribucion2025, distribucion2026, periodoComparado } = datosCategorias

    if (chartSegmentosRef.current) {
      const ctx = chartSegmentosRef.current.getContext('2d')
      const segmentos = ['Grandes Cuentas (>50K)', 'Medianas (10K-50K)', 'Pequeñas (2K-10K)', 'Micro (<2K)']
      
      const chart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: segmentos.map(s => s.replace(' (>50K)', '').replace(' (10K-50K)', '').replace(' (2K-10K)', '').replace(' (<2K)', '')),
          datasets: [
            {
              label: `2025 (${periodoComparado})`,
              data: segmentos.map(s => {
                const d = distribucion2025.find((x: any) => x.segmento === s)
                return d ? d.total_segmento : 0
              }),
              backgroundColor: 'rgba(107, 114, 128, 0.6)',
              borderColor: '#6b7280',
              borderWidth: 1
            },
            {
              label: `2026 (${periodoComparado})`,
              data: segmentos.map(s => {
                const d = distribucion2026.find((x: any) => x.segmento === s)
                return d ? d.total_segmento : 0
              }),
              backgroundColor: 'rgba(249, 115, 22, 0.6)',
              borderColor: '#f97316',
              borderWidth: 1
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top' },
            title: { display: true, text: `Facturación por Segmento - Mismo período (${periodoComparado})`, font: { size: 14 } }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { callback: (v: number) => v >= 1000 ? (v/1000).toFixed(0) + 'K €' : v + ' €' }
            }
          }
        }
      })
      chartsRef.current.push(chart)
    }
  }, [chartLoaded, datosCategorias, tab])

  const formatEur = (n: number) => n?.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
  
  const calcVariacion = (actual: number, anterior: number) => {
    if (!anterior) return null
    return ((actual - anterior) / anterior * 100).toFixed(1)
  }

  // Obtener último mes dinámicamente
  const ultimoMes = datosMensual?.ultimoMes2026 || 4
  const mesEnCurso = datosMensual?.mesEnCurso || 5
  const primerMes2025 = datosMensual?.primerMes2025 || 1
  const periodoComparadoMensual = datosMensual?.periodoComparado || `${MESES[0]} - ${MESES[ultimoMes - 1]}`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Estadísticas de Facturación</h1>
        <p className="mt-1 text-sm text-gray-500">Comparativa interanual 2025 vs 2026 — Meses cerrados ({periodoComparadoMensual})</p>
        <p className="mt-0.5 text-xs text-amber-600">* {MESES[mesEnCurso - 1]} 2026 en curso (datos parciales, no incluido en la comparativa)</p>
      </div>

      {/* KPIs */}
      {datosMensual && (() => {
        const acumulado2026 = datosMensual.totales.año2026?.total_sin_iva || 0
        const facturas2026 = datosMensual.totales.año2026?.facturas || 0
        const proyeccion2026 = ultimoMes > 0 ? acumulado2026 * (12 / ultimoMes) : 0
        const total2025 = datosMensual.totales.año2025?.total_sin_iva || 0
        const facturas2025 = datosMensual.totales.año2025?.facturas || 0
        const varProyeccion = total2025 > 0 ? ((proyeccion2026 - total2025) / total2025 * 100).toFixed(1) : null
        // Ticket medio
        const ticketMedio2025 = facturas2025 > 0 ? total2025 / facturas2025 : 0
        const ticketMedio2026 = facturas2026 > 0 ? acumulado2026 / facturas2026 : 0
        const varTicket = ticketMedio2025 > 0 ? ((ticketMedio2026 - ticketMedio2025) / ticketMedio2025 * 100).toFixed(1) : null
        return (
        <>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <KPICard
            icon={<BanknotesIcon className="h-6 w-6 text-orange-600" />}
            label={`Facturación 2026 (${periodoComparadoMensual})`}
            value={formatEur(acumulado2026)}
            variacion={calcVariacion(
              acumulado2026,
              datosMensual.totales.año2025MismoPeriodo?.total_sin_iva || 0
            )}
            subtext={`vs ${periodoComparadoMensual} 2025`}
          />
          <KPICard
            icon={<ArrowTrendingUpIcon className="h-6 w-6 text-emerald-600" />}
            label="Proyección 2026 (año)"
            value={formatEur(proyeccion2026)}
            variacion={varProyeccion}
            subtext={`vs ${formatEur(total2025)} en 2025`}
          />
          <KPICard
            icon={<DocumentTextIcon className="h-6 w-6 text-blue-600" />}
            label={`Facturas 2026 (${periodoComparadoMensual})`}
            value={(facturas2026).toLocaleString()}
            variacion={calcVariacion(
              facturas2026,
              datosMensual.totales.año2025MismoPeriodo?.facturas || 0
            )}
            subtext={`vs ${periodoComparadoMensual} 2025`}
          />
          <KPICard
            icon={<UsersIcon className="h-6 w-6 text-green-600" />}
            label="Clientes 2026"
            value={(datosMensual.totales.año2026?.clientes || 0).toLocaleString()}
            variacion={calcVariacion(
              datosMensual.totales.año2026?.clientes || 0,
              datosMensual.totales.año2025MismoPeriodo?.clientes || 0
            )}
            subtext={`vs ${datosMensual.totales.año2025MismoPeriodo?.clientes || 0} en mismo período 2025`}
          />
          <KPICard
            icon={<ChartBarIcon className="h-6 w-6 text-purple-600" />}
            label="Total 2025 (año completo)"
            value={formatEur(total2025)}
            variacion={null}
            subtext="11 meses (feb-dic)"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <KPICard
            icon={<BanknotesIcon className="h-6 w-6 text-amber-600" />}
            label="Ticket Medio 2025 (año)"
            value={formatEur(ticketMedio2025)}
            variacion={null}
            subtext={`${facturas2025.toLocaleString()} facturas`}
          />
          <KPICard
            icon={<BanknotesIcon className="h-6 w-6 text-amber-600" />}
            label={`Ticket Medio 2026 (${MESES[0]}-${MESES[ultimoMes - 1]})`}
            value={formatEur(ticketMedio2026)}
            variacion={varTicket}
            subtext={`vs ${formatEur(ticketMedio2025)} en 2025`}
          />
        </div>
        </>
        )
      })()}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-6">
          {[
            { key: 'mensual', label: 'Evolución Mensual' },
            { key: 'clientes', label: 'Por Cliente' },
            { key: 'categorias', label: 'Por Segmento' }
          ].map(t => (
            <button key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenido */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Cargando datos...</div>
      ) : (
        <>
          {/* TAB MENSUAL */}
          {tab === 'mensual' && datosMensual && (
            <div className="space-y-6">
              {/* Gráfico evolución */}
              <div className="rounded-lg bg-white shadow border border-gray-200 p-6">
                <div style={{ height: '350px' }}>
                  <canvas ref={chartEvolucionRef}></canvas>
                </div>
              </div>

              {/* Gráfico facturas */}
              <div className="rounded-lg bg-white shadow border border-gray-200 p-6">
                <div style={{ height: '300px' }}>
                  <canvas ref={chartFacturasRef}></canvas>
                </div>
              </div>

              {/* Tabla detalle */}
              <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Mes</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">2025 (Base)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">2026 (Base)</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Variación</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Fact. 2025</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Fact. 2026</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {MESES.map((mes, i) => {
                      const d25 = datosMensual.datos2025.find((m: any) => m.mes === i + 1)
                      const d26 = datosMensual.datos2026.find((m: any) => m.mes === i + 1)
                      const esMesEnCurso = i + 1 === mesEnCurso
                      const var_pct = d25 && d26 && !esMesEnCurso ? ((d26.total_sin_iva - d25.total_sin_iva) / d25.total_sin_iva * 100).toFixed(1) : null
                      return (
                        <tr key={i} className={`${!d25 && !d26 ? 'opacity-30' : ''} ${esMesEnCurso ? 'bg-amber-50' : ''}`}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">
                            {mes}
                            {esMesEnCurso && <span className="ml-2 text-xs text-amber-600 font-normal">(en curso)</span>}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{d25 ? formatEur(d25.total_sin_iva) : '-'}</td>
                          <td className={`px-4 py-2 text-sm text-right ${esMesEnCurso ? 'text-amber-600 italic' : 'text-gray-700'}`}>{d26 ? formatEur(d26.total_sin_iva) : '-'}</td>
                          <td className="px-4 py-2 text-sm text-right">
                            {esMesEnCurso ? (
                              <span className="text-xs text-amber-600">parcial</span>
                            ) : var_pct ? (
                              <span className={`inline-flex items-center gap-0.5 font-medium ${parseFloat(var_pct) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {parseFloat(var_pct) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(var_pct))}%
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-500">{d25 ? d25.facturas : '-'}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-500">{d26 ? d26.facturas : '-'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CLIENTES */}
          {tab === 'clientes' && datosClientes && (
            <div className="space-y-6">
              {/* Indicador de período */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <p className="text-sm text-blue-800">
                  <strong>Comparativa justa:</strong> Solo se comparan meses cerrados ({datosClientes.periodoComparado}) en ambos años. {MESES[(datosClientes.mesEnCurso || 5) - 1]} está en curso y no se incluye.
                </p>
              </div>

              {/* Gráfico */}
              <div className="rounded-lg bg-white shadow border border-gray-200 p-6">
                <div style={{ height: '450px' }}>
                  <canvas ref={chartClientesRef}></canvas>
                </div>
              </div>

              {/* Tabla detalle clientes */}
              <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Cliente</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">2025 ({datosClientes.periodoComparado})</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">2026 ({datosClientes.periodoComparado})</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Var. Real</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">2025 Total</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Proy. 2026</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Var. Proy.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {datosClientes.clientes2025.slice(0, 20).map((c: ClienteData) => {
                      const c26 = datosClientes.clientes2026.find((x: ClienteData) => x.codigo_cliente === c.codigo_cliente)
                      const total26 = c26 ? c26.total_periodo : 0
                      const variacionReal = c.total_periodo > 0 ? ((total26 - c.total_periodo) / c.total_periodo * 100).toFixed(1) : null
                      // Total anual 2025
                      const anual25 = datosClientes.totalAnual2025?.find((x: any) => x.codigo_cliente === c.codigo_cliente)
                      const totalAnual25 = anual25 ? anual25.total_anual : c.total_periodo
                      // Proyección 2026: extrapolar al año completo
                      const mesesDatos = datosClientes.ultimoMes2026 || 5
                      const proyeccion26 = total26 * (12 / mesesDatos)
                      const variacionProy = totalAnual25 > 0 ? ((proyeccion26 - totalAnual25) / totalAnual25 * 100).toFixed(1) : null
                      return (
                        <tr key={c.codigo_cliente}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">{c.nombre_cliente}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{formatEur(c.total_periodo)}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{formatEur(total26)}</td>
                          <td className="px-4 py-2 text-sm text-right">
                            {variacionReal ? (
                              <span className={`font-medium ${parseFloat(variacionReal) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {parseFloat(variacionReal) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(variacionReal))}%
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-gray-500">{formatEur(totalAnual25)}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-500 italic">{formatEur(proyeccion26)}</td>
                          <td className="px-4 py-2 text-sm text-right">
                            {variacionProy ? (
                              <span className={`font-medium ${parseFloat(variacionProy) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {parseFloat(variacionProy) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(variacionProy))}%
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB CATEGORÍAS/SEGMENTOS */}
          {tab === 'categorias' && datosCategorias && (
            <div className="space-y-6">
              {/* Indicador de período */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <p className="text-sm text-blue-800">
                  <strong>Comparativa justa:</strong> Solo se comparan meses cerrados ({datosCategorias.periodoComparado}) en ambos años. {MESES[(datosCategorias.mesEnCurso || 5) - 1]} está en curso y no se incluye.
                </p>
              </div>

              {/* Gráfico */}
              <div className="rounded-lg bg-white shadow border border-gray-200 p-6">
                <div style={{ height: '350px' }}>
                  <canvas ref={chartSegmentosRef}></canvas>
                </div>
              </div>

              {/* Tabla distribución */}
              <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
                <div className="px-4 py-3 bg-gray-50 border-b">
                  <h3 className="text-sm font-semibold text-gray-700">Distribución por Segmento — Período {datosCategorias.periodoComparado}</h3>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Segmento</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Clientes 2025</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total 2025</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Clientes 2026</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total 2026</th>
                      <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Variación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {datosCategorias.distribucion2025.map((seg: any) => {
                      const seg26 = datosCategorias.distribucion2026.find((s: any) => s.segmento === seg.segmento)
                      const total26 = seg26 ? seg26.total_segmento : 0
                      const variacion = seg.total_segmento > 0 ? ((total26 - seg.total_segmento) / seg.total_segmento * 100).toFixed(1) : null
                      return (
                        <tr key={seg.segmento}>
                          <td className="px-4 py-2 text-sm font-medium text-gray-900">{seg.segmento}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{seg.num_clientes}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{formatEur(seg.total_segmento)}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{seg26 ? seg26.num_clientes : 0}</td>
                          <td className="px-4 py-2 text-sm text-right text-gray-700">{seg26 ? formatEur(seg26.total_segmento) : '-'}</td>
                          <td className="px-4 py-2 text-sm text-right">
                            {variacion ? (
                              <span className={`font-medium ${parseFloat(variacion) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {parseFloat(variacion) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(variacion))}%
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// Componente KPI
function KPICard({ icon, label, value, variacion, subtext }: { icon: React.ReactNode, label: string, value: string, variacion: string | null, subtext: string }) {
  return (
    <div className="rounded-lg bg-white shadow border border-gray-200 p-4">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 rounded-lg bg-gray-50 p-2">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500 truncate">{label}</p>
          <p className="text-lg font-bold text-gray-900">{value}</p>
          <div className="flex items-center gap-2">
            {variacion && (
              <span className={`text-xs font-medium ${parseFloat(variacion) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {parseFloat(variacion) >= 0 ? '↑' : '↓'} {Math.abs(parseFloat(variacion))}%
              </span>
            )}
            <span className="text-xs text-gray-400">{subtext}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
