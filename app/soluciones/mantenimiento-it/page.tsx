"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';
import { useState } from 'react';

const planes = [
  { nombre: 'Básico', precio: 'Desde 199€/mes', descripcion: 'Para pequeñas empresas', caracteristicas: ['Hasta 10 equipos', 'Soporte 8x5', 'Monitorización básica', 'Tiempo respuesta 8h'] },
  { nombre: 'Profesional', precio: 'Desde 499€/mes', descripcion: 'Para empresas en crecimiento', caracteristicas: ['Hasta 50 equipos', 'Soporte 12x5', 'Monitorización avanzada', 'Tiempo respuesta 4h'], destacado: true },
  { nombre: 'Enterprise', precio: 'A medida', descripcion: 'Para grandes organizaciones', caracteristicas: ['Equipos ilimitados', 'Soporte 24x7', 'Monitorización proactiva', 'Tiempo respuesta 1h'] }
];

const servicios = [
  { titulo: 'Monitorización 24/7', descripcion: 'Vigilamos tu infraestructura en tiempo real. Detectamos problemas antes de que afecten a tu negocio.' },
  { titulo: 'Helpdesk', descripcion: 'Soporte técnico para tus usuarios. Resolvemos incidencias por teléfono, email o acceso remoto.' },
  { titulo: 'Mantenimiento Preventivo', descripcion: 'Actualizaciones, parches de seguridad y revisiones periódicas para evitar problemas.' },
  { titulo: 'Backup y Recuperación', descripcion: 'Copias de seguridad automatizadas y planes de recuperación ante desastres.' }
];

