import OpenAI from 'openai';

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export interface DatosLead {
  empresa: string;
  contactoNombre: string;
  contactoEmail: string;
  telefono: string;
  sector: string;
  urlWebActual: string | null;
  frustracionActual: string | null;
  objetivos: any;
  respuestasSector: any;
  softwareActual: string | null;
  necesitaIntegracion: boolean;
  tieneApi: string | null;
  datosIntegracion: string | null;
  presupuesto: string | null;
  fechaLimite: string | null;
}

export interface RespuestaCuestionario {
  bloque: string;
  numeroPregunta: number;
  pregunta: string;
  respuesta: string;
}

export interface Partida {
  numero: string;
  nombre: string;
  descripcion: string;
  horas: number;
  precio: number;
}

export interface BloqueValoracion {
  numero: number;
  titulo: string;
  partidas: Partida[];
  subtotalHoras: number;
  subtotalPrecio: number;
}

export interface ValoracionGenerada {
  resumenEjecutivo: string;
  stackTecnologico: {
    software: string;
    funcion: string;
    apiDisponible: string;
    tipoIntegracion: string;
  }[];
  bloques: BloqueValoracion[];
  totalHoras: number;
  totalPrecio: number;
  tarifaHora: number;
  opcionA: { total: number; plazo: string; pago: string };
  opcionB: { total: number; plazo: string; descripcion: string };
  opcionC: {
    fases: {
      numero: number;
      contenido: string;
      partidas: string;
      horas: number;
      importe: number;
      plazo: string;
    }[];
  };
  cronograma: {
    fase: number;
    titulo: string;
    semanas: { rango: string; actuacion: string }[];
  }[];
  siguientesPasos: { accion: string; responsable: string }[];
  notasCondiciones: string[];
}

