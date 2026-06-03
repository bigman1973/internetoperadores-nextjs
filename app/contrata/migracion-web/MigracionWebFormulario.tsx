'use client';

import { useState } from 'react';
import Image from 'next/image';

// ===== TIPOS =====
interface FormData {
  // Paso 1
  nombreEmpresa: string;
  contacto: string;
  email: string;
  telefono: string;
  urlWebActual: string;
  newsletter: boolean;
  // Paso 2
  sector: string;
  sectorOtro: string;
  // Paso 3
  numPaginas: string;
  tieneBlog: boolean;
  tieneTienda: boolean;
  tieneFormularios: boolean;
  tieneAreaPrivada: boolean;
  frustracionActual: string;
  // Paso 4
  objetivos: string[];
  // Paso 5 (respuestas sector)
  respuestasSector: Record<string, string>;
  // Paso 6
  necesitaIntegracion: boolean;
  softwareActual: string;
  tieneApi: string;
  datosIntegracion: string;
  proveedorActual: string;
  // Paso 7
  presupuesto: string;
  fechaLimite: string;
  comoNosConocio: string;
}

const initialFormData: FormData = {
  nombreEmpresa: '',
  contacto: '',
  email: '',
  telefono: '',
  urlWebActual: '',
  newsletter: true,
  sector: '',
  sectorOtro: '',
  numPaginas: '',
  tieneBlog: false,
  tieneTienda: false,
  tieneFormularios: false,
  tieneAreaPrivada: false,
  frustracionActual: '',
  objetivos: [],
  respuestasSector: {},
  necesitaIntegracion: false,
  softwareActual: '',
  tieneApi: '',
  datosIntegracion: '',
  proveedorActual: '',
  presupuesto: '',
  fechaLimite: '',
  comoNosConocio: '',
};

// ===== DATOS DE SECTORES =====
const SECTORES = [
  { id: 'seguros', label: 'Seguros y Correduría', icon: '🛡️' },
  { id: 'construccion', label: 'Construcción e Ingeniería', icon: '🏗️' },
  { id: 'hosteleria', label: 'Hostelería y Restauración', icon: '🍽️' },
  { id: 'despachos', label: 'Despachos Profesionales', icon: '⚖️' },
  { id: 'comercio', label: 'Comercio y Retail', icon: '🛒' },
  { id: 'salud', label: 'Salud y Bienestar', icon: '🏥' },
  { id: 'industria', label: 'Industria y Fabricación', icon: '🏭' },
  { id: 'otro', label: 'Otro sector', icon: '💼' },
];

const OBJETIVOS = [
  { id: 'captar_clientes', label: 'Captar más clientes' },
  { id: 'mejorar_imagen', label: 'Mejorar imagen corporativa' },
  { id: 'integrar_software', label: 'Integrar con mi software' },
  { id: 'mejorar_seguridad', label: 'Mejorar seguridad' },
  { id: 'mejorar_seo', label: 'Mejorar posicionamiento SEO' },
  { id: 'area_privada', label: 'Área privada para clientes' },
  { id: 'vender_online', label: 'Vender online' },
  { id: 'otro', label: 'Otro objetivo' },
];

