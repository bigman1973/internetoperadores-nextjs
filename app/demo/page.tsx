"use client";
import Link from 'next/link';
import { useState, useRef } from 'react';
import EmpresaNav from '../../components/EmpresaNav';
import EmpresaFooter from '../../components/EmpresaFooter';

export default function DemoPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    empleados: '',
    interes: '',
    fecha: '',
    horario: '',
    mensaje: '',
    newsletter: false,
    acepta: false
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: formData.nombre,
          empresa: formData.empresa,
          email: formData.email,
          telefono: formData.telefono,
          empleados: formData.empleados,
          interes: formData.interes,
          fecha: formData.fecha,
          horario: formData.horario,
          mensaje: formData.mensaje,
          newsletter: formData.newsletter
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

  const selectDemo = (value: string) => {
    setFormData(prev => ({ ...prev, interes: value }));
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const demos = [
    { icono: '🌐', titulo: 'Conectividad SD-WAN', value: 'conectividad-sdwan', desc: 'Te mostramos cómo gestionar múltiples sedes con una red inteligente que prioriza tráfico crítico y reduce costes.', duracion: '30 min' },
    { icono: '📞', titulo: 'Comunicaciones Unificadas', value: 'comunicaciones-unificadas', desc: 'Demostración en vivo de centralita virtual, integración con Teams/Zoom, grabación de llamadas y analíticas.', duracion: '30 min' },
    { icono: '📶', titulo: 'WiFi Empresarial', value: 'wifi-empresarial', desc: 'Diseño de cobertura WiFi 6 para tu espacio, portal cautivo para clientes y gestión centralizada.', duracion: '20 min' },
    { icono: '🛡️', titulo: 'Seguridad de Red', value: 'seguridad-red', desc: 'Firewall avanzado, VPN corporativa, segmentación de red y monitorización de amenazas en tiempo real.', duracion: '25 min' },
    { icono: '💾', titulo: 'ExaGrid Backup', value: 'exagrid-backup', desc: 'Solución de backup y recuperación ante desastres. Te mostramos cómo proteger tus datos críticos.', duracion: '25 min' },
    { icono: '🔧', titulo: 'Mantenimiento IT', value: 'mantenimiento-it', desc: 'Gestión proactiva de tu infraestructura: monitorización, actualizaciones, soporte remoto y presencial.', duracion: '25 min' },
    { icono: '🌍', titulo: 'Migración Web', value: 'migracion-web', desc: 'Migración de tu web, email y hosting a nuestra infraestructura con cero downtime y soporte completo.', duracion: '20 min' },
    { icono: '📱', titulo: 'Soluciones Móviles', value: 'soluciones-moviles', desc: 'Tarifas móviles corporativas con gestión centralizada, MDM y comunicaciones unificadas.', duracion: '20 min' },
    { icono: '🔍', titulo: 'Auditoría Completa', value: 'auditoria-completa', desc: 'Revisión integral de tu infraestructura actual con propuesta de mejora personalizada y presupuesto.', duracion: '45 min' }
  ];

  return (
    <div className="min-h-screen bg-white">
      <EmpresaNav currentPage="demo" />

      {/* Hero */}
      <section className="pt-32 pb-16 bg-gradient-to-b from-orange-50 to-white">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block bg-orange-100 text-orange-600 text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              Sin compromiso
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Solicita una <span className="text-orange-500">demo personalizada</span>
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Nuestro equipo técnico te mostrará en directo cómo nuestras soluciones pueden transformar 
              la conectividad de tu empresa. Sin compromiso, sin coste, adaptada a tu caso concreto.
            </p>
          </div>
        </div>
      </section>

      {/* Tipos de demo - tarjetas clickables */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">¿Qué te gustaría ver?</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((d, i) => (
              <button
                key={i}
                onClick={() => selectDemo(d.value)}
                className={`text-left bg-gray-50 rounded-xl p-6 border-2 transition-all cursor-pointer hover:shadow-md hover:border-orange-300 ${
                  formData.interes === d.value ? 'border-orange-500 bg-orange-50 shadow-md' : 'border-gray-100'
                }`}
              >
                <div className="flex items-start gap-4">
                  <span className="text-3xl">{d.icono}</span>
                  <div>
                    <h3 className="font-bold text-gray-900 mb-1">{d.titulo}</h3>
                    <p className="text-gray-600 text-sm mb-3 leading-relaxed">{d.desc}</p>
                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-full font-medium">Duración: {d.duracion}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Formulario */}
      <section className="py-20 bg-gray-50" ref={formRef}>
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto">
            {isSubmitted ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-12 text-center">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-bold text-green-800 mb-4">Demo solicitada correctamente</h3>
                <p className="text-green-700 text-lg mb-2">Nuestro equipo técnico te contactará en menos de 24 horas para confirmar la fecha y hora de tu demo.</p>
                <p className="text-green-600 mb-6">Hemos enviado un email de confirmación con los detalles de tu solicitud.</p>
                <Link href="/" className="text-orange-500 hover:text-orange-600 font-semibold">Volver al inicio</Link>
              </div>
            ) : (
              <>
                <div className="text-center mb-10">
                  <h2 className="text-3xl font-bold text-gray-900 mb-4">Reserva tu demo</h2>
                  <p className="text-gray-600">Completa el formulario y te contactaremos para confirmar fecha y hora</p>
                </div>
                <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-8 md:p-12">
                  {error && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">{error}</div>
                  )}
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Nombre completo *</label>
                      <input type="text" name="nombre" value={formData.nombre} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Empresa *</label>
                      <input type="text" name="empresa" value={formData.empresa} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Email corporativo *</label>
                      <input type="email" name="email" value={formData.email} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Teléfono *</label>
                      <input type="tel" name="telefono" value={formData.telefono} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">N.º de empleados</label>
                      <select name="empleados" value={formData.empleados} onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 bg-white">
                        <option value="">Seleccionar</option>
                        <option value="1-10">1 - 10</option>
                        <option value="11-50">11 - 50</option>
                        <option value="51-200">51 - 200</option>
                        <option value="200+">Más de 200</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">¿Qué te interesa ver? *</label>
                      <select name="interes" value={formData.interes} onChange={handleChange} required
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 bg-white">
                        <option value="">Seleccionar demo</option>
                        <option value="conectividad-sdwan">Conectividad SD-WAN</option>
                        <option value="comunicaciones-unificadas">Comunicaciones Unificadas</option>
                        <option value="wifi-empresarial">WiFi Empresarial</option>
                        <option value="seguridad-red">Seguridad de Red</option>
                        <option value="exagrid-backup">ExaGrid Backup</option>
                        <option value="mantenimiento-it">Mantenimiento IT</option>
                        <option value="migracion-web">Migración Web</option>
                        <option value="soluciones-moviles">Soluciones Móviles</option>
                        <option value="auditoria-completa">Auditoría Completa</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Fecha preferida</label>
                      <input type="date" name="fecha" value={formData.fecha} onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Horario preferido</label>
                      <select name="horario" value={formData.horario} onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900 bg-white">
                        <option value="">Seleccionar horario</option>
                        <option value="9-11">9:00 - 11:00</option>
                        <option value="11-13">11:00 - 13:00</option>
                        <option value="13-15">13:00 - 15:00</option>
                        <option value="15-17">15:00 - 17:00</option>
                        <option value="17-19">17:00 - 19:00</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-6">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">¿Algo que debamos saber? (opcional)</label>
                    <textarea name="mensaje" value={formData.mensaje} onChange={handleChange} rows={3}
                      placeholder="Cuéntanos tu situación actual, qué problemas tienes o qué necesitas mejorar..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" />
                  </div>

                  {/* Newsletter opt-in */}
                  <div className="mt-6">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name="newsletter" checked={formData.newsletter} onChange={handleChange}
                        className="mt-1 h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 accent-orange-600" />
                      <span className="text-sm text-gray-600">
                        Quiero suscribirme al newsletter y recibir novedades, ofertas y contenido de interés.
                      </span>
                    </label>
                  </div>

                  {/* Privacidad */}
                  <div className="mt-4">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name="acepta" checked={formData.acepta} onChange={handleChange} required
                        className="mt-1 h-4 w-4 text-orange-500 border-gray-300 rounded focus:ring-orange-500 accent-orange-600" />
                      <span className="text-sm text-gray-600">
                        Acepto la <Link href="/politica-privacidad" className="underline hover:text-orange-600">política de privacidad</Link> y consiento el tratamiento de mis datos. *
                      </span>
                    </label>
                  </div>
                  <button type="submit" disabled={isSubmitting || !formData.acepta}
                    className="mt-8 w-full bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white py-4 rounded-lg font-semibold text-lg transition-all">
                    {isSubmitting ? 'Enviando solicitud...' : 'Solicitar demo gratuita'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Ventajas */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-bold text-gray-900 mb-2">100% personalizada</h3>
              <p className="text-gray-600 text-sm">Adaptamos la demo a tu sector, tamaño de empresa y necesidades específicas.</p>
            </div>
            <div>
              <div className="text-4xl mb-3">💻</div>
              <h3 className="font-bold text-gray-900 mb-2">Online o presencial</h3>
              <p className="text-gray-600 text-sm">Por videollamada o en tus instalaciones. Tú eliges lo que más te convenga.</p>
            </div>
            <div>
              <div className="text-4xl mb-3">📋</div>
              <h3 className="font-bold text-gray-900 mb-2">Con propuesta incluida</h3>
              <p className="text-gray-600 text-sm">Tras la demo, recibirás una propuesta técnica y económica sin compromiso.</p>
            </div>
          </div>
        </div>
      </section>

      <EmpresaFooter />
    </div>
  );
}
