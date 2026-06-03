"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';
import { useState } from 'react';

const partners = [
  {
    nombre: 'Wildix',
    color: 'text-green-600',
    ideal: 'Contact Center y atención telefónica',
    descripcion: 'Plataforma de comunicaciones unificadas con potente centralita virtual, integración CRM y herramientas de contact center. Ideal para empresas con alto volumen de llamadas.',
    caracteristicas: ['Centralita virtual avanzada', 'Integración CRM nativa', 'Contact Center multicanal', 'WebRTC sin plugins', 'Analíticas en tiempo real']
  },
  {
    nombre: 'Zoom',
    color: 'text-blue-500',
    ideal: 'Videollamadas y webinars',
    descripcion: 'La plataforma de videoconferencia más utilizada del mundo. Calidad de vídeo superior, webinars para miles de asistentes y Zoom Phone para telefonía.',
    caracteristicas: ['Zoom Meetings HD', 'Zoom Webinars', 'Zoom Phone', 'Zoom Rooms', 'Integraciones con +1000 apps']
  },
  {
    nombre: 'Microsoft Teams',
    color: 'text-blue-600',
    ideal: 'Empresas con Office 365',
    descripcion: 'Si ya usas Office 365, Teams es tu solución natural. Integración completa con Outlook, SharePoint, OneDrive y todo el ecosistema Microsoft.',
    caracteristicas: ['Chat y colaboración', 'Videollamadas integradas', 'Integración Office 365', 'SharePoint y OneDrive', 'Power Automate']
  }
];

