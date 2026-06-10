"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';
import { useState } from 'react';

const servicios = [
  { titulo: 'WiFi Empresarial', descripcion: 'Diseño e implementación de redes WiFi de alto rendimiento. Cobertura total, roaming seamless y gestión centralizada.', caracteristicas: ['Alta densidad de usuarios', 'Roaming sin cortes', 'Gestión cloud', 'Analíticas de uso'] },
  { titulo: 'Cableado Estructurado', descripcion: 'Instalación y certificación de cableado Cat6/Cat6A. Infraestructura preparada para el futuro.', caracteristicas: ['Certificación Fluke', 'Cat6A hasta 10Gbps', 'Garantía 25 años', 'Documentación completa'] },
  { titulo: 'Switching y Routing', descripcion: 'Equipamiento de red empresarial con redundancia, VLANs y QoS para priorizar tráfico crítico.', caracteristicas: ['Alta disponibilidad', 'QoS avanzado', 'Segmentación VLAN', 'Gestión centralizada'] },
  { titulo: 'Seguridad de Red', descripcion: 'Firewalls, IDS/IPS y segmentación de red para proteger tu infraestructura de amenazas.', caracteristicas: ['Next-Gen Firewall', 'Detección de intrusos', 'VPN site-to-site', 'Monitorización 24/7'] }
];

const serviciosOpciones = [
  'WiFi empresarial (diseño + instalación)',
  'Cableado estructurado (Cat6/Cat6A)',
  'Switching y routing',
  'Seguridad de red (firewall, IDS/IPS)',
  'Auditoría de red existente',
  'Ampliación de red actual',
  'Migración de equipamiento',
  'Monitorización y gestión remota',
];

