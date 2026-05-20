import OpenAI from 'openai';

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || undefined,
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
    duracion: string;
    semanas: { rango: string; actuacion: string }[];
  }[];
  mantenimiento: {
    concepto: string;
    mensual: string;
  }[];
  siguientesPasos: { accion: string; responsable: string }[];
  notasCondiciones: string[];
  condiciones: {
    validez: string;
    iva: string;
    licencias: string;
  };
  reunionArranque: string;
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

  const prompt = `Eres un consultor IT senior de Internet Operadores (empresa de servicios IT, ciberseguridad e IA en España).
Tu trabajo es generar una VALORACIÓN DE TIEMPOS Y PRESUPUESTO profesional y detallada basándote en la información del lead.

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
- Presupuesto indicado por cliente: ${datosLead.presupuesto || 'No indicado'}
- Fecha límite: ${datosLead.fechaLimite || 'No indicada'}

RESPUESTAS DEL CUESTIONARIO TÉCNICO PERSONALIZADO:
${respuestasFormateadas}

=== REGLAS OBLIGATORIAS ===

1. IGNORA el presupuesto indicado por el cliente. Valora según las NECESIDADES REALES detectadas en las respuestas. Si el cliente indicó 3.000-6.000€ pero necesita un dashboard con integraciones a 4 sistemas, el presupuesto real será mucho mayor. Explica esto en las notas.

2. TARIFA FIJA: 60€/hora para todo (desarrollo, diseño UX/UI, consultoría, integración).

3. ESTRUCTURA DE BLOQUES (máximo 3 bloques):
   - BLOQUE 1 SIEMPRE es "CONTROL INTERNO" (Dashboard Financiero, integraciones con software del cliente, alertas, reporting). Este es SIEMPRE el PRIORITARIO. Mínimo 7-9 partidas.
   - BLOQUE 2 es "WEB CORPORATIVA PROFESIONAL" (diseño, desarrollo, SEO, portfolio, blog, formularios). Mínimo 5-6 partidas.
   - BLOQUE 3 es "INTEGRACIONES Y AUTOMATIZACIONES" (flujos automáticos entre sistemas, reporting periódico). 2-3 partidas.

4. HORAS REALISTAS para un equipo profesional:
   - Dashboard completo con KPIs: 60-80h
   - Integración API completa (ZINKEE, SAGE, etc.): 35-45h cada una
   - Importación ficheros (TCQ/BC3): 20-30h
   - Comparativa coste previsto vs real: 25-35h
   - Sistema de alertas: 15-20h
   - Control costes indirectos: 20-30h
   - Gestión roles/permisos: 15-20h
   - Diseño UX/UI web completa: 35-45h
   - Desarrollo frontend responsive: 40-55h
   - Portfolio de obras: 20-30h
   - SEO técnico: 15-25h
   - Blog profesional: 10-15h
   - Formulario cualificado: 8-12h
   - Flujo certificación→factura: 25-35h
   - Reporting automático: 12-20h

5. DESCRIPCIONES DETALLADAS: Cada partida debe tener una descripción de 2-3 frases explicando exactamente qué se desarrolla, mencionando tecnologías o funcionalidades específicas del cliente.

6. STACK TECNOLÓGICO: Analiza cada software que mencione el cliente. Investiga si tiene API:
   - ZINKEE: ✅ API REST V2 completa (doc.zinkee.com). Conexión directa.
   - PLAN HOPPER: ✅ Tiene API (confirmar documentación con cliente). Conexión directa.
   - SAGE: ✅ API REST con OAuth 2.0 (developer.sage.com). Confirmar versión (50/200/Cloud).
   - TCQ: ❌ Sin API pública. Importación ficheros BC3/FIEBDC.
   - SIGO: ❌ Consultoría tradicional sin plataforma digital. No integrable.
   - Otros: Analiza según lo que diga el cliente.

7. OPCIONES DE EJECUCIÓN:
   - Opción A: Proyecto completo (todos los bloques). Plazo 16-20 semanas. Pago: 30% inicio + 40% hito intermedio + 30% entrega.
   - Opción B: Bloques 1 + 2 (sin automatizaciones avanzadas). Plazo 14-16 semanas.
   - Opción C (RECOMENDADA): Fases progresivas. Fase 1 = Dashboard + integraciones core. Fase 2 = Web completa. Fase 3 = Módulos avanzados.

8. CRONOGRAMA: Detallado por semanas para cada fase de la Opción C. Cada fase tiene 3-5 rangos de semanas con actuaciones específicas.

9. MANTENIMIENTO POST-PROYECTO:
   - Hosting + infraestructura: 50€/mes
   - Mantenimiento correctivo + actualizaciones: 150€/mes
   - Soporte técnico (hasta 5h/mes): 200€/mes
   - Total: 400€/mes

10. NOTAS Y CONDICIONES: Párrafos explicativos sobre cada software (API disponible, limitaciones, qué confirmar). Mínimo 5-7 notas detalladas. Incluir nota sobre el presupuesto del cliente vs necesidades reales.

11. SIGUIENTES PASOS: 5-7 acciones concretas con responsable (cliente o ambas partes). Incluir: confirmar opción, confirmar versión software, facilitar credenciales API, facilitar ficheros ejemplo, firma acuerdo.

12. REUNIÓN DE ARRANQUE: Proponer reunión presencial o videollamada con las personas clave del cliente para validar KPIs y definir criterios antes de iniciar.

13. RESUMEN EJECUTIVO: Párrafo largo (5-8 líneas) que describa la empresa, su situación actual, necesidades detectadas, prioridades, y qué NO necesitan. Usar información tanto del formulario como del cuestionario. Mencionar frecuencia de uso, número de usuarios, volumen de operaciones.

RESPONDE EXCLUSIVAMENTE con un JSON válido (sin markdown, sin backticks, sin explicaciones):
{
  "resumenEjecutivo": "Párrafo largo y detallado describiendo empresa, necesidades, prioridades...",
  "stackTecnologico": [
    {"software": "NOMBRE", "funcion": "Qué hace en la empresa", "apiDisponible": "✅ API REST V2 completa / ❌ Sin API pública / ⚠️ Parcial (detalles)", "tipoIntegracion": "Conexión directa / Importación ficheros BC3 / No integrable"}
  ],
  "bloques": [
    {
      "numero": 1,
      "titulo": "CONTROL INTERNO (Dashboard Financiero) — PRIORITARIO",
      "partidas": [
        {"numero": "1.1", "nombre": "Nombre corto", "descripcion": "Descripción detallada de 2-3 frases con funcionalidades específicas", "horas": 80, "precio": 4800}
      ],
      "subtotalHoras": 312,
      "subtotalPrecio": 18720
    }
  ],
  "totalHoras": 512,
  "totalPrecio": 30720,
  "tarifaHora": 60,
  "opcionA": {"total": 30720, "plazo": "16-18 semanas", "pago": "30% inicio + 40% hito intermedio + 30% entrega"},
  "opcionB": {"total": 27840, "plazo": "14-16 semanas", "descripcion": "Incluye Bloques 1 y 2 (Dashboard + Web). Las integraciones avanzadas (Bloque 3) se ejecutan en fase posterior."},
  "opcionC": {
    "fases": [
      {"numero": 1, "contenido": "Dashboard Financiero con integraciones core", "partidas": "1.1, 1.2, 1.3, 1.7, 1.8, 1.9", "horas": 240, "importe": 14400, "plazo": "10 semanas"},
      {"numero": 2, "contenido": "Web Corporativa completa", "partidas": "2.1, 2.2, 2.3, 2.4, 2.5, 2.6", "horas": 152, "importe": 9120, "plazo": "6 semanas"},
      {"numero": 3, "contenido": "Módulos avanzados: alertas, costes indirectos, automatizaciones", "partidas": "1.4, 1.5, 1.6, 3.1, 3.2", "horas": 120, "importe": 7200, "plazo": "5 semanas"}
    ]
  },
  "cronograma": [
    {
      "fase": 1,
      "titulo": "Dashboard Financiero",
      "duracion": "10 semanas",
      "semanas": [
        {"rango": "1-2", "actuacion": "Auditoría técnica de APIs. Confirmación versiones. Diseño base de datos."},
        {"rango": "3-5", "actuacion": "Desarrollo de conectores API y motor de integración."},
        {"rango": "6-8", "actuacion": "Desarrollo del Dashboard visual. Configuración de KPIs."},
        {"rango": "9-10", "actuacion": "Pruebas con datos reales. Formación al equipo."}
      ]
    }
  ],
  "mantenimiento": [
    {"concepto": "Hosting + infraestructura (servidor cloud privado)", "mensual": "50€/mes"},
    {"concepto": "Mantenimiento correctivo + actualizaciones de seguridad", "mensual": "150€/mes"},
    {"concepto": "Soporte técnico (hasta 5h/mes)", "mensual": "200€/mes"},
    {"concepto": "Total mantenimiento", "mensual": "400€/mes"}
  ],
  "siguientesPasos": [
    {"accion": "Confirmación de la opción elegida (A, B o C)", "responsable": "Cliente (Gerencia)"},
    {"accion": "Confirmar versión exacta de SAGE utilizada (50, 200 o Cloud)", "responsable": "Cliente (Administración)"},
    {"accion": "Facilitar credenciales de acceso a ZINKEE (API Key) para pruebas", "responsable": "Cliente"},
    {"accion": "Facilitar 2-3 ficheros BC3 de ejemplo de TCQ", "responsable": "Cliente"},
    {"accion": "Firma del acuerdo y primer pago (30%)", "responsable": "Ambas partes"}
  ],
  "notasCondiciones": [
    "1. ZINKEE: API REST V2 confirmada y documentada en doc.zinkee.com. Permite acceso completo a registros de obras, costes, facturas y cobros. Autenticación por API Key.",
    "2. PLAN HOPPER: El cliente confirma que dispone de API. Se verificará la documentación durante la fase de análisis técnico.",
    "3. SAGE: Dispone de API REST con OAuth 2.0 (developer.sage.com). Es imprescindible confirmar la versión exacta que usa el cliente: SAGE 50 (integración limitada vía SDK/ODBC), SAGE 200 (API REST completa) o Sage Business Cloud (API REST completa).",
    "4. TCQ: No dispone de API pública. La integración se realizará mediante importación de ficheros en formato BC3/FIEBDC, que es el estándar del sector de la construcción en España.",
    "5. Costes indirectos: Actualmente no los controlan de forma sistematizada. La partida correspondiente implementa esta funcionalidad nueva.",
    "6. Presupuesto inicial del cliente: El formulario indicaba un rango inferior, pero las necesidades reales (dashboard financiero con integraciones a múltiples sistemas) exceden ese rango. Se recomienda presentar la Opción C por fases para facilitar la entrada."
  ],
  "condiciones": {
    "validez": "30 días desde la fecha de emisión",
    "iva": "Todos los importes son sin IVA (21%)",
    "licencias": "El coste de licencias de software de terceros no está incluido y corre a cargo del cliente"
  },
  "reunionArranque": "Proponemos una reunión presencial o por videollamada con los responsables clave del cliente para validar los KPIs del dashboard y definir los criterios de reparto de costes indirectos antes de iniciar el desarrollo."
}`;

  const openai = getOpenAIClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      {
        role: 'system',
        content: 'Eres un consultor IT senior de Internet Operadores. Generas valoraciones de tiempos y presupuesto profesionales y detalladas. SIEMPRE respondes SOLO con JSON válido, sin markdown, sin backticks, sin explicaciones adicionales. Las valoraciones deben ser ambiciosas y realistas, NUNCA ajustadas al presupuesto del cliente sino a sus necesidades reales.',
      },
      { role: 'user', content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 8000,
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

    // Recalcular opciones
    valoracion.opcionA.total = totalPrecio;
    
    // Opción B = Bloques 1 + 2
    const bloque1y2 = valoracion.bloques.slice(0, 2).reduce((sum, b) => sum + b.subtotalPrecio, 0);
    valoracion.opcionB.total = bloque1y2;

    return valoracion;
  } catch (error) {
    console.error('Error parseando respuesta de IA:', cleanContent);
    throw new Error('Error al generar la valoración: respuesta de IA no válida');
  }
}
