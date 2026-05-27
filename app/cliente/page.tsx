"use client";
export const dynamic = "force-dynamic";

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface AltaCliente {
  id: string
  tarifaNombre: string
  estado: string
  createdAt: string
  token: string
  importeCuota: number
  documentos: { tipo: string; validado: boolean }[]
  contratoFirmado: boolean
}

export default function ClienteDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [altas, setAltas] = useState<AltaCliente[]>([]);
  const [loadingAltas, setLoadingAltas] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user?.email) {
      fetchAltas();
    }
  }, [session]);

  const fetchAltas = async () => {
    try {
      const res = await fetch(`/api/cliente/altas`);
      if (res.ok) {
        const data = await res.json();
        setAltas(data);
      }
    } catch (err) {
      console.error('Error cargando altas:', err);
    } finally {
      setLoadingAltas(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
          <p className="mt-2 text-sm text-gray-600">Cargando tu panel...</p>
        </div>
      </div>
    );
  }

  if (!session) return null;

  const estadoLabel = (estado: string) => {
    const map: Record<string, { text: string; color: string }> = {
      'ESPERANDO_DOCUMENTACION': { text: 'Pendiente de documentación', color: 'bg-yellow-100 text-yellow-800' },
      'DOCUMENTACION_COMPLETA': { text: 'Documentación enviada', color: 'bg-blue-100 text-blue-800' },
      'EN_REVISION': { text: 'En revisión', color: 'bg-purple-100 text-purple-800' },
      'APROBADA': { text: 'Aprobada', color: 'bg-green-100 text-green-800' },
      'RECHAZADA': { text: 'Rechazada', color: 'bg-red-100 text-red-800' },
      'SERVICIO_ACTIVO': { text: 'Servicio activo', color: 'bg-green-100 text-green-800' },
    };
    return map[estado] || { text: estado, color: 'bg-gray-100 text-gray-800' };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center">
            <span className="text-2xl font-bold">
              <span className="text-black">internet</span>
              <span className="text-orange-500">operadores</span>
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600 hidden sm:block">
              Hola, <span className="font-semibold text-gray-900">{session.user?.name}</span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="text-sm font-medium text-gray-600 hover:text-orange-600 transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Mi Área de Cliente</h1>
          <p className="mt-2 text-gray-600">Gestiona tus servicios, documentación y soporte desde un solo lugar.</p>
        </div>

        {/* Grid de Acciones Rápidas */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Mis Servicios</h3>
            <p className="text-sm text-gray-600 mb-4">Consulta el estado de tu fibra, móvil y otros servicios activos.</p>
            <span className="text-orange-600 text-sm font-medium">Próximamente</span>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Facturación</h3>
            <p className="text-sm text-gray-600 mb-4">Descarga tus facturas recientes y gestiona tus métodos de pago.</p>
            <span className="text-blue-600 text-sm font-medium">Próximamente</span>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Soporte Técnico</h3>
            <p className="text-sm text-gray-600 mb-4">¿Tienes algún problema? Contacta con nuestro equipo.</p>
            <a href="mailto:sat@internetoperadores.com" className="text-green-600 text-sm font-medium hover:underline">Contactar soporte →</a>
          </div>
        </div>

        {/* Mis Altas / Documentación */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900">Mis Altas de Servicio</h3>
            {altas.some(a => a.estado === 'ESPERANDO_DOCUMENTACION') && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full font-medium">
                Documentación pendiente
              </span>
            )}
          </div>
          <div className="p-6">
            {loadingAltas ? (
              <div className="text-center py-8">
                <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-orange-600 border-r-transparent"></div>
                <p className="mt-2 text-sm text-gray-500">Cargando...</p>
              </div>
            ) : altas.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-gray-500">No tienes altas de servicio registradas.</p>
                <a href="/alta-servicio" className="inline-block mt-3 text-sm text-orange-600 font-medium hover:underline">
                  Contratar un servicio →
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                {altas.map(alta => {
                  const estado = estadoLabel(alta.estado);
                  const docsTotal = alta.documentos?.length || 0;
                  const docsValidados = alta.documentos?.filter(d => d.validado).length || 0;
                  
                  return (
                    <div key={alta.id} className="border rounded-lg p-4 hover:border-orange-200 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-gray-900">{alta.tarifaNombre}</h4>
                          <p className="text-sm text-gray-500">
                            Solicitada el {new Date(alta.createdAt).toLocaleDateString('es-ES')}
                          </p>
                          <div className="flex items-center gap-3 mt-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${estado.color}`}>
                              {estado.text}
                            </span>
                            {docsTotal > 0 && (
                              <span className="text-xs text-gray-500">
                                Documentos: {docsValidados}/{docsTotal} validados
                              </span>
                            )}
                            {alta.contratoFirmado && (
                              <span className="text-xs text-green-600 font-medium">Contrato firmado</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          {(alta.estado === 'ESPERANDO_DOCUMENTACION' || alta.estado === 'DOCUMENTACION_COMPLETA') && (
                            <a
                              href={`/alta-servicio/documentacion?token=${alta.token}`}
                              className="inline-flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                              {alta.estado === 'ESPERANDO_DOCUMENTACION' ? 'Subir documentación' : 'Modificar documentación'}
                            </a>
                          )}
                          <a
                            href={`/api/altas/contrato?altaId=${alta.id}&format=html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            Ver contrato
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Información de Cuenta */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="font-semibold text-gray-900">Información de tu Cuenta</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Nombre Completo</p>
                <p className="text-gray-900">{session.user?.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Correo Electrónico</p>
                <p className="text-gray-900">{session.user?.email}</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center text-gray-500 text-xs">
        <p>&copy; 2026 Internet Operadores. Todos los derechos reservados.</p>
      </footer>
    </div>
  );
}
