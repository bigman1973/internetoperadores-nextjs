'use client'

import { useState, useEffect } from 'react'

const TIPOS_EXPORTACION = [
  { value: 'facturas_emitidas', label: 'Facturas Emitidas', icon: '📤', diario: 'VENTAS' },
  { value: 'facturas_recibidas', label: 'Facturas Recibidas', icon: '📥', diario: 'COMPRAS' },
  { value: 'gastos', label: 'Gastos / Tickets', icon: '🧾', diario: 'GASTOS' },
  { value: 'nominas', label: 'Nóminas', icon: '💰', diario: 'NOMINAS' },
  { value: 'movimientos_bancarios', label: 'Movimientos Bancarios', icon: '🏦', diario: 'BANCO' },
  { value: 'todo', label: 'Todo (Completo)', icon: '📦', diario: 'TODOS' },
]

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const TRIMESTRES = [
  { value: 1, label: '1T (Ene-Mar)' },
  { value: 2, label: '2T (Abr-Jun)' },
  { value: 3, label: '3T (Jul-Sep)' },
  { value: 4, label: '4T (Oct-Dic)' },
]

export default function ExportarA3Page() {
  const [tipo, setTipo] = useState('')
  const [periodo, setPeriodo] = useState('mes')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [trimestre, setTrimestre] = useState(Math.ceil((new Date().getMonth() + 1) / 3))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resumen, setResumen] = useState<any>(null)
  const [loadingResumen, setLoadingResumen] = useState(true)

  useEffect(() => {
    fetchResumen()
  }, [])

  const fetchResumen = async () => {
    try {
      const res = await fetch('/api/admin/finanzas/exportar-a3')
      if (res.ok) {
        const data = await res.json()
        setResumen(data.resumen)
      }
    } catch (err) {
      console.error('Error fetching resumen:', err)
    } finally {
      setLoadingResumen(false)
    }
  }

  const handleExportar = async () => {
    if (!tipo) {
      setError('Selecciona un tipo de datos a exportar')
      return
    }

    setLoading(true)
    setError('')

    try {
      const body: any = { tipo, periodo, anio }
      if (periodo === 'mes') body.mes = mes
      if (periodo === 'trimestre') body.trimestre = trimestre

      const res = await fetch('/api/admin/finanzas/exportar-a3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error al generar el fichero')
      }

      // Descargar el CSV
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      const disposition = res.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="(.+)"/)
      a.href = url
      a.download = filenameMatch ? filenameMatch[1] : `exportacion_a3.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">EXPORTAR A A3</h1>
        <p className="mt-1 text-sm text-gray-500">
          Genera ficheros CSV compatibles con A3 Contabilidad para importar asientos contables.
        </p>
      </div>

      {/* Resumen de datos disponibles */}
      {!loadingResumen && resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{resumen.facturas_emitidas}</p>
            <p className="text-xs text-gray-500 mt-1">Facturas Emitidas</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-purple-600">{resumen.facturas_recibidas}</p>
            <p className="text-xs text-gray-500 mt-1">Facturas Recibidas</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-orange-600">{resumen.gastos}</p>
            <p className="text-xs text-gray-500 mt-1">Gastos</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{resumen.nominas}</p>
            <p className="text-xs text-gray-500 mt-1">Nóminas</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-600">{resumen.movimientos_bancarios}</p>
            <p className="text-xs text-gray-500 mt-1">Mov. Bancarios</p>
          </div>
        </div>
      )}

      {/* Formulario de exportación */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {/* Tipo de datos */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            1. Selecciona el tipo de datos a exportar
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {TIPOS_EXPORTACION.map((t) => (
              <button
                key={t.value}
                onClick={() => setTipo(t.value)}
                className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all text-left ${
                  tipo === t.value
                    ? 'border-orange-500 bg-orange-50 ring-1 ring-orange-500'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <span className="text-2xl">{t.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-500">Diario: {t.diario}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Periodo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            2. Selecciona el periodo
          </label>
          <div className="flex gap-3 mb-4">
            {[
              { value: 'mes', label: 'Mes' },
              { value: 'trimestre', label: 'Trimestre' },
              { value: 'anual', label: 'Año completo' },
            ].map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriodo(p.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  periodo === p.value
                    ? 'bg-orange-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-4 items-end">
            {/* Año */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">Año</label>
              <select
                value={anio}
                onChange={(e) => setAnio(parseInt(e.target.value))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
              >
                {[2024, 2025, 2026].map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            {/* Mes */}
            {periodo === 'mes' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Mes</label>
                <select
                  value={mes}
                  onChange={(e) => setMes(parseInt(e.target.value))}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
                >
                  {MESES.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Trimestre */}
            {periodo === 'trimestre' && (
              <div>
                <label className="block text-xs text-gray-500 mb-1">Trimestre</label>
                <select
                  value={trimestre}
                  onChange={(e) => setTrimestre(parseInt(e.target.value))}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-orange-500 focus:ring-orange-500"
                >
                  {TRIMESTRES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 border border-red-200">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Botón exportar */}
        <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
          <button
            onClick={handleExportar}
            disabled={loading || !tipo}
            className="inline-flex items-center rounded-md bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generando...
              </>
            ) : (
              <>
                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Generar y Descargar CSV
              </>
            )}
          </button>
          <p className="text-xs text-gray-500">
            El fichero se generará en formato CSV con separador punto y coma (;), compatible con A3 Contabilidad.
          </p>
        </div>
      </div>

      {/* Info formato */}
      <div className="bg-blue-50 rounded-lg border border-blue-200 p-4">
        <div className="flex gap-3">
          <svg className="h-5 w-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">Formato del fichero generado:</p>
            <p>Columnas: Asiento | Apunte | Fecha | Cuenta | Concepto | Debe | Haber | Documento | Diario</p>
            <p className="mt-1">Separador: punto y coma (;) | Decimales: coma (,) | Codificación: UTF-8</p>
            <p className="mt-1">Para importar en A3: Utilidades → Importar datos → Tipo fichero &quot;Diario&quot; → Seleccionar CSV</p>
          </div>
        </div>
      </div>
    </div>
  )
}
