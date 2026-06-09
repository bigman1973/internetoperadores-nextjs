"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';
import { useState } from 'react';

const soluciones = [
  { titulo: 'Conexión con Respaldo', descripcion: 'Línea principal con backup automático. Si falla la fibra, se activa 5G, WIMAX o Satélite sin intervención manual.', caracteristicas: ['Failover automático', 'Sin cortes de servicio', 'Múltiples tecnologías', 'Monitorización 24/7'] },
  { titulo: 'MPLS', descripcion: 'Red privada para conectar múltiples sedes con máxima seguridad y calidad de servicio garantizada.', caracteristicas: ['QoS garantizado', 'Seguridad extremo a extremo', 'Escalable', 'SLA empresarial'] },
  { titulo: 'Conectividad Internacional', descripcion: 'Conexiones dedicadas para empresas con presencia internacional. Latencia optimizada y rutas redundantes.', caracteristicas: ['Baja latencia', 'Rutas redundantes', 'Soporte global', 'Facturación centralizada'] },
  { titulo: 'SD-WAN', descripcion: 'Gestión inteligente del tráfico entre sedes. Optimiza el uso de múltiples conexiones automáticamente.', caracteristicas: ['Gestión centralizada', 'Optimización automática', 'Visibilidad total', 'Reducción de costes'] }
];

const serviciosOpciones = [
  'Internet dedicado',
  'VPN entre sedes',
  'Backup de línea (failover)',
  'IP fija',
  'Fibra simétrica',
  'SD-WAN',
  'Housing/Colocation',
  'Conectividad para eventos',
];

