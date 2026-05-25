"use client";
import Link from 'next/link';
import { useState } from 'react';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

export default function PartnersPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    sector: '',
    numClientes: '',
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
      const response = await fetch('/api/contacto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          empresa: formData.empresa,
          email: formData.email,
          telefono: formData.telefono,
          empleados: formData.numClientes,
          servicio: `Partner - ${formData.sector}`,
          mensaje: formData.mensaje,
          origen: 'Programa de Partners'
        })
      });
      if (!response.ok) throw new Error('Error al enviar');
      setIsSubmitted(true);
    } catch (err) {
      setError('Ha ocurrido un error. Por favor, inténtelo de nuevo o contacte por WhatsApp.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target;
    const { name, value } = target;
    const checked = target instanceof HTMLInputElement ? target.checked : false;
    const type = target instanceof HTMLInputElement ? target.type : 'text';
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const sectoresPartner = [
    {
      nombre: 'Gestorías y Asesorías',
      icono: '📋',
      descripcion: 'Tus clientes necesitan conectividad fiable para facturación electrónica, acceso a la AEAT y trabajo remoto. Ofréceles soluciones de telecomunicaciones como valor añadido a tus servicios de gestoría.',
      clientes: 'Autónomos, PYMEs, comercios',
      beneficio: 'Comisión recurrente mensual + fidelización de tu cartera'
    },
    {
      nombre: 'Corredurías de Seguros',
      icono: '🛡️',
      descripcion: 'Tus asegurados son empresas que dependen de internet para operar. Completa tu oferta con conectividad empresarial y ciberseguridad. Cada póliza de negocio es una oportunidad de telecomunicaciones.',
      clientes: 'PYMEs, comercios, industria',
      beneficio: 'Ingreso recurrente + diferenciación frente a competidores'
    },
    {
      nombre: 'Inmobiliarias y Administradores de Fincas',
      icono: '🏢',
      descripcion: 'Cada local comercial, oficina o nave que alquilas necesita conectividad. Ofrece a tus inquilinos soluciones llave en mano de telecomunicaciones desde el primer día de su actividad.',
      clientes: 'Locales comerciales, oficinas, naves industriales',
      beneficio: 'Comisión por alta + recurrente mensual por cliente activo'
    },
    {
      nombre: 'Consultoras IT y Empresas de Software',
      icono: '💻',
      descripcion: 'Tus clientes ya confían en ti para su transformación digital. Completa tu oferta con la capa de conectividad: fibra, SD-WAN, VoIP y WiFi empresarial. Todo integrado con tus soluciones.',
      clientes: 'Empresas en transformación digital',
      beneficio: 'Margen por proyecto + recurrente mensual'
    },
    {
      nombre: 'Empresas de Seguridad y Alarmas',
      icono: '🔒',
      descripcion: 'Los sistemas de videovigilancia y alarmas necesitan conexiones estables y redundantes. Ofrece a tus clientes la conectividad que garantiza que sus sistemas de seguridad nunca fallen.',
      clientes: 'Comercios, industria, residencial premium',
      beneficio: 'Venta cruzada natural + recurrente mensual'
    },
    {
      nombre: 'Distribuidores de Material de Oficina e Informática',
      icono: '🖨️',
      descripcion: 'Ya vendes hardware y consumibles a empresas. Añade telecomunicaciones a tu catálogo: centralitas VoIP, routers empresariales, soluciones WiFi. Mismo cliente, más facturación.',
      clientes: 'Oficinas, despachos profesionales',
      beneficio: 'Ampliar catálogo + ingreso recurrente nuevo'
    }
  ];

  const ventajas = [
    { icono: '💰', titulo: 'Ingresos Recurrentes', descripcion: 'Comisiones mensuales mientras el cliente permanezca activo. Un ingreso pasivo que crece con cada nuevo cliente referido.' },
    { icono: '🤝', titulo: 'Sin Inversión Inicial', descripcion: 'No necesitas stock, ni infraestructura, ni personal técnico. Nosotros nos encargamos de todo: instalación, soporte y facturación.' },
    { icono: '🎯', titulo: 'Gestor Dedicado', descripcion: 'Un gestor de canal exclusivo para ti. Te ayuda con propuestas comerciales, formación y seguimiento de oportunidades.' },
    { icono: '📊', titulo: 'Panel de Control', descripcion: 'Accede a tu panel de partner para ver el estado de tus clientes, comisiones generadas y oportunidades en curso.' },
    { icono: '🏆', titulo: 'Formación Continua', descripcion: 'Sesiones de formación sobre productos, técnicas de venta y novedades del sector para que siempre estés al día.' },
    { icono: '⚡', titulo: 'Soporte Prioritario', descripcion: 'Tus clientes referidos tienen soporte prioritario 24/7. Tu reputación está protegida con nuestro SLA garantizado.' }
  ];

  const niveles = [
    { nombre: 'Partner Referral', color: 'bg-gray-100 border-gray-300', clientes: '1-5 clientes/año', comision: 'Comisión por alta + 5% recurrente', requisitos: 'Sin requisitos mínimos', ideal: 'Gestorías, corredurías, profesionales independientes' },
    { nombre: 'Partner Silver', color: 'bg-orange-50 border-orange-300', clientes: '6-15 clientes/año', comision: 'Comisión por alta + 8% recurrente', requisitos: 'Formación básica completada', ideal: 'Consultoras, inmobiliarias, empresas de seguridad' },
    { nombre: 'Partner Gold', color: 'bg-yellow-50 border-yellow-400', clientes: '16+ clientes/año', comision: 'Comisión premium + 12% recurrente', requisitos: 'Certificación Partner + volumen', ideal: 'Distribuidores IT, integradores, grandes consultoras' }
  ];

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="partners" />

      {/* Hero */}
      <section className="pt-32 pb-20 bg-gradient-to-br from-gray-900 via-gray-800 to-orange-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 bg-orange-500 rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-20 w-96 h-96 bg-orange-400 rounded-full blur-3xl"></div>
        </div>
        <div className="container mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <span className="inline-block bg-orange-500/20 text-orange-300 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              Programa de Partners
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Diversifica tus ingresos con <span className="text-orange-400">telecomunicaciones empresariales</span>
            </h1>
            <p className="text-xl text-gray-300 mb-8 leading-relaxed">
              Si tienes clientes empresariales, ya tienes oportunidades de negocio en telecomunicaciones. 
              Genera ingresos recurrentes sin inversión, sin riesgo y con soporte total de nuestro equipo.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <a href="#formulario" className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all shadow-lg hover:shadow-xl text-center">
                Quiero ser Partner
              </a>
              <a href="https://wa.me/34900730034?text=Hola%2C%20me%20interesa%20el%20programa%20de%20partners" target="_blank" className="border-2 border-white/30 hover:border-white text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all text-center">
                Hablar por WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Propuesta de valor */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">¿Por qué convertirte en Partner?</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Tu negocio ya tiene la confianza de tus clientes. Aprovecha esa relación para ofrecerles un servicio que necesitan 
              y genera un nuevo flujo de ingresos recurrentes cada mes.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {ventajas.map((v, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-8 hover:shadow-lg transition-all border border-gray-100">
                <span className="text-4xl mb-4 block">{v.icono}</span>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{v.titulo}</h3>
                <p className="text-gray-600 leading-relaxed">{v.descripcion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sectores ideales */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Sectores con mayor potencial</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Si tu negocio pertenece a alguno de estos sectores, tienes clientes que ya necesitan telecomunicaciones empresariales. 
              Solo falta que se lo ofrezcas.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {sectoresPartner.map((s, i) => (
              <div key={i} className="bg-white rounded-xl p-8 shadow-sm hover:shadow-lg transition-all border border-gray-100">
                <span className="text-4xl mb-4 block">{s.icono}</span>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{s.nombre}</h3>
                <p className="text-gray-600 mb-4 leading-relaxed">{s.descripcion}</p>
                <div className="border-t border-gray-100 pt-4 space-y-2">
                  <p className="text-sm text-gray-500"><span className="font-semibold text-gray-700">Clientes tipo:</span> {s.clientes}</p>
                  <p className="text-sm text-orange-600 font-semibold">{s.beneficio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Así de fácil funciona</h2>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-4 gap-8">
              {[
                { paso: '01', titulo: 'Te registras', desc: 'Rellena el formulario y en 24h tendrás acceso a tu panel de partner con toda la información.' },
                { paso: '02', titulo: 'Identificas oportunidades', desc: 'Entre tus clientes actuales, detecta quién necesita mejorar su conectividad, telefonía o WiFi.' },
                { paso: '03', titulo: 'Nos lo presentas', desc: 'Nos pasas el contacto o nos presentas directamente. Nosotros hacemos la propuesta técnica y comercial.' },
                { paso: '04', titulo: 'Cobras cada mes', desc: 'Cuando el cliente se da de alta, empiezas a cobrar tu comisión recurrente. Cada mes, sin hacer nada más.' }
              ].map((p, i) => (
                <div key={i} className="text-center">
                  <div className="w-16 h-16 bg-orange-500 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    {p.paso}
                  </div>
                  <h3 className="font-bold text-gray-900 mb-2">{p.titulo}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{p.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Niveles de partner */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Niveles del programa</h2>
            <p className="text-xl text-gray-600">Cuantos más clientes refieras, mayores son tus beneficios</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {niveles.map((n, i) => (
              <div key={i} className={`${n.color} border-2 rounded-xl p-8 hover:shadow-lg transition-all`}>
                <h3 className="text-xl font-bold text-gray-900 mb-4">{n.nombre}</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Volumen</p>
                    <p className="text-gray-900 font-semibold">{n.clientes}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Compensación</p>
                    <p className="text-orange-600 font-bold">{n.comision}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Requisitos</p>
                    <p className="text-gray-700">{n.requisitos}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 font-medium">Ideal para</p>
                    <p className="text-gray-700">{n.ideal}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ejemplo de ingresos */}
      <section className="py-20 bg-orange-500 text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-8">Ejemplo real de ingresos</h2>
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 md:p-12">
              <p className="text-lg mb-8 text-orange-100">
                Una gestoría con 200 clientes empresariales refiere 10 clientes al año con una factura media de 150 €/mes.
              </p>
              <div className="grid md:grid-cols-3 gap-8">
                <div>
                  <p className="text-4xl font-bold">1.800 €</p>
                  <p className="text-orange-200 mt-2">Comisiones por alta (10 x 180 €)</p>
                </div>
                <div>
                  <p className="text-4xl font-bold">1.440 €</p>
                  <p className="text-orange-200 mt-2">Recurrente anual (8% x 150 € x 10 x 12)</p>
                </div>
                <div>
                  <p className="text-4xl font-bold">3.240 €</p>
                  <p className="text-orange-200 mt-2">Total primer año</p>
                </div>
              </div>
              <p className="mt-8 text-orange-100 text-sm">
                * Y los ingresos recurrentes se acumulan cada año. En el tercer año, con 30 clientes activos, 
                el recurrente anual supera los 4.300 €/año sin esfuerzo adicional.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonios */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Lo que dicen nuestros partners</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { texto: 'Llevamos 2 años como partners y hemos generado un ingreso recurrente de más de 800 €/mes solo con clientes que ya teníamos. No hemos invertido ni un euro.', autor: 'María López', cargo: 'Directora, Gestoría López & Asociados' },
              { texto: 'Nuestros clientes nos pedían recomendaciones de internet y telefonía. Ahora en vez de recomendar gratis, cobramos una comisión cada mes. Es un win-win.', autor: 'Carlos Ruiz', cargo: 'Gerente, Correduría Ruiz Seguros' },
              { texto: 'El equipo de Internet Operadores se encarga de todo lo técnico. Yo solo presento al cliente y ellos hacen el resto. Cobro mi comisión sin complicaciones.', autor: 'Ana Martín', cargo: 'Administradora de Fincas, Fincas Martín' }
            ].map((t, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-8 border border-gray-100">
                <p className="text-gray-600 italic mb-6 leading-relaxed">"{t.texto}"</p>
                <div>
                  <p className="font-bold text-gray-900">{t.autor}</p>
                  <p className="text-sm text-gray-500">{t.cargo}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Formulario */}
      <section id="formulario" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Únete al programa de Partners</h2>
              <p className="text-gray-600 text-lg">Rellena el formulario y te contactaremos en menos de 24 horas</p>
            </div>

            {isSubmitted ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-green-800 mb-4">Solicitud recibida</h3>
                <p className="text-green-700 text-lg mb-6">
                  Nuestro equipo de canal se pondrá en contacto contigo en menos de 24 horas para explicarte todos los detalles del programa.
                </p>
                <Link href="/" className="text-orange-500 hover:text-orange-600 font-semibold">
                  Volver al inicio
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 md:p-12">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
                )}
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre completo *</label>
                    <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Empresa *</label>
                    <input type="text" name="empresa" value={formData.empresa} onChange={handleChange} required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono *</label>
                    <input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Sector de tu negocio *</label>
                    <select name="sector" value={formData.sector} onChange={handleChange} required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                      <option value="">Seleccionar sector</option>
                      <option value="gestoria">Gestoría / Asesoría</option>
                      <option value="seguros">Correduría de Seguros</option>
                      <option value="inmobiliaria">Inmobiliaria / Administración de Fincas</option>
                      <option value="consultora-it">Consultora IT / Empresa de Software</option>
                      <option value="seguridad">Empresa de Seguridad / Alarmas</option>
                      <option value="distribuidor">Distribuidor Informática / Material Oficina</option>
                      <option value="otro">Otro sector</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">N.º aprox. de clientes empresariales</label>
                    <select name="numClientes" value={formData.numClientes} onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                      <option value="">Seleccionar rango</option>
                      <option value="1-50">1 - 50 clientes</option>
                      <option value="51-200">51 - 200 clientes</option>
                      <option value="201-500">201 - 500 clientes</option>
                      <option value="500+">Más de 500 clientes</option>
                    </select>
                  </div>
                </div>
                <div className="mt-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Mensaje (opcional)</label>
                  <textarea name="mensaje" value={formData.mensaje} onChange={handleChange} rows={4}
                    placeholder="Cuéntanos sobre tu negocio y qué te interesa del programa..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                </div>
                <div className="mt-6">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" name="acepta" checked={formData.acepta} onChange={handleChange} required
                      className="mt-1 h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                    <span className="text-sm text-gray-600">
                      Acepto la <Link href="/politica-privacidad" className="underline hover:text-orange-600">política de privacidad</Link> y consiento el tratamiento de mis datos para recibir información sobre el programa de partners. *
                    </span>
                  </label>
                </div>
                <button type="submit" disabled={isSubmitting || !formData.acepta}
                  className="mt-8 w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white py-4 rounded-lg font-semibold text-lg transition-all">
                  {isSubmitting ? 'Enviando solicitud...' : 'Solicitar acceso al programa'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* FAQ Partners */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Preguntas frecuentes</h2>
            <div className="space-y-6">
              {[
                { p: '¿Necesito conocimientos técnicos de telecomunicaciones?', r: 'No. Nosotros nos encargamos de toda la parte técnica: diseño de solución, instalación, configuración y soporte. Tú solo necesitas identificar la oportunidad y presentarnos al cliente.' },
                { p: '¿Cuánto tardo en empezar a cobrar?', r: 'Desde que el cliente firma el contrato y se activa el servicio (normalmente 1-2 semanas), empiezas a generar comisión. El pago se realiza mensualmente por transferencia.' },
                { p: '¿Qué pasa si el cliente tiene un problema técnico?', r: 'Nuestro equipo de soporte 24/7 se encarga de todo. El cliente tiene un número directo de soporte y un gestor dedicado. Tu reputación siempre está protegida.' },
                { p: '¿Puedo ser partner si ya trabajo con otro operador?', r: 'Sí. No exigimos exclusividad. Puedes comparar nuestras condiciones y ofrecer a tus clientes la mejor opción en cada caso.' },
                { p: '¿Hay un mínimo de clientes que deba referir?', r: 'No. El nivel Partner Referral no tiene mínimos. Puedes empezar con un solo cliente y crecer a tu ritmo.' }
              ].map((faq, i) => (
                <details key={i} className="group bg-gray-50 rounded-xl border border-gray-100">
                  <summary className="flex justify-between items-center cursor-pointer p-6 font-semibold text-gray-900 hover:text-orange-600">
                    {faq.p}
                    <span className="ml-4 text-orange-500 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="px-6 pb-6 text-gray-600 leading-relaxed">{faq.r}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
