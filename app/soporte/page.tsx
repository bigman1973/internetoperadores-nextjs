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
              <a href="https://wa.me/34900123456?text=Hola%2C%20necesito%20soporte%20t%C3%A9cnico" target="_blank" className="bg-green-600 hover:bg-green-700 text-white px-6 py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2">
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
              { icono: '💬', titulo: 'WhatsApp', dato: '+34 6XX XXX XXX', desc: 'Envía capturas, vídeos y describe tu incidencia de forma rápida y cómoda.', horario: '24 horas, 365 días' },
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
    </div>
  );
}
