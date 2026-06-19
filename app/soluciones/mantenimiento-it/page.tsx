"use client";
import Link from 'next/link';
import EmpresaNav from '../../../components/EmpresaNav';
import EmpresaFooter from '../../../components/EmpresaFooter';
import ProductosSolucionDynamic from '../../../components/public/ProductosSolucionDynamic';
import { useState } from 'react';

const servicios = [
  {
    titulo: 'Soporte y Mantenimiento Preventivo',
    descripcion: 'Mantenimiento proactivo de tu infraestructura IT. Actualizaciones, parches de seguridad, revisiones periódicas y resolución de incidencias antes de que afecten a tu negocio.',
    caracteristicas: ['Actualizaciones y parches', 'Revisiones periódicas', 'Helpdesk multicanal', 'Documentación del entorno']
  },
  {
    titulo: 'Guardias IT',
    descripcion: 'Cobertura fuera de horario laboral para empresas que no paran. Tu equipo IT descansa y nosotros vigilamos: noches, fines de semana y festivos con técnicos especializados.',
    caracteristicas: ['Técnicos asignados a tu empresa', 'Acceso remoto preconfigurado (VPN)', 'Escalado presencial si es necesario', 'SLA de respuesta garantizado']
  },
  {
    titulo: 'Outsourcing IT',
    descripcion: 'Externaliza parte o todo tu departamento IT. Accede a un equipo multidisciplinar certificado por una cuota mensual predecible, sin costes de contratación.',
    caracteristicas: ['Equipo certificado Microsoft/Cisco/VMware', 'Complemento o sustitución del IT interno', 'Coste mensual fijo y predecible', 'Escalabilidad sin fricciones']
  },
  {
    titulo: 'Monitorización 24/7',
    descripcion: 'Vigilancia continua de servidores, red y servicios críticos. Detectamos y resolvemos alertas antes de que se conviertan en incidencias que paralicen tu actividad.',
    caracteristicas: ['NOC propio', 'Alertas en tiempo real', 'Resolución proactiva', 'Informes mensuales de estado']
  }
];

const casosUso = [
  { perfil: 'Farmacia / Centro médico', necesidad: 'Software de dispensación + TPV + receta electrónica', solucion: 'Bono mensual especializado + soporte remoto prioritario' },
  { perfil: 'HORECA', necesidad: 'TPV, reservas online, WiFi clientes, cocina conectada', solucion: 'Bono mensual + cobertura fin de semana' },
  { perfil: 'PYME (hasta 20 empleados)', necesidad: 'No tiene departamento IT propio', solucion: 'Outsourcing IT completo + helpdesk' },
  { perfil: 'Mediana / Gran empresa', necesidad: 'IT interno pequeño y desbordado, múltiples sedes', solucion: 'Propuesta a medida + guardias + monitorización 24/7' },
];

const serviciosInteresPYME = [
  'Soporte y mantenimiento preventivo',
  'Helpdesk para usuarios',
  'Gestión de backups y recuperación',
  'Ciberseguridad gestionada',
  'Gestión de parches y actualizaciones',
  'Monitorización de equipos',
];

const serviciosInteresGrande = [
  'Soporte y mantenimiento preventivo',
  'Guardias IT (cobertura fuera de horario)',
  'Outsourcing IT (externalización parcial o total)',
  'Monitorización 24/7',
  'Helpdesk para usuarios',
  'Gestión de backups y recuperación',
  'Ciberseguridad gestionada',
  'Gestión de parches y actualizaciones',
];

type TipoNegocio = '' | 'FARMACIA' | 'HORECA' | 'PYME' | 'MEDIANA_GRANDE';

