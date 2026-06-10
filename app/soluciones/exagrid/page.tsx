"use client";
import { useState } from 'react';
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';

const metricas = [
  { valor: '3X', label: 'Más rápido', sublabel: 'en backups' },
  { valor: '20X', label: 'Más rápido', sublabel: 'en recuperaciones' },
  { valor: '4,800+', label: 'Empresas', sublabel: 'confían en ExaGrid' },
  { valor: '5 años', label: 'Protección', sublabel: 'de precio garantizada' }
];

const arquitectura = [
  {
    titulo: 'Landing Zone',
    subtitulo: 'Disco Caché de Alto Rendimiento',
    items: ['Backups más recientes siempre disponibles', 'Recuperaciones y arranque de VMs ultrarrápidos', 'Ventana de backup fija independiente del volumen'],
    color: 'orange'
  },
  {
    titulo: 'Repositorio de Retención',
    subtitulo: 'Almacenamiento Eficiente a Largo Plazo',
    items: ['Deduplicación inteligente (ratios 10:1 a 50:1)', 'Objetos inmutables no modificables', 'Tier no conectado a la red (air gap)'],
    color: 'green'
  }
];

const proteccion = [
  { titulo: 'Retention Time-Lock con IA', descripcion: 'La inteligencia artificial detecta patrones anómalos y bloquea automáticamente la eliminación de backups, impidiendo que el ransomware destruya tus copias.' },
  { titulo: 'Air Gap Escalonado', descripcion: 'El tier de retención no está conectado a la red. Incluso si un atacante compromete tu infraestructura, no puede acceder a los backups almacenados.' },
  { titulo: 'Delayed Delete Policy', descripcion: 'Los backups no se pueden eliminar inmediatamente, ni siquiera con credenciales de administrador comprometidas. Tiempo de gracia configurable.' },
  { titulo: 'Objetos Inmutables', descripcion: 'Una vez creados, los objetos de deduplicación no pueden modificarse ni eliminarse. Garantía de integridad absoluta de los datos.' }
];

const valorPartner = [
  { titulo: 'Dimensionamiento Personalizado', descripcion: 'Nuestros ingenieros certificados analizan tu entorno y calculan el appliance ExaGrid exacto que necesitas. Sin sobredimensionar, sin quedarte corto.' },
  { titulo: 'POC Gratuito', descripcion: 'Prueba ExaGrid en tu entorno real antes de decidir. Instalamos un equipo de demostración para que compruebes el rendimiento con tus propios datos.' },
  { titulo: 'Instalación e Integración', descripcion: 'Configuramos ExaGrid integrado con tu software de backup (Veeam, Veritas, Commvault...) y tu infraestructura existente. Llave en mano.' },
  { titulo: 'Soporte Local en España', descripcion: 'Equipo técnico propio para soporte post-venta, mantenimiento preventivo, renovaciones y upgrades. Sin intermediarios ni call centers.' }
];

const casosUso = [
  { titulo: 'Empresas Medianas y Grandes', items: ['Protección de infraestructura crítica', 'Cumplimiento normativo (GDPR, ISO, ENS)', 'Recuperación ante desastres en minutos'] },
  { titulo: 'Entornos Virtualizados', items: ['Integración nativa con Veeam', 'Backup de VMware y Hyper-V', 'Arranque instantáneo de VMs desde Landing Zone'] },
  { titulo: 'Sectores Regulados', items: ['Banca y finanzas', 'Sanidad e industria farmacéutica', 'Administración pública y defensa'] }
];

