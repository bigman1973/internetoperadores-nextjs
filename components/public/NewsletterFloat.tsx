'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';

export default function NewsletterFloat() {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const pathname = usePathname();

  // No mostrar en admin ni en login
  if (pathname.startsWith('/admin') || pathname.startsWith('/login') || pathname.startsWith('/cliente')) {
    return null;
  }

  // Detectar si es sección de particulares
  const isParticular = pathname.startsWith('/particular') || pathname.startsWith('/movil') || pathname.startsWith('/internet') || pathname.startsWith('/tarifas');
  const tipo = isParticular ? 'particulares' : 'empresas';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, nombre, telefono, tipo }),
      });

      if (res.ok) {
        setSuccess(true);
        setEmail('');
        setNombre('');
        setTelefono('');
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
        }, 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al suscribirse');
      }
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 ${
          isOpen ? 'bg-gray-700 rotate-45' : 'bg-[#E85D2A]'
        }`}
        aria-label="Suscribirse al newsletter"
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
      </button>

      {/* Panel de suscripción */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className={`px-5 py-4 ${isParticular ? 'bg-blue-600' : 'bg-[#1a1a2e]'}`}>
            <h3 className="text-white font-semibold text-lg">
              Newsletter {isParticular ? 'Particulares' : 'Empresas'}
            </h3>
            <p className="text-white/80 text-sm mt-1">
              {isParticular
                ? 'Recibe ofertas exclusivas de fibra y móvil'
                : 'Novedades en soluciones IT y telecomunicaciones'}
            </p>
          </div>

          {/* Formulario */}
          <div className="p-5">
            {success ? (
              <div className="text-center py-4">
                <svg className="w-12 h-12 text-green-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-green-700 font-medium">¡Suscripción confirmada!</p>
                <p className="text-gray-500 text-sm mt-1">Gracias por suscribirte</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E85D2A] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <input
                    type="email"
                    placeholder="tu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E85D2A] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <input
                    type="tel"
                    placeholder="Teléfono (opcional)"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#E85D2A] focus:border-transparent"
                  />
                </div>
                {error && (
                  <p className="text-red-500 text-xs">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className={`w-full py-2.5 rounded-lg text-white font-medium text-sm transition-colors ${
                    loading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : isParticular
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-[#E85D2A] hover:bg-[#d04d1f]'
                  }`}
                >
                  {loading ? 'Suscribiendo...' : 'Suscribirme'}
                </button>
                <p className="text-xs text-gray-400 text-center">
                  Sin spam. Puedes darte de baja en cualquier momento.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
