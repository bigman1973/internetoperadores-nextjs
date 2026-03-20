"use client";
import Link from 'next/link';
import { useState } from 'react';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

export default function ContactoPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    empleados: '',
    servicio: '',
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
      await new Promise(resolve => setTimeout(resolve, 1500));
      setIsSubmitted(true);
    } catch (err) {
      setError('Ha ocurrido un error. Por favor, inténtelo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target;
    const { name, value } = target;
    const checked = target instanceof HTMLInputElement ? target.checked : false;
    const type = target instanceof HTMLInputElement ? target.type : 'text';
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="contacto" />
      
      {/* Hero */}
      <section className="bg-gradient-to-br from-orange-50 via-white to-orange-50 py-10 sm:py-16 lg:py-20">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-4 sm:mb-6">
              Contacta con nosotros
            </h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">
              Cuéntanos las necesidades de tu empresa y te prepararemos una propuesta personalizada sin compromiso.
            </p>
          </div>
        </div>
      </section>

      {/* Contenido principal */}
      <section className="py-8 sm:py-12 lg:py-16 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              
              {/* Formulario */}
              <div className="lg:col-span-2">
                {!isSubmitted ? (
                  <div className="bg-white border-2 border-gray-200 rounded-2xl p-6 sm:p-8">
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Solicitar presupuesto</h2>
                    <p className="text-gray-600 mb-6">Complete el formulario y le responderemos en menos de 24 horas laborables.</p>
                    
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="nombre" className="block text-sm font-semibold text-gray-700 mb-1">
                            Nombre completo *
                          </label>
                          <input
                            type="text"
                            id="nombre"
                            name="nombre"
                            required
                            value={formData.nombre}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900"
                            placeholder="Juan García López"
                          />
                        </div>
                        <div>
                          <label htmlFor="empresa" className="block text-sm font-semibold text-gray-700 mb-1">
                            Empresa *
                          </label>
                          <input
                            type="text"
                            id="empresa"
                            name="empresa"
                            required
                            value={formData.empresa}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900"
                            placeholder="Mi Empresa S.L."
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-1">
                            Email corporativo *
                          </label>
                          <input
                            type="email"
                            id="email"
                            name="email"
                            required
                            value={formData.email}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900"
                            placeholder="juan@miempresa.com"
                          />
                        </div>
                        <div>
                          <label htmlFor="telefono" className="block text-sm font-semibold text-gray-700 mb-1">
                            Teléfono *
                          </label>
                          <input
                            type="tel"
                            id="telefono"
                            name="telefono"
                            required
                            value={formData.telefono}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900"
                            placeholder="612 345 678"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="empleados" className="block text-sm font-semibold text-gray-700 mb-1">
                            Numero de empleados
                          </label>
                          <select
                            id="empleados"
                            name="empleados"
                            value={formData.empleados}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900 bg-white"
                          >
                            <option value="">Seleccionar</option>
                            <option value="1-10">1 - 10 empleados</option>
                            <option value="11-50">11 - 50 empleados</option>
                            <option value="51-200">51 - 200 empleados</option>
                            <option value="201-500">201 - 500 empleados</option>
                            <option value="500+">Más de 500 empleados</option>
                          </select>
                        </div>
                        <div>
                          <label htmlFor="servicio" className="block text-sm font-semibold text-gray-700 mb-1">
                            Servicio de interés
                          </label>
                          <select
                            id="servicio"
                            name="servicio"
                            value={formData.servicio}
                            onChange={handleChange}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900 bg-white"
                          >
                            <option value="">Seleccionar</option>
                            <option value="conectividad">Conectividad avanzada (Fibra, MPLS, SD-WAN)</option>
                            <option value="comunicaciones">Comunicaciones unificadas (VoIP, Teams)</option>
                            <option value="infraestructura">Infraestructura de red (WiFi, Switching)</option>
                            <option value="mantenimiento">Mantenimiento IT</option>
                            <option value="moviles">Líneas móviles empresariales</option>
                            <option value="exagrid">ExaGrid (Backup y recuperación)</option>
                            <option value="varios">Varios servicios / No estoy seguro</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="mensaje" className="block text-sm font-semibold text-gray-700 mb-1">
                          Cuéntanos tu necesidad
                        </label>
                        <textarea
                          id="mensaje"
                          name="mensaje"
                          rows={4}
                          value={formData.mensaje}
                          onChange={handleChange}
                          className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-500 focus:outline-none text-gray-900 resize-none"
                          placeholder="Describe brevemente qué necesitas: tipo de conexión, número de sedes, servicios actuales, problemas que quieres resolver..."
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
                          className="h-4 w-4 text-orange-600 rounded mt-1 accent-orange-600"
                        />
                        <label htmlFor="acepta" className="text-sm text-gray-600">
                          Acepto la <Link href="/politica-privacidad" className="underline hover:text-orange-600">política de privacidad</Link> y consiento el tratamiento de mis datos para recibir información comercial. *
                        </label>
                      </div>

                      {error && <p className="text-red-500 text-sm">{error}</p>}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full px-6 py-4 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            Enviando...
                          </span>
                        ) : 'Solicitar Presupuesto'}
                      </button>
                    </form>
                  </div>
                ) : (
                  <div className="bg-white border-2 border-green-200 rounded-2xl p-8 sm:p-12 text-center">
                    <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                      <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Solicitud enviada correctamente</h2>
                    <p className="text-gray-600 mb-6">
                      Hemos recibido su solicitud. Nuestro equipo comercial se pondrá en contacto con usted en menos de 24 horas laborables.
                    </p>
                    <p className="text-sm text-gray-500 mb-8">
                      Si necesita una respuesta urgente, puede llamarnos directamente o contactar por WhatsApp.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                      <a href="tel:+34900900900" className="px-6 py-3 bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-all font-semibold">
                        Llamar ahora
                      </a>
                      <a href="https://wa.me/34900900900" className="px-6 py-3 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold">
                        WhatsApp
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar de contacto */}
              <div className="space-y-6">
                {/* Teléfono */}
                <div className="bg-gray-50 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Teléfono</h3>
                  </div>
                  <a href="tel:+34900900900" className="text-xl font-bold text-orange-600 hover:text-orange-700">
                    900 900 900
                  </a>
                  <p className="text-sm text-gray-500 mt-1">Lunes a Viernes, 9:00 - 19:00</p>
                </div>

                {/* WhatsApp */}
                <div className="bg-green-50 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-900">WhatsApp</h3>
                  </div>
                  <a href="https://wa.me/34900900900" className="inline-block px-5 py-2.5 bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all font-semibold text-sm">
                    Iniciar conversación
                  </a>
                  <p className="text-sm text-gray-500 mt-2">Respuesta inmediata en horario laboral</p>
                </div>

                {/* Email */}
                <div className="bg-gray-50 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Email</h3>
                  </div>
                  <a href="mailto:comercial@internetoperadores.com" className="text-orange-600 hover:text-orange-700 font-medium">
                    comercial@internetoperadores.com
                  </a>
                </div>

                {/* Soporte 24/7 */}
                <div className="bg-orange-600 rounded-2xl p-6 text-white">
                  <h3 className="font-bold text-lg mb-2">Soporte técnico 24/7</h3>
                  <p className="text-orange-100 text-sm mb-4">
                    Si ya es cliente y necesita soporte técnico, nuestro equipo está disponible las 24 horas.
                  </p>
                  <a href="tel:+34900900901" className="inline-block px-5 py-2.5 bg-white text-orange-600 rounded-xl hover:bg-orange-50 transition-all font-semibold text-sm">
                    900 900 901 (Soporte)
                  </a>
                </div>

                {/* Dirección */}
                <div className="bg-gray-50 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                      <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <h3 className="font-bold text-gray-900">Oficinas</h3>
                  </div>
                  <p className="text-gray-700 text-sm">
                    Internet Operadores S.L.<br />
                    Barcelona, España
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ventajas */}
      <section className="py-12 sm:py-16 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-8 text-center">
              ¿Por qué elegir Internet Operadores?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-1">SLA garantizado</h3>
                <p className="text-sm text-gray-600">99,9% de disponibilidad con penalizaciones contractuales</p>
              </div>
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Soporte 24/7</h3>
                <p className="text-sm text-gray-600">Equipo técnico disponible todos los días del año</p>
              </div>
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Gestor dedicado</h3>
                <p className="text-sm text-gray-600">Un interlocutor único que conoce tu empresa</p>
              </div>
              <div className="bg-white rounded-xl p-6 text-center shadow-sm">
                <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-7 h-7 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Multioperador</h3>
                <p className="text-sm text-gray-600">Acceso a todas las redes para la mejor solución</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
