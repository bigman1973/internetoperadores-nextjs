"use client";
export const dynamic = "force-dynamic";


import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function ClienteDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

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
          <h1 className="text-3xl font-bold text-gray-900">Bienvenido a tu Área de Cliente</h1>
          <p className="mt-2 text-gray-600">Gestiona tus servicios, facturas y soporte desde un solo lugar.</p>
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
            <button className="text-orange-600 text-sm font-medium hover:underline">Ver servicios →</button>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Facturación</h3>
            <p className="text-sm text-gray-600 mb-4">Descarga tus facturas recientes y gestiona tus métodos de pago.</p>
            <button className="text-blue-600 text-sm font-medium hover:underline">Ver facturas →</button>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Soporte Técnico</h3>
            <p className="text-sm text-gray-600 mb-4">¿Tienes algún problema? Abre un ticket o habla con un agente.</p>
            <button className="text-green-600 text-sm font-medium hover:underline">Contactar soporte →</button>
          </div>
        </div>

        {/* Sección de Información de Cuenta */}
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
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">ID de Cliente (ISPGestión)</p>
                <p className="text-gray-900 font-mono">CLIENTE_TEST_001</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wider text-gray-500 font-bold mb-1">Estado de Suscripción</p>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Activo
                </span>
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
