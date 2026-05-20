import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Preguntas por sector para el cuestionario técnico privado
const PREGUNTAS_TECNICAS: Record<string, { bloque: string; preguntas: string[] }[]> = {
  construccion: [
    {
      bloque: 'Software de Gestión Interna',
      preguntas: [
        '¿Qué software principal utilizan actualmente para la gestión de la empresa? (SAP, Navision, Holded, BrickControl, Sigrid, Presto, desarrollo a medida, Excel...)',
        '¿Este software dispone de API abierta o webhooks para conectarse con herramientas externas?',
        '¿Cómo gestionan actualmente la entrada de un nuevo cliente potencial (lead)?',
        'Para el control de obras y liquidez: ¿El software actual les permite vincular las certificaciones de obra con el calendario de ejecución real?',
        '¿Utilizan alguna herramienta específica para la elaboración de presupuestos y mediciones? (Presto, Arquímedes, TCQ, Excel avanzado)',
        '¿Cuántas personas del equipo utilizan el software de gestión y con qué frecuencia?',
      ],
    },
    {
      bloque: 'Proceso Comercial y Cualificación de Leads',
      preguntas: [
        '¿Cuáles son las 3 preguntas clave que hace su equipo comercial cuando recibe una llamada para saber si un proyecto es viable?',
        '¿Qué información mínima e imprescindible necesitan para hacer una primera valoración de un proyecto?',
        '¿Desean que la web filtre automáticamente a los usuarios que indiquen presupuestos inferiores a un umbral mínimo?',
        '¿Tienen identificados los diferentes tipos de cliente ideal (buyer personas)?',
        '¿Cuántos contactos/solicitudes reciben actualmente al mes a través de la web? ¿Y cuántos acaban siendo proyectos reales?',
      ],
    },
    {
      bloque: 'Contenidos y Portfolio',
      preguntas: [
        '¿Disponen de un archivo fotográfico profesional de las obras ejecutadas en los últimos años?',
        '¿Tienen documentados los datos clave de sus proyectos de éxito (presupuesto, plazo, superficie, tipo)?',
        '¿Cuentan con testimonios reales o cartas de recomendación de clientes B2B?',
        '¿Necesitarán que nuestro equipo de redacción elabore los textos corporativos desde cero, o disponen de material actualizado?',
      ],
    },
    {
      bloque: 'Área Privada de Cliente y Transparencia',
      preguntas: [
        '¿Estarían interesados en que la nueva web incluya un "Área Privada de Cliente"?',
        'En caso afirmativo, ¿qué información les gustaría mostrar al cliente? (avance de obra, facturas, documentación, planning)',
        '¿Su equipo de obra a pie de campo utiliza tablets o móviles para reportar el avance?',
        '¿Cuántas obras tienen en ejecución simultáneamente de media?',
      ],
    },
    {
      bloque: 'Expectativas y Contexto del Proyecto',
      preguntas: [
        '¿Tienen alguna fecha límite o hito corporativo para el lanzamiento de la nueva web?',
        '¿Quiénes serán los interlocutores principales por parte de la empresa para la toma de decisiones?',
        '¿Tienen un presupuesto orientativo asignado para este proyecto de transformación digital?',
        '¿Hay algún aspecto adicional que consideren importante y que no hayamos cubierto?',
      ],
    },
  ],
  seguros: [
    {
      bloque: 'Software y Gestión de Pólizas',
      preguntas: [
        '¿Qué software de gestión de pólizas utilizan? (Segur, Avant2, desarrollo propio...)',
        '¿El software dispone de API para conectar con la web?',
        '¿Cómo gestionan actualmente los leads que llegan por la web?',
        '¿Necesitan cotizador online integrado con las aseguradoras?',
      ],
    },
    {
      bloque: 'Proceso Comercial',
      preguntas: [
        '¿Cuáles son los ramos principales que trabajan?',
        '¿Trabajan con cliente particular, empresa o ambos?',
        '¿Cuántos contactos reciben al mes por la web? ¿Cuántos convierten?',
        '¿Necesitan segmentar la web por tipo de seguro o por tipo de cliente?',
      ],
    },
    {
      bloque: 'Contenidos y Marca',
      preguntas: [
        '¿Disponen de material corporativo actualizado (fotos equipo, oficina, etc.)?',
        '¿Publican contenido regularmente (blog, noticias del sector)?',
        '¿Necesitan la web en varios idiomas?',
        '¿Tienen testimonios de clientes que podamos incluir?',
      ],
    },
    {
      bloque: 'Funcionalidades Específicas',
      preguntas: [
        '¿Necesitan área privada para clientes (consulta de pólizas, siniestros)?',
        '¿Necesitan landing pages para campañas específicas por ramo?',
        '¿Quieren integrar chat o WhatsApp Business?',
      ],
    },
    {
      bloque: 'Expectativas del Proyecto',
      preguntas: [
        '¿Tienen fecha límite para el lanzamiento?',
        '¿Quiénes serán los interlocutores principales?',
        '¿Tienen presupuesto orientativo asignado?',
        '¿Hay algún aspecto adicional importante?',
      ],
    },
  ],
  hosteleria: [
    {
      bloque: 'Software y Gestión',
      preguntas: [
        '¿Qué TPV o software de gestión utilizan? (Revo, Agora, Last, Mapal...)',
        '¿El software dispone de API para conectar con la web?',
        '¿Utilizan alguna plataforma de reservas? (TheFork, CoverManager, propio...)',
        '¿Trabajan con plataformas de delivery? ¿Cuáles?',
      ],
    },
    {
      bloque: 'Necesidades Web',
      preguntas: [
        '¿Cuántos establecimientos tienen?',
        '¿Necesitan carta/menú digital actualizable?',
        '¿Necesitan sistema de reservas online integrado?',
        '¿Organizan eventos o catering que necesiten formulario específico?',
        '¿Necesitan tienda online (venta de productos, bonos regalo, etc.)?',
      ],
    },
    {
      bloque: 'Contenidos',
      preguntas: [
        '¿Disponen de fotografía profesional del local y platos?',
        '¿Tienen presencia activa en redes sociales? ¿Cuáles?',
        '¿Necesitan blog o sección de noticias/eventos?',
      ],
    },
    {
      bloque: 'Expectativas del Proyecto',
      preguntas: [
        '¿Tienen fecha límite para el lanzamiento?',
        '¿Quiénes serán los interlocutores principales?',
        '¿Tienen presupuesto orientativo asignado?',
        '¿Hay algún aspecto adicional importante?',
      ],
    },
  ],
  despachos: [
    {
      bloque: 'Software y Gestión',
      preguntas: [
        '¿Qué software de gestión de expedientes/casos utilizan?',
        '¿El software dispone de API para conectar con la web?',
        '¿Cómo gestionan actualmente la captación de nuevos clientes?',
      ],
    },
    {
      bloque: 'Necesidades Web',
      preguntas: [
        '¿Qué áreas de práctica/especialidades quieren destacar?',
        '¿Necesitan área privada para compartir documentos con clientes?',
        '¿Necesitan sistema de citas online?',
        '¿Publican contenido jurídico/técnico regularmente?',
        '¿Necesitan cumplir alguna normativa específica en la web?',
      ],
    },
    {
      bloque: 'Contenidos',
      preguntas: [
        '¿Disponen de fotografía profesional del equipo y oficina?',
        '¿Tienen casos de éxito documentados que puedan publicarse?',
        '¿Necesitan la web en varios idiomas?',
      ],
    },
    {
      bloque: 'Expectativas del Proyecto',
      preguntas: [
        '¿Tienen fecha límite para el lanzamiento?',
        '¿Quiénes serán los interlocutores principales?',
        '¿Tienen presupuesto orientativo asignado?',
        '¿Hay algún aspecto adicional importante?',
      ],
    },
  ],
  comercio: [
    {
      bloque: 'Software y Gestión',
      preguntas: [
        '¿Qué ERP o software de gestión de stock utilizan?',
        '¿El software dispone de API para sincronizar productos/stock con la web?',
        '¿Qué plataforma e-commerce usan actualmente? (WooCommerce, Prestashop, Shopify...)',
        '¿Cuántas referencias/productos manejan?',
      ],
    },
    {
      bloque: 'Necesidades E-commerce',
      preguntas: [
        '¿Venden a nivel nacional, internacional o ambos?',
        '¿Necesitan precios diferentes por tipo de cliente (B2B vs B2C)?',
        '¿Qué pasarelas de pago necesitan? (Redsys, Stripe, PayPal...)',
        '¿Necesitan integración con marketplaces (Amazon, eBay)?',
        '¿Necesitan gestión de envíos integrada? ¿Con qué transportistas?',
      ],
    },
    {
      bloque: 'Contenidos',
      preguntas: [
        '¿Disponen de fotografía profesional de productos?',
        '¿Tienen las fichas de producto completas (descripciones, especificaciones)?',
        '¿Necesitan blog o sección de contenidos?',
      ],
    },
    {
      bloque: 'Expectativas del Proyecto',
      preguntas: [
        '¿Tienen fecha límite para el lanzamiento?',
        '¿Quiénes serán los interlocutores principales?',
        '¿Tienen presupuesto orientativo asignado?',
        '¿Hay algún aspecto adicional importante?',
      ],
    },
  ],
  salud: [
    {
      bloque: 'Software y Gestión Clínica',
      preguntas: [
        '¿Qué software de gestión clínica utilizan?',
        '¿El software dispone de API para conectar con la web?',
        '¿Cómo gestionan actualmente las citas? (teléfono, email, plataforma...)',
      ],
    },
    {
      bloque: 'Necesidades Web',
      preguntas: [
        '¿Qué especialidades/servicios ofrecen?',
        '¿Necesitan sistema de citas online integrado?',
        '¿Necesitan área privada con ficha del paciente?',
        '¿Necesitan cumplir normativa sanitaria específica en la web?',
        '¿Necesitan pasarela de pago para pagos online?',
      ],
    },
    {
      bloque: 'Contenidos',
      preguntas: [
        '¿Disponen de fotografía profesional del centro y equipo?',
        '¿Tienen testimonios de pacientes que puedan publicarse?',
        '¿Publican contenido de salud regularmente?',
      ],
    },
    {
      bloque: 'Expectativas del Proyecto',
      preguntas: [
        '¿Tienen fecha límite para el lanzamiento?',
        '¿Quiénes serán los interlocutores principales?',
        '¿Tienen presupuesto orientativo asignado?',
        '¿Hay algún aspecto adicional importante?',
      ],
    },
  ],
  industria: [
    {
      bloque: 'Software y Gestión',
      preguntas: [
        '¿Qué ERP utilizan? (SAP, Navision, Sage, desarrollo propio...)',
        '¿El ERP dispone de API para conectar con la web?',
        '¿Cómo gestionan actualmente el catálogo de productos?',
        '¿Necesitan sincronizar precios/stock con la web?',
      ],
    },
    {
      bloque: 'Necesidades Web',
      preguntas: [
        '¿Venden a distribuidores (B2B), cliente final (B2C) o ambos?',
        '¿Necesitan catálogo online con fichas técnicas descargables?',
        '¿Necesitan configurador de producto?',
        '¿Necesitan zona privada con precios por distribuidor/cliente?',
        '¿Necesitan formulario de solicitud de presupuesto técnico?',
      ],
    },
    {
      bloque: 'Contenidos',
      preguntas: [
        '¿Disponen de fotografía profesional de productos e instalaciones?',
        '¿Tienen fichas técnicas y documentación de producto?',
        '¿Necesitan sección de casos de éxito / proyectos realizados?',
      ],
    },
    {
      bloque: 'Expectativas del Proyecto',
      preguntas: [
        '¿Tienen fecha límite para el lanzamiento?',
        '¿Quiénes serán los interlocutores principales?',
        '¿Tienen presupuesto orientativo asignado?',
        '¿Hay algún aspecto adicional importante?',
      ],
    },
  ],
};