export async function generarValoracionConIA(
  datosLead: DatosLead,
  respuestas: RespuestaCuestionario[]
): Promise<ValoracionGenerada> {
  // Preparar el contexto de respuestas agrupadas por bloque
  const respuestasPorBloque: Record<string, { pregunta: string; respuesta: string }[]> = {};
  for (const r of respuestas) {
    if (!respuestasPorBloque[r.bloque]) {
      respuestasPorBloque[r.bloque] = [];
    }
    respuestasPorBloque[r.bloque].push({ pregunta: r.pregunta, respuesta: r.respuesta });
  }

  const respuestasFormateadas = Object.entries(respuestasPorBloque)
    .map(([bloque, preguntas]) => {
      const preguntasStr = preguntas
        .map((p) => `  P: ${p.pregunta}\n  R: ${p.respuesta}`)
        .join('\n\n');
      return `### ${bloque}\n${preguntasStr}`;
    })
    .join('\n\n');

  const prompt = `Eres un consultor IT senior de Internet Operadores, una empresa de servicios IT, ciberseguridad e IA. 
Tu trabajo es analizar la información de un lead (formulario inicial + respuestas del cuestionario técnico) y generar una valoración de tiempos y presupuesto profesional.

DATOS DEL FORMULARIO INICIAL:
- Empresa: ${datosLead.empresa}
- Contacto: ${datosLead.contactoNombre}
- Email: ${datosLead.contactoEmail}
- Teléfono: ${datosLead.telefono}
- Sector: ${datosLead.sector}
- Web actual: ${datosLead.urlWebActual || 'No indicada'}
- Frustración actual: ${datosLead.frustracionActual || 'No indicada'}
- Objetivos: ${JSON.stringify(datosLead.objetivos)}
- Respuestas sector: ${JSON.stringify(datosLead.respuestasSector)}
- Software actual: ${datosLead.softwareActual || 'No indicado'}
- Necesita integración: ${datosLead.necesitaIntegracion ? 'Sí' : 'No'}
- Tiene API: ${datosLead.tieneApi || 'No indicado'}
- Datos integración: ${datosLead.datosIntegracion || 'No indicado'}
- Presupuesto indicado: ${datosLead.presupuesto || 'No indicado'}
- Fecha límite: ${datosLead.fechaLimite || 'No indicada'}

RESPUESTAS DEL CUESTIONARIO TÉCNICO:
${respuestasFormateadas}

INSTRUCCIONES:
1. Analiza toda la información y genera una valoración profesional.
2. La tarifa es 60€/hora para todo (desarrollo, diseño, consultoría).
3. Organiza el trabajo en bloques lógicos (máximo 3-4 bloques).
4. Prioriza siempre la parte de control interno/dashboard si el cliente lo necesita.
5. Cada bloque tiene partidas numeradas (1.1, 1.2, etc.) con nombre, descripción, horas y precio.
6. Las horas deben ser realistas para un equipo de desarrollo profesional.
7. Incluye un stack tecnológico del cliente (software que usan, si tiene API, tipo de integración posible).
8. Genera 3 opciones de ejecución (A: completo, B: parcial, C: por fases progresivas).
9. Genera un cronograma detallado por semanas para la opción C.
10. Lista los siguientes pasos necesarios para arrancar.
11. Incluye notas y condiciones relevantes.

IMPORTANTE: Responde EXCLUSIVAMENTE con un JSON válido con esta estructura exacta (sin markdown, sin backticks):
{
  "resumenEjecutivo": "Párrafo descriptivo del proyecto...",
  "stackTecnologico": [
    {"software": "nombre", "funcion": "qué hace", "apiDisponible": "✅ Sí / ❌ No / ⚠️ Parcial", "tipoIntegracion": "tipo"}
  ],
  "bloques": [
    {
      "numero": 1,
      "titulo": "Nombre del bloque",
      "partidas": [
        {"numero": "1.1", "nombre": "Nombre partida", "descripcion": "Descripción detallada", "horas": 40, "precio": 2400}
      ],
      "subtotalHoras": 0,
      "subtotalPrecio": 0
    }
  ],
  "totalHoras": 0,
  "totalPrecio": 0,
  "tarifaHora": 60,
  "opcionA": {"total": 0, "plazo": "X semanas", "pago": "30% inicio + 40% hito + 30% entrega"},
  "opcionB": {"total": 0, "plazo": "X semanas", "descripcion": "Descripción de qué incluye"},
  "opcionC": {
    "fases": [
      {"numero": 1, "contenido": "Descripción", "partidas": "1.1, 1.2, 1.3", "horas": 0, "importe": 0, "plazo": "X semanas"}
    ]
  },
  "cronograma": [
    {
      "fase": 1,
      "titulo": "Nombre fase",
      "semanas": [
        {"rango": "1-2", "actuacion": "Qué se hace"}
      ]
    }
  ],
  "siguientesPasos": [
    {"accion": "Acción requerida", "responsable": "Quién"}
  ],
  "notasCondiciones": ["Nota 1", "Nota 2"]
}`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'Eres un consultor IT senior. Responde SOLO con JSON válido, sin markdown ni backticks.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const content = response.choices[0]?.message?.content || '{}';
  
  // Limpiar posibles backticks o markdown
  const cleanContent = content
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  try {
    const valoracion = JSON.parse(cleanContent) as ValoracionGenerada;
    
    // Recalcular subtotales y totales por seguridad
    let totalHoras = 0;
    let totalPrecio = 0;
    for (const bloque of valoracion.bloques) {
      bloque.subtotalHoras = bloque.partidas.reduce((sum, p) => sum + p.horas, 0);
      bloque.subtotalPrecio = bloque.partidas.reduce((sum, p) => sum + p.precio, 0);
      totalHoras += bloque.subtotalHoras;
      totalPrecio += bloque.subtotalPrecio;
    }
    valoracion.totalHoras = totalHoras;
    valoracion.totalPrecio = totalPrecio;
    valoracion.tarifaHora = 60;

    return valoracion;
  } catch (error) {
    console.error('Error parseando respuesta de IA:', cleanContent);
    throw new Error('Error al generar la valoración: respuesta de IA no válida');
  }
}
