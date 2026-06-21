import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

// ============================================================
// PROPUESTA ECONÓMICA A PRECIO CERRADO
// Se genera después de recibir el cuestionario técnico completado
// Usa las respuestas para dimensionar exactamente los servicios
// ============================================================

interface LineaPresupuesto {
  concepto: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  total: number;
  periodicidad: 'mensual' | 'única' | 'anual';
}

// POST: Generar propuesta económica con IA basada en cuestionario
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    const datos = lead.datos as any;
    const cuestionario = datos?.cuestionarioTecnico;

    if (!cuestionario?.respuestas || cuestionario.estado !== 'COMPLETADO') {
      return NextResponse.json({ error: 'El cuestionario técnico debe estar completado para generar la propuesta económica' }, { status: 400 });
    }

    const ofertaPrevia = datos?.ofertaGenerada;

    // Construir contexto completo para la IA
    const contexto = `
DATOS DEL LEAD:
- Empresa: ${lead.empresa}
- Contacto: ${lead.nombre} (${lead.email})
- Tipo de negocio: ${datos.tipoNegocio || 'MEDIANA_GRANDE'}
- Nº Equipos: ${datos.numEquipos || 'N/A'}
- Nº Servidores: ${datos.numServidores || 'N/A'}
- Producción 24h: ${datos.produccion24h || 'N/A'}
- Cobertura horaria: ${datos.coberturaHoraria || 'N/A'}
- Equipo IT interno: ${datos.equipoITInterno || 'N/A'}
- Sistemas críticos: ${datos.sistemasCriticos || 'N/A'}
- Servicios de interés: ${datos.serviciosInteres || 'N/A'}

RESPUESTAS DEL CUESTIONARIO TÉCNICO:
${JSON.stringify(cuestionario.respuestas, null, 2)}

${ofertaPrevia ? `PROPUESTA PREVIA (rango estimado):
- Servicios recomendados: ${ofertaPrevia.serviciosRecomendados?.join(', ') || 'N/A'}
- Rango estimado: ${ofertaPrevia.estimacionRango?.min || 0} - ${ofertaPrevia.estimacionRango?.max || 0} €/mes
` : ''}

TARIFARIO DE REFERENCIA (precios base):
- Bono 20h N2 Presencial: 1.099€/mes
- Bono 20h N2 Remoto: 989€/mes
- Bono 20h N3 Presencial: 1.499€/mes
- Bono 20h N3 Remoto: 1.349€/mes
- Bono 40h N2 Presencial: 1.999€/mes
- Bono 40h N2 Remoto: 1.799€/mes
- Bono 40h N3 Presencial: 2.799€/mes
- Bono 40h N3 Remoto: 2.519€/mes
- Guardia 24/7: 899€/mes
- Guardia fin de semana: 499€/mes
- Guardia festivos: 299€/mes
- Monitorización proactiva: 299€/mes (hasta 50 equipos), 499€/mes (51-100), 799€/mes (101-200)
- Backup gestionado: 199€/mes (hasta 1TB), 349€/mes (hasta 5TB)
- Antivirus gestionado: 4,5€/equipo/mes
- Auditoría seguridad: 1.500€ (única)
- Migración servidor: desde 2.500€ (única)
`;

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 });
    }

    const prompt = `Eres un consultor comercial experto en servicios IT gestionados de Internet Operadores.
Basándote en los datos del lead y las respuestas del cuestionario técnico, genera una PROPUESTA ECONÓMICA A PRECIO CERRADO.

${contexto}

INSTRUCCIONES:
1. Analiza las respuestas del cuestionario para dimensionar exactamente los servicios necesarios
2. Genera líneas de presupuesto detalladas con precios reales basados en el tarifario
3. Incluye servicios recurrentes (mensuales) y servicios de implementación (únicos)
4. El precio debe ser competitivo pero rentable
5. Incluye condiciones del servicio y SLA

Responde EXCLUSIVAMENTE en JSON válido con esta estructura:
{
  "resumenEjecutivo": "texto de 2-3 frases resumen de la propuesta",
  "lineasRecurrentes": [
    { "concepto": "nombre del servicio", "descripcion": "detalle", "cantidad": 1, "precioUnitario": 0, "total": 0, "periodicidad": "mensual" }
  ],
  "lineasUnicas": [
    { "concepto": "nombre del servicio", "descripcion": "detalle", "cantidad": 1, "precioUnitario": 0, "total": 0, "periodicidad": "única" }
  ],
  "totalMensual": 0,
  "totalImplementacion": 0,
  "totalAnualEstimado": 0,
  "sla": {
    "tiempoRespuesta": "texto",
    "tiempoResolucion": "texto",
    "disponibilidad": "texto",
    "penalizaciones": "texto"
  },
  "condiciones": {
    "duracionContrato": "texto",
    "formaPago": "texto",
    "revisionPrecios": "texto",
    "preaviso": "texto"
  },
  "validez": "30 días desde la fecha de emisión",
  "notasAdicionales": "texto con observaciones relevantes"
}`;

    const openaiRes = await fetch(`${process.env.OPENAI_API_BASE || 'https://api.openai.com'}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!openaiRes.ok) {
      const err = await openaiRes.text();
      console.error('[PROPUESTA-ECONOMICA] Error OpenAI:', err);
      return NextResponse.json({ error: 'Error generando propuesta económica' }, { status: 500 });
    }

    const openaiData = await openaiRes.json();
    const content = openaiData.choices?.[0]?.message?.content || '';

    // Parsear JSON de la respuesta
    let propuesta: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      propuesta = JSON.parse(jsonMatch[0]);
    } catch {
      console.error('[PROPUESTA-ECONOMICA] Error parsing:', content);
      return NextResponse.json({ error: 'Error procesando la propuesta generada' }, { status: 500 });
    }

    // Guardar propuesta en el lead
    const datosActualizados = {
      ...datos,
      propuestaEconomica: {
        ...propuesta,
        generadaAt: new Date().toISOString(),
        generadaPor: session.user?.email || 'admin',
        version: (datos.propuestaEconomica?.version || 0) + 1,
      },
    };

    await prisma.leadSolucion.update({
      where: { id },
      data: { datos: datosActualizados },
    });

    return NextResponse.json({ success: true, propuesta: datosActualizados.propuestaEconomica });
  } catch (error: any) {
    console.error('[PROPUESTA-ECONOMICA] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: Generar PDF de la propuesta económica
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return new Response('No autorizado', { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({ where: { id } });
    if (!lead) {
      return new Response('Lead no encontrado', { status: 404 });
    }

    const datos = lead.datos as any;
    const propuesta = datos?.propuestaEconomica;

    if (!propuesta) {
      return new Response('No hay propuesta económica generada', { status: 400 });
    }

    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Propuesta Económica - ${lead.empresa}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; line-height: 1.5; }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 25mm 20mm; position: relative; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #E87A2E; }
    .logo { font-size: 24px; font-weight: 800; }
    .logo span { color: #E87A2E; }
    .doc-info { text-align: right; font-size: 11px; color: #666; }
    .doc-info .ref { font-size: 13px; font-weight: 700; color: #1a1a1a; }
    h1 { font-size: 22px; color: #1a1a1a; margin: 20px 0 5px; }
    h2 { font-size: 16px; color: #E87A2E; margin: 25px 0 12px; padding-bottom: 5px; border-bottom: 1px solid #eee; }
    .resumen { background: #f8f9fa; border-left: 4px solid #E87A2E; padding: 15px 20px; margin: 15px 0; font-size: 13px; }
    .cliente-box { background: #f0f4f8; padding: 15px; border-radius: 8px; margin: 15px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px; }
    .cliente-box strong { color: #333; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
    th { background: #2d3748; color: white; padding: 10px 12px; text-align: left; font-weight: 600; }
    td { padding: 9px 12px; border-bottom: 1px solid #e2e8f0; }
    tr:nth-child(even) td { background: #f7fafc; }
    .total-row td { font-weight: 700; background: #edf2f7 !important; border-top: 2px solid #2d3748; }
    .totales-box { background: linear-gradient(135deg, #E87A2E, #d4691e); color: white; padding: 20px; border-radius: 10px; margin: 20px 0; }
    .totales-box h3 { font-size: 14px; margin-bottom: 12px; opacity: 0.9; }
    .totales-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; }
    .total-item { text-align: center; }
    .total-item .label { font-size: 11px; opacity: 0.85; }
    .total-item .value { font-size: 22px; font-weight: 800; margin-top: 3px; }
    .sla-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 10px 0; }
    .sla-item { background: #f8f9fa; padding: 12px; border-radius: 6px; border-left: 3px solid #E87A2E; }
    .sla-item .label { font-size: 10px; color: #666; text-transform: uppercase; font-weight: 600; }
    .sla-item .value { font-size: 13px; font-weight: 600; color: #1a1a1a; margin-top: 3px; }
    .condiciones { font-size: 12px; }
    .condiciones li { margin: 6px 0; padding-left: 5px; }
    .firma-section { margin-top: 40px; padding-top: 20px; border-top: 2px solid #eee; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .firma-box { text-align: center; }
    .firma-box .linea { border-bottom: 1px solid #333; height: 60px; margin-bottom: 8px; }
    .firma-box .nombre { font-size: 11px; color: #666; }
    .footer { position: absolute; bottom: 15mm; left: 20mm; right: 20mm; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
    .validez { background: #fff3cd; border: 1px solid #ffc107; padding: 10px 15px; border-radius: 6px; font-size: 11px; margin: 15px 0; }
    @media print { .page { margin: 0; padding: 15mm; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div>
        <div class="logo">internet<span>operadores</span></div>
        <p style="font-size: 11px; color: #666; margin-top: 4px;">Servicios IT Gestionados</p>
      </div>
      <div class="doc-info">
        <p class="ref">PROP-MIT-${lead.id.slice(0, 6).toUpperCase()}</p>
        <p>${fecha}</p>
        <p>Versión ${propuesta.version || 1}</p>
      </div>
    </div>

    <h1>Propuesta Económica</h1>
    <h2 style="border: none; padding: 0; margin-top: 5px; font-size: 14px; color: #666;">Servicios de Mantenimiento IT para ${lead.empresa}</h2>

    <div class="cliente-box">
      <div><strong>Empresa:</strong> ${lead.empresa}</div>
      <div><strong>Contacto:</strong> ${lead.nombre}</div>
      <div><strong>Email:</strong> ${lead.email}</div>
      <div><strong>Teléfono:</strong> ${lead.telefono || 'N/A'}</div>
    </div>

    <div class="resumen">${propuesta.resumenEjecutivo || ''}</div>

    <h2>Servicios Recurrentes (Mensuales)</h2>
    <table>
      <thead>
        <tr><th>Concepto</th><th>Descripción</th><th style="text-align:center">Ud.</th><th style="text-align:right">€/ud</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>
        ${(propuesta.lineasRecurrentes || []).map((l: any) => `
        <tr>
          <td><strong>${l.concepto}</strong></td>
          <td>${l.descripcion}</td>
          <td style="text-align:center">${l.cantidad}</td>
          <td style="text-align:right">${Number(l.precioUnitario).toLocaleString('es-ES')} €</td>
          <td style="text-align:right"><strong>${Number(l.total).toLocaleString('es-ES')} €</strong></td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="4">TOTAL MENSUAL</td>
          <td style="text-align:right">${Number(propuesta.totalMensual).toLocaleString('es-ES')} €/mes</td>
        </tr>
      </tbody>
    </table>

    ${(propuesta.lineasUnicas || []).length > 0 ? `
    <h2>Servicios de Implementación (Pago Único)</h2>
    <table>
      <thead>
        <tr><th>Concepto</th><th>Descripción</th><th style="text-align:center">Ud.</th><th style="text-align:right">€/ud</th><th style="text-align:right">Total</th></tr>
      </thead>
      <tbody>
        ${(propuesta.lineasUnicas || []).map((l: any) => `
        <tr>
          <td><strong>${l.concepto}</strong></td>
          <td>${l.descripcion}</td>
          <td style="text-align:center">${l.cantidad}</td>
          <td style="text-align:right">${Number(l.precioUnitario).toLocaleString('es-ES')} €</td>
          <td style="text-align:right"><strong>${Number(l.total).toLocaleString('es-ES')} €</strong></td>
        </tr>`).join('')}
        <tr class="total-row">
          <td colspan="4">TOTAL IMPLEMENTACIÓN</td>
          <td style="text-align:right">${Number(propuesta.totalImplementacion).toLocaleString('es-ES')} €</td>
        </tr>
      </tbody>
    </table>` : ''}

    <div class="totales-box">
      <h3>Resumen Económico</h3>
      <div class="totales-grid">
        <div class="total-item">
          <div class="label">Cuota mensual</div>
          <div class="value">${Number(propuesta.totalMensual).toLocaleString('es-ES')} €</div>
        </div>
        <div class="total-item">
          <div class="label">Implementación</div>
          <div class="value">${Number(propuesta.totalImplementacion || 0).toLocaleString('es-ES')} €</div>
        </div>
        <div class="total-item">
          <div class="label">Estimación anual</div>
          <div class="value">${Number(propuesta.totalAnualEstimado).toLocaleString('es-ES')} €</div>
        </div>
      </div>
    </div>

    ${propuesta.sla ? `
    <h2>Acuerdo de Nivel de Servicio (SLA)</h2>
    <div class="sla-grid">
      <div class="sla-item"><div class="label">Tiempo de respuesta</div><div class="value">${propuesta.sla.tiempoRespuesta}</div></div>
      <div class="sla-item"><div class="label">Tiempo de resolución</div><div class="value">${propuesta.sla.tiempoResolucion}</div></div>
      <div class="sla-item"><div class="label">Disponibilidad</div><div class="value">${propuesta.sla.disponibilidad}</div></div>
      <div class="sla-item"><div class="label">Penalizaciones</div><div class="value">${propuesta.sla.penalizaciones}</div></div>
    </div>` : ''}

    ${propuesta.condiciones ? `
    <h2>Condiciones del Servicio</h2>
    <ul class="condiciones">
      <li><strong>Duración del contrato:</strong> ${propuesta.condiciones.duracionContrato}</li>
      <li><strong>Forma de pago:</strong> ${propuesta.condiciones.formaPago}</li>
      <li><strong>Revisión de precios:</strong> ${propuesta.condiciones.revisionPrecios}</li>
      <li><strong>Preaviso de cancelación:</strong> ${propuesta.condiciones.preaviso}</li>
    </ul>` : ''}

    <div class="validez">
      <strong>⏱ Validez:</strong> ${propuesta.validez || '30 días desde la fecha de emisión'}
    </div>

    ${propuesta.notasAdicionales ? `
    <h2>Notas Adicionales</h2>
    <p style="font-size: 12px; color: #555;">${propuesta.notasAdicionales}</p>` : ''}

    <p style="font-size: 11px; color: #666; margin-top: 15px;">* Todos los precios indicados son sin IVA. Propuesta sujeta a verificación técnica presencial de las instalaciones del cliente.</p>

    <div class="firma-section">
      <div class="firma-box">
        <div class="linea"></div>
        <div class="nombre">Internet Operadores</div>
      </div>
      <div class="firma-box">
        <div class="linea"></div>
        <div class="nombre">${lead.empresa}</div>
      </div>
    </div>

    <div class="footer">
      Internet Operadores | 900 730 034 | comercial@internetoperadores.com | www.internetoperadores.com
    </div>
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('[PROPUESTA-ECONOMICA-PDF] Error:', error);
    return new Response('Error generando PDF', { status: 500 });
  }
}