// Preguntas específicas por sector
const PREGUNTAS_SECTOR: Record<string, { id: string; pregunta: string; tipo: 'text' | 'select' | 'radio'; opciones?: string[] }[]> = {
  seguros: [
    { id: 'aseguradoras', pregunta: '¿Con cuántas aseguradoras trabajan?', tipo: 'text' },
    { id: 'cotizador', pregunta: '¿Necesitan un cotizador online integrado?', tipo: 'radio', opciones: ['Sí', 'No', 'Lo estamos valorando'] },
    { id: 'multirramo', pregunta: '¿Trabajan con multirramo o están especializados?', tipo: 'text' },
    { id: 'software_polizas', pregunta: '¿Qué software de gestión de pólizas utilizan?', tipo: 'text' },
    { id: 'multilingue', pregunta: '¿Necesitan la web en varios idiomas?', tipo: 'radio', opciones: ['Sí', 'No'] },
    { id: 'landing_pages', pregunta: '¿Necesitan landing pages para campañas?', tipo: 'radio', opciones: ['Sí', 'No', 'Posiblemente'] },
  ],
  construccion: [
    { id: 'rango_presupuesto', pregunta: '¿Cuál es el rango de presupuesto medio de sus proyectos?', tipo: 'select', opciones: ['Menos de 100.000 €', '100.000 € - 500.000 €', '500.000 € - 2.000.000 €', 'Más de 2.000.000 €'] },
    { id: 'tipo_cliente', pregunta: '¿Su cliente principal es B2B, B2C o ambos?', tipo: 'radio', opciones: ['B2B', 'B2C', 'Ambos'] },
    { id: 'portfolio', pregunta: '¿Disponen de portfolio fotográfico de obras?', tipo: 'radio', opciones: ['Sí, profesional', 'Sí, pero básico', 'No'] },
    { id: 'software_obras', pregunta: '¿Qué software utilizan para gestión de obras?', tipo: 'text' },
    { id: 'area_privada_obra', pregunta: '¿Les interesa un área privada donde el cliente vea el avance de su obra?', tipo: 'radio', opciones: ['Sí', 'No', 'Lo estamos valorando'] },
    { id: 'filtro_presupuesto', pregunta: '¿Desean filtrar automáticamente solicitudes por debajo de un presupuesto mínimo?', tipo: 'radio', opciones: ['Sí', 'No', 'Derivar a colaboradores'] },
  ],
  hosteleria: [
    { id: 'establecimientos', pregunta: '¿Cuántos establecimientos tienen?', tipo: 'text' },
    { id: 'reservas', pregunta: '¿Necesitan sistema de reservas online?', tipo: 'radio', opciones: ['Sí', 'No', 'Ya tenemos uno'] },
    { id: 'carta_digital', pregunta: '¿Necesitan carta digital / menú online?', tipo: 'radio', opciones: ['Sí', 'No', 'Ya tenemos'] },
    { id: 'delivery', pregunta: '¿Trabajan con plataformas de delivery?', tipo: 'radio', opciones: ['Sí', 'No', 'Queremos empezar'] },
    { id: 'tpv', pregunta: '¿Qué TPV o software de gestión utilizan?', tipo: 'text' },
    { id: 'eventos', pregunta: '¿Organizan eventos o catering?', tipo: 'radio', opciones: ['Sí', 'No'] },
  ],
  despachos: [
    { id: 'tipo_despacho', pregunta: '¿Qué tipo de despacho? (abogados, asesores, arquitectos...)', tipo: 'text' },
    { id: 'area_privada_docs', pregunta: '¿Necesitan área privada para compartir documentos con clientes?', tipo: 'radio', opciones: ['Sí', 'No', 'Lo estamos valorando'] },
    { id: 'blog_contenidos', pregunta: '¿Publican contenido jurídico/técnico regularmente?', tipo: 'radio', opciones: ['Sí', 'No', 'Queremos empezar'] },
    { id: 'citas_online', pregunta: '¿Necesitan sistema de citas online?', tipo: 'radio', opciones: ['Sí', 'No'] },
    { id: 'software_expedientes', pregunta: '¿Qué software de gestión de expedientes utilizan?', tipo: 'text' },
    { id: 'normativa', pregunta: '¿Necesitan cumplir alguna normativa específica en la web?', tipo: 'text' },
  ],
  comercio: [
    { id: 'tienda_fisica', pregunta: '¿Tienen tienda física además de online?', tipo: 'radio', opciones: ['Sí', 'Solo online', 'Solo física, quiero online'] },
    { id: 'num_productos', pregunta: '¿Cuántos productos/referencias manejan?', tipo: 'select', opciones: ['Menos de 50', '50-200', '200-1000', 'Más de 1000'] },
    { id: 'plataforma_actual', pregunta: '¿Qué plataforma e-commerce usan actualmente?', tipo: 'text' },
    { id: 'erp', pregunta: '¿Tienen ERP o software de gestión de stock?', tipo: 'text' },
    { id: 'ambito', pregunta: '¿Venden a nivel nacional, internacional o ambos?', tipo: 'radio', opciones: ['Nacional', 'Internacional', 'Ambos'] },
    { id: 'pasarela_pago', pregunta: '¿Qué pasarela de pago prefieren?', tipo: 'text' },
  ],
  salud: [
    { id: 'tipo_centro', pregunta: '¿Qué tipo de centro es? (clínica dental, fisio, estética...)', tipo: 'text' },
    { id: 'citas_online', pregunta: '¿Necesitan sistema de citas online?', tipo: 'radio', opciones: ['Sí', 'No', 'Ya tenemos'] },
    { id: 'ficha_paciente', pregunta: '¿Necesitan área privada con ficha del paciente?', tipo: 'radio', opciones: ['Sí', 'No'] },
    { id: 'software_clinica', pregunta: '¿Qué software de gestión clínica utilizan?', tipo: 'text' },
    { id: 'normativa_sanitaria', pregunta: '¿Necesitan cumplir normativa sanitaria específica en la web?', tipo: 'radio', opciones: ['Sí', 'No', 'No estoy seguro'] },
  ],
  industria: [
    { id: 'catalogo', pregunta: '¿Necesitan catálogo de productos online?', tipo: 'radio', opciones: ['Sí', 'No'] },
    { id: 'configurador', pregunta: '¿Necesitan un configurador de producto?', tipo: 'radio', opciones: ['Sí', 'No', 'Lo estamos valorando'] },
    { id: 'distribuidores', pregunta: '¿Venden a distribuidores (B2B) o cliente final (B2C)?', tipo: 'radio', opciones: ['B2B', 'B2C', 'Ambos'] },
    { id: 'zona_precios', pregunta: '¿Necesitan zona privada con precios por distribuidor?', tipo: 'radio', opciones: ['Sí', 'No'] },
    { id: 'erp_industria', pregunta: '¿Qué ERP o software de gestión utilizan?', tipo: 'text' },
  ],
};

