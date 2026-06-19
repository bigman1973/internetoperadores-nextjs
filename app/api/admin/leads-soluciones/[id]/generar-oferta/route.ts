import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ============================================================
// TARIFARIO MANTENIMIENTO IT - SISTEMA DE CÁLCULO AUTOMÁTICO
// ============================================================
// Multiplicadores de bono: N1×1, N2×1.5, N3×2.5
// Horas excedidas: N1 presencial 49€/h, N1 remoto 44€/h
// ============================================================

interface TarifaCalculo {
  nombre: string;
  precioMensual: number;
  horasIncluidas: number;
  nivelTecnico: string;
  modalidad: string;
  subcategoria: string;
}

// Tarifas base para cálculo automático (basadas en IDs 720-761 en BD)
const TARIFAS_PYME: TarifaCalculo[] = [
  // Planes PYMES 10h
  { nombre: 'Bono PYME 10h N1 Presencial', precioMensual: 399, horasIncluidas: 10, nivelTecnico: 'N1', modalidad: 'Presencial', subcategoria: 'Planes PYMES' },
  { nombre: 'Bono PYME 10h N1 Remoto', precioMensual: 359, horasIncluidas: 10, nivelTecnico: 'N1', modalidad: 'Remoto', subcategoria: 'Planes PYMES' },
  { nombre: 'Bono PYME 10h N2 Presencial', precioMensual: 599, horasIncluidas: 10, nivelTecnico: 'N2', modalidad: 'Presencial', subcategoria: 'Planes PYMES' },
  { nombre: 'Bono PYME 10h N2 Remoto', precioMensual: 539, horasIncluidas: 10, nivelTecnico: 'N2', modalidad: 'Remoto', subcategoria: 'Planes PYMES' },
  { nombre: 'Bono PYME 10h N3 Presencial', precioMensual: 999, horasIncluidas: 10, nivelTecnico: 'N3', modalidad: 'Presencial', subcategoria: 'Planes PYMES' },
  { nombre: 'Bono PYME 10h N3 Remoto', precioMensual: 899, horasIncluidas: 10, nivelTecnico: 'N3', modalidad: 'Remoto', subcategoria: 'Planes PYMES' },
];

const TARIFAS_FARMACIA_HORECA: TarifaCalculo[] = [
  // Planes Farmacia/Médicos/HORECA 8h
  { nombre: 'Bono Farmacia/HORECA 8h N1 Presencial', precioMensual: 319, horasIncluidas: 8, nivelTecnico: 'N1', modalidad: 'Presencial', subcategoria: 'Planes Farmacia/Médicos/HORECA' },
  { nombre: 'Bono Farmacia/HORECA 8h N1 Remoto', precioMensual: 289, horasIncluidas: 8, nivelTecnico: 'N1', modalidad: 'Remoto', subcategoria: 'Planes Farmacia/Médicos/HORECA' },
  { nombre: 'Bono Farmacia/HORECA 8h N2 Presencial', precioMensual: 479, horasIncluidas: 8, nivelTecnico: 'N2', modalidad: 'Presencial', subcategoria: 'Planes Farmacia/Médicos/HORECA' },
  { nombre: 'Bono Farmacia/HORECA 8h N2 Remoto', precioMensual: 429, horasIncluidas: 8, nivelTecnico: 'N2', modalidad: 'Remoto', subcategoria: 'Planes Farmacia/Médicos/HORECA' },
  { nombre: 'Bono Farmacia/HORECA 8h N3 Presencial', precioMensual: 799, horasIncluidas: 8, nivelTecnico: 'N3', modalidad: 'Presencial', subcategoria: 'Planes Farmacia/Médicos/HORECA' },
  { nombre: 'Bono Farmacia/HORECA 8h N3 Remoto', precioMensual: 719, horasIncluidas: 8, nivelTecnico: 'N3', modalidad: 'Remoto', subcategoria: 'Planes Farmacia/Médicos/HORECA' },
];

