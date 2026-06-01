"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from 'react';

interface ClienteData {
  nombre: string;
  nombreComercial: string | null;
  email: string;
  codigo: string | null;
  nif: string | null;
  cif: string | null;
  telefono: string | null;
  movil: string | null;
  domicilio: string | null;
  numero: string | null;
  localidad: string | null;
  municipio: string | null;
  codigoPostal: string | null;
  provincia: string | null;
  formaPago: string | null;
  cuentaCargo: string | null;
  fechaAlta: string | null;
}

export default function DatosPage() {
  const [data, setData] = useState<ClienteData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/cliente/datos')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Error al cargar los datos.</div>;
  }

  const maskIBAN = (iban: string | null) => {
    if (!iban) return '-';
    if (iban.length > 8) return iban.slice(0, 4) + ' **** **** ' + iban.slice(-4);
    return iban;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mis Datos</h1>
        <p className="text-gray-500 mt-1">Información de tu cuenta y datos de contacto.</p>
      </div>

      {/* Datos de empresa */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Datos de empresa</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Nombre / Razón social</p>
            <p className="text-gray-900">{data.nombre}</p>
          </div>
          {data.nombreComercial && (
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Nombre comercial</p>
              <p className="text-gray-900">{data.nombreComercial}</p>
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">NIF / CIF</p>
            <p className="text-gray-900">{data.cif || data.nif || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Código cliente</p>
            <p className="text-gray-900">{data.codigo || '-'}</p>
          </div>
          {data.fechaAlta && (
            <div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Cliente desde</p>
              <p className="text-gray-900">{new Date(data.fechaAlta).toLocaleDateString('es-ES')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Datos de contacto */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Contacto</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Email</p>
            <p className="text-gray-900">{data.email}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Teléfono</p>
            <p className="text-gray-900">{data.telefono || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Móvil</p>
            <p className="text-gray-900">{data.movil || '-'}</p>
          </div>
        </div>
      </div>

      {/* Dirección */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Dirección</h2>
        </div>
        <div className="p-5">
          <p className="text-gray-900">
            {[data.domicilio, data.numero].filter(Boolean).join(' ')}
          </p>
          <p className="text-gray-600">
            {[data.codigoPostal, data.localidad || data.municipio, data.provincia].filter(Boolean).join(', ')}
          </p>
        </div>
      </div>

      {/* Datos de facturación */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Datos de facturación</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Forma de pago</p>
            <p className="text-gray-900">{data.formaPago || '-'}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-gray-400 font-medium mb-1">Cuenta de cargo</p>
            <p className="text-gray-900 font-mono text-sm">{maskIBAN(data.cuentaCargo)}</p>
          </div>
        </div>
      </div>

      {/* Nota */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-sm text-orange-800">
          Para modificar tus datos, contacta con nosotros en{' '}
          <a href="mailto:administracion@internetoperadores.com" className="font-medium underline">
            administracion@internetoperadores.com
          </a>{' '}
          o llama al <a href="tel:+34900730034" className="font-medium underline">900 730 034</a>.
        </p>
      </div>
    </div>
  );
}
