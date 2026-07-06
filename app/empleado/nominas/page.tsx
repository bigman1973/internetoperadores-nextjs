'use client';

import { useState, useEffect } from 'react';
import { DocumentTextIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

interface Nomina {
  id: string;
  mes: number;
  anio: number;
  devengadoTotal: number;
  netoPercibir: number;
  irpf: number | null;
  ssTrabajador: number | null;
  archivoUrl: string | null;
}

const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function MisNominasPage() {
  const [nominas, setNominas] = useState<Nomina[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNominas();
  }, []);

  async function fetchNominas() {
    try {
      const res = await fetch('/api/empleado/nominas');
      const data = await res.json();
      if (!res.ok) {
        setError(data.error);
        return;
      }
      setNominas(data.nominas || []);
    } catch (e) {
      setError('Error al cargar las nóminas');
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

  if (error) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-center">
        <p className="text-yellow-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Nóminas</h1>
        <p className="text-sm text-gray-500 mt-1">Historial de nóminas y recibos de salario</p>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Período</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Devengado</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">IRPF</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">SS Trabajador</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Neto a percibir</th>
              <th className="text-center px-4 py-3 font-medium text-gray-600">Documento</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {nominas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No hay nóminas disponibles todavía
                </td>
              </tr>
            ) : (
              nominas.map((nom) => (
                <tr key={nom.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <DocumentTextIcon className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{MESES[nom.mes]} {nom.anio}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{formatEur(nom.devengadoTotal)}</td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {nom.irpf ? `-${formatEur(nom.irpf)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-red-600">
                    {nom.ssTrabajador ? `-${formatEur(nom.ssTrabajador)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{formatEur(nom.netoPercibir)}</td>
                  <td className="px-4 py-3 text-center">
                    {nom.archivoUrl ? (
                      <a
                        href={nom.archivoUrl}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center gap-1 text-orange-600 hover:text-orange-700"
                      >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        <span className="text-xs">PDF</span>
                      </a>
                    ) : (
                      <span className="text-gray-300 text-xs">No disponible</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