const PASOS = [
  'Datos básicos',
  'Sector',
  'Estado web',
  'Objetivos',
  'Sector específico',
  'Integración',
  'Presupuesto',
  'Confirmación',
];

export default function MigracionWebFormulario() {
  const [paso, setPaso] = useState(1);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  const totalPasos = calcularTotalPasos();

  function calcularTotalPasos() {
    let total = 8;
    // Si no tiene preguntas de sector, saltar paso 5
    if (!formData.sector || formData.sector === 'otro' || !PREGUNTAS_SECTOR[formData.sector]) {
      total--;
    }
    // Si no necesita integración, saltar paso 6
    if (!formData.objetivos.includes('integrar_software')) {
      total--;
    }
    return total;
  }

  function getPasoReal(pasoVisual: number): number {
    // Mapear paso visual a paso real considerando los que se saltan
    const saltarSector = !formData.sector || formData.sector === 'otro' || !PREGUNTAS_SECTOR[formData.sector];
    const saltarIntegracion = !formData.objetivos.includes('integrar_software');

    if (pasoVisual <= 4) return pasoVisual;
    if (saltarSector && pasoVisual === 5) return saltarIntegracion ? 7 : 6;
    if (saltarSector && !saltarIntegracion && pasoVisual === 6) return 7;
    if (saltarSector && pasoVisual >= 6) return pasoVisual + 1 + (saltarIntegracion ? 1 : 0);
    return pasoVisual;
  }

  function siguiente() {
    // Validaciones por paso
    if (paso === 1) {
      if (!formData.nombreEmpresa || !formData.contacto || !formData.email) {
        setError('Por favor, completa los campos obligatorios.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
        setError('El email no es válido.');
        return;
      }
    }
    if (paso === 2 && !formData.sector) {
      setError('Selecciona un sector.');
      return;
    }

    setError('');

    // Saltar paso 5 si no hay preguntas de sector
    if (paso === 4) {
      const saltarSector = !formData.sector || formData.sector === 'otro' || !PREGUNTAS_SECTOR[formData.sector];
      if (saltarSector) {
        const saltarIntegracion = !formData.objetivos.includes('integrar_software');
        setPaso(saltarIntegracion ? 7 : 6);
        return;
      }
    }

    // Saltar paso 6 si no necesita integración
    if (paso === 5) {
      const saltarIntegracion = !formData.objetivos.includes('integrar_software');
      if (saltarIntegracion) {
        setPaso(7);
        return;
      }
    }

    setPaso(paso + 1);
  }

  function anterior() {
    if (paso === 7) {
      const saltarIntegracion = !formData.objetivos.includes('integrar_software');
      if (saltarIntegracion) {
        const saltarSector = !formData.sector || formData.sector === 'otro' || !PREGUNTAS_SECTOR[formData.sector];
        setPaso(saltarSector ? 4 : 5);
        return;
      }
    }
    if (paso === 6) {
      const saltarSector = !formData.sector || formData.sector === 'otro' || !PREGUNTAS_SECTOR[formData.sector];
      if (saltarSector) {
        setPaso(4);
        return;
      }
    }
    setPaso(paso - 1);
  }

  async function enviarFormulario() {
    setEnviando(true);
    setError('');
    try {
      const res = await fetch('/api/contrata/migracion-web', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al enviar');
      }
      setEnviado(true);
    } catch (err: any) {
      setError(err.message || 'Error al enviar el formulario');
    } finally {
      setEnviando(false);
    }
  }

  function updateField(field: keyof FormData, value: any) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  function toggleObjetivo(id: string) {
    setFormData(prev => ({
      ...prev,
      objetivos: prev.objetivos.includes(id)
        ? prev.objetivos.filter(o => o !== id)
        : [...prev.objetivos, id],
    }));
  }

  function updateRespuestaSector(id: string, value: string) {
    setFormData(prev => ({
      ...prev,
      respuestasSector: { ...prev.respuestasSector, [id]: value },
    }));
  }

  // Calcular progreso visual
  const progreso = Math.round((paso / 8) * 100);

  if (enviado) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Solicitud enviada correctamente</h2>
          <p className="text-gray-600 mb-6">
            Hemos recibido tu solicitud de auditoría web. Te hemos enviado un email de confirmación con el resumen de tu solicitud. Nuestro equipo revisará la información y
            recibirás tu propuesta personalizada en un plazo máximo de <strong>5 días laborables</strong>.
          </p>
          <a href="/" className="inline-block bg-orange-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-orange-600 transition-colors">
            Volver al inicio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="https://www.internetoperadores.com" className="flex items-center gap-2">
            <span className="text-lg font-bold">internet <span className="text-orange-500">operadores</span></span>
          </a>
          <span className="text-sm text-gray-500">Migración Web Profesional</span>
        </div>
      </header>

      {/* Barra de progreso */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Paso {paso} de 8</span>
            <span className="text-sm text-gray-500">{progreso}% completado</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-orange-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenido del paso */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow-sm border p-6 md:p-8">
          {/* PASO 1: Datos básicos */}
          {paso === 1 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Datos de contacto</h2>
              <p className="text-gray-600 mb-6">Cuéntanos quién eres para poder preparar tu propuesta personalizada.</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de la empresa *</label>
                  <input
                    type="text"
                    value={formData.nombreEmpresa}
                    onChange={e => updateField('nombreEmpresa', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Tu empresa S.L."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Persona de contacto *</label>
                  <input
                    type="text"
                    value={formData.contacto}
                    onChange={e => updateField('contacto', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Nombre y apellidos"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={e => updateField('email', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="email@empresa.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono</label>
                  <input
                    type="tel"
                    value={formData.telefono}
                    onChange={e => updateField('telefono', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="600 000 000"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL de tu web actual</label>
                  <input
                    type="url"
                    value={formData.urlWebActual}
                    onChange={e => updateField('urlWebActual', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="https://www.tuempresa.com"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASO 2: Sector */}
          {paso === 2 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Sector de actividad</h2>
              <p className="text-gray-600 mb-6">Selecciona tu sector para adaptar las preguntas a tu negocio.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {SECTORES.map(s => (
                  <button
                    key={s.id}
                    onClick={() => updateField('sector', s.id)}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                      formData.sector === s.id
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    <span className="text-2xl">{s.icon}</span>
                    <span className="font-medium text-gray-900">{s.label}</span>
                  </button>
                ))}
              </div>
              {formData.sector === 'otro' && (
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Especifica tu sector</label>
                  <input
                    type="text"
                    value={formData.sectorOtro}
                    onChange={e => updateField('sectorOtro', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Describe tu sector..."
                  />
                </div>
              )}
            </div>
          )}

          {/* PASO 3: Estado web */}
          {paso === 3 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Estado actual de tu web</h2>
              <p className="text-gray-600 mb-6">Ayúdanos a entender tu situación actual.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Número aproximado de páginas</label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {['Menos de 10', '10-50', '50-150', 'Más de 150'].map(op => (
                      <button
                        key={op}
                        onClick={() => updateField('numPaginas', op)}
                        className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          formData.numPaginas === op
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tu web actual incluye:</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { field: 'tieneBlog' as const, label: 'Blog' },
                      { field: 'tieneTienda' as const, label: 'Tienda online' },
                      { field: 'tieneFormularios' as const, label: 'Formularios de contacto' },
                      { field: 'tieneAreaPrivada' as const, label: 'Área privada / login' },
                    ].map(item => (
                      <label key={item.field} className="flex items-center gap-2 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={formData[item.field] as boolean}
                          onChange={e => updateField(item.field, e.target.checked)}
                          className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                        />
                        <span className="text-sm text-gray-700">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Principal frustración con tu web actual
                  </label>
                  <textarea
                    value={formData.frustracionActual}
                    onChange={e => updateField('frustracionActual', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    rows={3}
                    placeholder="¿Qué es lo que más te frustra de tu web actual?"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASO 4: Objetivos */}
          {paso === 4 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Objetivos del proyecto</h2>
              <p className="text-gray-600 mb-6">¿Qué quieres conseguir con la nueva web? Puedes seleccionar varios.</p>
              <div className="grid gap-3 md:grid-cols-2">
                {OBJETIVOS.map(obj => (
                  <button
                    key={obj.id}
                    onClick={() => toggleObjetivo(obj.id)}
                    className={`flex items-center gap-3 p-4 rounded-lg border-2 text-left transition-all ${
                      formData.objetivos.includes(obj.id)
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                      formData.objetivos.includes(obj.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'
                    }`}>
                      {formData.objetivos.includes(obj.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="font-medium text-gray-900">{obj.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* PASO 5: Preguntas específicas del sector */}
          {paso === 5 && formData.sector && PREGUNTAS_SECTOR[formData.sector] && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Preguntas específicas: {SECTORES.find(s => s.id === formData.sector)?.label}
              </h2>
              <p className="text-gray-600 mb-6">Estas preguntas nos ayudan a personalizar tu propuesta.</p>
              <div className="space-y-5">
                {PREGUNTAS_SECTOR[formData.sector].map(p => (
                  <div key={p.id}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{p.pregunta}</label>
                    {p.tipo === 'text' && (
                      <input
                        type="text"
                        value={formData.respuestasSector[p.id] || ''}
                        onChange={e => updateRespuestaSector(p.id, e.target.value)}
                        className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      />
                    )}
                    {p.tipo === 'select' && p.opciones && (
                      <select
                        value={formData.respuestasSector[p.id] || ''}
                        onChange={e => updateRespuestaSector(p.id, e.target.value)}
                        className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      >
                        <option value="">Selecciona una opción</option>
                        {p.opciones.map(op => (
                          <option key={op} value={op}>{op}</option>
                        ))}
                      </select>
                    )}
                    {p.tipo === 'radio' && p.opciones && (
                      <div className="flex flex-wrap gap-2">
                        {p.opciones.map(op => (
                          <button
                            key={op}
                            onClick={() => updateRespuestaSector(p.id, op)}
                            className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                              formData.respuestasSector[p.id] === op
                                ? 'border-orange-500 bg-orange-50 text-orange-700'
                                : 'border-gray-200 hover:border-orange-300'
                            }`}
                          >
                            {op}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PASO 6: Integración software */}
          {paso === 6 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Integración con software</h2>
              <p className="text-gray-600 mb-6">Cuéntanos sobre el software que necesitas integrar con la web.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Qué software utilizan actualmente?</label>
                  <input
                    type="text"
                    value={formData.softwareActual}
                    onChange={e => updateField('softwareActual', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="SAP, Navision, Holded, desarrollo propio..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">¿El software dispone de API?</label>
                  <div className="flex gap-2">
                    {['Sí', 'No', 'No lo sé'].map(op => (
                      <button
                        key={op}
                        onClick={() => updateField('tieneApi', op)}
                        className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${
                          formData.tieneApi === op
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Qué datos necesitan fluir entre web y software?</label>
                  <textarea
                    value={formData.datosIntegracion}
                    onChange={e => updateField('datosIntegracion', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    rows={3}
                    placeholder="Ej: leads del formulario al CRM, stock del ERP a la web, pedidos..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Tienen proveedor informático actual?</label>
                  <input
                    type="text"
                    value={formData.proveedorActual}
                    onChange={e => updateField('proveedorActual', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Nombre del proveedor o 'interno'"
                  />
                </div>
              </div>
            </div>
          )}

          {/* PASO 7: Presupuesto y plazos */}
          {paso === 7 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Presupuesto y plazos</h2>
              <p className="text-gray-600 mb-6">Última información para preparar tu propuesta.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Presupuesto orientativo</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {['Menos de 3.000 €', '3.000 - 6.000 €', '6.000 - 12.000 €', 'Más de 12.000 €', 'No tengo referencia'].map(op => (
                      <button
                        key={op}
                        onClick={() => updateField('presupuesto', op)}
                        className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                          formData.presupuesto === op
                            ? 'border-orange-500 bg-orange-50 text-orange-700'
                            : 'border-gray-200 hover:border-orange-300'
                        }`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Tienes fecha límite para el lanzamiento?</label>
                  <input
                    type="text"
                    value={formData.fechaLimite}
                    onChange={e => updateField('fechaLimite', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    placeholder="Ej: Septiembre 2026, sin fecha fija..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">¿Cómo nos has conocido?</label>
                  <select
                    value={formData.comoNosConocio}
                    onChange={e => updateField('comoNosConocio', e.target.value)}
                    className="w-full border rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="google">Google</option>
                    <option value="recomendacion">Recomendación</option>
                    <option value="redes_sociales">Redes sociales</option>
                    <option value="ya_soy_cliente">Ya soy cliente</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* PASO 8: Confirmación */}
          {paso === 8 && (
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Resumen de tu solicitud</h2>
              <p className="text-gray-600 mb-6">Revisa los datos antes de enviar.</p>
              <div className="space-y-4 bg-gray-50 rounded-lg p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Empresa</span>
                    <p className="font-medium">{formData.nombreEmpresa}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Contacto</span>
                    <p className="font-medium">{formData.contacto}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Email</span>
                    <p className="font-medium">{formData.email}</p>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 uppercase">Sector</span>
                    <p className="font-medium">{SECTORES.find(s => s.id === formData.sector)?.label || formData.sectorOtro}</p>
                  </div>
                  {formData.urlWebActual && (
                    <div className="md:col-span-2">
                      <span className="text-xs text-gray-500 uppercase">Web actual</span>
                      <p className="font-medium">{formData.urlWebActual}</p>
                    </div>
                  )}
                  {formData.objetivos.length > 0 && (
                    <div className="md:col-span-2">
                      <span className="text-xs text-gray-500 uppercase">Objetivos</span>
                      <p className="font-medium">{formData.objetivos.map(o => OBJETIVOS.find(ob => ob.id === o)?.label).join(', ')}</p>
                    </div>
                  )}
                  {formData.presupuesto && (
                    <div>
                      <span className="text-xs text-gray-500 uppercase">Presupuesto</span>
                      <p className="font-medium">{formData.presupuesto}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-6 space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" className="mt-1 w-4 h-4 text-orange-500 rounded focus:ring-orange-500" required />
                  <span className="text-sm text-gray-600">
                    Acepto la <a href="/privacidad" className="text-orange-500 underline">política de privacidad</a> y consiento el tratamiento de mis datos para recibir la propuesta solicitada. *
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.newsletter}
                    onChange={(e) => updateField('newsletter', e.target.checked)}
                    className="mt-1 w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                    required
                  />
                  <span className="text-sm text-gray-600">
                    Suscribirme al newsletter de empresas para recibir novedades y ofertas. *
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Navegación */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            {paso > 1 ? (
              <button
                onClick={anterior}
                className="px-6 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Anterior
              </button>
            ) : (
              <div />
            )}
            {paso < 8 ? (
              <button
                onClick={siguiente}
                className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
              >
                Siguiente
              </button>
            ) : (
              <button
                onClick={enviarFormulario}
                disabled={enviando}
                className="px-6 py-2.5 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {enviando ? 'Enviando...' : 'Solicitar mi propuesta personalizada'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
