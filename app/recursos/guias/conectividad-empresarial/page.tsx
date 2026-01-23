'use client';

import EmpresaNav from '@/components/EmpresaNav';
import EmpresaFooter from '@/components/EmpresaFooter';
import Link from 'next/link';
import { useState } from 'react';

export default function GuiaConectividadEmpresarial() {
  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    empresa: '',
    telefono: '',
    cargo: '',
    acepta: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    // Aquí se integraría con Brevo
    // Por ahora simulamos el envío
    try {
      // Simular envío a Brevo
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // En producción, aquí iría la llamada a la API de Brevo
      // const response = await fetch('/api/brevo/subscribe', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     email: formData.email,
      //     attributes: {
      //       NOMBRE: formData.nombre,
      //       EMPRESA: formData.empresa,
      //       TELEFONO: formData.telefono,
      //       CARGO: formData.cargo,
      //       RECURSO: 'Guía Conectividad Empresarial 2026'
      //     },
      //     listIds: [X] // ID de la lista en Brevo
      //   })
      // });

      setIsSubmitted(true);
    } catch (err) {
      setError('Ha ocurrido un error. Por favor, inténtelo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav />
      
      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-orange-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Contenido */}
            <div>
              <span className="inline-block px-4 py-2 bg-orange-100 text-orange-600 rounded-full text-sm font-medium mb-6">
                Guía Gratuita · 29 páginas
              </span>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6 leading-tight">
                Guía de Conectividad Empresarial 2026
              </h1>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                Todo lo que necesita saber para construir una infraestructura de red resiliente, 
                segura y preparada para el futuro de su empresa.
              </p>
              
              {/* Puntos clave */}
              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-700">Fundamentos de conectividad: ancho de banda, latencia, jitter</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-700">Estrategias de alta disponibilidad y conexión de respaldo</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-700">Comparativa completa: VPN vs. MPLS vs. SD-WAN</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-700">WiFi empresarial: de WiFi 6 a WiFi 7</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-700">Seguridad perimetral: NGFW, IPS y SASE</span>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-gray-700">Checklist de evaluación de infraestructura</span>
                </div>
              </div>
            </div>
            
            {/* Formulario */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              {!isSubmitted ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Descarga gratuita
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Complete el formulario para recibir la guía en su email.
                  </p>
                  
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="nombre" className="block text-sm font-medium text-gray-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        id="nombre"
                        name="nombre"
                        required
                        value={formData.nombre}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                        placeholder="Juan García"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email corporativo *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                        placeholder="juan@empresa.com"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="empresa" className="block text-sm font-medium text-gray-700 mb-1">
                        Empresa *
                      </label>
                      <input
                        type="text"
                        id="empresa"
                        name="empresa"
                        required
                        value={formData.empresa}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                        placeholder="Nombre de su empresa"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="telefono" className="block text-sm font-medium text-gray-700 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        id="telefono"
                        name="telefono"
                        value={formData.telefono}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                        placeholder="600 000 000"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="cargo" className="block text-sm font-medium text-gray-700 mb-1">
                        Cargo
                      </label>
                      <input
                        type="text"
                        id="cargo"
                        name="cargo"
                        value={formData.cargo}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition-colors"
                        placeholder="Director IT, Gerente..."
                      />
                    </div>
                    
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        id="acepta"
                        name="acepta"
                        required
                        checked={formData.acepta}
                        onChange={handleChange}
                        className="mt-1 w-4 h-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500"
                      />
                      <label htmlFor="acepta" className="text-sm text-gray-600">
                        Acepto la <Link href="/privacidad" className="text-orange-500 hover:underline">política de privacidad</Link> y 
                        recibir comunicaciones comerciales de Internet Operadores. *
                      </label>
                    </div>
                    
                    {error && (
                      <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                        {error}
                      </div>
                    )}
                    
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full bg-orange-500 text-white py-4 px-6 rounded-lg font-semibold hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSubmitting ? 'Enviando...' : 'Descargar Guía Gratuita'}
                    </button>
                  </form>
                  
                  <p className="text-xs text-gray-500 mt-4 text-center">
                    Sus datos están seguros. No compartimos su información con terceros.
                  </p>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">¡Gracias!</h3>
                  <p className="text-gray-600 mb-6">
                    Hemos enviado la guía a su email. También puede descargarla directamente:
                  </p>
                  <a
                    href="/guias/guia_conectividad_empresarial_2026.pdf"
                    download
                    className="inline-flex items-center gap-2 bg-orange-500 text-white py-3 px-6 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Descargar PDF (29 páginas)
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      
      {/* Índice de contenidos */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Contenido de la guía
          </h2>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                capitulo: '1',
                titulo: 'Fundamentos de Conectividad',
                descripcion: 'Ancho de banda, latencia, jitter. Tipos de conexión: fibra, radioenlace, 4G/5G. La importancia de la simetría.'
              },
              {
                capitulo: '2',
                titulo: 'Alta Disponibilidad',
                descripcion: 'El coste real del downtime. Estrategias de failover. Tecnologías de respaldo. Entendiendo los SLAs.'
              },
              {
                capitulo: '3',
                titulo: 'Redes Multi-Sede',
                descripcion: 'VPN para teletrabajo. MPLS para aplicaciones críticas. SD-WAN: la evolución inteligente.'
              },
              {
                capitulo: '4',
                titulo: 'WiFi Empresarial',
                descripcion: 'APs profesionales vs. domésticos. WiFi 6 y WiFi 7. Planificación y site survey. Seguridad WiFi.'
              },
              {
                capitulo: '5',
                titulo: 'Seguridad Perimetral',
                descripcion: 'Firewalls NGFW. Sistemas IDS/IPS. SASE y Zero Trust. Protección del perímetro.'
              },
              {
                capitulo: '6',
                titulo: 'Casos Prácticos',
                descripcion: 'Escenarios reales: oficina única, multi-sede, industria, hostelería. Soluciones recomendadas.'
              },
              {
                capitulo: '7',
                titulo: 'Checklist de Evaluación',
                descripcion: 'Lista de verificación completa para evaluar su infraestructura actual de conectividad.'
              },
              {
                capitulo: '8',
                titulo: 'Tendencias y Futuro',
                descripcion: '5G privado, WiFi 7, SASE, IA en redes. Lo que viene en los próximos años.'
              },
              {
                capitulo: '+',
                titulo: 'Glosario de Términos',
                descripcion: 'Definiciones claras de todos los términos técnicos utilizados en la guía.'
              }
            ].map((item, index) => (
              <div key={index} className="bg-white rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-orange-600 font-bold">{item.capitulo}</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">{item.titulo}</h3>
                    <p className="text-sm text-gray-600">{item.descripcion}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* Para quién es */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            ¿Para quién es esta guía?
          </h2>
          
          <div className="grid md:grid-cols-4 gap-6">
            {[
              {
                icono: '👨‍💼',
                titulo: 'Directores de IT',
                descripcion: 'Que buscan optimizar y modernizar la infraestructura de conectividad.'
              },
              {
                icono: '📊',
                titulo: 'Gerentes y Directivos',
                descripcion: 'Que necesitan entender las implicaciones estratégicas de la conectividad.'
              },
              {
                icono: '🚀',
                titulo: 'Empresarios',
                descripcion: 'Que quieren asegurar una base tecnológica sólida para crecer.'
              },
              {
                icono: '🏭',
                titulo: 'Responsables de Operaciones',
                descripcion: 'En sectores donde la conectividad es crítica para el negocio.'
              }
            ].map((item, index) => (
              <div key={index} className="text-center p-6">
                <div className="text-4xl mb-4">{item.icono}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{item.titulo}</h3>
                <p className="text-sm text-gray-600">{item.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      
      {/* CTA Final */}
      <section className="py-16 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            ¿Prefiere una evaluación personalizada?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Nuestros expertos pueden analizar su infraestructura actual y recomendarle 
            las mejores soluciones para su caso específico.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/34900000000?text=Hola,%20me%20gustaría%20solicitar%20una%20auditoría%20de%20conectividad"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 bg-orange-500 text-white py-4 px-8 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
            >
              Solicitar Auditoría Gratuita
            </a>
            <a
              href="tel:+34900000000"
              className="inline-flex items-center justify-center gap-2 bg-transparent border-2 border-white text-white py-4 px-8 rounded-lg font-semibold hover:bg-white hover:text-gray-900 transition-colors"
            >
              Llamar Ahora
            </a>
          </div>
        </div>
      </section>
      
      <EmpresaFooter />
    </div>
  );
}