const beneficios = [
  {
    titulo: 'Reducción de costes',
    descripcion: 'Hasta un 40% de ahorro en comunicaciones al unificar voz, vídeo y datos en una sola plataforma.',
    icono: (
      <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  },
  {
    titulo: 'Mayor productividad',
    descripcion: 'Tus equipos colaboran mejor con herramientas integradas de chat, videollamada y compartición de archivos.',
    icono: (
      <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  },
  {
    titulo: 'Movilidad total',
    descripcion: 'Trabaja desde cualquier lugar con la misma experiencia. Softphone, app móvil y acceso web.',
    icono: (
      <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    )
  },
  {
    titulo: 'Escalabilidad',
    descripcion: 'Añade usuarios, líneas o funcionalidades según crece tu empresa. Sin inversiones en hardware.',
    icono: (
      <svg className="w-6 h-6 sm:w-8 sm:h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
      </svg>
    )
  }
];

const funcionalidadesOpciones = [
  'Llamadas internas y externas',
  'Videoconferencia',
  'Chat corporativo',
  'Grabación de llamadas',
  'IVR (menú de opciones)',
  'Integración con CRM',
  'Softphone (app móvil)',
  'Fax virtual',
];

export default function ComunicacionesUnificadasPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    numEmpleados: '',
    centralitaActual: '',
    funcionalidades: [] as string[],
    modalidadTrabajo: '',
    operadorActual: '',
    comentarios: '',
    newsletter: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleFuncionalidadChange = (func: string) => {
    setFormData(prev => ({
      ...prev,
      funcionalidades: prev.funcionalidades.includes(func)
        ? prev.funcionalidades.filter(f => f !== func)
        : [...prev.funcionalidades, func]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/contrata/comunicaciones-unificadas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          empresa: formData.empresa,
          telefono: formData.telefono,
          numEmpleados: formData.numEmpleados,
          centralitaActual: formData.centralitaActual,
          funcionalidades: formData.funcionalidades,
          modalidadTrabajo: formData.modalidadTrabajo,
          operadorActual: formData.operadorActual,
          comentarios: formData.comentarios,
        }),
      });
      if (response.ok) {
        setIsSubmitted(true);
      } else {
        const data = await response.json();
        setError(data.error || 'Error al enviar el formulario');
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soluciones" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/soluciones" className="inline-flex items-center text-orange-600 hover:text-orange-700 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Volver a Soluciones
            </Link>
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 inline-block mr-1 sm:mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
              </svg>
              Partners Wildix & Zoom
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">
              Comunicaciones Unificadas
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">
              Centralita virtual, videoconferencia, chat empresarial y colaboración en una sola plataforma. No te atamos a un fabricante: elegimos la mejor solución para tu empresa.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <a href="#propuesta" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">
                Solicitar Propuesta Gratuita
              </a>
              <a href="https://wa.me/34900730034?text=Hola,%20quiero%20información%20sobre%20Comunicaciones%20Unificadas" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">
                Hablar con un experto
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Beneficios */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              ¿Por qué unificar tus comunicaciones?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Las empresas que unifican sus comunicaciones son más eficientes, reducen costes y mejoran la experiencia de sus clientes.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8 max-w-6xl mx-auto">
            {beneficios.map((beneficio, index) => (
              <div key={index} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all text-center">
                <div className="w-14 h-14 sm:w-16 sm:h-16 bg-orange-100 rounded-xl flex items-center justify-center mb-4 sm:mb-6 mx-auto text-orange-600">
                  {beneficio.icono}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2 sm:mb-3">{beneficio.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{beneficio.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partners - Soluciones */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              La solución correcta para cada empresa
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              No vendemos lo único que tenemos. Analizamos tu empresa y te recomendamos la mejor opción entre nuestros partners tecnológicos.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8 max-w-6xl mx-auto">
            {partners.map((partner, index) => (
              <div key={index} className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-6 sm:p-8 hover:shadow-xl transition-all">
                <div className="h-16 sm:h-20 flex items-center justify-center mb-4 sm:mb-6">
                  <div className={`text-3xl sm:text-4xl font-bold ${partner.color}`}>{partner.nombre}</div>
                </div>
                <p className="text-xs sm:text-sm text-orange-600 font-semibold mb-3 sm:mb-4">Ideal para: {partner.ideal}</p>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">{partner.descripcion}</p>
                <div className="border-t pt-4 sm:pt-6">
                  <p className="text-xs sm:text-sm font-semibold text-gray-900 mb-2 sm:mb-3">Características:</p>
                  <ul className="space-y-2">
                    {partner.caracteristicas.map((caracteristica, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
                        <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {caracteristica}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proceso */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">
              ¿Cómo trabajamos?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Un proceso probado para garantizar el éxito de tu proyecto de comunicaciones unificadas.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {[
              { paso: '1', titulo: 'Auditoría', descripcion: 'Analizamos tu infraestructura actual y necesidades de comunicación.' },
              { paso: '2', titulo: 'Propuesta', descripcion: 'Te presentamos la mejor solución con presupuesto detallado.' },
              { paso: '3', titulo: 'Implementación', descripcion: 'Desplegamos la solución con mínimo impacto en tu operativa.' },
              { paso: '4', titulo: 'Soporte', descripcion: 'Te acompañamos con soporte 24/7 y formación continua.' }
            ].map((item, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-orange-600 text-white rounded-full flex items-center justify-center text-xl sm:text-2xl font-bold mx-auto mb-4">
                  {item.paso}
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">{item.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{item.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Productos dinámicos */}
      <ProductosSolucionDynamic solucion="comunicaciones-unificadas" solucionNombre="Comunicaciones Unificadas" />

      {/* Formulario de solicitud */}
      <section id="propuesta" className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Sin compromiso
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu propuesta personalizada</h2>
                <p className="text-gray-400 mb-8">Cuéntanos sobre tu empresa y te prepararemos una propuesta a medida con la mejor solución de comunicaciones unificadas para tu caso.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Comparativa personalizada</div>
                      <div className="text-sm text-gray-400">Wildix, Zoom o Teams: te recomendamos la mejor opción para tu caso</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Presupuesto detallado</div>
                      <div className="text-sm text-gray-400">Coste por usuario/mes, sin sorpresas ni costes ocultos</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Demo gratuita</div>
                      <div className="text-sm text-gray-400">Prueba la plataforma antes de decidir, sin compromiso</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div>
                      <div className="text-white font-semibold">Plan de migración</div>
                      <div className="text-sm text-gray-400">Cronograma detallado con mínimo impacto en tu operativa</div>
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
                    <p className="text-gray-600">Te hemos enviado un email de confirmación. Nuestro equipo de comunicaciones analizará tus necesidades y te contactará en menos de 24 horas con una propuesta personalizada.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Datos de contacto</h3>
                    <p className="text-sm text-gray-500 mb-3">Cuéntanos quién eres para preparar tu propuesta.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                        <input type="text" required value={formData.nombre} onChange={(e) => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900" placeholder="Tu nombre" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                        <input type="text" required value={formData.empresa} onChange={(e) => setFormData({...formData, empresa: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900" placeholder="Nombre de tu empresa" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input type="email" required value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900" placeholder="tu@empresa.com" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input type="tel" value={formData.telefono} onChange={(e) => setFormData({...formData, telefono: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900" placeholder="600 000 000" />
                      </div>
                    </div>

                    <hr className="my-4 border-gray-200" />
                    <h3 className="text-lg font-bold text-gray-900 mb-1">Sobre tu empresa</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº empleados con comunicaciones *</label>
                        <select required value={formData.numEmpleados} onChange={(e) => setFormData({...formData, numEmpleados: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="1-5">1-5 empleados</option>
                          <option value="6-15">6-15 empleados</option>
                          <option value="16-30">16-30 empleados</option>
                          <option value="31-50">31-50 empleados</option>
                          <option value="51-100">51-100 empleados</option>
                          <option value="+100">Más de 100</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">¿Tienen centralita actualmente?</label>
                        <select value={formData.centralitaActual} onChange={(e) => setFormData({...formData, centralitaActual: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="No tenemos">No tenemos</option>
                          <option value="Sí, analógica">Sí, analógica</option>
                          <option value="Sí, IP (VoIP)">Sí, IP (VoIP)</option>
                          <option value="Sí, virtual en la nube">Sí, virtual en la nube</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué funcionalidades necesitan?</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {funcionalidadesOpciones.map((func) => (
                          <label key={func} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.funcionalidades.includes(func)}
                              onChange={() => handleFuncionalidadChange(func)}
                              className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
                            />
                            {func}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad de trabajo</label>
                        <select value={formData.modalidadTrabajo} onChange={(e) => setFormData({...formData, modalidadTrabajo: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Todo presencial, una sede">Todo presencial, una sede</option>
                          <option value="Presencial, varias sedes">Presencial, varias sedes</option>
                          <option value="Híbrido (oficina + remoto)">Híbrido (oficina + remoto)</option>
                          <option value="Mayoría en remoto">Mayoría en remoto</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Operador actual</label>
                        <input type="text" value={formData.operadorActual} onChange={(e) => setFormData({...formData, operadorActual: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900" placeholder="Ej: Movistar, Vodafone..." />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                      <textarea rows={3} value={formData.comentarios} onChange={(e) => setFormData({...formData, comentarios: e.target.value})} className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm text-gray-900 resize-none" placeholder="Cuéntanos cualquier necesidad específica..." />
                    </div>

                    <div className="flex items-start gap-2">
                      <input type="checkbox" required checked={formData.newsletter} onChange={(e) => setFormData({...formData, newsletter: e.target.checked})} className="mt-1 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                      <label className="text-xs text-gray-500">Acepto recibir la propuesta personalizada y suscribirme al newsletter de Internet Operadores con novedades y consejos para empresas. Puedo darme de baja en cualquier momento.</label>
                    </div>
                    {error && <p className="text-red-600 text-sm">{error}</p>}
                    <button type="submit" disabled={isSubmitting} className="w-full px-6 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSubmitting ? 'Enviando...' : 'Solicitar Propuesta Gratuita'}
                    </button>
                    <p className="text-xs text-gray-400 text-center">Sin compromiso. Te contactaremos en menos de 24h.</p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-12 sm:py-16 lg:py-20 bg-orange-600">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">
              ¿Prefieres hablar directamente?
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">
              Nuestro equipo de expertos en comunicaciones está disponible para resolver cualquier duda.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <a href="#propuesta" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">
                Solicitar Propuesta Gratuita
              </a>
              <a href="tel:+34900730034" className="inline-block px-8 py-4 sm:px-10 sm:py-5 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-base sm:text-lg">
                Llamar: 900 730 034
              </a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
