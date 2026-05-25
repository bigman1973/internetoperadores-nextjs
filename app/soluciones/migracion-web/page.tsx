"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import { useState } from 'react';

const stats = [
  { valor: '11.334', label: 'Vulnerabilidades WordPress descubiertas en 2025', fuente: 'Patchstack / WPScan' },
  { valor: '13.000', label: 'Sitios WordPress hackeados cada día', fuente: 'Sucuri Security Report' },
  { valor: '42%', label: 'Incremento interanual de vulnerabilidades', fuente: 'WPScan 2025' },
  { valor: '35%', label: 'De vulnerabilidades siguen sin parche', fuente: 'Wordfence Annual Report 2024' },
];

const problemas = [
  { icono: '🔓', titulo: 'Seguridad comprometida', descripcion: 'WordPress es el CMS más atacado del mundo. Cada plugin es una puerta de entrada potencial para hackers. Las actualizaciones de seguridad son constantes y, si no se aplican a tiempo, tu web queda expuesta.' },
  { icono: '🐌', titulo: 'Rendimiento deficiente', descripcion: 'La arquitectura monolítica de WordPress genera tiempos de carga lentos. Cada visita ejecuta consultas a la base de datos, PHP procesa la página completa y el servidor se satura con poco tráfico.' },
  { icono: '💸', titulo: 'Costes ocultos', descripcion: 'Licencias anuales de plugins (Elementor, WPML, Yoast, WooCommerce...), hosting premium para que no vaya lento, mantenimiento correctivo constante. El "WordPress gratuito" acaba costando miles de euros al año.' },
  { icono: '⚠️', titulo: 'Dependencia de terceros', descripcion: 'Tu web depende de decenas de plugins de terceros que pueden abandonarse, volverse incompatibles o introducir vulnerabilidades. Una actualización de WordPress puede romper toda tu web.' },
];

const solucion = [
  { titulo: 'Seguridad inexpugnable', descripcion: 'Sin base de datos expuesta, sin panel de administración público, sin plugins de terceros. La superficie de ataque se reduce a prácticamente cero. Tu web es un conjunto de archivos estáticos servidos desde una CDN global.', icono: (
    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  )},
  { titulo: 'Velocidad extrema', descripcion: 'Las páginas se generan en tiempo de compilación y se sirven desde la CDN más cercana al usuario. Tiempos de carga inferiores a 1 segundo. Google lo premia con mejor posicionamiento SEO.', icono: (
    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
  )},
  { titulo: 'Gestión sencilla', descripcion: 'Un panel de administración intuitivo (CMS Headless) donde solo ves lo que necesitas editar: textos, imágenes y contenidos. Sin menús confusos, sin avisos de actualización, sin miedo a romper nada.', icono: (
    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
  )},
  { titulo: 'Coste predecible', descripcion: 'Sin licencias anuales de plugins, sin hosting caro, sin mantenimiento correctivo. El coste de infraestructura mensual es mínimo (20-40€/mes) y no hay sorpresas. Tu inversión inicial es la única inversión significativa.', icono: (
    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )},
];

const comparativa = [
  { aspecto: 'Seguridad', wp: 'Vulnerable (plugins, base de datos expuesta)', nextjs: 'Inexpugnable (archivos estáticos, sin BD pública)', wpColor: 'text-red-600', nextColor: 'text-green-600' },
  { aspecto: 'Velocidad', wp: '3-8 segundos de carga', nextjs: 'Menos de 1 segundo', wpColor: 'text-red-600', nextColor: 'text-green-600' },
  { aspecto: 'SEO', wp: 'Depende de plugins (Yoast)', nextjs: 'SEO integrado de serie', wpColor: 'text-yellow-600', nextColor: 'text-green-600' },
  { aspecto: 'Mantenimiento', wp: 'Actualizaciones constantes obligatorias', nextjs: 'Prácticamente cero', wpColor: 'text-red-600', nextColor: 'text-green-600' },
  { aspecto: 'Coste anual', wp: 'Hosting + plugins + mantenimiento: 500-2.000€/año', nextjs: 'Hosting CDN: 240-480€/año', wpColor: 'text-red-600', nextColor: 'text-green-600' },
  { aspecto: 'Escalabilidad', wp: 'Limitada por servidor', nextjs: 'Ilimitada (CDN global)', wpColor: 'text-yellow-600', nextColor: 'text-green-600' },
  { aspecto: 'Multiidioma', wp: 'Plugin WPML (89€/año)', nextjs: 'Nativo y gratuito', wpColor: 'text-yellow-600', nextColor: 'text-green-600' },
];