// Determinar nivel técnico recomendado según complejidad
function determinarNivelTecnico(datos: any): string {
  const tipoNegocio = datos.tipoNegocio;
  const numEquipos = datos.numEquipos || '';
  const softwareEspecifico = datos.softwareEspecifico || [];
  const sistemasCriticos = datos.sistemasCriticos || '';

  // Farmacia con robot o muchos equipos → N2
  if (tipoNegocio === 'FARMACIA') {
    if (softwareEspecifico.includes('Robot de farmacia') || numEquipos.includes('+15') || numEquipos.includes('11-15')) {
      return 'N2';
    }
    return 'N1';
  }

  // HORECA con pantallas de cocina o muchos equipos → N2
  if (tipoNegocio === 'HORECA') {
    if (softwareEspecifico.includes('Pantallas de cocina / KDS') || numEquipos.includes('+15') || numEquipos.includes('11-15')) {
      return 'N2';
    }
    return 'N1';
  }

  // PYME
  if (tipoNegocio === 'PYME') {
    const numServidores = datos.numServidores || '';
    if (numServidores.includes('+3') || numEquipos.includes('16-20')) {
      return 'N2';
    }
    if (numServidores === 'Ninguno' && (numEquipos.includes('1-5') || numEquipos.includes('6-10'))) {
      return 'N1';
    }
    return 'N1';
  }

  // Mediana/Grande - siempre propuesta a medida, pero por defecto N2
  if (sistemasCriticos?.includes('SCADA') || sistemasCriticos?.includes('Varios')) {
    return 'N3';
  }
  return 'N2';
}

// Determinar modalidad recomendada
function determinarModalidad(datos: any): string {
  const tipoNegocio = datos.tipoNegocio;
  const coberturaHoraria = datos.coberturaHoraria || '';

  // Si piden 24x7 o guardias → presencial necesario
  if (coberturaHoraria.includes('24x7') || coberturaHoraria.includes('guardias')) {
    return 'Presencial';
  }

  // Farmacia/HORECA generalmente necesitan presencial (hardware TPV, impresoras, etc.)
  if (tipoNegocio === 'FARMACIA' || tipoNegocio === 'HORECA') {
    return 'Presencial';
  }

  // PYME sin servidores puede ser remoto
  if (tipoNegocio === 'PYME') {
    const numServidores = datos.numServidores || '';
    if (numServidores === 'Ninguno') {
      return 'Remoto';
    }
    return 'Presencial';
  }

  return 'Presencial';
}

// Generar oferta automática para PYME/Farmacia/HORECA
function generarOfertaAutomatica(datos: any): any {
  const tipoNegocio = datos.tipoNegocio;
  const nivelRecomendado = determinarNivelTecnico(datos);
  const modalidadRecomendada = determinarModalidad(datos);

  // Seleccionar tarifario según tipo
  const tarifas = (tipoNegocio === 'FARMACIA' || tipoNegocio === 'HORECA')
    ? TARIFAS_FARMACIA_HORECA
    : TARIFAS_PYME;

  // Encontrar la tarifa recomendada
  const tarifaRecomendada = tarifas.find(t =>
    t.nivelTecnico === nivelRecomendado && t.modalidad === modalidadRecomendada
  );

  // Alternativas (mismo nivel, otra modalidad + nivel superior misma modalidad)
  const alternativas = tarifas.filter(t =>
    t !== tarifaRecomendada && (
      (t.nivelTecnico === nivelRecomendado && t.modalidad !== modalidadRecomendada) ||
      (t.nivelTecnico !== nivelRecomendado && t.modalidad === modalidadRecomendada)
    )
  ).slice(0, 2);

  // Calcular extras opcionales
  const extras: any[] = [];

  // Si HORECA con producción continua, sugerir guardia fin de semana
  if (tipoNegocio === 'HORECA' && datos.produccion24h?.includes('continuo')) {
    extras.push({
      nombre: 'Suplemento cobertura fin de semana',
      precio: 99,
      descripcion: 'Soporte telefónico + remoto sábados y domingos',
    });
  }

  // Si no tiene backup, sugerir
  if (datos.backupCiberseguridad?.includes('No tengo') || datos.backupCiberseguridad?.includes('no estoy seguro')) {
    extras.push({
      nombre: 'Backup gestionado en la nube',
      precio: 49,
      descripcion: 'Copias automáticas diarias con retención 30 días',
    });
  }

  // Desplazamiento si es presencial
  if (modalidadRecomendada === 'Presencial') {
    extras.push({
      nombre: 'Desplazamiento incluido (zona Lleida)',
      precio: 0,
      descripcion: 'Sin coste adicional para desplazamientos en zona Lleida capital y alrededores',
    });
  }

  return {
    tipo: 'OFERTA_AUTOMATICA',
    tipoNegocio,
    nivelRecomendado,
    modalidadRecomendada,
    tarifaRecomendada: tarifaRecomendada || tarifas[0],
    alternativas,
    extras,
    condiciones: {
      horasExcedidas: modalidadRecomendada === 'Presencial' ? '49 €/h' : '44 €/h',
      permanencia: 'Sin permanencia. Renovación mensual.',
      sla: nivelRecomendado === 'N1' ? '4h respuesta / 8h resolución' : nivelRecomendado === 'N2' ? '2h respuesta / 4h resolución' : '1h respuesta / 2h resolución',
      facturacion: 'Mensual por adelantado',
    },
    resumenTexto: `Plan recomendado: ${tarifaRecomendada?.nombre || 'Bono estándar'} — ${tarifaRecomendada?.precioMensual || 0} €/mes (${tarifaRecomendada?.horasIncluidas || 0}h incluidas)`,
  };
}

