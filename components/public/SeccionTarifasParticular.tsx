'use client';
import Link from 'next/link';
import TarifaCard from './TarifaCard';

interface TarifaWeb {
  id: number;
  tipoCliente: string;
  categoria: string;
  nombre: string;
  descripcionCorta: string | null;
  descripcionLarga: string | null;
  velocidad: string | null;
  velocidadBajada: string | null;
  velocidadSubida: string | null;
  fibraBajada: string | null;
  fibraSubida: string | null;
  datosIncluidos: string | null;
  minutosIncluidos: string | null;
  smsIncluidos: string | null;
  precioSinIva: number;
  precioConIva: number;
  permanencia: string | null;
  duracionPermanenciaMeses: number | null;
  garantia: string | null;
  destacada: boolean;
  esMovil: boolean;
  esFijo: boolean;
  esInternet: boolean;
  esTv: boolean;
  esCompuesta: boolean;
  seccionWebParticular: string | null;
  contratosActivos?: number;
  esPopular?: boolean;
}

interface Props {
  titulo: string;
  subtitulo: string;
  descripcion: string;
  icono: React.ReactNode;
  color: string; // 'orange' | 'blue' | 'green' | 'purple'
  top3: TarifaWeb[];
  totalTarifas: number;
  seccion: string;
}

export default function SeccionTarifasParticular({ titulo, subtitulo, descripcion, icono, color, top3, totalTarifas, seccion }: Props) {
  const colorMap: Record<string, { bg: string; text: string; gradient: string; border: string }> = {
    orange: { bg: 'bg-orange-500', text: 'text-orange-500', gradient: 'from-orange-500 to-orange-600', border: 'border-orange-500' },
    blue: { bg: 'bg-blue-500', text: 'text-blue-500', gradient: 'from-blue-500 to-blue-600', border: 'border-blue-500' },
    green: { bg: 'bg-green-500', text: 'text-green-500', gradient: 'from-green-500 to-green-600', border: 'border-green-500' },
    purple: { bg: 'bg-purple-500', text: 'text-purple-500', gradient: 'from-purple-500 to-purple-600', border: 'border-purple-500' },
  };
  const c = colorMap[color] || colorMap.orange;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="bg-gray-50 border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="flex items-center justify-between h-10 text-sm">
              <div className="flex items-center gap-4">
                <Link href="/empresa" className="text-gray-600 hover:text-orange-500 font-medium">Empresas</Link>
                <Link href="/particular" className="text-orange-500 font-semibold">Particulares</Link>
              </div>
              <div className="flex items-center gap-4">
                <a href="tel:+34900730034" className="text-gray-700 font-medium hover:text-orange-500">900 730 034</a>
                <Link href="/soporte" className="hidden sm:inline text-gray-600 hover:text-orange-500 font-medium">Soporte</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-white">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="flex items-center justify-between h-16 sm:h-20">
              <Link href="/particular" className="flex items-center">
                <img src="/logo_transparent.png" alt="Internet Operadores" className="h-10 sm:h-12 lg:h-14" />
              </Link>
              <nav className="hidden md:flex items-center gap-8">
                <Link href="/internet" className={`text-base font-medium transition-colors ${seccion === 'internet' ? 'text-orange-500' : 'text-gray-700 hover:text-orange-500'}`}>Internet</Link>
                <Link href="/movil" className={`text-base font-medium transition-colors ${seccion === 'movil' ? 'text-orange-500' : 'text-gray-700 hover:text-orange-500'}`}>Móvil</Link>
                <Link href="/packs" className={`text-base font-medium transition-colors ${seccion === 'packs' ? 'text-orange-500' : 'text-gray-700 hover:text-orange-500'}`}>Packs</Link>
                <Link href="/mas-vendido" className={`text-base font-medium transition-colors ${seccion === 'mas-vendido' ? 'text-orange-500' : 'text-gray-700 hover:text-orange-500'}`}>Más Vendido</Link>
              </nav>
              <Link href="#cobertura" className="px-6 py-3 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-all shadow-sm">
                Comprobar Cobertura
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className={`bg-gradient-to-br ${c.gradient} py-16 lg:py-24`}>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 text-center text-white">
          <div className="mb-6">{icono}</div>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">{titulo}</h1>
          <p className="text-xl lg:text-2xl text-white/80 mb-2">{subtitulo}</p>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">{descripcion}</p>
        </div>
      </section>

      {/* Top 3 Tarifas */}
      <section className="py-16 lg:py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold text-gray-900 mb-4">
              Nuestras Mejores Tarifas
            </h2>
            <p className="text-lg text-gray-600">
              Las tarifas más populares de {titulo.toLowerCase()}
            </p>
          </div>

          {top3.length > 0 ? (
            <>
              <div className={`grid grid-cols-1 ${top3.length >= 3 ? 'md:grid-cols-3' : top3.length === 2 ? 'md:grid-cols-2 max-w-3xl mx-auto' : 'max-w-md mx-auto'} gap-8`}>
                {top3.map((tarifa) => (
                  <TarifaCard
                    key={tarifa.id}
                    tarifa={tarifa}
                  />
                ))}
              </div>

              {totalTarifas > 3 && (
                <div className="text-center mt-12">
                  <Link
                    href={`/tarifas/particular?seccion=${seccion}`}
                    className="inline-flex items-center gap-2 px-8 py-4 border-2 border-orange-500 text-orange-600 rounded-lg font-semibold hover:bg-orange-50 transition-colors text-lg"
                  >
                    Ver todas las tarifas ({totalTarifas})
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                    </svg>
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg mb-6">Estamos preparando nuestras tarifas de {titulo.toLowerCase()}.</p>
              <Link href="/contacto" className="px-8 py-4 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors text-lg">
                Contactar para más información
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gray-900 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">¿No encuentras lo que buscas?</h2>
          <p className="text-gray-400 text-lg mb-8">Contacta con nosotros y te ayudaremos a encontrar la tarifa perfecta para ti.</p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="tel:+34900730034" className="px-8 py-4 bg-orange-500 text-white rounded-lg font-semibold hover:bg-orange-600 transition-colors text-lg">
              Llamar: 900 730 034
            </a>
            <Link href="/contacto" className="px-8 py-4 border-2 border-white text-white rounded-lg font-semibold hover:bg-white/10 transition-colors text-lg">
              Contactar
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="font-bold mb-4">Particulares</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/internet" className="hover:text-white">Internet</Link></li>
                <li><Link href="/movil" className="hover:text-white">Móvil</Link></li>
                <li><Link href="/packs" className="hover:text-white">Packs</Link></li>
                <li><Link href="/mas-vendido" className="hover:text-white">Más Vendido</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">Empresa</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/empresa" className="hover:text-white">Soluciones empresariales</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">Ayuda</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/soporte" className="hover:text-white">Centro de ayuda</Link></li>
                <li><Link href="#" className="hover:text-white">FAQ</Link></li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold mb-4">Legal</h3>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/politica-privacidad" className="hover:text-white">Privacidad</Link></li>
                <li><Link href="/politica-cookies" className="hover:text-white">Cookies</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-6 text-center text-sm text-gray-400">
            <p>&copy; 2026 Internet Operadores. Más de 25 años conectando España.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
