"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';
import { useState } from 'react';

const ventajas = [
  { titulo: 'Operador autorizado', descripcion: 'Somos operador de telecomunicaciones autorizado por la CNMC. Facturación directa sin intermediarios.' },
  { titulo: 'Cobertura nacional', descripcion: 'Acceso a las mejores redes móviles de España. Cobertura 4G/5G en todo el territorio.' },
  { titulo: 'Gestión centralizada', descripcion: 'Panel de control para gestionar todas las líneas de tu empresa. Consumos, límites y alertas.' },
  { titulo: 'Factura única', descripcion: 'Consolida todas tus comunicaciones en una sola factura. Fijo, móvil e internet.' }
];

export default function MovilesPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    numLineas: '',
    operadorActual: '',
    consumoDatos: '',
    permanenciaActual: '',
    tipoDispositivos: '',
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
      const response = await fetch('/api/contrata/moviles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          email: formData.email,
          empresa: formData.empresa,
          telefono: formData.telefono,
          numLineas: formData.numLineas,
          operadorActual: formData.operadorActual,
          consumoDatos: formData.consumoDatos,
          permanenciaActual: formData.permanenciaActual,
          tipoDispositivos: formData.tipoDispositivos,
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
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Operador autorizado</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Soluciones Móviles</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Tarifas móviles empresariales con las mejores condiciones. Flotas móviles, datos compartidos y gestión centralizada para tu empresa.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 sm:gap-4 px-4">
              <a href="#presupuesto" className="px-6 py-3 sm:px-8 sm:py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold text-base sm:text-lg">Solicitar Presupuesto</a>
              <a href="https://wa.me/34900730034?text=Hola,%20quiero%20información%20sobre%20tarifas%20móviles%20para%20empresas" target="_blank" rel="noopener noreferrer" className="px-6 py-3 sm:px-8 sm:py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold text-base sm:text-lg">Hablar con un experto</a>
            </div>
          </div>
        </div>
      </section>

      {/* Métricas */}
      <section className="py-8 sm:py-12 bg-white border-b">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {[{valor:'4G/5G',label:'Cobertura',desc:'Red nacional'},{valor:'100%',label:'Territorio',desc:'Cobertura España'},{valor:'1',label:'Factura',desc:'Todo unificado'},{valor:'24/7',label:'Gestión',desc:'Panel online'}].map((b,i)=>(
              <div key={i} className="text-center"><div className="text-3xl sm:text-4xl font-bold text-orange-600 mb-1 sm:mb-2">{b.valor}</div><div className="font-semibold text-gray-900 mb-1">{b.label}</div><div className="text-xs sm:text-sm text-gray-500">{b.desc}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Ventajas */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">¿Por qué elegirnos?</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Ventajas de contratar tus líneas móviles con Internet Operadores.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {ventajas.map((v,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{v.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600">{v.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tarifas */}
      <section className="py-12 sm:py-16 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">Tarifas a medida para empresas</h2>
            <p className="text-base sm:text-lg text-gray-600 mb-8">Consulta nuestras tarifas móviles o solicita una propuesta personalizada para tu flota.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Link href="/tarifas/empresa" className="px-8 py-4 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-semibold">Ver Tarifas</Link>
              <a href="#presupuesto" className="px-8 py-4 border-2 border-orange-600 text-orange-600 rounded-lg hover:bg-orange-50 transition-all font-semibold">Solicitar Propuesta</a>
            </div>
          </div>
        </div>
      </section>

      {/* Productos dinámicos */}
      <ProductosSolucionDynamic solucion="moviles" solucionNombre="Móviles Empresa" ctaHref="#presupuesto" />

      {/* Formulario de solicitud */}
      <section id="presupuesto" className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Sin compromiso
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu presupuesto de móviles</h2>
                <p className="text-gray-400 mb-8">Analizamos tu consumo actual y te proponemos la mejor tarifa móvil empresarial con ahorro garantizado.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Comparativa con tu operador actual</p><p className="text-gray-400 text-sm">Te mostramos cuánto puedes ahorrar</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Portabilidad sin cortes</p><p className="text-gray-400 text-sm">Nos encargamos de todo el proceso</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Terminales financiados</p><p className="text-gray-400 text-sm">Smartphones y tablets a plazos sin intereses</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Gestor personal dedicado</p><p className="text-gray-400 text-sm">Un interlocutor único para todas tus líneas</p></div>
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
                    <p className="text-gray-600">Te hemos enviado un email de confirmación. Nuestro equipo comercial te contactará en menos de 24h con tu presupuesto personalizado.</p>
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
                    <h3 className="text-xl font-bold text-gray-900 mb-4">Sobre tus líneas móviles</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nº de líneas necesarias</label>
                        <select value={formData.numLineas} onChange={e => setFormData({...formData, numLineas: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="1-3 líneas">1-3 líneas</option>
                          <option value="4-10 líneas">4-10 líneas</option>
                          <option value="11-25 líneas">11-25 líneas</option>
                          <option value="26-50 líneas">26-50 líneas</option>
                          <option value="+50 líneas">+50 líneas</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Operador actual</label>
                        <select value={formData.operadorActual} onChange={e => setFormData({...formData, operadorActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Movistar">Movistar</option>
                          <option value="Vodafone">Vodafone</option>
                          <option value="Orange">Orange</option>
                          <option value="MásMóvil/Yoigo">MásMóvil/Yoigo</option>
                          <option value="Otro">Otro</option>
                          <option value="Nuevo (sin operador)">Nuevo (sin operador)</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Consumo medio de datos</label>
                        <select value={formData.consumoDatos} onChange={e => setFormData({...formData, consumoDatos: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Bajo (menos de 5 GB)">Bajo (menos de 5 GB)</option>
                          <option value="Medio (5-20 GB)">Medio (5-20 GB)</option>
                          <option value="Alto (20-50 GB)">Alto (20-50 GB)</option>
                          <option value="Muy alto (+50 GB)">Muy alto (+50 GB)</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Permanencia actual</label>
                        <select value={formData.permanenciaActual} onChange={e => setFormData({...formData, permanenciaActual: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                          <option value="">Seleccionar...</option>
                          <option value="Sin permanencia">Sin permanencia</option>
                          <option value="Menos de 6 meses">Menos de 6 meses</option>
                          <option value="6-12 meses">6-12 meses</option>
                          <option value="Más de 12 meses">Más de 12 meses</option>
                          <option value="No lo sé">No lo sé</option>
                        </select>
                      </div>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de dispositivos</label>
                      <select value={formData.tipoDispositivos} onChange={e => setFormData({...formData, tipoDispositivos: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                        <option value="">Seleccionar...</option>
                        <option value="Solo smartphones">Solo smartphones</option>
                        <option value="Solo tablets/routers">Solo tablets/routers</option>
                        <option value="Smartphones + tablets">Smartphones + tablets</option>
                        <option value="Solo SIM (ya tenemos terminales)">Solo SIM (ya tenemos terminales)</option>
                        <option value="Necesitamos terminales nuevos">Necesitamos terminales nuevos</option>
                      </select>
                    </div>

                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                      <textarea value={formData.comentarios} onChange={e => setFormData({...formData, comentarios: e.target.value})} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder="Cuéntanos cualquier necesidad específica (roaming, datos compartidos, etc.)..." />
                    </div>

                    <div className="mb-6">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input type="checkbox" required checked={formData.newsletter} onChange={e => setFormData({...formData, newsletter: e.target.checked})} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 mt-0.5" />
                        <span className="text-xs text-gray-600">Acepto recibir el presupuesto de móviles y suscribirme al newsletter de Internet Operadores con novedades y consejos para empresas. Puedo darme de baja en cualquier momento.</span>
                      </label>
                    </div>

                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                    <button type="submit" disabled={isSubmitting} className="w-full px-6 py-3.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                      {isSubmitting ? 'Enviando...' : 'Solicitar Presupuesto Móviles'}
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
