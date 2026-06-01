"use client";
import Link from 'next/link';
import { useState } from 'react';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

export default function SoportePage() {
  const [ticketData, setTicketData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    tipo: '',
    prioridad: '',
    descripcion: '',
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
          nombre: ticketData.nombre,
          empresa: ticketData.empresa,
          email: ticketData.email,
          telefono: ticketData.telefono,
          servicio: `Soporte - ${ticketData.tipo}`,
          mensaje: `[Prioridad: ${ticketData.prioridad}] ${ticketData.descripcion}`,
          origen: 'Centro de Soporte'
        })
      });
      if (!response.ok) throw new Error('Error al enviar');
      setIsSubmitted(true);
    } catch (err) {
      setError('Ha ocurrido un error. Llame al 900 730 034 para soporte urgente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const target = e.target;
    const { name, value } = target;
    const checked = target instanceof HTMLInputElement ? target.checked : false;
    const type = target instanceof HTMLInputElement ? target.type : 'text';
    setTicketData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="soporte" />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-gray-900 to-gray-800 text-white">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block bg-green-500/20 text-green-300 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              Disponible 24/7
            </span>
            <h1 className="text-4xl md:text-5xl font-bold mb-6">Centro de <span className="text-orange-400">Soporte Técnico</span></h1>
            <p className="text-xl text-gray-300 mb-10">
              Estamos aquí para ayudarte en cualquier momento. Elige el canal que prefieras para contactar con nuestro equipo técnico.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              <a href="tel:+34900730034" className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
                <span className="text-xl">📞</span> Llamar ahora
              </a>
              <a href="https://wa.me/34900730034?text=Hola%2C%20necesito%20soporte%20t%C3%A9cnico" target="_blank" className="bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
                <span className="text-xl">💬</span> WhatsApp
              </a>
              <a href="mailto:soporte@internetoperadores.com" className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
                <span className="text-xl">✉️</span> Email
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Canales de soporte */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Canales de atención</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {[
              { icono: '📞', titulo: 'Teléfono 24/7', dato: '900 730 034', desc: 'Línea directa con técnicos especializados. Sin esperas, sin menús interminables.', horario: '24 horas, 365 días' },
              { icono: '💬', titulo: 'WhatsApp', dato: '900 730 034', desc: 'Envía capturas, vídeos y describe tu incidencia de forma rápida y cómoda.', horario: '24 horas, 365 días' },
              { icono: '✉️', titulo: 'Email', dato: 'soporte@internetoperadores.com', desc: 'Para incidencias no urgentes o consultas técnicas que requieran documentación.', horario: 'Respuesta < 4h laborables' },
              { icono: '🎫', titulo: 'Ticket Web', dato: 'Formulario abajo', desc: 'Abre un ticket desde esta página y haz seguimiento del estado de tu incidencia.', horario: 'Respuesta < 2h laborables' }
            ].map((c, i) => (
              <div key={i} className="bg-gray-50 rounded-xl p-6 border border-gray-100 text-center">
                <span className="text-4xl block mb-3">{c.icono}</span>
                <h3 className="font-bold text-gray-900 mb-1">{c.titulo}</h3>
                <p className="text-orange-500 font-semibold text-sm mb-3">{c.dato}</p>
                <p className="text-gray-600 text-sm mb-3">{c.desc}</p>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">{c.horario}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SLA */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Nuestro compromiso de servicio (SLA)</h2>
          <div className="max-w-4xl mx-auto">
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
              <table className="w-full">
                <thead>
                  <tr className="bg-orange-500 text-white">
                    <th className="px-6 py-4 text-left font-semibold">Prioridad</th>
                    <th className="px-6 py-4 text-left font-semibold">Tipo de incidencia</th>
                    <th className="px-6 py-4 text-left font-semibold">Tiempo de respuesta</th>
                    <th className="px-6 py-4 text-left font-semibold">Tiempo de resolución</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { prioridad: 'Crítica', color: 'text-red-600', tipo: 'Caída total del servicio', respuesta: '15 minutos', resolucion: '4 horas' },
                    { prioridad: 'Alta', color: 'text-orange-600', tipo: 'Degradación severa del servicio', respuesta: '30 minutos', resolucion: '8 horas' },
                    { prioridad: 'Media', color: 'text-yellow-600', tipo: 'Problema parcial o intermitente', respuesta: '2 horas', resolucion: '24 horas' },
                    { prioridad: 'Baja', color: 'text-green-600', tipo: 'Consulta técnica o mejora', respuesta: '4 horas', resolucion: '48 horas' }
                  ].map((s, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className={`px-6 py-4 font-bold ${s.color}`}>{s.prioridad}</td>
                      <td className="px-6 py-4 text-gray-700">{s.tipo}</td>
                      <td className="px-6 py-4 text-gray-900 font-semibold">{s.respuesta}</td>
                      <td className="px-6 py-4 text-gray-900 font-semibold">{s.resolucion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Resoluciones rápidas */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Resoluciones rápidas</h2>
          <div className="max-w-3xl mx-auto space-y-4">
            {[
              { p: 'Mi conexión a internet va lenta', r: 'Reinicia el router desconectándolo de la corriente durante 30 segundos. Si el problema persiste, haz un test de velocidad desde recursos/herramientas/test-velocidad y contacta con nosotros con el resultado.' },
              { p: 'No tengo conexión a internet', r: 'Verifica que las luces del router estén encendidas (especialmente la luz de internet/WAN). Si están apagadas, comprueba el cableado. Si las luces están en rojo o parpadeando, contacta con soporte inmediatamente.' },
              { p: 'Las llamadas VoIP se cortan o tienen eco', r: 'Esto suele deberse a falta de ancho de banda o mala configuración de QoS. Verifica que no haya descargas pesadas en curso y contacta con soporte para revisar la priorización de tráfico.' },
              { p: 'El WiFi no llega a todas las zonas', r: 'Puede ser necesario añadir puntos de acceso adicionales. Solicita una auditoría WiFi gratuita y te diseñamos la cobertura óptima para tu espacio.' },
              { p: 'Necesito cambiar mi contraseña del área de cliente', r: 'Accede a /login, haz clic en "¿Olvidaste tu contraseña?" y sigue las instrucciones. Si tienes problemas, contacta con soporte.' }
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
          <div className="text-center mt-8">
            <Link href="/recursos/faq" className="text-orange-500 hover:text-orange-600 font-semibold">
              Ver todas las preguntas frecuentes →
            </Link>
          </div>
        </div>
      </section>

      {/* Soporte Remoto - Control Remoto */}
      <section id="control-remoto" className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <span className="inline-block bg-blue-500/10 text-blue-600 text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
                Asistencia remota
              </span>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">Control Remoto</h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Descarga nuestra aplicación de soporte remoto para que nuestro equipo técnico pueda acceder a tu equipo de forma segura y resolver incidencias al instante.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Windows */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="text-center">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="currentColor" viewBox="0 0 24 24"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">Windows</h3>
                  <p className="text-sm text-gray-500 mb-4">Windows 10 / 11</p>
                  <div className="space-y-2">
                    <a href="https://gjdfjawxpneglbivplfs.supabase.co/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-WIN.exe" 
                       className="block w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 px-4 rounded-lg font-semibold text-sm transition-all">
                      Descargar .EXE
                    </a>
                    <a href="https://gjdfjawxpneglbivplfs.supabase.co/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-WIN-MSI.msi" 
                       className="block w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all">
                      Descargar .MSI
                    </a>
                  </div>
                </div>
              </div>

              {/* macOS */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gray-800/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-800" fill="currentColor" viewBox="0 0 24 24"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11"/></svg>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">macOS</h3>
                  <p className="text-sm text-gray-500 mb-4">Apple Silicon / Intel</p>
                  <div className="space-y-2">
                    <a href="https://gjdfjawxpneglbivplfs.supabase.co/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-MAC_ARM.dmg" 
                       className="block w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 px-4 rounded-lg font-semibold text-sm transition-all">
                      Apple Silicon (M1/M2/M3)
                    </a>
                    <a href="https://gjdfjawxpneglbivplfs.supabase.co/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-MAC_X86.dmg" 
                       className="block w-full bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all">
                      Intel (x86)
                    </a>
                  </div>
                </div>
              </div>

              {/* Linux */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all">
                <div className="text-center">
                  <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-yellow-600" fill="currentColor" viewBox="0 0 24 24"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.368 1.884 1.43.868.07 1.723-.26 2.456-.594.733-.34 1.455-.78 2.28-.67.825.108 1.663.468 2.37.602a2.7 2.7 0 001.57-.14c.424-.18.692-.467.856-.799.164-.332.183-.7.036-1.024-.147-.324-.42-.594-.763-.82-.068-.045-.14-.09-.215-.145.22-.09.478-.198.736-.395.643-.497.902-1.176.719-1.669-.183-.493-.654-.659-.926-.659-.272 0-.483.132-.483.132s.167-.088.167-.333c0-.2-.133-.333-.133-.333s.333.2.333-.067c0-.266-.333-.333-.333-.333s.333.067.333-.2c0-.266-.333-.333-.333-.333s.133.067.133-.133c0-.2-.2-.333-.2-.333s.133.067.133-.133c0-.2-.133-.267-.133-.267s.067.067.067-.133c0-.2-.133-.267-.133-.267s.067.067.067-.133c0-.2-.133-.267-.133-.267s.067.067.067-.133c0-.2-.133-.267-.133-.267s.067.067.067-.133c0-.2-.133-.267-.133-.267"/></svg>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">Linux</h3>
                  <p className="text-sm text-gray-500 mb-4">Ubuntu / Debian</p>
                  <div className="space-y-2">
                    <a href="https://gjdfjawxpneglbivplfs.supabase.co/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-LINUX.deb" 
                       className="block w-full bg-orange-500 hover:bg-orange-600 text-white py-2.5 px-4 rounded-lg font-semibold text-sm transition-all">
                      Descargar .DEB
                    </a>
                  </div>
                </div>
              </div>

              {/* Android */}
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all sm:col-span-2 lg:col-span-3">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="currentColor" viewBox="0 0 24 24"><path d="M17.523 15.341a.996.996 0 010-1.992.996.996 0 010 1.992m-11.046 0a.996.996 0 010-1.992.996.996 0 010 1.992m11.405-6.02l1.997-3.46a.416.416 0 00-.152-.567.416.416 0 00-.567.152l-2.024 3.506C15.604 8.16 13.88 7.7 12 7.7s-3.604.46-5.136 1.252L4.84 5.446a.416.416 0 00-.567-.152.416.416 0 00-.152.567l1.997 3.46C2.688 11.187.343 14.445 0 18.3h24c-.344-3.855-2.688-7.113-6.118-8.979"/></svg>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-1">Android</h3>
                  <p className="text-sm text-gray-500 mb-4">Smartphones y tablets</p>
                  <a href="https://gjdfjawxpneglbivplfs.supabase.co/storage/v1/object/public/downloads/soporte-remoto/SAT_IO-ANDROID.apk" 
                     className="inline-block bg-orange-500 hover:bg-orange-600 text-white py-2.5 px-8 rounded-lg font-semibold text-sm transition-all">
                    Descargar .APK
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-8 bg-blue-50 rounded-xl p-6 border border-blue-100">
              <h4 className="font-bold text-gray-900 mb-2">¿Cómo funciona?</h4>
              <ol className="text-gray-600 space-y-2 text-sm">
                <li><span className="font-semibold text-orange-500">1.</span> Descarga e instala la aplicación en tu dispositivo</li>
                <li><span className="font-semibold text-orange-500">2.</span> Ejecuta la aplicación — se generará un ID y contraseña</li>
                <li><span className="font-semibold text-orange-500">3.</span> Comunica el ID y contraseña a nuestro técnico por teléfono o chat</li>
                <li><span className="font-semibold text-orange-500">4.</span> El técnico se conectará de forma segura a tu equipo para resolver la incidencia</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Formulario de ticket */}
      <section id="ticket" className="py-20 bg-gray-50">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            {isSubmitted ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center">
                <div className="text-6xl mb-4">🎫</div>
                <h3 className="text-2xl font-bold text-green-800 mb-4">Ticket creado correctamente</h3>
                <p className="text-green-700 text-lg mb-2">Nuestro equipo técnico revisará tu incidencia y te contactará en el tiempo indicado según la prioridad.</p>
                <p className="text-green-600 mb-6">Recibirás un email de confirmación con el número de ticket.</p>
                <Link href="/" className="text-orange-500 hover:text-orange-600 font-semibold">Volver al inicio</Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Abrir ticket de soporte</h2>
                  <p className="text-gray-600">Para incidencias urgentes, recomendamos llamar al 900 730 034</p>
                </div>
                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 md:p-12">
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
                  )}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre *</label>
                      <input type="text" name="nombre" value={ticketData.nombre} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Empresa *</label>
                      <input type="text" name="empresa" value={ticketData.empresa} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Email *</label>
                      <input type="email" name="email" value={ticketData.email} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono *</label>
                      <input type="tel" name="telefono" value={ticketData.telefono} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de incidencia *</label>
                      <select name="tipo" value={ticketData.tipo} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                        <option value="">Seleccionar tipo</option>
                        <option value="conectividad">Conectividad / Internet</option>
                        <option value="telefonia">Telefonía / VoIP</option>
                        <option value="wifi">WiFi</option>
                        <option value="seguridad">Seguridad de red</option>
                        <option value="hardware">Hardware / Equipos</option>
                        <option value="facturacion">Facturación</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Prioridad *</label>
                      <select name="prioridad" value={ticketData.prioridad} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500">
                        <option value="">Seleccionar prioridad</option>
                        <option value="critica">Crítica - Servicio caído</option>
                        <option value="alta">Alta - Degradación severa</option>
                        <option value="media">Media - Problema parcial</option>
                        <option value="baja">Baja - Consulta / Mejora</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Descripción de la incidencia *</label>
                    <textarea name="descripcion" value={ticketData.descripcion} onChange={handleChange} rows={5} required
                      placeholder="Describe el problema con el mayor detalle posible: qué ocurre, desde cuándo, qué equipos están afectados..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                  </div>
                  <div className="mt-6">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name="acepta" checked={ticketData.acepta} onChange={handleChange} required
                        className="mt-1 h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500" />
                      <span className="text-sm text-gray-600">
                        Acepto la <Link href="/politica-privacidad" className="underline hover:text-orange-600">política de privacidad</Link>. *
                      </span>
                    </label>
                  </div>
                  <button type="submit" disabled={isSubmitting || !ticketData.acepta}
                    className="mt-8 w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white py-4 rounded-lg font-semibold text-lg transition-all">
                    {isSubmitting ? 'Enviando ticket...' : 'Abrir ticket de soporte'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      <EmpresaFooter />

      {/* Botón flotante Control Remoto - SOS */}
      <a href="#control-remoto" 
         className="fixed top-1/2 -translate-y-1/2 right-6 bg-red-600 hover:bg-red-700 text-white px-4 py-4 rounded-2xl shadow-lg hover:shadow-xl transition-all flex flex-col items-center gap-1 z-50 animate-pulse hover:animate-none">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span className="font-black text-xs">SOS</span>
        <span className="font-semibold text-[10px] leading-tight">Control<br/>Remoto</span>
      </a>
    </div>
  );
}