export default function ExagridPage() {
  const [formData, setFormData] = useState({
    nombre: '', email: '', empresa: '', telefono: '',
    volumenDatos: '', softwareBackup: '', entorno: '', retencion: '',
    necesidades: [] as string[], interesadoPOC: '', comentarios: ''
  });
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/contrata/exagrid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setEnviado(true);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al enviar. Inténtalo de nuevo.');
      }
    } catch {
      setError('Error de conexión. Inténtalo de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  const handleNecesidad = (necesidad: string) => {
    setFormData(prev => ({
      ...prev,
      necesidades: prev.necesidades.includes(necesidad)
        ? prev.necesidades.filter(n => n !== necesidad)
        : [...prev.necesidades, necesidad]
    }));
  };

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soluciones" />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 py-12 sm:py-16 lg:py-24">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <Link href="/soluciones" className="inline-flex items-center text-orange-400 hover:text-orange-300 font-medium mb-4 sm:mb-6">
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              Volver a Soluciones
            </Link>
            <div className="inline-block bg-orange-600/20 text-orange-400 border border-orange-500/30 px-4 py-2 rounded-full text-sm font-semibold mb-6">Partner Autorizado ExaGrid</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-4 sm:mb-6">ExaGrid</h1>
            <p className="text-xl sm:text-2xl text-orange-400 font-semibold mb-4">Backup Empresarial Escalonado</p>
            <p className="text-base sm:text-lg lg:text-xl text-gray-300 mb-8 px-2">La solución más rápida y segura para proteger tus datos empresariales. Arquitectura única de dos niveles que combina velocidad extrema con protección total contra ransomware.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <a href="#dimensionamiento" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Dimensionamiento Gratuito</a>
              <a href="tel:+34900730034" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-gray-500 text-gray-200 rounded-lg hover:border-orange-500 hover:text-orange-400 transition-all font-semibold text-base sm:text-lg">900 730 034</a>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-8 sm:py-12 bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {metricas.map((m, i) => (
              <div key={i} className="text-center">
                <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-orange-600">{m.valor}</p>
                <p className="text-sm sm:text-base font-semibold text-gray-900 mt-1">{m.label}</p>
                <p className="text-xs sm:text-sm text-gray-500">{m.sublabel}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Arquitectura Escalonada */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Arquitectura Tiered Backup Storage</h2>
            <p className="text-base sm:text-lg text-gray-600">Dos niveles diseñados para ofrecer velocidad máxima y protección total</p>
          </div>
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            {arquitectura.map((tier, i) => (
              <div key={i} className={`bg-white border-2 ${tier.color === 'orange' ? 'border-orange-200' : 'border-green-200'} rounded-xl p-6 sm:p-8`}>
                <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 ${tier.color === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                  {i === 0 ? 'TIER 1 — Rendimiento' : 'TIER 2 — Retención'}
                </div>
                <h3 className={`text-xl sm:text-2xl font-bold mb-2 ${tier.color === 'orange' ? 'text-orange-600' : 'text-green-600'}`}>{tier.titulo}</h3>
                <p className="text-sm text-gray-500 mb-4">{tier.subtitulo}</p>
                <ul className="space-y-3">
                  {tier.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2 text-sm text-gray-700">
                      <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${tier.color === 'orange' ? 'text-orange-500' : 'text-green-500'}`} fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-center text-base sm:text-lg text-gray-600 mt-8 max-w-3xl mx-auto">Scale-out hasta 32 appliances en un solo sistema. Crece sin obsolescencia ni actualizaciones costosas — mezcla cualquier modelo o generación.</p>
        </div>
      </section>

      {/* Protección Ransomware */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3 sm:mb-4">Protección Multicapa contra Ransomware</h2>
            <p className="text-base sm:text-lg text-gray-400">Tu última línea de defensa cuando todo lo demás falla</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {proteccion.map((p, i) => (
              <div key={i} className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg sm:text-xl font-bold text-orange-400 mb-3 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                  {p.titulo}
                </h3>
                <p className="text-sm sm:text-base text-gray-300">{p.descripcion}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-10 sm:mt-12">
            <p className="text-xl sm:text-2xl font-bold text-white">Resultado: <span className="text-orange-400">Recuperación garantizada en minutos, no en días</span></p>
          </div>
        </div>
      </section>

      {/* Valor del Partner */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Nuestro Valor como Partner ExaGrid</h2>
            <p className="text-base sm:text-lg text-gray-600">No solo vendemos hardware. Te acompañamos en todo el proceso.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {valorPartner.map((v, i) => (
              <div key={i} className="flex gap-4 p-6 bg-gray-50 rounded-xl">
                <div className="flex-shrink-0 w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                  <span className="text-orange-600 font-bold text-lg">{i + 1}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-2">{v.titulo}</h3>
                  <p className="text-sm text-gray-600">{v.descripcion}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Casos de Uso */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gray-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4">Soluciones para Cada Entorno</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {casosUso.map((c, i) => (
              <div key={i} className="bg-white rounded-xl p-6 sm:p-8 border border-gray-200">
                <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">{c.titulo}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  {c.items.map((item, j) => (
                    <li key={j} className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <ProductosSolucionDynamic solucion="exagrid" solucionNombre="ExaGrid Backup" />

      {/* Formulario de Dimensionamiento */}
      <section id="dimensionamiento" className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
              {/* Info lateral */}
              <div className="lg:col-span-2">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Solicita tu Dimensionamiento Gratuito</h2>
                <p className="text-gray-600 mb-6">Nuestros ingenieros certificados ExaGrid analizarán tu entorno y te propondrán la solución exacta que necesitas.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div><p className="font-semibold text-gray-900">Sizing personalizado</p><p className="text-sm text-gray-500">Calculamos el appliance exacto para tu volumen</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div><p className="font-semibold text-gray-900">POC sin compromiso</p><p className="text-sm text-gray-500">Pruébalo en tu entorno antes de decidir</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div><p className="font-semibold text-gray-900">Respuesta en 24h</p><p className="text-sm text-gray-500">Propuesta detallada con presupuesto</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-6 h-6 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <div><p className="font-semibold text-gray-900">5 años protección de precio</p><p className="text-sm text-gray-500">Sin sorpresas en renovaciones</p></div>
                  </div>
                </div>
              </div>

              {/* Formulario */}
              <div className="lg:col-span-3">
                {enviado ? (
                  <div className="bg-green-50 border-2 border-green-200 rounded-xl p-8 text-center">
                    <svg className="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <h3 className="text-2xl font-bold text-green-800 mb-2">Solicitud recibida</h3>
                    <p className="text-green-700">Nuestro equipo de ingenieros te contactará en menos de 24 horas con una propuesta de dimensionamiento personalizada.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-6 sm:p-8 border border-gray-200">
                    {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{error}</div>}
                    
                    {/* Datos de contacto */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                        <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa *</label>
                        <input type="text" required value={formData.empresa} onChange={e => setFormData({...formData, empresa: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                        <input type="tel" value={formData.telefono} onChange={e => setFormData({...formData, telefono: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      </div>
                    </div>

                    {/* Datos de sizing */}
                    <div className="border-t border-gray-200 pt-6 mb-6">
                      <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-4">Datos para el dimensionamiento</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Volumen de datos a proteger</label>
                          <select value={formData.volumenDatos} onChange={e => setFormData({...formData, volumenDatos: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                            <option value="">Seleccionar...</option>
                            <option value="Menos de 5 TB">Menos de 5 TB</option>
                            <option value="5 - 20 TB">5 - 20 TB</option>
                            <option value="20 - 50 TB">20 - 50 TB</option>
                            <option value="50 - 100 TB">50 - 100 TB</option>
                            <option value="100 - 500 TB">100 - 500 TB</option>
                            <option value="500 TB - 1 PB">500 TB - 1 PB</option>
                            <option value="Más de 1 PB">Más de 1 PB</option>
                            <option value="No lo sé / Necesito ayuda">No lo sé / Necesito ayuda para calcularlo</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Software de backup</label>
                          <select value={formData.softwareBackup} onChange={e => setFormData({...formData, softwareBackup: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                            <option value="">Seleccionar...</option>
                            <option value="Veeam">Veeam</option>
                            <option value="Veritas NetBackup">Veritas NetBackup</option>
                            <option value="Commvault">Commvault</option>
                            <option value="Acronis">Acronis</option>
                            <option value="Rubrik">Rubrik</option>
                            <option value="IBM Spectrum Protect">IBM Spectrum Protect</option>
                            <option value="HYCU">HYCU</option>
                            <option value="Otro">Otro</option>
                            <option value="No tengo software de backup">No tengo software de backup</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Entorno</label>
                          <select value={formData.entorno} onChange={e => setFormData({...formData, entorno: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                            <option value="">Seleccionar...</option>
                            <option value="Físico">Físico</option>
                            <option value="Virtual (VMware)">Virtual (VMware)</option>
                            <option value="Virtual (Hyper-V)">Virtual (Hyper-V)</option>
                            <option value="Mixto (físico + virtual)">Mixto (físico + virtual)</option>
                            <option value="Cloud híbrido">Cloud híbrido</option>
                            <option value="Multi-cloud">Multi-cloud</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Retención necesaria</label>
                          <select value={formData.retencion} onChange={e => setFormData({...formData, retencion: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                            <option value="">Seleccionar...</option>
                            <option value="7 días">7 días</option>
                            <option value="30 días">30 días</option>
                            <option value="90 días">90 días</option>
                            <option value="6 meses">6 meses</option>
                            <option value="1 año">1 año</option>
                            <option value="Más de 1 año">Más de 1 año</option>
                            <option value="Según normativa (GDPR/ENS)">Según normativa (GDPR/ENS)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Necesidades */}
                    <div className="border-t border-gray-200 pt-6 mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-3">Necesidades principales</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {['Velocidad de backup/restore', 'Protección contra ransomware', 'Escalabilidad sin límites', 'Reducción de costes de almacenamiento', 'Disaster Recovery', 'Cumplimiento normativo (GDPR/ENS/ISO)'].map(nec => (
                          <label key={nec} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 cursor-pointer">
                            <input type="checkbox" checked={formData.necesidades.includes(nec)} onChange={() => handleNecesidad(nec)} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500" />
                            <span className="text-sm text-gray-700">{nec}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* POC */}
                    <div className="border-t border-gray-200 pt-6 mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-3">¿Te interesa un POC (Proof of Concept) gratuito?</label>
                      <div className="flex flex-wrap gap-3">
                        {['Sí, quiero probarlo', 'Quiero más información', 'No por ahora'].map(opcion => (
                          <label key={opcion} className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${formData.interesadoPOC === opcion ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-300 hover:border-gray-400'}`}>
                            <input type="radio" name="poc" value={opcion} checked={formData.interesadoPOC === opcion} onChange={e => setFormData({...formData, interesadoPOC: e.target.value})} className="sr-only" />
                            <span className="text-sm">{opcion}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Comentarios */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                      <textarea rows={3} value={formData.comentarios} onChange={e => setFormData({...formData, comentarios: e.target.value})} placeholder="Cuéntanos más sobre tu proyecto, plazos, requisitos específicos..." className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>

                    <button type="submit" disabled={enviando} className="w-full py-3 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {enviando ? 'Enviando...' : 'Solicitar Dimensionamiento Gratuito'}
                    </button>
                    <p className="text-xs text-gray-500 text-center mt-3">Respuesta garantizada en menos de 24 horas laborables</p>
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
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 px-2">¿Listo para proteger tus datos con ExaGrid?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-orange-100 mb-6 sm:mb-8 px-2">Dimensionamiento gratuito, POC sin compromiso y soporte local en España.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4">
              <a href="#dimensionamiento" className="inline-block px-8 py-4 sm:px-10 sm:py-5 bg-white text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-bold text-base sm:text-lg">Solicitar Dimensionamiento</a>
              <a href="tel:+34900730034" className="inline-block px-8 py-4 sm:px-10 sm:py-5 border-2 border-white text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-base sm:text-lg">Llamar: 900 730 034</a>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
