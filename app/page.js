'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-gray-900 text-white py-3 text-sm">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2 md:gap-0">
            <div className="flex flex-wrap gap-3 md:gap-6 text-white font-semibold items-center">
              <Link href="/" className="hover:text-orange-500">INICIO</Link>
              <a href="mailto:david.perez@internetoperadores.com" className="hover:text-orange-500 hidden md:inline">
                david.perez@internetoperadores.com
              </a>
              <span className="hidden lg:inline text-sm">Paseo De La Habana 26 1-1. 28036, Madrid. España</span>
            </div>
            <a 
              href="https://wa.me/34655100400?text=Hola,%20quiero%20información%20sobre%20Internet%20Operadores" 
              className="bg-green-500 px-4 py-2 rounded hover:bg-green-600 font-semibold text-center"
              target="_blank"
              rel="noopener noreferrer"
            >
              WhatsApp
            </a>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b py-4 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center">
            <div>
              <Link href="/">
                <img src="/logo_transparent.png" alt="Internet Operadores" className="h-8 md:h-10 cursor-pointer" />
              </Link>
            </div>
            
            {/* Desktop Menu */}
            <div className="hidden md:flex gap-6 text-gray-900 font-semibold items-center">
              <Link href="/" className="hover:text-orange-500">INICIO</Link>
              <Link href="/empresa" className="hover:text-orange-500">EMPRESA</Link>
              <Link href="/fansaticos" className="hover:text-orange-500">FANSÁTICOS</Link>
              <Link href="/cero-riesgos" className="hover:text-orange-500">CERO RIESGOS</Link>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="hover:text-orange-500">SABER DIARIO</a>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600">Protección</a>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden text-gray-900 focus:outline-none"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-4 pb-4 flex flex-col gap-3">
              <Link href="/" className="text-gray-900 hover:text-orange-500 font-semibold py-2">INICIO</Link>
              <Link href="/empresa" className="text-gray-900 hover:text-orange-500 font-semibold py-2">EMPRESA</Link>
              <Link href="/fansaticos" className="text-gray-900 hover:text-orange-500 font-semibold py-2">FANSÁTICOS</Link>
              <Link href="/cero-riesgos" className="text-gray-900 hover:text-orange-500 font-semibold py-2">CERO RIESGOS</Link>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="text-gray-900 hover:text-orange-500 font-semibold py-2">SABER DIARIO</a>
              <a href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U" target="_blank" rel="noopener noreferrer" className="bg-orange-500 text-white px-4 py-3 rounded hover:bg-orange-600 font-semibold text-center">Protección</a>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gray-800 py-12 md:py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-4 leading-tight">
              Servicios IT: Seguridad, Backups Y Telecomunicaciones
            </h1>
            <p className="text-xl md:text-2xl text-orange-500 mb-6">
              —escáner de malware
            </p>
            <p className="text-base md:text-lg text-white mb-8 leading-relaxed">
              Revisamos la ciberseguridad, las copias de seguridad y las telecomunicaciones de tu empresa para detectar riesgos y oportunidades de mejora. Recibirás un informe claro en 48 horas con acciones concretas para proteger tu negocio y dormir tranquilo.
            </p>
            <a 
              href="https://dcfb0cf4.sibforms.com/serve/MUIFANgDSlNz0J6jkpzLENOPwNhPBMIluIzy24WifdoCJLUOD_of_bitIxciEv0MeYqaD6AzUbJZ5caTr7RrN9YbODvcxeHC0PxrXXbCPWekbMK3TvuDEvZqp5Dlq_5kq9AcxaMpowt1CmY2AYfgNNk6V4GLaLciGSpHTpHFpaNed_wDeWABFLO0AJ2QwskgqKKpq5iqokVitp7U"
              className="inline-block bg-orange-500 text-white px-6 md:px-8 py-3 rounded font-semibold hover:bg-orange-600 text-sm md:text-base"
              target="_blank"
              rel="noopener noreferrer"
            >
              SOLUCIONES DE SEGURIDAD 🔒
            </a>
          </div>
        </div>
      </section>

      {/* Intro Text */}
      <section className="py-12 md:py-16 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-orange-500 mb-6 md:mb-8 max-w-5xl leading-tight">
            Muchos de empresarios trabajan con la sensación constante de que &quot;algo puede fallar&quot;. ¿Y si pudieras saber exactamente qué tienes mal y cómo mejorarlo?
          </h2>
          <div className="h-1 w-20 bg-orange-500"></div>
        </div>
      </section>

      {/* Services Grid */}
      <section className="py-12 md:py-16 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            
            {/* Informe Cero Riesgos */}
            <Link href="/cero-riesgos" className="group relative h-64 md:h-80 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow">
              <div className="absolute inset-0 bg-cover bg-center" 
                style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1551434678-e076c223a692?w=600&h=600&fit=crop')"}}>
              </div>
              <div className="absolute bottom-0 left-0 p-4 md:p-6">
                <div className="bg-orange-500 w-12 h-12 md:w-16 md:h-16 rounded flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-white text-2xl md:text-3xl">🔒</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white">Informe Cero Riesgos</h3>
              </div>
            </Link>

            {/* Conectividad */}
            <div className="group relative h-64 md:h-80 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow cursor-pointer">
              <div className="absolute inset-0 bg-cover bg-center" 
                style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&h=600&fit=crop')"}}>
              </div>
              <div className="absolute bottom-0 left-0 p-4 md:p-6">
                <div className="bg-orange-500 w-12 h-12 md:w-16 md:h-16 rounded flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-white text-2xl md:text-3xl">📡</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white">Conectividad</h3>
              </div>
            </div>

            {/* Backup Gestionado 360 */}
            <div className="group relative h-64 md:h-80 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow cursor-pointer">
              <div className="absolute inset-0 bg-cover bg-center" 
                style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&h=600&fit=crop')"}}>
              </div>
              <div className="absolute bottom-0 left-0 p-4 md:p-6">
                <div className="bg-orange-500 w-12 h-12 md:w-16 md:h-16 rounded flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-white text-2xl md:text-3xl">💾</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white">Backup Gestionado 360</h3>
              </div>
            </div>

            {/* Infraestructura Física */}
            <div className="group relative h-64 md:h-80 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow cursor-pointer">
              <div className="absolute inset-0 bg-cover bg-center" 
                style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=600&fit=crop')"}}>
              </div>
              <div className="absolute bottom-0 left-0 p-4 md:p-6">
                <div className="bg-orange-500 w-12 h-12 md:w-16 md:h-16 rounded flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-white text-2xl md:text-3xl">🏗️</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white">Infraestructura Física</h3>
              </div>
            </div>

            {/* WiFi360 */}
            <div className="group relative h-64 md:h-80 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow cursor-pointer">
              <div className="absolute inset-0 bg-cover bg-center" 
                style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1606904825846-647eb07f5be2?w=600&h=600&fit=crop')"}}>
              </div>
              <div className="absolute bottom-0 left-0 p-4 md:p-6">
                <div className="bg-orange-500 w-12 h-12 md:w-16 md:h-16 rounded flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-white text-2xl md:text-3xl">📶</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white">Wifi360</h3>
              </div>
            </div>

            {/* CobroCripto */}
            <div className="group relative h-64 md:h-80 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-shadow cursor-pointer">
              <div className="absolute inset-0 bg-cover bg-center" 
                style={{backgroundImage: "linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.5)), url('https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=600&h=600&fit=crop')"}}>
              </div>
              <div className="absolute bottom-0 left-0 p-4 md:p-6">
                <div className="bg-orange-500 w-12 h-12 md:w-16 md:h-16 rounded flex items-center justify-center mb-3 md:mb-4">
                  <span className="text-white text-2xl md:text-3xl">₿</span>
                </div>
                <h3 className="text-xl md:text-2xl font-bold text-white">CobroCripto</h3>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Mantenimiento 24/7 */}
      <section className="py-12 md:py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-8 md:mb-16 leading-tight">
            Mantenimiento 24/7<br/>vigilancia & investigación
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 max-w-5xl">
            <div>
              <h3 className="text-xl md:text-2xl font-bold mb-4">Vocación operadora 24/7</h3>
              <p className="text-base md:text-lg text-gray-300 leading-relaxed">
                &quot;Nacimos como operadores. Vivimos conectados.&quot; Nuestra esencia está en la continuidad: los servicios no paran y nosotros tampoco. Vigilamos, prevenimos e intervenimos en tiempo real, los 365 días del año.
              </p>
            </div>

            <div>
              <h3 className="text-xl md:text-2xl font-bold mb-4">Seguridad y mejora constante</h3>
              <p className="text-base md:text-lg text-gray-300 leading-relaxed">
                &quot;Más que mantenimiento: inteligencia en tiempo real.&quot; Supervisamos tu red para detectar, entender y resolver antes de que el problema exista. Cada alerta es una oportunidad para mejorar y proteger tu negocio.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-4 md:mb-6 text-black leading-tight px-4">
            Confianza construida durante más de 25 años
          </h2>
          <p className="text-center text-lg md:text-xl text-gray-800 mb-8 md:mb-16">¿Por qué nos eligen nuestros clientes?</p>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 text-center max-w-5xl mx-auto">
            <div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-2">46%</div>
              <div className="text-sm md:text-base text-gray-800">WiFi</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-2">77%</div>
              <div className="text-sm md:text-base text-gray-800">Servicios Consultoría</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-2">100%</div>
              <div className="text-sm md:text-base text-gray-800">Telecomunicaciones</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-2">+6,340</div>
              <div className="text-sm md:text-base text-gray-800">Clientes atendidos</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6 md:gap-8 text-center max-w-3xl mx-auto mt-8 md:mt-12">
            <div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-2">+25</div>
              <div className="text-sm md:text-base text-gray-800">Años de experiencia</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl lg:text-6xl font-bold text-orange-500 mb-2">3</div>
              <div className="text-sm md:text-base text-gray-800">Continentes</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Carousel */}
      <section className="py-12 md:py-20 bg-gradient-to-r from-orange-500 to-orange-600 text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4 md:mb-6 leading-tight">
            &quot;Anticiparse es la mejor defensa.&quot;
          </h2>
          <p className="text-base md:text-lg lg:text-xl mb-6 md:mb-8 max-w-3xl mx-auto leading-relaxed">
            Auditamos, monitorizamos y reforzamos tu entorno digital antes de que ocurra un incidente. Así conviertes la seguridad en una ventaja competitiva, no en una reacción de emergencia.
          </p>
          <a 
            href="https://wa.me/34655100400?text=Hola,%20quiero%20proteger%20mi%20empresa"
            className="inline-block bg-white text-orange-500 px-6 md:px-8 py-3 md:py-4 rounded text-base md:text-lg font-bold hover:bg-gray-100"
            target="_blank"
            rel="noopener noreferrer"
          >
            CONTACTA
          </a>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-8 md:mb-12">
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold mb-4">Informe Cero Riesgos</h2>
              <h3 className="text-xl md:text-2xl text-gray-800">En que consiste</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 mb-8 md:mb-12">
              <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
                <p className="text-base md:text-lg mb-6 leading-relaxed">
                  Revisión de ciberseguridad y backups, Estado de tus soluciones de telecomunicaciones, Análisis del área IT y proveedores actuales, Informe con mejoras ordenadas por prioridad
                </p>
                <Link href="/cero-riesgos" className="text-orange-500 font-semibold hover:underline">
                  + info
                </Link>
              </div>

              <div className="bg-white p-6 md:p-8 rounded-lg shadow-lg">
                <h3 className="text-xl md:text-2xl font-bold mb-4">Maximiza tu seguridad</h3>
                <p className="text-gray-700 mb-6 leading-relaxed">
                  «Porque un fallo en tu seguridad, una mala inversión en IT o un sistema mal dimensionado puede costarte miles de euros. Este informe te permite anticiparte, ahorrar y proteger tu despacho con criterio profesional.»
                </p>
                <div className="text-3xl md:text-4xl font-bold text-orange-500 mb-4">€790 <span className="text-base md:text-lg">anual</span></div>
                <a 
                  href="https://wa.me/34655100400?text=Hola,%20quiero%20contratar%20el%20Informe%20Cero%20Riesgos%20por%20790€"
                  className="inline-block bg-orange-500 text-white px-6 py-3 rounded font-semibold hover:bg-orange-600 w-full md:w-auto text-center"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  CONTRATA
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-12 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8 md:mb-12">
            <p className="text-lg md:text-xl lg:text-2xl font-bold mb-8 text-black leading-relaxed px-4">
              &quot;Nuestro objetivo es detectar y prevenir ataques a tu empresa, protegiendo especialmente las comunicaciones, tu conexión al mundo y principal vía de ciberataques.&quot;
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 max-w-6xl mx-auto">
            <div className="text-center">
              <h3 className="text-lg md:text-xl font-bold mb-3 text-black">Métricas de seguridad</h3>
              <p className="text-sm md:text-base text-gray-800 leading-relaxed">
                «Medimos la seguridad de tu empresa con indicadores claros que revelan riesgos y priorizan acciones.»
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-lg md:text-xl font-bold mb-3 text-black">Soporte en seguridad</h3>
              <p className="text-sm md:text-base text-gray-800 leading-relaxed">
                «Te ofrecemos soporte en seguridad para responder, resolver y prevenir incidentes que pongan en riesgo tu negocio.»
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-lg md:text-xl font-bold mb-3 text-black">Seguridad de los datos</h3>
              <p className="text-sm md:text-base text-gray-800 leading-relaxed">
                «La seguridad de los datos es clave para proteger la información confidencial de tu empresa y mantener la confianza de tus clientes.»
              </p>
            </div>

            <div className="text-center">
              <h3 className="text-lg md:text-xl font-bold mb-3 text-black">Seguridad general o física (safety)</h3>
              <p className="text-sm md:text-base text-gray-800 leading-relaxed">
                «Velamos por la seguridad y protección integral de tu despacho, tanto frente a ciberamenazas como a riesgos operativos.»
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-12 md:py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold text-center mb-4">Testimonios</h2>
          <p className="text-center text-gray-800 mb-8 md:mb-12 max-w-3xl mx-auto leading-relaxed px-4">
            Por respeto y confidencialidad hacia nuestros clientes, no publicamos sus nombres ni logotipos. Si desea referencias reales sobre nuestro trabajo, estaremos encantados de facilitárselas personalmente.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 max-w-6xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-700 mb-4 italic leading-relaxed">
                &quot;Creíamos que teníamos copias de seguridad, pero en realidad no se estaban haciendo bien. Si hubiéramos perdido los datos, habría sido un desastre. Ahora dormimos tranquilos.&quot;
              </p>
              <p className="font-bold">Director Financiero</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-700 mb-4 italic leading-relaxed">
                &quot;En una hora detectaron fallos que nuestro proveedor de siempre nunca mencionó. Nos ahorraron más de 1.200 € al año y ahora tenemos mejor conectividad y soporte real.&quot;
              </p>
              <p className="font-bold">Empresario</p>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <p className="text-gray-700 mb-4 italic leading-relaxed">
                &quot;Teníamos cortes constantes en la centralita y nadie nos daba solución. Ellos lo analizaron todo, cambiamos de operador con su ayuda y ahora por fin funciona como debe.&quot;
              </p>
              <p className="font-bold">Jefe Atención al Cliente</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section className="py-12 md:py-20 bg-gray-900 text-white">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 leading-tight">
              &quot;Identifica, comprende y responde a los ataques más rápido.&quot;
            </h2>
            <p className="text-base md:text-lg lg:text-xl mb-6 md:mb-8 leading-relaxed">
              Detectamos vulnerabilidades, analizamos su impacto y te damos un plan de acción claro para que actúes antes de que se conviertan en un problema real.
            </p>
            
            <div className="mb-6 md:mb-8">
              <p className="text-base md:text-lg mb-2">EMAIL</p>
              <a href="mailto:david.perez@internetoperadores.com" className="text-orange-500 text-lg md:text-xl hover:underline break-all">
                david.perez@internetoperadores.com
              </a>
            </div>

            <div>
              <p className="text-xl md:text-2xl font-bold mb-4 leading-tight">
                &quot;Lo suficientemente grandes para ayudarte, lo suficientemente cercanos para conocerte.&quot;
              </p>
              <p className="text-base md:text-lg mb-6 leading-relaxed">
                Cuando te conocemos, sabemos cómo ayudarte de verdad. Empieza contándonos algo de ti
              </p>
              <a 
                href="https://wa.me/34655100400?text=Hola,%20quiero%20conocer%20más%20sobre%20Internet%20Operadores"
                className="inline-block bg-orange-500 text-white px-6 md:px-8 py-3 md:py-4 rounded text-base md:text-lg font-bold hover:bg-orange-600"
                target="_blank"
                rel="noopener noreferrer"
              >
                AYÚDAME
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-6 md:py-8 border-t border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm md:text-base">&copy; 2025 Internet Operadores. Todos los derechos reservados.</p>
            <div className="flex gap-4 md:gap-6 text-xs md:text-sm">
              <Link href="/politica-privacidad" className="text-gray-400 hover:text-orange-500 transition-colors">
                Política de Privacidad
              </Link>
              <Link href="/politica-cookies" className="text-gray-400 hover:text-orange-500 transition-colors">
                Política de Cookies
              </Link>
            </div>
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-4 text-center">
            Paseo De La Habana 26 1-1. 28036, Madrid. España
          </p>
        </div>
      </footer>
    </div>
  );
}