const paquetes = [
  {
    nombre: 'Esencial',
    precio: 'Desde 1.500€',
    descripcion: 'Para pymes y webs corporativas',
    caracteristicas: [
      'Hasta 10 páginas',
      'Diseño responsive personalizado',
      'SEO básico integrado',
      'Formulario de contacto',
      'Google Analytics + Tag Manager',
      'Certificado SSL incluido',
      'Backup automático diario',
      'Migración de contenidos',
    ],
  },
  {
    nombre: 'Profesional',
    precio: 'Desde 3.000€',
    descripcion: 'Para empresas en crecimiento',
    destacado: true,
    caracteristicas: [
      'Hasta 30 páginas',
      'Diseño premium a medida',
      'SEO avanzado + Schema.org',
      'Multiidioma nativo',
      'Integraciones (CRM, reservas, chat)',
      'Blog / sección de noticias',
      'Panel de gestión autónomo',
      'Redirecciones 301 + auditoría SEO',
    ],
  },
  {
    nombre: 'Avanzado',
    precio: 'A medida',
    descripcion: 'Para proyectos complejos',
    caracteristicas: [
      'Páginas ilimitadas',
      'E-commerce / catálogo online',
      'Integraciones complejas (TPV, ERP)',
      'Pasarela de pago',
      'Área de clientes / portal privado',
      'Funcionalidades a medida',
      'Formación personalizada',
      'Soporte prioritario 12 meses',
    ],
  },
];

const proceso = [
  { paso: '01', titulo: 'Auditoría gratuita', descripcion: 'Analizamos tu web actual: seguridad, rendimiento, plugins, versiones. Te entregamos un informe detallado con el estado real de tu sitio.' },
  { paso: '02', titulo: 'Propuesta personalizada', descripcion: 'Diseñamos una propuesta a medida con el alcance, presupuesto y cronograma adaptados a tu negocio. Sin compromiso.' },
  { paso: '03', titulo: 'Diseño y desarrollo', descripcion: 'Construimos tu nueva web con tecnología de última generación. Mantenemos tu identidad visual y mejoramos la experiencia de usuario.' },
  { paso: '04', titulo: 'Migración y lanzamiento', descripcion: 'Migramos todos los contenidos, configuramos las redirecciones SEO y lanzamos. Tu web antigua sigue funcionando hasta que la nueva está lista.' },
];