export default function MantenimientoITPage() {
  const [formData, setFormData] = useState({
    nombre: '',
    empresa: '',
    email: '',
    telefono: '',
    tipoNegocio: '' as TipoNegocio,
    // Campos comunes
    numEquipos: '',
    coberturaHoraria: '',
    comentarios: '',
    newsletter: false,
    // Campos Farmacia/HORECA
    softwareEspecifico: [] as string[],
    produccion24h: '',
    // Campos PYME
    numServidores: '',
    serviciosInteres: [] as string[],
    backupCiberseguridad: '',
    // Campos Mediana/Grande
    numSedes: '',
    equipoITInterno: '',
    sistemasCriticos: '',
    presupuestoOrientativo: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleServicioChange = (servicio: string) => {
    setFormData(prev => ({
      ...prev,
      serviciosInteres: prev.serviciosInteres.includes(servicio)
        ? prev.serviciosInteres.filter(s => s !== servicio)
        : [...prev.serviciosInteres, servicio]
    }));
  };

  const handleSoftwareChange = (sw: string) => {
    setFormData(prev => ({
      ...prev,
      softwareEspecifico: prev.softwareEspecifico.includes(sw)
        ? prev.softwareEspecifico.filter(s => s !== sw)
        : [...prev.softwareEspecifico, sw]
    }));
  };

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
          tipoNegocio: formData.tipoNegocio,
          numEquipos: formData.numEquipos,
          coberturaHoraria: formData.coberturaHoraria,
          comentarios: formData.comentarios,
          // Campos condicionales
          ...(formData.tipoNegocio === 'FARMACIA' || formData.tipoNegocio === 'HORECA' ? {
            softwareEspecifico: formData.softwareEspecifico,
            produccion24h: formData.produccion24h,
          } : {}),
          ...(formData.tipoNegocio === 'PYME' ? {
            numServidores: formData.numServidores,
            serviciosInteres: formData.serviciosInteres,
            backupCiberseguridad: formData.backupCiberseguridad,
          } : {}),
          ...(formData.tipoNegocio === 'MEDIANA_GRANDE' ? {
            numServidores: formData.numServidores,
            numSedes: formData.numSedes,
            equipoITInterno: formData.equipoITInterno,
            sistemasCriticos: formData.sistemasCriticos,
            presupuestoOrientativo: formData.presupuestoOrientativo,
            serviciosInteres: formData.serviciosInteres,
          } : {}),
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

  const tipoNegocioOptions = [
    { value: 'FARMACIA', label: 'Farmacia / Centro médico', icon: '🏥', desc: 'Software de dispensación, receta electrónica, TPV farmacia' },
    { value: 'HORECA', label: 'HORECA (hostelería, restauración)', icon: '🍽️', desc: 'TPV, reservas, WiFi clientes, cocina conectada' },
    { value: 'PYME', label: 'PYME (hasta 20 empleados)', icon: '💼', desc: 'Oficina, comercio, taller, despacho profesional' },
    { value: 'MEDIANA_GRANDE', label: 'Mediana / Gran empresa (+20 empleados)', icon: '🏢', desc: 'Múltiples sedes, equipo IT interno, sistemas complejos' },
  ];

  const softwareFarmacia = [
    'Software de dispensación (Nixfarma, Farmatic, Unycop...)',
    'Receta electrónica',
    'TPV / cobro',
    'Gestión de stock',
    'Robot de farmacia',
    'Cámaras de seguridad',
  ];

  const softwareHORECA = [
    'TPV (Revo, Glop, ICG, Agora...)',
    'Sistema de reservas online',
    'WiFi para clientes',
    'Pantallas de cocina / KDS',
    'Control de accesos / fichaje',
    'Cámaras de seguridad',
  ];

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
            <div className="inline-block bg-orange-100 text-orange-700 px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold mb-4 sm:mb-6">Servicios IT Gestionados</div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-gray-900 mb-4 sm:mb-6">Mantenimiento IT</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 mb-6 sm:mb-8 px-2">Soporte preventivo, guardias fuera de horario, outsourcing IT y monitorización 24/7. Tu infraestructura siempre operativa con SLA garantizado.</p>
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
            {[{valor:'99.9%',label:'Uptime',desc:'Garantizado por SLA'},{valor:'<1h',label:'Respuesta',desc:'Incidencias críticas'},{valor:'24/7',label:'Monitorización',desc:'NOC propio'},{valor:'365',label:'Días/año',desc:'Cobertura de guardias'}].map((b,i)=>(
              <div key={i} className="text-center"><div className="text-3xl sm:text-4xl font-bold text-orange-600 mb-1 sm:mb-2">{b.valor}</div><div className="font-semibold text-gray-900 mb-1">{b.label}</div><div className="text-xs sm:text-sm text-gray-500">{b.desc}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* Servicios */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Nuestros Servicios IT Gestionados</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Cuatro pilares para mantener tu empresa operativa sin preocupaciones. Combínalos según tus necesidades.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 max-w-5xl mx-auto">
            {servicios.map((s,i)=>(
              <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-6 sm:p-8 hover:border-orange-500 hover:shadow-lg transition-all">
                <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 sm:mb-4">{s.titulo}</h3>
                <p className="text-sm sm:text-base text-gray-600 mb-4">{s.descripcion}</p>
                <ul className="space-y-2">
                  {s.caracteristicas.map((c,j)=>(
                    <li key={j} className="flex items-center gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Casos de uso por tipo de negocio */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gradient-to-br from-orange-50 via-white to-orange-50">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-4xl mx-auto text-center mb-10 sm:mb-12 lg:mb-16">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-3 sm:mb-4 px-2">Soluciones adaptadas a tu sector</h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 px-2">Cada negocio tiene necesidades IT diferentes. Identificamos tu perfil y te proponemos el plan ideal.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-5xl mx-auto">
            {casosUso.map((c,i)=>(
              <div key={i} className="bg-white rounded-xl p-5 sm:p-6 border border-gray-200 shadow-sm hover:shadow-md transition-all">
                <div className="text-2xl mb-3">{['🏥','🍽️','💼','🏢'][i]}</div>
                <h4 className="font-bold text-gray-900 mb-2">{c.perfil}</h4>
                <p className="text-sm text-gray-500 mb-3">{c.necesidad}</p>
                <p className="text-sm font-semibold text-orange-600">{c.solucion}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bloque Guardias IT destacado */}
      <section className="py-12 sm:py-16 lg:py-20 bg-gray-900">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <div className="inline-block bg-orange-500/20 text-orange-400 px-4 py-2 rounded-full text-sm font-semibold mb-6 border border-orange-500/30">
                  Servicio destacado
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4">Guardias IT: tu equipo descansa, nosotros vigilamos</h2>
                <p className="text-gray-400 mb-6">Empresas que producen 24 horas necesitan soporte IT fuera del horario laboral. Externalizamos las guardias nocturnas y de fin de semana para que tu equipo IT pueda desconectar.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <p className="text-gray-300"><strong className="text-white">Técnicos asignados</strong> que conocen tu infraestructura, no un call center genérico</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <p className="text-gray-300"><strong className="text-white">Acceso remoto preconfigurado</strong> para intervención inmediata vía VPN</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <p className="text-gray-300"><strong className="text-white">Escalado presencial</strong> si la incidencia no se resuelve en remoto</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    <p className="text-gray-300"><strong className="text-white">SLA garantizado</strong> con tiempos de respuesta comprometidos por contrato</p>
                  </div>
                </div>
              </div>
              <div className="bg-gray-800 rounded-2xl p-6 sm:p-8 border border-gray-700">
                <h3 className="text-xl font-bold text-white mb-4">Caso real</h3>
                <p className="text-gray-400 mb-4">Empresa de fabricación de piezas de automoción con producción 24h. Su equipo IT se turnaba para cubrir incidencias nocturnas, generando agotamiento y rotación.</p>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-orange-500 font-bold text-lg">Antes:</span>
                    <span className="text-gray-300 text-sm">Equipo IT interno haciendo guardias por turnos, sin descanso real</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-orange-500 font-bold text-lg">Ahora:</span>
                    <span className="text-gray-300 text-sm">Guardias externalizadas con nosotros. Su equipo descansa y la producción no se detiene</span>
                  </div>
                </div>
                <div className="mt-6 pt-6 border-t border-gray-700">
                  <p className="text-gray-500 text-sm italic">&ldquo;Desde que externalizamos las guardias nocturnas, nuestro equipo IT rinde mucho mejor durante el día y hemos reducido la rotación a cero.&rdquo;</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bloque Outsourcing IT */}
      <section className="py-12 sm:py-16 lg:py-20 bg-white">
        <div className="container mx-auto px-4 sm:px-6">
          <div className="max-w-5xl mx-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div className="order-2 lg:order-1 bg-orange-50 rounded-2xl p-6 sm:p-8 border border-orange-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">¿Qué puedes externalizar?</h3>
                <div className="space-y-3">
                  {[
                    { area: 'Helpdesk completo', desc: 'Atención a usuarios L1/L2' },
                    { area: 'Administración de sistemas', desc: 'Servidores, AD, backups' },
                    { area: 'Gestión de red', desc: 'Switches, WiFi, firewall' },
                    { area: 'Seguridad IT', desc: 'Antivirus, parches, auditorías' },
                    { area: 'Proyectos puntuales', desc: 'Migraciones, despliegues, nuevas sedes' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3 bg-white rounded-lg p-3 border border-orange-100">
                      <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                      <div>
                        <p className="font-semibold text-gray-900 text-sm">{item.area}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="order-1 lg:order-2">
                <div className="inline-block bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold mb-6">
                  Outsourcing IT
                </div>
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4">Externaliza tu departamento IT, total o parcialmente</h2>
                <p className="text-gray-600 mb-6">No necesitas un equipo IT completo en plantilla. Accede a técnicos certificados en múltiples áreas por un coste mensual fijo. Complementa tu equipo actual o déjanos gestionar toda tu IT.</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">-40%</div>
                    <div className="text-xs text-gray-500 mt-1">Coste vs equipo interno equivalente</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">0</div>
                    <div className="text-xs text-gray-500 mt-1">Costes de contratación y formación</div>
                  </div>
                </div>
              </div>
            </div>
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
                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-6">Solicita tu propuesta de servicios IT</h2>
                <p className="text-gray-400 mb-8">Analizamos tu situación actual y te proponemos la combinación de servicios ideal según tu tipo de negocio.</p>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Propuesta adaptada a tu sector</p><p className="text-gray-400 text-sm">Farmacias, HORECA, PYMES o grandes empresas: cada una con su plan</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Presupuesto en 24h</p><p className="text-gray-400 text-sm">Para PYMES y comercios, oferta automática con precio cerrado</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">SLA con tiempos de respuesta garantizados</p><p className="text-gray-400 text-sm">Penalizaciones si no cumplimos los plazos</p></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-1" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    <div><p className="text-white font-semibold">Equipo técnico certificado</p><p className="text-gray-400 text-sm">Microsoft, Cisco, VMware, Fortinet y más</p></div>
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
                    <p className="text-gray-600">
                      {formData.tipoNegocio === 'MEDIANA_GRANDE' 
                        ? 'Nuestro equipo técnico te contactará en menos de 24h para agendar una reunión y preparar tu propuesta a medida.'
                        : 'Te hemos enviado un email de confirmación. Recibirás tu propuesta con precios cerrados en menos de 24h.'}
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    {/* PASO 1: Tipo de negocio */}
                    <h3 className="text-xl font-bold text-gray-900 mb-2">¿Qué tipo de negocio tienes?</h3>
                    <p className="text-sm text-gray-500 mb-4">Selecciona tu sector para mostrarte las preguntas relevantes</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      {tipoNegocioOptions.map((opt) => (
                        <label
                          key={opt.value}
                          className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            formData.tipoNegocio === opt.value
                              ? 'border-orange-500 bg-orange-50 shadow-sm'
                              : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'
                          }`}
                        >
                          <input
                            type="radio"
                            name="tipoNegocio"
                            value={opt.value}
                            checked={formData.tipoNegocio === opt.value}
                            onChange={(e) => setFormData({...formData, tipoNegocio: e.target.value as TipoNegocio})}
                            className="mt-1 text-orange-600 focus:ring-orange-500"
                            required
                          />
                          <div>
                            <span className="text-lg mr-1">{opt.icon}</span>
                            <span className="font-semibold text-gray-900 text-sm">{opt.label}</span>
                            <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                          </div>
                        </label>
                      ))}
                    </div>

                    {/* Mostrar el resto del formulario solo cuando se selecciona tipo */}
                    {formData.tipoNegocio && (
                      <>
                        <hr className="my-6 border-gray-200" />
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

                        {/* Campo común: Nº equipos */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nº de equipos/PCs *</label>
                            <select required value={formData.numEquipos} onChange={e => setFormData({...formData, numEquipos: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                              <option value="">Seleccionar...</option>
                              {(formData.tipoNegocio === 'FARMACIA' || formData.tipoNegocio === 'HORECA') ? (
                                <>
                                  <option value="1-3 equipos">1-3 equipos</option>
                                  <option value="4-6 equipos">4-6 equipos</option>
                                  <option value="7-10 equipos">7-10 equipos</option>
                                  <option value="11-15 equipos">11-15 equipos</option>
                                  <option value="+15 equipos">+15 equipos</option>
                                </>
                              ) : formData.tipoNegocio === 'PYME' ? (
                                <>
                                  <option value="1-5 equipos">1-5 equipos</option>
                                  <option value="6-10 equipos">6-10 equipos</option>
                                  <option value="11-15 equipos">11-15 equipos</option>
                                  <option value="16-20 equipos">16-20 equipos</option>
                                </>
                              ) : (
                                <>
                                  <option value="20-50 equipos">20-50 equipos</option>
                                  <option value="51-100 equipos">51-100 equipos</option>
                                  <option value="101-250 equipos">101-250 equipos</option>
                                  <option value="+250 equipos">+250 equipos</option>
                                </>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cobertura horaria necesaria</label>
                            <select value={formData.coberturaHoraria} onChange={e => setFormData({...formData, coberturaHoraria: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                              <option value="">Seleccionar...</option>
                              <option value="8x5 (L-V horario oficina)">8x5 (L-V horario oficina)</option>
                              {(formData.tipoNegocio === 'HORECA') && (
                                <option value="Fines de semana incluidos">Fines de semana incluidos</option>
                              )}
                              <option value="12x7 (horario extendido)">12x7 (horario extendido)</option>
                              <option value="24x7 (cobertura total)">24x7 (cobertura total)</option>
                              {formData.tipoNegocio === 'MEDIANA_GRANDE' && (
                                <option value="Solo guardias fuera de horario">Solo guardias fuera de horario</option>
                              )}
                            </select>
                          </div>
                        </div>

                        {/* ===== CAMPOS FARMACIA ===== */}
                        {formData.tipoNegocio === 'FARMACIA' && (
                          <>
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Software específico que utilizas</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {softwareFarmacia.map((sw, i) => (
                                  <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-orange-50 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={formData.softwareEspecifico.includes(sw)}
                                      onChange={() => handleSoftwareChange(sw)}
                                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm text-gray-700">{sw}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {/* ===== CAMPOS HORECA ===== */}
                        {formData.tipoNegocio === 'HORECA' && (
                          <>
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Software y sistemas que utilizas</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {softwareHORECA.map((sw, i) => (
                                  <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-orange-50 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={formData.softwareEspecifico.includes(sw)}
                                      onChange={() => handleSoftwareChange(sw)}
                                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm text-gray-700">{sw}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-1">¿Producción/servicio continuo?</label>
                              <select value={formData.produccion24h} onChange={e => setFormData({...formData, produccion24h: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                <option value="">Seleccionar...</option>
                                <option value="Sí, servicio continuo (hotel 24h)">Sí, servicio continuo (hotel 24h)</option>
                                <option value="Horario partido (mediodía + noche)">Horario partido (mediodía + noche)</option>
                                <option value="Solo mediodía o solo noche">Solo mediodía o solo noche</option>
                                <option value="Horario comercial estándar">Horario comercial estándar</option>
                              </select>
                            </div>
                          </>
                        )}

                        {/* ===== CAMPOS PYME ===== */}
                        {formData.tipoNegocio === 'PYME' && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nº de servidores</label>
                                <select value={formData.numServidores} onChange={e => setFormData({...formData, numServidores: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                  <option value="">Seleccionar...</option>
                                  <option value="Ninguno">Ninguno</option>
                                  <option value="1 servidor">1 servidor</option>
                                  <option value="2-3 servidores">2-3 servidores</option>
                                  <option value="+3 servidores">+3 servidores</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Backup y ciberseguridad</label>
                                <select value={formData.backupCiberseguridad} onChange={e => setFormData({...formData, backupCiberseguridad: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                  <option value="">Seleccionar...</option>
                                  <option value="No tengo nada implementado">No tengo nada implementado</option>
                                  <option value="Tengo backup pero no estoy seguro de que funcione">Tengo backup pero no estoy seguro</option>
                                  <option value="Tengo backup y antivirus básico">Tengo backup y antivirus básico</option>
                                  <option value="Tengo solución profesional">Tengo solución profesional</option>
                                </select>
                              </div>
                            </div>
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Servicios de interés</label>
                              <p className="text-xs text-gray-500 mb-3">Selecciona los que te interesen (puedes marcar varios)</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {serviciosInteresPYME.map((s, i) => (
                                  <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-orange-50 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={formData.serviciosInteres.includes(s)}
                                      onChange={() => handleServicioChange(s)}
                                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm text-gray-700">{s}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {/* ===== CAMPOS MEDIANA/GRANDE ===== */}
                        {formData.tipoNegocio === 'MEDIANA_GRANDE' && (
                          <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nº de servidores</label>
                                <select value={formData.numServidores} onChange={e => setFormData({...formData, numServidores: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                  <option value="">Seleccionar...</option>
                                  <option value="1-2 servidores">1-2 servidores</option>
                                  <option value="3-5 servidores">3-5 servidores</option>
                                  <option value="6-10 servidores">6-10 servidores</option>
                                  <option value="+10 servidores">+10 servidores</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nº de sedes/oficinas</label>
                                <select value={formData.numSedes} onChange={e => setFormData({...formData, numSedes: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                  <option value="">Seleccionar...</option>
                                  <option value="1 sede">1 sede</option>
                                  <option value="2-3 sedes">2-3 sedes</option>
                                  <option value="4-5 sedes">4-5 sedes</option>
                                  <option value="+5 sedes">+5 sedes</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">¿Tenéis equipo IT interno?</label>
                                <select value={formData.equipoITInterno} onChange={e => setFormData({...formData, equipoITInterno: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                  <option value="">Seleccionar...</option>
                                  <option value="Sí, quiero complementarlo">Sí, quiero complementarlo</option>
                                  <option value="Sí, pero está desbordado">Sí, pero está desbordado</option>
                                  <option value="No, necesito cobertura completa">No, necesito cobertura completa</option>
                                  <option value="Tenemos proveedor pero queremos cambiar">Tenemos proveedor pero queremos cambiar</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Sistemas críticos</label>
                                <select value={formData.sistemasCriticos} onChange={e => setFormData({...formData, sistemasCriticos: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                  <option value="">Seleccionar...</option>
                                  <option value="ERP / software de gestión">ERP / software de gestión</option>
                                  <option value="Correo y Microsoft 365">Correo y Microsoft 365</option>
                                  <option value="Servidor de ficheros">Servidor de ficheros</option>
                                  <option value="Web / ecommerce">Web / ecommerce</option>
                                  <option value="SCADA / sistemas industriales (OT)">SCADA / sistemas industriales (OT)</option>
                                  <option value="Varios de los anteriores">Varios de los anteriores</option>
                                </select>
                              </div>
                            </div>
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-1">Presupuesto orientativo mensual</label>
                              <select value={formData.presupuestoOrientativo} onChange={e => setFormData({...formData, presupuestoOrientativo: e.target.value})} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900">
                                <option value="">Seleccionar...</option>
                                <option value="500-1.000 €/mes">500-1.000 €/mes</option>
                                <option value="1.000-2.500 €/mes">1.000-2.500 €/mes</option>
                                <option value="2.500-5.000 €/mes">2.500-5.000 €/mes</option>
                                <option value="+5.000 €/mes">+5.000 €/mes</option>
                                <option value="No tengo referencia">No tengo referencia</option>
                              </select>
                            </div>
                            <div className="mb-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">Servicios de interés</label>
                              <p className="text-xs text-gray-500 mb-3">Selecciona los que te interesen (puedes marcar varios)</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {serviciosInteresGrande.map((s, i) => (
                                  <label key={i} className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-orange-50 transition-colors">
                                    <input
                                      type="checkbox"
                                      checked={formData.serviciosInteres.includes(s)}
                                      onChange={() => handleServicioChange(s)}
                                      className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
                                    />
                                    <span className="text-sm text-gray-700">{s}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Comentarios (todos) */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Comentarios adicionales</label>
                          <textarea value={formData.comentarios} onChange={e => setFormData({...formData, comentarios: e.target.value})} rows={3} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-gray-900" placeholder={
                            formData.tipoNegocio === 'FARMACIA' ? 'Cuéntanos tus principales problemas IT: caídas del software, lentitud, problemas con la receta electrónica...' :
                            formData.tipoNegocio === 'HORECA' ? 'Cuéntanos tus principales problemas IT: TPV que falla, WiFi inestable, problemas con reservas...' :
                            formData.tipoNegocio === 'PYME' ? 'Cuéntanos tus principales problemas o necesidades IT...' :
                            'Describe brevemente tu infraestructura actual y qué problemas quieres resolver...'
                          } />
                        </div>

                        {/* Newsletter + Submit */}
                        <div className="mb-6">
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" required checked={formData.newsletter} onChange={e => setFormData({...formData, newsletter: e.target.checked})} className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500 mt-0.5" />
                            <span className="text-xs text-gray-600">Acepto recibir la propuesta de servicios IT y suscribirme al newsletter de Internet Operadores con novedades y consejos para empresas. Puedo darme de baja en cualquier momento.</span>
                          </label>
                        </div>

                        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                        <button type="submit" disabled={isSubmitting} className="w-full px-6 py-3.5 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed">
                          {isSubmitting ? 'Enviando...' : (
                            formData.tipoNegocio === 'MEDIANA_GRANDE' 
                              ? 'Solicitar Propuesta a Medida'
                              : 'Solicitar Presupuesto'
                          )}
                        </button>
                        <p className="text-center text-xs text-gray-500 mt-3">
                          {formData.tipoNegocio === 'MEDIANA_GRANDE'
                            ? 'Sin compromiso. Te contactaremos para agendar una reunión.'
                            : 'Sin compromiso. Recibirás tu presupuesto en menos de 24h.'}
                        </p>
                      </>
                    )}
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
