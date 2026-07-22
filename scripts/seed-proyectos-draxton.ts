const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// IDs
const CONTRATO_EXT_OPERACIONES = 'e8f10f14-e196-4725-9986-b9fb0eac8c71'; // Extenalización Operaciones + Government (2400h)
const JESUS_PARRA = '4917dff3-cc09-42da-b060-10b450230f5e';
const ALEJANDRO_MARTINEZ = '633e8841-a8d7-429f-a925-1bde822da559';

const proyectos = [
  // === PROYECTOS ACTIVOS DE JESÚS PARRA ===
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Infraestructura Servidor Oficial (PolyWorks DataLoop)',
    descripcion: 'Definición e instalación de la infraestructura y máquina oficializada para la gestión de datos en planta. La máquina ya se encuentra oficializada y la infraestructura definida.',
    categoria: 'proyecto',
    estado: 'planificado',
    impacto: 'Kick Off programado para el 1 de septiembre. Gestión centralizada de datos de metrología en planta.',
    prioridad: 'alta',
    orden: 1,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Adecuación Normativa y Certificación TISAX',
    descripcion: 'Atender y cumplir los requerimientos de seguridad de la información solicitados para la planta. Incluye: cambios de SO Windows 10→11, normalización inventario activos, custodia llaves, actas de borrado seguro, códigos PIN en impresoras.',
    categoria: 'proyecto',
    estado: 'en_curso',
    impacto: 'Cumplimiento estricto del estándar TISAX exigido por la industria automovilística para la planta de Lleida.',
    prioridad: 'alta',
    orden: 2,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Automatización Pantalla Asignación Producción por Turnos',
    descripcion: 'Solución visual automatizada que muestra la asignación de máquinas por turno. Pantalla activa 15 min antes/después del turno, conmutación automática a presentación RRHH fuera de ventana. Responsabilidad TI: arquitectura, red, automatización horarios, blindaje ante cortes eléctricos.',
    categoria: 'proyecto',
    estado: 'en_curso',
    impacto: 'Elimina consulta presencial de 20-30 operarios al Team Leader por turno. Reducción de tiempo muerto en incorporación a líneas. Desarrollo PowerApps a cargo de Fran.',
    prioridad: 'media',
    orden: 3,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Despliegue Infraestructura Big Data en Lleida',
    descripcion: 'Soporte y adecuación técnica para nueva infraestructura Big Data en planta. Elaboración de documento técnico detallado: información de cada sensor, PLC y elemento conectado, con tipo de dato, permisos de acceso y configuraciones de red.',
    categoria: 'proyecto',
    estado: 'en_curso',
    impacto: 'Habilitación de la capa de datos industriales para analítica avanzada y toma de decisiones en tiempo real.',
    prioridad: 'alta',
    orden: 4,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Implementación Global de OEE en Planta',
    descripcion: 'Desarrollo integral del sistema de Eficiencia General de los Equipos (OEE) para todas las máquinas de producción. Solicitud prioritaria desde Codir. Colaboración con Gerardo Morales en desarrollo e integración de sistemas de captura y análisis.',
    categoria: 'proyecto',
    estado: 'en_curso',
    impacto: 'Visibilidad completa de la eficiencia productiva de toda la planta. Proyecto prioritario de dirección.',
    prioridad: 'alta',
    orden: 5,
  },

  // === MEJORAS EJECUTADAS DE JESÚS PARRA ===
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Reingeniería Sistema Monitorización de Células',
    descripcion: 'Transición del sistema inestable basado en 5 sesiones VNC concurrentes con scripts de rotación propensos a fallar, hacia ecosistema de streaming NDI centralizado en OBS Studio.',
    categoria: 'mejora_ejecutada',
    estado: 'completado',
    impacto: 'Eliminación del mantenimiento diario. Estabilidad absoluta frente a microcortes: si una célula pierde conexión, la rotación continúa y la señal regresa automáticamente.',
    prioridad: 'alta',
    orden: 1,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Centralización Copias de Seguridad (Veeam VBR)',
    descripcion: 'Migración de Veeam Agent individual por máquina a arquitectura centralizada con Veeam Backup & Replication mediante licencias comunitarias gratuitas (coste cero).',
    categoria: 'mejora_ejecutada',
    estado: 'completado',
    impacto: 'Consola única de diagnóstico. Recuperación granular en minutos (de 2h a instantes). Reporte automatizado de ~30 máquinas. Eliminación de revisiones manuales semanales.',
    prioridad: 'alta',
    orden: 2,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Estabilización Flujos Datos Industriales (Node-RED + PM2)',
    descripcion: 'Implementación de Watchdog VBScript + PM2 para flujos Node-RED en célula de producción crítica. Anteriormente, el CMD invisible no se recuperaba automáticamente ante caídas.',
    categoria: 'mejora_ejecutada',
    estado: 'completado',
    impacto: 'Monitorización permanente, limitaciones de memoria y recuperación inmediata automática ante caídas de línea.',
    prioridad: 'media',
    orden: 3,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Fabricación Interna Componentes de Alimentación',
    descripcion: 'Montaje DIY de alimentadores 12V 5A con conectores Phoenix 3 pines y tubo termorretráctil. Coste proveedor: 46€/ud vs coste interno: 8,44€/ud.',
    categoria: 'mejora_ejecutada',
    estado: 'en_curso',
    impacto: 'Ahorro neto del 81,65% por unidad. Amortización desde la primera unidad fabricada.',
    ahorroEstimado: 37.56, // ahorro por unidad
    prioridad: 'media',
    orden: 4,
  },

  // === PROPUESTAS FUTURAS DE JESÚS PARRA ===
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Reducción Parque Impresión Industrial (Zebra)',
    descripcion: 'Reducción del ratio 1 impresora/terminal (60 terminales) a 1 impresora KLT + 1 de Producción por área. Cada Zebra cuesta 450-480€. Propuesta presentada y aprobada por Pedro y Guillermo. Gestión directa de garantías con Zebra (ahorro >1.200€ en placas dañadas). Monitorización SNMP implementada.',
    categoria: 'propuesta_futura',
    estado: 'planificado',
    impacto: 'Reducción drástica de roturas por manipulación y gasto en impresoras. Ahorro >1.200€ ya conseguido en garantías.',
    ahorroEstimado: 1200,
    prioridad: 'alta',
    orden: 1,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Automatización Eléctrica Infraestructura (Eaton)',
    descripcion: 'Despliegue de máquina virtual Eaton para automatización de apagado ordenado de servidores y envío de avisos preventivos ante baja energía o cortes prolongados.',
    categoria: 'propuesta_futura',
    estado: 'planificado',
    impacto: 'Protección automática de servidores ante cortes eléctricos. Eliminación de intervención manual en emergencias.',
    prioridad: 'media',
    orden: 2,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Wake-on-LAN (WOL) en Terminales de Planta',
    descripcion: 'Configuración WOL en la totalidad de terminales de planta para encendido remoto masivo.',
    categoria: 'propuesta_futura',
    estado: 'planificado',
    impacto: 'Ahorro masivo de tiempo ante cortes eléctricos o mantenimiento masivo. Elimina desplazamiento físico terminal por terminal.',
    prioridad: 'media',
    orden: 3,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: JESUS_PARRA,
    titulo: 'Asistentes IA para Gestión TI (Sujeto a licencias corporativas)',
    descripcion: 'Tres agentes propuestos: 1) Gestión Interna TI (SharePoint, inventarios, pedidos). 2) Autogestión Usuarios Planta (datastore de fallos, tickets automáticos, guardia técnica). 3) Analítico ITSM (SQL + consola ITSM, KPIs en lenguaje natural). Se ha logrado despertar interés de México para acceso SQL global del ITSM (hito sin precedentes según Sergi Tallon).',
    categoria: 'propuesta_futura',
    estado: 'planificado',
    impacto: 'Ventaja estratégica sin precedentes para analítica de planta. Acceso SQL global del ITSM nunca conseguido antes en Europa/Asia.',
    prioridad: 'alta',
    orden: 4,
  },

  // === PROYECTOS DE ALEJANDRO MARTÍNEZ ===
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: ALEJANDRO_MARTINEZ,
    titulo: 'Data Acquisition (Recopilación de Datos)',
    descripcion: 'Implicación directa en la recopilación de datos industriales. Perseguir al personal interesado en la recopilación. Dificultad por falta de colaboración del personal de Draxton.',
    categoria: 'proyecto',
    estado: 'en_curso',
    impacto: 'Alimentación de la infraestructura Big Data con datos reales de planta Barcelona.',
    prioridad: 'alta',
    orden: 6,
  },
  {
    contratoDraxtonId: CONTRATO_EXT_OPERACIONES,
    responsableId: ALEJANDRO_MARTINEZ,
    titulo: 'Regularización de Hostnames',
    descripcion: 'Regularizar todos los hostnames de la fábrica BCN en la medida de lo posible. Limitación: por necesidades de producción hay equipos que no se pueden tocar hasta la parada programada.',
    categoria: 'proyecto',
    estado: 'en_curso',
    impacto: 'Normalización del inventario de red. Mejora de la trazabilidad y gestión de activos en planta Barcelona.',
    prioridad: 'media',
    orden: 7,
  },
];

async function main() {
  console.log('Insertando proyectos...');
  for (const p of proyectos) {
    await prisma.proyectoContratoDraxton.create({ data: p });
    console.log(`  ✓ ${p.titulo}`);
  }
  console.log(`\nTotal: ${proyectos.length} proyectos insertados.`);
}

main()
  .then(() => process.exit(0))
  .catch(e => { console.error(e); process.exit(1); });