export default function MantenimientoITPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    numEquipos: '',
    numServidores: '',
    backupActual: '',
    antivirusCorporativo: '',
    horarioSoporte: '',
    sistemaOperativo: '',
    comentarios: '',
    newsletter: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/contrata/mantenimiento-it', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          empresa: formData.empresa,
          telefono: formData.telefono,
          numEquipos: formData.numEquipos,
          numServidores: formData.numServidores,
          backupActual: formData.backupActual,
          antivirusCorporativo: formData.antivirusCorporativo,
          horarioSoporte: formData.horarioSoporte,
          sistemaOperativo: formData.sistemaOperativo,
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
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">SLA garantizado</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Mantenimiento IT</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Mantenimiento preventivo y correctivo de tu infraestructura IT. Monitorización 24/7, helpdesk y respuesta ante incidentes con SLA garantizado.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <a href="#soporte" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Propuesta</a>
              <a href="https://wa.me/34900730034?text=Hola,%20quiero%20información%20sobre%20Mantenimiento%20IT" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-8 sm:py-12 bg-white border-b">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {[{valor:'99.9%',label:'Uptime',desc:'Garantizado por SLA'},{valor:'<4h',label:'Respuesta',desc:'Tiempo máximo'},{valor:'24/7',label:'Monitorización',desc:'NOC propio'},{valor:'+500',label:'Equipos',desc:'Gestionados'}].map((b,i)=>(
              <div key={i} className="text-center"><div className="text-3xl sm:text-4xl font-bold text-orange-600 mb-1 sm:mb-2">{b.valor}</div><div className="font-semibold text-gray-900 mb-1">{b.label}</div><div className="text-xs sm:text-sm text-gray-500">{b.desc}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Servicios Incluidos</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Todo lo que necesitas para mantener tu infraestructura IT funcionando al máximo rendimiento.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {servicios.map((s,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{s.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Planes */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Planes de Mantenimiento</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {planes.map((p,i)=>(
              <div key={i} className={`bg-white rounded-xl sm:rounded-2xl p-6 sm:p-8 ${p.destacado ? 'border-2 border-orange-500 shadow-xl' : 'border border-gray-200 shadow-lg'}`}>
                {p.destacado && <div className="bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full inline-block mb-4">Más popular</div>}
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{p.nombre}</h3>
                <div className="text-2xl sm:text-3xl font-bold text-orange-600 mb-2">{p.precio}</div>
                <p className="text-sm text-gray-500 mb-6">{p.descripcion}</p>
                <ul className="space-y-3 mb-6">
                  {p.caracteristicas.map((c,j)=>(<li key={j} className="flex items-center gap-2 text-sm text-gray-600"><svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>{c}</li>))}
                </ul>
                <a href="#soporte" className={`block text-center px-6 py-3 rounded-lg font-semibold transition-all ${p.destacado ? 'bg-orange-600 text-white hover:bg-orange-700' : 'border-2 border-orange-600 text-orange-600 hover:bg-orange-50'}`}>Solicitar información</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Productos dinámicos */}
      <ProductosSolucionDynamic solucion="mantenimiento-it" solucionNombre="Mantenimiento IT" ctaHref="#soporte" />

      {/* Formulario de solicitud */}
      <section id="soporte" className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Sin compromiso
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu propuesta de mantenimiento</h2>
                <p className="text-gray-400 mb-8">Analizamos tu infraestructura actual y te proponemos un plan de mantenimiento a medida con SLA garantizado.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Auditoría gratuita de tu infraestructura</p><p className="text-gray-400 text-sm">Evaluamos el estado actual de tus equipos y sistemas</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Plan preventivo personalizado</p><p className="text-gray-400 text-sm">Mantenimiento adaptado a tu negocio y horarios</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">SLA con tiempos de respuesta garantizados</p><p className="text-gray-400 text-sm">Penalizaciones si no cumplimos los plazos</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Equipo técnico certificado</p><p className="text-gray-400 text-sm">Microsoft, Cisco, VMware y más</p></div>
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
                    <p className="text-gray-600">Te hemos enviado un email de confirmación. Nuestro equipo técnico te contactará en menos de 24h con tu propuesta personalizada.</p>
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
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Tu infraestructura</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº de equipos/PCs</label>
                        <select value={formData.numEquipos} onChange={e => setFormData({...formData, numEquipos: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="1-5 equipos">1-5 equipos</option>
                          <option value="6-15 equipos">6-15 equipos</option>
                          <option value="16-50 equipos">16-50 equipos</option>
                          <option value="51-100 equipos">51-100 equipos</option>
                          <option value="+100 equipos">+100 equipos</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº de servidores</label>
                        <select value={formData.numServidores} onChange={e => setFormData({...formData, numServidores: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Ninguno">Ninguno</option>
                          <option value="1-2 servidores">1-2 servidores</option>
                          <option value="3-5 servidores">3-5 servidores</option>
                          <option value="6-10 servidores">6-10 servidores</option>
                          <option value="+10 servidores">+10 servidores</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">¿Tenéis backup actualmente?</label>
                        <select value={formData.backupActual} onChange={e => setFormData({...formData, backupActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Sí, en la nube">Sí, en la nube</option>
                          <option value="Sí, local (NAS/disco)">Sí, local (NAS/disco)</option>
                          <option value="Sí, mixto">Sí, mixto (local + nube)</option>
                          <option value="No tenemos backup">No tenemos backup</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">¿Antivirus corporativo?</label>
                        <select value={formData.antivirusCorporativo} onChange={e => setFormData({...formData, antivirusCorporativo: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Sí, gestionado centralmente">Sí, gestionado centralmente</option>
                          <option value="Sí, pero individual">Sí, pero individual en cada equipo</option>
                          <option value="No tenemos">No tenemos</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Horario de soporte necesario</label>
                        <select value={formData.horarioSoporte} onChange={e => setFormData({...formData, horarioSoporte: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="8x5 (L-V horario oficina)">8x5 (L-V horario oficina)</option>
                          <option value="12x5 (L-V ampliado)">12x5 (L-V ampliado)</option>
                          <option value="12x7 (todos los días)">12x7 (todos los días)</option>
                          <option value="24x7">24x7</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sistema operativo principal</label>
                        <select value={formData.sistemaOperativo} onChange={e => setFormData({...formData, sistemaOperativo: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Windows">Windows</option>
                          <option value="macOS">macOS</option>
                          <option value="Linux">Linux</option>
                          <option value="Mixto">Mixto (varios SO)</option>
                        </select>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                      <textarea value={formData.comentarios} onChange={e => setFormData({...formData, comentarios: e.target.value})} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Cuéntanos tus principales problemas o necesidades IT..." />
                    </div>

                    <div className="mb-6">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" required checked={formData.newsletter} onChange={e => setFormData({...formData, newsletter: e.target.checked})} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 mt-0.5" />
                        <span className="text-xs text-gray-600">Acepto recibir la propuesta de mantenimiento y suscribirme al newsletter de Internet Operadores con novedades y consejos para empresas. Puedo darme de baja en cualquier momento.</span>
                      </label>
                    </div>

                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                    <button type="submit" disabled={isSubmitting} className="w-full px-6 py-3.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSubmitting ? 'Enviando...' : 'Solicitar Propuesta de Mantenimiento'}
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