export default function MigracionWebPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    empresa: '',
    telefono: '',
    urlWeb: '',
    mensaje: '',
    acepta: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/guias-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          empresa: formData.empresa,
          telefono: formData.telefono,
          cargo: formData.urlWeb,
          guia: 'Auditoría Web Gratuita - Migración WordPress'
        })
      });

      if (!response.ok) throw new Error('Error al enviar');
      setIsSubmitted(true);
    } catch (err) {
      setError('Ha ocurrido un error. Por favor, inténtelo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soluciones" />

      {/* HERO */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12 sm:py-16 lg:py-24 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-orange-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-orange-600 rounded-full blur-3xl"></div>
        </div>
        <div className="container mx-auto px-4 sm:px-6 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/soluciones" className="inline-flex items-center text-orange-400 hover:text-orange-300 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Soluciones
            </Link>
            <div className="inline-block bg-red-500/20 text-red-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-red-500/30">
              Tu WordPress es un riesgo para tu negocio
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-6 leading-tight">
              Evoluciona tu web a la <span className="text-orange-500">tecnología del futuro</span>
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
              Migramos tu WordPress obsoleto a Next.js. Máxima seguridad, velocidad extrema y sin mantenimiento constante. El mismo nivel de excelencia tecnológica que ya confías para tu conectividad y ciberseguridad.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <a href="#auditoria" className="px-8 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-lg shadow-lg shadow-orange-600/30">
                Solicitar Auditoría Gratuita
              </a>
              <a href="#comparativa" className="px-8 py-4 border-2 border-gray-500 text-gray-300 rounded-lg hover:border-orange-500 hover:text-orange-400 transition-all font-semibold text-lg">
                Ver Comparativa
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="bg-orange-600 py-8">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
            {stats.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-1">{s.valor}</div>
                <div className="text-xs sm:text-sm text-orange-100 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEMAS DE WORDPRESS */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">¿Por qué tu WordPress te está costando dinero?</h2>
            <p className="text-base sm:text-lg text-gray-600">WordPress fue revolucionario en 2003. Pero en 2026, mantener una web empresarial en WordPress es como gestionar tu contabilidad con una hoja de cálculo: funciona, pero te expone a riesgos innecesarios.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {problemas.map((p, i) => (
              <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-6 sm:p-8">
                <div className="text-3xl mb-4">{p.icono}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{p.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{p.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NUESTRA SOLUCIÓN */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-16">
            <div className="inline-block bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">La solución definitiva</div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Tecnología Next.js: tu web blindada</h2>
            <p className="text-base sm:text-lg text-gray-600">La misma tecnología que utilizan Netflix, Nike, Twitch y TikTok para sus webs. Ahora accesible para tu empresa.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {solucion.map((s, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-300 hover:shadow-lg transition-all">
                <div className="mb-4">{s.icono}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{s.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMPARATIVA */}
      <section id="comparativa" className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">WordPress vs Next.js: la comparativa</h2>
            <p className="text-base sm:text-lg text-gray-600">Los datos hablan por sí solos. Compara tu situación actual con lo que podrías tener.</p>
          </div>
          <div className="max-w-4xl mx-auto overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-4 px-4 text-gray-900 font-bold">Aspecto</th>
                  <th className="text-left py-4 px-4 text-gray-900 font-bold">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 bg-red-500 rounded-full"></span>
                      WordPress
                    </span>
                  </th>
                  <th className="text-left py-4 px-4 text-gray-900 font-bold">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                      Next.js (IO)
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparativa.map((c, i) => (
                  <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-gray-50' : ''}`}>
                    <td className="py-4 px-4 font-semibold text-gray-900 text-sm sm:text-base">{c.aspecto}</td>
                    <td className={`py-4 px-4 text-sm sm:text-base ${c.wpColor}`}>{c.wp}</td>
                    <td className={`py-4 px-4 text-sm sm:text-base font-medium ${c.nextColor}`}>{c.nextjs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* PROCESO */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-gray-50 to-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Proceso de migración en 4 pasos</h2>
            <p className="text-base sm:text-lg text-gray-600">Un proceso transparente y sin sorpresas. Tu web actual sigue funcionando hasta que la nueva esté lista.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {proceso.map((p, i) => (
              <div key={i} className="relative">
                <div className="text-5xl sm:text-6xl font-bold text-orange-100 mb-2">{p.paso}</div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-3">{p.titulo}</h3>
                <p className="text-sm text-gray-600">{p.descripcion}</p>
                {i < proceso.length - 1 && (
                  <div className="hidden lg:block absolute top-8 -right-4 text-orange-300">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PAQUETES */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Paquetes de migración</h2>
            <p className="text-base sm:text-lg text-gray-600">Soluciones adaptadas al tamaño y necesidades de tu negocio. Todos incluyen hosting, SSL, backup y soporte.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {paquetes.map((p, i) => (
              <div key={i} className={`bg-white rounded-2xl p-6 sm:p-8 ${p.destacado ? 'border-2 border-orange-500 shadow-xl relative' : 'border border-gray-200 shadow-lg'}`}>
                {p.destacado && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-orange-500 text-white text-xs font-semibold px-4 py-1 rounded-full">Más popular</div>}
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{p.nombre}</h3>
                <div className="text-2xl sm:text-3xl font-bold text-orange-600 mb-2">{p.precio}</div>
                <p className="text-sm text-gray-500 mb-6">{p.descripcion}</p>
                <ul className="space-y-3 mb-8">
                  {p.caracteristicas.map((c, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-600">
                      <svg className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {c}
                    </li>
                  ))}
                </ul>
                <a href="#auditoria" className={`block text-center px-6 py-3 rounded-lg font-semibold transition-all ${p.destacado ? 'bg-orange-600 text-white hover:bg-orange-700' : 'border-2 border-orange-600 text-orange-600 hover:bg-orange-50'}`}>
                  Solicitar Auditoría
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* POR QUÉ IO */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">¿Por qué Internet Operadores?</h2>
            <p className="text-base sm:text-lg text-gray-600">No somos una agencia web. Somos tu proveedor integral de tecnología.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Expertos en ciberseguridad</h3>
              <p className="text-sm text-gray-600">Ya protegemos la infraestructura de cientos de empresas. Cuando decimos que WordPress no es seguro, sabemos de lo que hablamos.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Ecosistema completo</h3>
              <p className="text-sm text-gray-600">Conectividad, VoIP, ciberseguridad, IT y ahora web. Todo tu ecosistema tecnológico con un solo proveedor de confianza. Un solo teléfono para todo.</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 text-center">
              <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">Proximidad y confianza</h3>
              <p className="text-sm text-gray-600">Somos una empresa local que entiende las necesidades de las pymes. No somos una agencia de Madrid que desaparece tras el proyecto. Estamos aquí.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FORMULARIO DE AUDITORÍA */}
      <section id="auditoria" className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Sin compromiso
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu auditoría web gratuita</h2>
                <p className="text-gray-400 mb-8">Analizamos tu web actual y te entregamos un informe detallado con el estado de seguridad, rendimiento y oportunidades de mejora. Sin compromiso ni coste alguno.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Análisis de seguridad</div>
                      <div className="text-sm text-gray-400">Vulnerabilidades, plugins obsoletos, versiones de PHP y WordPress</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Test de rendimiento</div>
                      <div className="text-sm text-gray-400">Velocidad de carga, Core Web Vitals, puntuación Google PageSpeed</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Propuesta personalizada</div>
                      <div className="text-sm text-gray-400">Presupuesto detallado con alcance, cronograma y condiciones</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl p-6 sm:p-8">
                {isSubmitted ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Solicitud recibida</h3>
                    <p className="text-gray-600">Hemos recibido tu solicitud. Nuestro equipo analizará tu web y te contactará en menos de 24 horas con el informe de auditoría.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Datos de contacto</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                        <input type="text" required value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm" placeholder="Tu nombre" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                        <input type="text" required value={formData.empresa} onChange={(e) => setFormData({...formData, empresa: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm" placeholder="Nombre de tu empresa" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm" placeholder="tu@empresa.com" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input type="tel" value={formData.telefono} onChange={(e) => setFormData({...formData, telefono: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm" placeholder="600 000 000" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">URL de tu web actual *</label>
                      <input type="url" required value={formData.urlWeb} onChange={(e) => setFormData({...formData, urlWeb: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm" placeholder="https://tuweb.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">¿Qué problemas tienes con tu web actual?</label>
                      <textarea rows={3} value={formData.mensaje} onChange={(e) => setFormData({...formData, mensaje: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm resize-none" placeholder="Cuéntanos brevemente qué te gustaría mejorar..." />
                    </div>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" required checked={formData.acepta} onChange={(e) => setFormData({...formData, acepta: e.target.checked})} className="mt-1 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                      <label className="text-xs text-gray-500">Acepto la política de privacidad y consiento el tratamiento de mis datos para recibir la auditoría web gratuita.</label>
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <button type="submit" disabled={isSubmitting} className="w-full px-6 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSubmitting ? 'Enviando...' : 'Solicitar Auditoría Gratuita'}
                    </button>
                    <p className="text-xs text-gray-400 text-center">Sin compromiso. Recibirás el informe en menos de 24h.</p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6">¿Prefieres hablar directamente?</h2>
            <p className="text-base sm:text-lg text-orange-100 mb-8">Nuestro equipo está disponible para resolver cualquier duda sobre el proceso de migración.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <a href="tel:+34973228000" className="inline-block px-8 py-4 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-lg">
                Llamar: 973 228 000
              </a>
              <a href="https://wa.me/34900730034?text=Hola,%20quiero%20información%20sobre%20migración%20de%20mi%20web%20WordPress" target="_blank" rel="noopener noreferrer" className="inline-block px-8 py-4 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-lg">
                WhatsApp: 900 730 034
              </a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