export default function ConectividadAvanzadaPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    numSedes: '',
    conexionActual: '',
    velocidadNecesaria: '',
    servicios: [] as string[],
    problemaActual: '',
    operadorActual: '',
    comentarios: '',
    newsletter: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleServicioChange = (servicio: string) => {
    setFormData(prev => ({
      ...prev,
      servicios: prev.servicios.includes(servicio)
        ? prev.servicios.filter(s => s !== servicio)
        : [...prev.servicios, servicio]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/contrata/conectividad-avanzada', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          empresa: formData.empresa,
          telefono: formData.telefono,
          numSedes: formData.numSedes,
          conexionActual: formData.conexionActual,
          velocidadNecesaria: formData.velocidadNecesaria,
          servicios: formData.servicios,
          problemaActual: formData.problemaActual,
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
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Soluciones
            </Link>
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Failover automático</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Conectividad Avanzada</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Tu negocio no puede parar. Conexiones con respaldo automático, MPLS para múltiples sedes y conectividad internacional con la máxima fiabilidad.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <a href="#estudio" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Estudio Gratuito</a>
              <a href="https://wa.me/34900730034?text=Hola,%20quiero%20información%20sobre%20Conectividad%20Avanzada" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-8 sm:py-12 bg-white border-b">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {[{valor:'99.99%',label:'Disponibilidad',desc:'SLA garantizado'},{valor:'<30s',label:'Failover',desc:'Tiempo de conmutación'},{valor:'24/7',label:'Monitorización',desc:'NOC propio'},{valor:'100%',label:'Cobertura',desc:'Cualquier ubicación'}].map((b,i)=>(
              <div key={i} className="text-center"><div className="text-3xl sm:text-4xl font-bold text-orange-600 mb-1 sm:mb-2">{b.valor}</div><div className="font-semibold text-gray-900 mb-1">{b.label}</div><div className="text-xs sm:text-sm text-gray-500">{b.desc}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Soluciones */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Soluciones de Conectividad</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Diseñamos la arquitectura de red que tu empresa necesita, con redundancia y alta disponibilidad.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {soluciones.map((s,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">{s.descripcion}</p>
                <div className="grid grid-cols-2 gap-2">{s.caracteristicas.map((c,j)=>(<div key={j} className="flex items-center gap-2 text-xs sm:text-sm text-gray-600"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{c}</div>))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Productos dinámicos */}
      <ProductosSolucionDynamic solucion="conectividad-avanzada" solucionNombre="Conectividad Avanzada" ctaHref="#estudio" />

      {/* Formulario de solicitud */}
      <section id="estudio" className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Sin compromiso
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu estudio de conectividad</h2>
                <p className="text-gray-400 mb-8">Analizamos tu ubicación, necesidades y presupuesto para proponerte la mejor solución de conectividad con garantía de servicio.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Estudio de cobertura personalizado</p><p className="text-gray-400 text-sm">Verificamos todas las tecnologías disponibles en tu zona</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Comparativa de operadores</p><p className="text-gray-400 text-sm">Te presentamos las mejores opciones precio/calidad</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">SLA garantizado por contrato</p><p className="text-gray-400 text-sm">99.99% de disponibilidad con penalizaciones</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Soporte técnico 24/7</p><p className="text-gray-400 text-sm">NOC propio con monitorización proactiva</p></div>
                  </div>
                </div>
              </div>

              {/* Formulario */}
              <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-xl">
                {isSubmitted ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">Solicitud recibida</h3>
                    <p className="text-gray-600">Te hemos enviado un email de confirmación. Nuestro equipo te contactará en menos de 24h con tu estudio personalizado.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    <h3 className="text-xl font-bold text-gray-900 mb-6">Datos de contacto</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                        <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Tu nombre" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                        <input type="text" required value={formData.empresa} onChange={e => setFormData({...formData, empresa: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Nombre de tu empresa" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="tu@empresa.com" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input type="tel" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="600 000 000" />
                      </div>
                    </div>

                    <hr className="my-6 border-gray-200" />
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Sobre tu conectividad</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº de sedes/ubicaciones *</label>
                        <select required value={formData.numSedes} onChange={e => setFormData({...formData, numSedes: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="1 sede">1 sede</option>
                          <option value="2-3 sedes">2-3 sedes</option>
                          <option value="4-10 sedes">4-10 sedes</option>
                          <option value="+10 sedes">+10 sedes</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Conexión actual</label>
                        <select value={formData.conexionActual} onChange={e => setFormData({...formData, conexionActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="ADSL">ADSL</option>
                          <option value="Fibra simétrica">Fibra simétrica</option>
                          <option value="Fibra no simétrica">Fibra no simétrica</option>
                          <option value="Radio enlace">Radio enlace</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Velocidad necesaria</label>
                        <select value={formData.velocidadNecesaria} onChange={e => setFormData({...formData, velocidadNecesaria: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Hasta 100 Mbps">Hasta 100 Mbps</option>
                          <option value="100-300 Mbps">100-300 Mbps</option>
                          <option value="300 Mbps - 1 Gbps">300 Mbps - 1 Gbps</option>
                          <option value="+1 Gbps">+1 Gbps</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Principal problema actual</label>
                        <select value={formData.problemaActual} onChange={e => setFormData({...formData, problemaActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Velocidad insuficiente">Velocidad insuficiente</option>
                          <option value="Caídas frecuentes">Caídas frecuentes</option>
                          <option value="Latencia alta">Latencia alta</option>
                          <option value="Necesito conectar varias sedes">Necesito conectar varias sedes</option>
                          <option value="Precio demasiado alto">Precio demasiado alto</option>
                          <option value="Proyecto nuevo">Estoy empezando un proyecto nuevo</option>
                        </select>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué servicios necesitas?</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {serviciosOpciones.map((servicio) => (
                          <label key={servicio} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input type="checkbox" checked={formData.servicios.includes(servicio)} onChange={() => handleServicioChange(servicio)} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500" />
                            {servicio}
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Operador actual</label>
                      <input type="text" value={formData.operadorActual} onChange={e => setFormData({...formData, operadorActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Ej: Movistar, Vodafone..." />
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                      <textarea value={formData.comentarios} onChange={e => setFormData({...formData, comentarios: e.target.value})} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Cuéntanos cualquier necesidad específica..." />
                    </div>

                    <div className="mb-6">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" required checked={formData.newsletter} onChange={e => setFormData({...formData, newsletter: e.target.checked})} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 mt-0.5" />
                        <span className="text-xs text-gray-600">Acepto recibir el estudio de conectividad y suscribirme al newsletter de Internet Operadores con novedades y consejos para empresas. Puedo darme de baja en cualquier momento.</span>
                      </label>
                    </div>

                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                    <button type="submit" disabled={isSubmitting} className="w-full px-6 py-3.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSubmitting ? 'Enviando...' : 'Solicitar Estudio Gratuito'}
                    </button>
                    <p className="text-center text-xs text-gray-500 mt-3">Sin compromiso. Te contactaremos en menos de 24h.</p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
