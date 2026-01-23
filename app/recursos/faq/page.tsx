"use client";
import Link from 'next/link';
import { useState } from 'react';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';

const faqs = [
  {
    categoria: 'Conectividad',
    preguntas: [
      {
        pregunta: '¿Qué pasa si se cae mi conexión principal?',
        respuesta: 'Nuestro sistema de failover automático detecta la caída en menos de 30 segundos y activa automáticamente la conexión de backup (5G, WIMAX o Satélite según disponibilidad). Tu negocio no se para.'
      },
      {
        pregunta: '¿Cuánto tarda la instalación de fibra empresarial?',
        respuesta: 'El tiempo de instalación depende de la infraestructura existente. En zonas con cobertura de fibra, el proceso completo (alta + instalación) suele tardar entre 5 y 15 días laborables.'
      },
      {
        pregunta: '¿Qué velocidades ofrecéis para empresas?',
        respuesta: 'Ofrecemos conexiones simétricas desde 100 Mbps hasta 10 Gbps, dependiendo de las necesidades de tu empresa y la infraestructura disponible en tu zona.'
      }
    ]
  },
  {
    categoria: 'Soporte',
    preguntas: [
      {
        pregunta: '¿Qué incluye el soporte 24/7?',
        respuesta: 'Nuestro soporte 24/7 incluye atención telefónica con técnicos especializados, monitorización proactiva de tu conexión, y respuesta a incidencias en menos de 4 horas para clientes empresa.'
      },
      {
        pregunta: '¿Cómo puedo contactar con soporte técnico?',
        respuesta: 'Puedes contactarnos por teléfono (disponible 24/7), WhatsApp, email o a través del área de cliente. Para emergencias, recomendamos siempre el teléfono.'
      }
    ]
  },
  {
    categoria: 'Facturación',
    preguntas: [
      {
        pregunta: '¿Cuáles son las formas de pago disponibles?',
        respuesta: 'Aceptamos domiciliación bancaria (SEPA), transferencia bancaria y tarjeta de crédito. Para empresas con múltiples servicios, ofrecemos facturación consolidada.'
      }
    ]
  }
];

const tutoriales = [
  {
    titulo: 'Cómo configurar tu centralita virtual Wildix',
    descripcion: 'Guía paso a paso para configurar extensiones, grupos de llamada y buzones de voz en tu centralita Wildix.',
    duracion: '15 min',
    nivel: 'Intermedio'
  },
  {
    titulo: 'Primeros pasos con tu router empresarial',
    descripcion: 'Configuración inicial de tu router: acceso al panel, cambio de contraseña, configuración WiFi y seguridad básica.',
    duracion: '10 min',
    nivel: 'Básico'
  },
  {
    titulo: 'Cómo acceder al área de cliente',
    descripcion: 'Tutorial para acceder al área de cliente, consultar facturas, abrir tickets de soporte y gestionar tus servicios.',
    duracion: '5 min',
    nivel: 'Básico'
  },
  {
    titulo: 'Configuración de VPN para teletrabajo',
    descripcion: 'Cómo configurar una conexión VPN segura para que tus empleados puedan trabajar desde casa.',
    duracion: '20 min',
    nivel: 'Avanzado'
  }
];

export default function FAQPage() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="recursos" />
      
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/recursos" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Recursos
            </Link>
            <div className="text-5xl mb-4">❓</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">FAQ y Tutoriales</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Respuestas a las preguntas más frecuentes y tutoriales paso a paso.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="py-12 sm:py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Preguntas frecuentes</h2>
            <div className="space-y-6">
              {faqs.map((categoria, i) => (
                <div key={i}>
                  <h3 className="text-lg font-bold text-orange-600 mb-4">{categoria.categoria}</h3>
                  <div className="space-y-3">
                    {categoria.preguntas.map((faq, j) => {
                      const faqId = `${i}-${j}`;
                      const isOpen = openFaq === faqId;
                      return (
                        <div key={j} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                          <button
                            onClick={() => setOpenFaq(isOpen ? null : faqId)}
                            className="w-full px-5 py-4 text-left flex justify-between items-center hover:bg-gray-50 transition-colors"
                          >
                            <span className="font-semibold text-gray-900 pr-4">{faq.pregunta}</span>
                            <svg 
                              className={`w-5 h-5 text-orange-600 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {isOpen && (
                            <div className="px-5 pb-4">
                              <p className="text-gray-600">{faq.respuesta}</p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Tutoriales */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8">Tutoriales</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tutoriales.map((tutorial, i) => (
                <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-5 hover:border-orange-500 hover:shadow-lg transition-all">
                  <div className="flex gap-2 mb-3">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      tutorial.nivel === 'Básico' ? 'bg-green-100 text-green-700' :
                      tutorial.nivel === 'Intermedio' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {tutorial.nivel}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                      ⏱️ {tutorial.duracion}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{tutorial.titulo}</h3>
                  <p className="text-sm text-gray-600 mb-3">{tutorial.descripcion}</p>
                  <button className="text-orange-600 font-semibold text-sm hover:text-orange-700">
                    Ver tutorial →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-16 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">¿No encuentras lo que buscas?</h2>
            <p className="text-base sm:text-lg text-gray-300 mb-6">
              Nuestro equipo de soporte está disponible 24/7 para ayudarte.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href="tel:+34900000000" className="px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">
                Llamar a Soporte
              </a>
              <a href="https://wa.me/34600000000" className="px-6 py-3 border-2 border-white text-white rounded-lg hover:bg-white hover:text-gray-900 transition-all font-semibold">
                WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