// Preguntas genéricas para sectores sin preguntas específicas
const PREGUNTAS_GENERICAS = [
  {
    bloque: 'Software y Gestión',
    preguntas: [
      '¿Qué software de gestión utilizan actualmente?',
      '¿El software dispone de API para conectar con la web?',
      '¿Cómo gestionan actualmente la captación de clientes?',
    ],
  },
  {
    bloque: 'Necesidades Web',
    preguntas: [
      '¿Qué funcionalidades principales necesita la nueva web?',
      '¿Necesitan área privada para clientes?',
      '¿Necesitan tienda online o sistema de pagos?',
      '¿Necesitan la web en varios idiomas?',
    ],
  },
  {
    bloque: 'Contenidos',
    preguntas: [
      '¿Disponen de material gráfico profesional (fotos, vídeos)?',
      '¿Tienen los textos corporativos redactados o necesitan copywriting?',
      '¿Necesitan blog o sección de noticias?',
    ],
  },
  {
    bloque: 'Expectativas del Proyecto',
    preguntas: [
      '¿Tienen fecha límite para el lanzamiento?',
      '¿Quiénes serán los interlocutores principales?',
      '¿Tienen presupuesto orientativo asignado?',
      '¿Hay algún aspecto adicional importante?',
    ],
  },
];

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const lead = await prisma.leadMigracionWeb.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    // Si ya tiene cuestionario, devolver el existente
    if (lead.cuestionarioId) {
      const existente = await prisma.cuestionarioPrivado.findUnique({
        where: { id: lead.cuestionarioId },
      });
      return NextResponse.json({ cuestionario: existente });
    }

    // Obtener preguntas del sector
    const sector = lead.sector || 'otro';
    const preguntasSector = PREGUNTAS_TECNICAS[sector] || PREGUNTAS_GENERICAS;

    // Crear cuestionario privado
    const cuestionario = await prisma.cuestionarioPrivado.create({
      data: {
        nombreEmpresa: lead.nombreEmpresa,
        sector: sector,
        contactoNombre: lead.contacto,
        contactoEmail: lead.email,
        titulo: `Cuestionario Técnico - ${lead.nombreEmpresa}`,
        descripcion: `Cuestionario personalizado para el proyecto de migración web de ${lead.nombreEmpresa}`,
        preguntas: preguntasSector,
        estado: 'PENDIENTE',
      },
    });

    // Vincular al lead
    await prisma.leadMigracionWeb.update({
      where: { id },
      data: {
        cuestionarioId: cuestionario.id,
        estado: 'CUESTIONARIO_ENVIADO',
      },
    });

    return NextResponse.json({ cuestionario });
  } catch (error: any) {
    console.error('Error al crear cuestionario:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