// Generar propuesta de valor para Mediana/Grande (con IA)
async function generarPropuestaGrande(datos: any): Promise<any> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

  if (!OPENAI_API_KEY) {
    // Fallback sin IA
    return {
      tipo: 'PROPUESTA_MEDIDA',
      tipoNegocio: 'MEDIANA_GRANDE',
      resumen: 'Propuesta a medida para empresa mediana/grande. Se requiere reunión técnica para dimensionar correctamente.',
      siguientesPasos: [
        'Reunión técnica inicial (presencial o Teams)',
        'Auditoría de infraestructura actual',
        'Propuesta económica detallada',
        'Periodo de prueba (1 mes)',
      ],
      cuestionarioTecnico: generarCuestionarioTecnico(datos),
    };
  }

  try {
    const prompt = `Eres un consultor IT senior de Internet Operadores (empresa de telecomunicaciones y servicios IT en Lleida, España). 
Genera una propuesta de valor personalizada para un lead de empresa mediana/grande con estos datos:

- Empresa: tipo mediana/grande (+20 empleados)
- Nº equipos: ${datos.numEquipos || 'No indicado'}
- Nº servidores: ${datos.numServidores || 'No indicado'}
- Nº sedes: ${datos.numSedes || 'No indicado'}
- Equipo IT interno: ${datos.equipoITInterno || 'No indicado'}
- Sistemas críticos: ${datos.sistemasCriticos || 'No indicado'}
- Cobertura horaria: ${datos.coberturaHoraria || 'No indicado'}
- Presupuesto orientativo: ${datos.presupuestoOrientativo || 'No indicado'}
- Servicios de interés: ${Array.isArray(datos.serviciosInteres) ? datos.serviciosInteres.join(', ') : 'No indicado'}
- Comentarios: ${datos.comentarios || 'Sin comentarios'}

Genera un JSON con esta estructura:
{
  "propuestaValor": "Texto de 3-4 párrafos explicando por qué Internet Operadores es el partner ideal para esta empresa, mencionando certificaciones, experiencia local, SLA garantizados y equipo técnico propio.",
  "serviciosRecomendados": ["lista de 3-5 servicios concretos recomendados"],
  "estimacionRango": { "min": número, "max": número, "nota": "texto explicativo" },
  "siguientesPasos": ["lista de 3-4 pasos siguientes"],
  "puntosFuertes": ["3-4 argumentos diferenciadores"]
}

Responde SOLO con el JSON, sin markdown ni explicaciones.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parsear JSON de la respuesta
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const propuesta = JSON.parse(jsonMatch[0]);
      return {
        tipo: 'PROPUESTA_MEDIDA',
        tipoNegocio: 'MEDIANA_GRANDE',
        ...propuesta,
        cuestionarioTecnico: generarCuestionarioTecnico(datos),
      };
    }

    throw new Error('No se pudo parsear la respuesta de IA');
  } catch (error) {
    console.error('[GENERAR-OFERTA] Error IA:', error);
    // Fallback sin IA
    return {
      tipo: 'PROPUESTA_MEDIDA',
      tipoNegocio: 'MEDIANA_GRANDE',
      propuestaValor: `Internet Operadores es su partner tecnológico de confianza en Lleida con más de 20 años de experiencia. Nuestro equipo técnico certificado (Microsoft, Cisco, VMware, Fortinet) ofrece un servicio integral de mantenimiento IT adaptado a empresas medianas y grandes.\n\nCon un NOC propio y técnicos asignados que conocen su infraestructura, garantizamos tiempos de respuesta comprometidos por contrato con SLA exigentes y penalizaciones reales si no cumplimos.\n\nNuestra propuesta se adapta a su realidad: ${datos.numSedes ? `${datos.numSedes} con coordinación centralizada` : 'gestión unificada de toda su infraestructura'}, ${datos.equipoITInterno?.includes('complementar') ? 'complementando su equipo IT interno' : 'cubriendo todas sus necesidades IT'}.`,
      serviciosRecomendados: [
        'Soporte y mantenimiento preventivo',
        datos.coberturaHoraria?.includes('24x7') ? 'Guardias IT 24/7' : 'Soporte en horario extendido',
        'Monitorización proactiva',
        'Gestión de backups y recuperación ante desastres',
        'Ciberseguridad gestionada',
      ],
      siguientesPasos: [
        'Reunión técnica inicial (presencial o Teams)',
        'Auditoría de infraestructura actual',
        'Propuesta económica detallada',
        'Periodo de prueba (1 mes)',
      ],
      cuestionarioTecnico: generarCuestionarioTecnico(datos),
    };
  }
}

function generarCuestionarioTecnico(datos: any): string[] {
  const preguntas: string[] = [];

  if (!datos.numServidores || datos.numServidores === 'No indicado') {
    preguntas.push('¿Cuántos servidores físicos y/o virtuales tenéis actualmente?');
  }
  if (!datos.sistemasCriticos || datos.sistemasCriticos === 'No indicado') {
    preguntas.push('¿Cuáles son vuestros sistemas críticos de negocio?');
  }
  preguntas.push('¿Tenéis política de backups documentada? ¿Se prueban las restauraciones?');
  preguntas.push('¿Qué solución de ciberseguridad tenéis implementada actualmente?');
  if (datos.numSedes && !datos.numSedes.includes('1 sede')) {
    preguntas.push('¿Cómo están conectadas las sedes entre sí? (VPN, MPLS, SD-WAN...)');
  }
  preguntas.push('¿Tenéis documentación actualizada de vuestra infraestructura IT?');
  preguntas.push('¿Cuáles son los 3 principales problemas IT que queréis resolver?');

  return preguntas;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    // Obtener el lead
    const lead = await prisma.leadSolucion.findUnique({
      where: { id: params.id },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    if (lead.tipo !== 'MANTENIMIENTO_IT') {
      return NextResponse.json({ error: 'Este lead no es de Mantenimiento IT' }, { status: 400 });
    }

    const datos = lead.datos as any;
    const tipoNegocio = datos?.tipoNegocio;

    let oferta: any;

    if (tipoNegocio === 'MEDIANA_GRANDE') {
      // Generar propuesta a medida con IA
      oferta = await generarPropuestaGrande(datos);
    } else {
      // Generar oferta automática con tarifario cerrado
      oferta = generarOfertaAutomatica(datos);
    }

    // Guardar la oferta en el lead (actualizar datos JSON)
    const datosActualizados = {
      ...datos,
      ofertaGenerada: oferta,
      ofertaGeneradaAt: new Date().toISOString(),
      ofertaGeneradaPor: session.user?.email || 'admin',
    };

    await prisma.leadSolucion.update({
      where: { id: params.id },
      data: {
        datos: datosActualizados,
        estado: 'EN_PROCESO',
      },
    });

    return NextResponse.json({
      success: true,
      oferta,
    });
  } catch (error: any) {
    console.error('[GENERAR-OFERTA] Error:', error);
    return NextResponse.json({ error: 'Error generando oferta' }, { status: 500 });
  }
}