export default function InfraestructuraRedPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    tipoProyecto: '',
    numUsuarios: '',
    superficieM2: '',
    numPlantas: '',
    servicios: [] as string[],
    infraestructuraActual: '',
    fabricantePreferido: '',
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
      const response = await fetch('/api/contrata/infraestructura-red', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          empresa: formData.empresa,
          telefono: formData.telefono,
          tipoProyecto: formData.tipoProyecto,
          numUsuarios: formData.numUsuarios,
          superficieM2: formData.superficieM2,
          numPlantas: formData.numPlantas,
          servicios: formData.servicios,
          infraestructuraActual: formData.infraestructuraActual,
          fabricantePreferido: formData.fabricantePreferido,
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
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Partner Ruckus</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Infraestructura de Red</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Diseño, implementación y mantenimiento de redes empresariales. Especialistas en Ruckus con capacidad para trabajar con amplio portfolio de fabricantes.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <a href="#auditoria" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Auditoría de Red</a>
              <a href="https://wa.me/34900730034?text=Hola,%20quiero%20información%20sobre%20Infraestructura%20de%20Red" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-8 sm:py-12 bg-white border-b">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {[{valor:'10 Gbps',label:'Velocidad',desc:'Cat6A certificado'},{valor:'WiFi 6E',label:'Tecnología',desc:'Última generación'},{valor:'25 años',label:'Garantía',desc:'Cableado estructurado'},{valor:'24/7',label:'Monitorización',desc:'Gestión proactiva'}].map((b,i)=>(
              <div key={i} className="text-center"><div className="text-2xl sm:text-3xl lg:text-4xl font-bold text-orange-600 mb-1 sm:mb-2">{b.valor}</div><div className="font-semibold text-gray-900 mb-1">{b.label}</div><div className="text-xs sm:text-sm text-gray-500">{b.desc}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Nuestros Servicios</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Soluciones completas de infraestructura de red para empresas de cualquier tamaño.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {servicios.map((s,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">{s.descripcion}</p>
                <div className="grid grid-cols-2 gap-2">{s.caracteristicas.map((c,j)=>(<div key={j} className="flex items-center gap-2 text-xs sm:text-sm text-gray-600"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{c}</div>))}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fabricantes */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-8 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 sm:mb-4">Fabricantes con los que trabajamos</h2>
            <p className="text-base sm:text-lg text-gray-600">No nos limitamos a un solo fabricante. Elegimos el mejor para cada proyecto.</p>
          </div>
          <div className="flex flex-wrap justify-center items-center gap-8 sm:gap-12 max-w-4xl mx-auto">
            {['Ruckus', 'Cisco', 'Aruba', 'Fortinet', 'Ubiquiti'].map((f,i)=>(<div key={i} className="text-xl sm:text-2xl font-bold text-gray-400 hover:text-orange-600 transition-colors">{f}</div>))}
          </div>
        </div>
      </section>

      {/* Productos dinámicos */}
      <ProductosSolucionDynamic solucion="infraestructura-red" solucionNombre="Infraestructura de Red" ctaHref="#auditoria" />

      {/* Formulario de solicitud */}
      <section id="auditoria" className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Auditoría gratuita
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu auditoría de red</h2>
                <p className="text-gray-400 mb-8">Analizamos tu infraestructura actual, detectamos cuellos de botella y te proponemos mejoras con presupuesto detallado.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Site survey profesional</p><p className="text-gray-400 text-sm">Medición de cobertura WiFi y análisis de interferencias</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Diseño de red a medida</p><p className="text-gray-400 text-sm">Planos de cobertura y topología de red</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Presupuesto sin compromiso</p><p className="text-gray-400 text-sm">Equipamiento + instalación + mantenimiento</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Instalación certificada</p><p className="text-gray-400 text-sm">Técnicos certificados por los fabricantes</p></div>
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
                    <p className="text-gray-600">Te hemos enviado un email de confirmación. Nuestro equipo de ingeniería te contactará en menos de 24h para coordinar la auditoría.</p>
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
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Sobre tu proyecto de red</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de proyecto *</label>
                        <select required value={formData.tipoProyecto} onChange={e => setFormData({...formData, tipoProyecto: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Nueva instalación">Nueva instalación (obra nueva)</option>
                          <option value="Ampliación de red">Ampliación de red existente</option>
                          <option value="Renovación/migración">Renovación / migración de equipos</option>
                          <option value="Auditoría y optimización">Auditoría y optimización</option>
                          <option value="Solo WiFi">Solo WiFi empresarial</option>
                          <option value="Solo cableado">Solo cableado estructurado</option>
                          <option value="Solo seguridad">Solo seguridad (firewall/IDS)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº de usuarios de red</label>
                        <select value={formData.numUsuarios} onChange={e => setFormData({...formData, numUsuarios: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="1-20 usuarios">1-20 usuarios</option>
                          <option value="21-50 usuarios">21-50 usuarios</option>
                          <option value="51-100 usuarios">51-100 usuarios</option>
                          <option value="101-250 usuarios">101-250 usuarios</option>
                          <option value="251-500 usuarios">251-500 usuarios</option>
                          <option value="+500 usuarios">+500 usuarios</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Superficie aproximada (m²)</label>
                        <select value={formData.superficieM2} onChange={e => setFormData({...formData, superficieM2: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Menos de 200 m²">Menos de 200 m²</option>
                          <option value="200-500 m²">200-500 m²</option>
                          <option value="500-1.000 m²">500-1.000 m²</option>
                          <option value="1.000-3.000 m²">1.000-3.000 m²</option>
                          <option value="3.000-10.000 m²">3.000-10.000 m²</option>
                          <option value="+10.000 m²">+10.000 m²</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº de plantas</label>
                        <select value={formData.numPlantas} onChange={e => setFormData({...formData, numPlantas: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="1 planta">1 planta</option>
                          <option value="2-3 plantas">2-3 plantas</option>
                          <option value="4-6 plantas">4-6 plantas</option>
                          <option value="7-10 plantas">7-10 plantas</option>
                          <option value="+10 plantas">+10 plantas</option>
                          <option value="Varias sedes">Varias sedes</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Infraestructura actual</label>
                        <select value={formData.infraestructuraActual} onChange={e => setFormData({...formData, infraestructuraActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="No tengo red (obra nueva)">No tengo red (obra nueva)</option>
                          <option value="Red básica (router ISP)">Red básica (router del ISP)</option>
                          <option value="Red con switches no gestionables">Switches no gestionables</option>
                          <option value="Red gestionada (obsoleta)">Red gestionada pero obsoleta</option>
                          <option value="Red gestionada (funcional)">Red gestionada y funcional</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fabricante preferido</label>
                        <select value={formData.fabricantePreferido} onChange={e => setFormData({...formData, fabricantePreferido: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Sin preferencia</option>
                          <option value="Ruckus">Ruckus</option>
                          <option value="Cisco">Cisco</option>
                          <option value="Aruba (HPE)">Aruba (HPE)</option>
                          <option value="Fortinet">Fortinet</option>
                          <option value="Ubiquiti">Ubiquiti</option>
                          <option value="Otro">Otro</option>
                          <option value="Que me recomienden">Que me recomienden</option>
                        </select>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">Servicios que necesitas (selecciona todos los que apliquen)</label>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                      <textarea value={formData.comentarios} onChange={e => setFormData({...formData, comentarios: e.target.value})} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Describe tu situación actual, problemas de red, requisitos especiales (alta densidad WiFi, entorno industrial, exterior...)..." />
                    </div>

                    <div className="mb-6">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" required checked={formData.newsletter} onChange={e => setFormData({...formData, newsletter: e.target.checked})} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 mt-0.5" />
                        <span className="text-xs text-gray-600">Acepto recibir la propuesta de infraestructura y suscribirme al newsletter de Internet Operadores con novedades y consejos para empresas. Puedo darme de baja en cualquier momento.</span>
                      </label>
                    </div>

                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                    <button type="submit" disabled={isSubmitting} className="w-full px-6 py-3.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSubmitting ? 'Enviando...' : 'Solicitar Auditoría de Red'}
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
