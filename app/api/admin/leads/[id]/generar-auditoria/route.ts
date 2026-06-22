import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadMigracionWeb.findUnique({
      where: { id },
      include: {
        cuestionario: true,
      },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const OPENAI_BASE_URL = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

    // Construir contexto del lead
    const objetivos = Array.isArray(lead.objetivos) ? lead.objetivos.join(', ') : (lead.objetivos || 'No indicado');
    const respuestasSector = lead.respuestasSector 
      ? Object.entries(lead.respuestasSector as Record<string, string>).map(([k, v]) => `${k}: ${v}`).join('\n')
      : 'No indicado';

    const prompt = `Eres un consultor senior de transformación digital de Internet Operadores (empresa de telecomunicaciones y desarrollo web en Lleida, España). 
Genera una auditoría web inicial personalizada para un lead con estos datos:

- Empresa: ${lead.nombreEmpresa}
- Sector: ${lead.sector || 'No indicado'}
- Web actual: ${lead.urlWebActual || 'No indicada'}
- Nº páginas: ${lead.numPaginas || 'No indicado'}
- Tiene blog: ${lead.tieneBlog ? 'Sí' : 'No'}
- Tiene tienda: ${lead.tieneTienda ? 'Sí' : 'No'}
- Tiene formularios: ${lead.tieneFormularios ? 'Sí' : 'No'}
- Tiene área privada: ${lead.tieneAreaPrivada ? 'Sí' : 'No'}
- Frustración principal: ${lead.frustracionActual || 'No indicada'}
- Objetivos: ${objetivos}
- Respuestas sector: ${respuestasSector}
- Software actual: ${lead.softwareActual || 'No indicado'}
- Necesita integración: ${lead.necesitaIntegracion ? 'Sí' : 'No'}
- Tiene API: ${lead.tieneApi || 'No indicado'}
- Presupuesto: ${lead.presupuesto || 'No indicado'}
- Plazo: ${lead.fechaLimite || 'No indicado'}

Genera un JSON con esta estructura exacta:
{
  "diagnostico": "Texto de 2-3 párrafos analizando la situación actual de la web del cliente, sus problemas y oportunidades. Sé específico con su sector.",
  "problemasDetectados": ["lista de 3-5 problemas concretos detectados basados en sus datos"],
  "oportunidades": ["lista de 3-4 oportunidades de mejora específicas para su sector"],
  "solucionPropuesta": "Texto de 2 párrafos explicando qué tipo de web/solución necesitan y por qué Internet Operadores es el partner ideal",
  "estimacionAlcance": {
    "tipo": "tipo de proyecto (ej: Web corporativa B2B, E-commerce, Portal con área privada, etc.)",
    "complejidad": "Media/Alta/Muy alta",
    "plazoEstimado": "X-Y semanas",
    "rangoInversion": { "min": número, "max": número }
  },
  "tecnologiasRecomendadas": ["lista de 3-5 tecnologías recomendadas"],
  "siguientesPasos": ["lista de 3-4 pasos siguientes"]
}

Responde SOLO con el JSON, sin markdown ni explicaciones. Los precios deben ser realistas para el mercado español (webs corporativas 3000-8000€, e-commerce 6000-15000€, portales complejos 10000-25000€).`;

    let auditoria: any;

    if (OPENAI_API_KEY) {
      try {
        const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        if (!response.ok) {
          throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          auditoria = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No se pudo parsear la respuesta de IA');
        }
      } catch (error) {
        console.error('[GENERAR-AUDITORIA] Error IA:', error);
        // Fallback sin IA
        auditoria = generarAuditoriaFallback(lead);
      }
    } else {
      auditoria = generarAuditoriaFallback(lead);
    }

    // Guardar la auditoría en notas del lead (como JSON serializado en un campo)
    // Usamos informePdfUrl para cachear el HTML del informe
    const htmlInforme = generarHTMLAuditoria(lead, auditoria);

    const notaActual = lead.notas || '';
    const nuevaNota = `[${new Date().toLocaleDateString('es-ES')} ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}] Auditoría inicial generada. Alcance: ${auditoria.estimacionAlcance?.tipo || 'Web'} (${auditoria.estimacionAlcance?.rangoInversion?.min?.toLocaleString('es-ES')}-${auditoria.estimacionAlcance?.rangoInversion?.max?.toLocaleString('es-ES')}€)`;

    await prisma.leadMigracionWeb.update({
      where: { id },
      data: {
        informePdfUrl: htmlInforme,
        estado: lead.estado === 'NUEVO' ? 'EN_REVISION' : lead.estado,
        notas: nuevaNota + (notaActual ? '\n' + notaActual : ''),
        fechaAuditoriaGenerada: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      auditoria,
    });
  } catch (error: any) {
    console.error('[GENERAR-AUDITORIA] Error:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

function generarAuditoriaFallback(lead: any): any {
  return {
    diagnostico: `${lead.nombreEmpresa} cuenta actualmente con una web de ${lead.numPaginas || 'varias'} páginas en el sector ${lead.sector || 'empresarial'}. Basándonos en la información proporcionada, la frustración principal es: "${lead.frustracionActual || 'web desactualizada'}". Esto es un problema común en empresas del sector que no han actualizado su presencia digital en los últimos años.\n\nLa buena noticia es que hay un margen de mejora significativo. Con las tecnologías actuales, es posible construir una web que no solo sea visualmente atractiva, sino que trabaje activamente para captar clientes y automatizar procesos.`,
    problemasDetectados: [
      'Web actual no optimizada para captación de leads',
      'Falta de integración con herramientas de gestión',
      'Diseño no adaptado a las expectativas actuales del sector',
      'Ausencia de estrategia de contenidos orientada a SEO',
    ],
    oportunidades: [
      'Automatizar la captación y cualificación de leads',
      'Integrar la web con el software de gestión existente',
      'Posicionar la empresa como referente digital en su sector',
    ],
    solucionPropuesta: `Para ${lead.nombreEmpresa} recomendamos una web profesional construida con tecnología moderna (Next.js + headless CMS) que permita gestionar contenidos de forma autónoma, captar leads cualificados y proyectar una imagen de empresa innovadora.\n\nInternet Operadores cuenta con más de 20 años de experiencia en transformación digital para empresas. Nuestro equipo de desarrollo propio garantiza un proyecto llave en mano con soporte continuado.`,
    estimacionAlcance: {
      tipo: lead.tieneTienda ? 'E-commerce' : lead.tieneAreaPrivada ? 'Portal con área privada' : 'Web corporativa',
      complejidad: lead.necesitaIntegracion ? 'Alta' : 'Media',
      plazoEstimado: lead.necesitaIntegracion ? '8-12 semanas' : '5-8 semanas',
      rangoInversion: {
        min: lead.tieneTienda ? 6000 : lead.tieneAreaPrivada ? 5000 : 3000,
        max: lead.tieneTienda ? 15000 : lead.tieneAreaPrivada ? 10000 : 8000,
      },
    },
    tecnologiasRecomendadas: ['Next.js', 'TailwindCSS', 'Headless CMS', lead.necesitaIntegracion ? 'API REST' : 'Formularios inteligentes'].filter(Boolean),
    siguientesPasos: [
      'Completar cuestionario técnico (10 min)',
      'Recibir presupuesto a precio cerrado (48h)',
      'Reunión de kick-off y planificación',
      'Desarrollo y entregas iterativas',
    ],
  };
}

function generarHTMLAuditoria(lead: any, auditoria: any): string {
  const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const cuestionarioToken = lead.cuestionario?.token || '';
  const cuestionarioUrl = cuestionarioToken ? `www.internetoperadores.com/cuestionario/${cuestionarioToken}` : '';

  const problemasHtml = (auditoria.problemasDetectados || [])
    .map((p: string) => `<div class="problema-item"><span class="icon">⚠</span><span>${p}</span></div>`)
    .join('');

  const oportunidadesHtml = (auditoria.oportunidades || [])
    .map((o: string) => `<div class="oportunidad-item"><span class="icon">✓</span><span>${o}</span></div>`)
    .join('');

  const techHtml = (auditoria.tecnologiasRecomendadas || [])
    .map((t: string) => `<span class="tech-badge">${t}</span>`)
    .join('');

  // Contexto sector
  let contextoSector = '';
  const sector = (lead.sector || '').toLowerCase();
  if (sector.includes('construc') || sector.includes('reform') || sector.includes('inmobil')) {
    contextoSector = 'En el sector de la construcción y reformas, la web es su mejor comercial: trabaja 24/7, filtra clientes que no encajan y posiciona su empresa frente a la competencia que sigue dependiendo del boca a boca.';
  } else if (sector.includes('salud') || sector.includes('medic') || sector.includes('farmac')) {
    contextoSector = 'En el sector salud, la confianza digital es fundamental. Los pacientes buscan online antes de elegir profesional. Una web profesional con sistema de citas y contenido de valor marca la diferencia.';
  } else if (sector.includes('hostel') || sector.includes('restaur') || sector.includes('turism')) {
    contextoSector = 'En hostelería y turismo, el 80% de las reservas empiezan online. Una web que no convierte es dinero que se va a la competencia. Necesita una presencia digital que venda por usted.';
  } else if (sector.includes('retail') || sector.includes('comerci') || sector.includes('tienda')) {
    contextoSector = 'En el comercio, la línea entre lo físico y lo digital se ha difuminado. Sus clientes esperan poder comprar, consultar stock y contactar online. Si no está ahí, su competencia sí lo estará.';
  } else if (sector.includes('indust') || sector.includes('fabric')) {
    contextoSector = 'En el sector industrial, la web B2B es su carta de presentación ante compradores que investigan online antes de contactar. Un catálogo técnico bien estructurado y un proceso de solicitud de presupuesto ágil son la clave.';
  } else {
    contextoSector = 'En un mercado cada vez más digital, su web es la primera impresión que reciben el 90% de sus potenciales clientes. No es un gasto: es la inversión con mayor retorno si se hace bien.';
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Auditoría Web - ${lead.nombreEmpresa}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', sans-serif; font-size: 11px; line-height: 1.6; color: #333; }
    .page { width: 210mm; min-height: 297mm; padding: 25mm 20mm; margin: 0 auto; position: relative; page-break-after: always; }
    .page:last-child { page-break-after: avoid; min-height: auto; }
    .portada { display: flex; flex-direction: column; justify-content: flex-start; padding-top: 30mm; }
    .logo-text { font-size: 22px; font-weight: 300; color: #333; }
    .logo-text span { color: #EA580C; font-weight: 700; }
    .portada h1 { font-size: 34px; font-weight: 800; color: #1a1a1a; margin-top: 30px; line-height: 1.15; }
    .portada h1 em { color: #EA580C; font-style: normal; }
    .portada-subtitulo { font-size: 15px; color: #555; margin-top: 8px; font-weight: 500; }
    .portada-claim { margin-top: 30px; background: linear-gradient(135deg, #fff8f3 0%, #fff 100%); border: 2px solid #EA580C; border-radius: 12px; padding: 25px; }
    .portada-claim h3 { color: #EA580C; font-size: 14px; margin-bottom: 10px; font-weight: 700; }
    .portada-claim p { font-size: 12px; color: #444; line-height: 1.7; }
    .portada-datos { margin-top: 35px; font-size: 12px; color: #555; }
    .portada-datos p { margin-bottom: 5px; }
    .portada-datos strong { color: #333; }
    .portada-badge { margin-top: 30px; display: flex; gap: 15px; }
    .badge-item { background: #f5f5f5; border-radius: 8px; padding: 12px 16px; text-align: center; flex: 1; }
    .badge-item .num { font-size: 20px; font-weight: 800; color: #EA580C; }
    .badge-item .label { font-size: 9px; color: #666; margin-top: 3px; }
    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #EA580C; padding-bottom: 10px; margin-bottom: 25px; }
    .header-logo { font-size: 16px; font-weight: 300; }
    .header-logo span { color: #EA580C; font-weight: 700; }
    .header-slogan { font-size: 9px; font-weight: 700; color: #666; letter-spacing: 1px; }
    h2.seccion-titulo { font-size: 20px; font-weight: 700; color: #1a1a1a; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 1px solid #eee; }
    h2.seccion-titulo em { color: #EA580C; font-style: normal; }
    h3.bloque-titulo { font-size: 13px; font-weight: 700; color: #333; margin: 20px 0 10px 0; padding-left: 12px; border-left: 3px solid #EA580C; }
    .diagnostico { font-size: 11.5px; line-height: 1.8; color: #444; margin-bottom: 20px; text-align: justify; }
    .diagnostico p { margin-bottom: 12px; }
    .problema-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; padding: 10px 15px; background: #fef2f2; border-radius: 8px; border-left: 3px solid #dc2626; }
    .problema-item .icon { color: #dc2626; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .problema-item span { font-size: 11px; color: #444; }
    .oportunidad-item { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 10px; padding: 10px 15px; background: #f0fdf4; border-radius: 8px; border-left: 3px solid #16a34a; }
    .oportunidad-item .icon { color: #16a34a; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .oportunidad-item span { font-size: 11px; color: #444; }
    .estimacion-box { background: linear-gradient(135deg, #fff8f3 0%, #fff 100%); border: 2px solid #EA580C; border-radius: 12px; padding: 25px; text-align: center; margin: 25px 0; }
    .estimacion-box h3 { color: #EA580C; font-size: 14px; margin-bottom: 10px; }
    .estimacion-box .rango { font-size: 36px; font-weight: 800; color: #1a1a1a; }
    .estimacion-box .rango-unidad { font-size: 16px; color: #666; font-weight: 400; }
    .estimacion-box .nota { font-size: 10px; color: #888; margin-top: 10px; }
    .estimacion-box .meta { display: flex; justify-content: center; gap: 25px; margin-top: 12px; }
    .estimacion-box .meta-item { text-align: center; }
    .estimacion-box .meta-item .val { font-size: 13px; font-weight: 700; color: #333; }
    .estimacion-box .meta-item .lbl { font-size: 9px; color: #888; }
    .tech-badge { display: inline-block; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 12px; font-size: 10px; font-weight: 600; color: #374151; margin: 3px 5px 3px 0; }
    .diferencia-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 20px 0; }
    .diferencia-item { padding: 15px; border-radius: 8px; }
    .diferencia-item.malo { background: #fef2f2; border: 1px solid #fecaca; }
    .diferencia-item.bueno { background: #f0fdf4; border: 1px solid #bbf7d0; }
    .diferencia-item h4 { font-size: 11px; margin-bottom: 8px; font-weight: 700; }
    .diferencia-item.malo h4 { color: #dc2626; }
    .diferencia-item.bueno h4 { color: #16a34a; }
    .diferencia-item ul { list-style: none; padding: 0; }
    .diferencia-item ul li { font-size: 10px; color: #555; margin-bottom: 4px; padding-left: 15px; position: relative; }
    .diferencia-item.malo ul li::before { content: "✗"; position: absolute; left: 0; color: #dc2626; font-weight: 700; }
    .diferencia-item.bueno ul li::before { content: "✓"; position: absolute; left: 0; color: #16a34a; font-weight: 700; }
    .cta-box { background: #EA580C; border-radius: 12px; padding: 30px; text-align: center; color: white; margin: 25px 0; }
    .cta-box h3 { font-size: 18px; font-weight: 700; margin-bottom: 10px; }
    .cta-box p { font-size: 12px; opacity: 0.9; margin-bottom: 15px; line-height: 1.6; }
    .cta-box .url { background: white; color: #EA580C; font-weight: 700; font-size: 13px; padding: 12px 20px; border-radius: 8px; display: inline-block; }
    .cta-box .tiempo { margin-top: 12px; font-size: 11px; opacity: 0.8; }
    .proceso-pasos { margin: 20px 0; }
    .paso { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 20px; }
    .paso-num { width: 36px; height: 36px; background: #EA580C; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
    .paso-content h4 { font-size: 12px; font-weight: 700; color: #333; margin-bottom: 3px; }
    .paso-content p { font-size: 10.5px; color: #666; line-height: 1.5; }
    .paso-highlight { background: #fff8f3; border: 1px solid #fed7aa; border-radius: 8px; padding: 12px 15px; }
    .contraportada { background: #EA580C; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; color: white; height: 247mm; margin: -25mm -20mm; padding: 25mm 20mm; }
    .contraportada .logo-contra { font-size: 32px; font-weight: 300; }
    .contraportada .logo-contra span { font-weight: 700; }
    .contraportada .slogan-contra { font-size: 11px; letter-spacing: 2px; margin-top: 10px; font-weight: 600; }
    .contraportada .separador { width: 60px; height: 3px; background: white; margin: 30px auto; }
    .contraportada .contacto-contra h3 { font-size: 18px; margin-bottom: 8px; }
    .contraportada .contacto-contra p { font-size: 12px; opacity: 0.9; margin-bottom: 4px; }
    .contraportada .footer-contra { margin-top: 40px; font-size: 10px; opacity: 0.7; }
    .page-footer { position: absolute; bottom: 15mm; left: 0; right: 0; text-align: center; font-size: 9px; color: #999; }
    .confidencial { background: #f5f5f5; border-radius: 6px; padding: 10px 15px; font-size: 9px; color: #666; text-align: center; margin-top: 20px; }
    @media print { .page { margin: 0; padding: 20mm 18mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>

  <!-- PORTADA -->
  <div class="page portada">
    <div class="logo-text">internet<span>operadores</span></div>
    
    <h1>Su nueva web,<br><em>sin perder el tiempo.</em></h1>
    <p class="portada-subtitulo">Auditoría web personalizada para ${lead.nombreEmpresa}</p>

    <div class="portada-claim">
      <h3>¿POR QUÉ RECIBE ESTE DOCUMENTO?</h3>
      <p>${contextoSector}</p>
      <p style="margin-top:10px;">Hemos analizado la información que nos ha proporcionado y le presentamos un <strong>diagnóstico inicial personalizado</strong>. No es un catálogo genérico: está pensado para su realidad y su sector.</p>
    </div>

    <div class="portada-datos">
      <p><strong>Preparado para:</strong> ${lead.contacto} — ${lead.nombreEmpresa}</p>
      <p><strong>Email:</strong> ${lead.email}</p>
      ${lead.telefono ? `<p><strong>Teléfono:</strong> ${lead.telefono}</p>` : ''}
      ${lead.urlWebActual ? `<p><strong>Web actual:</strong> ${lead.urlWebActual}</p>` : ''}
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Ref:</strong> AUD-WEB-${lead.id.substring(0, 8).toUpperCase()}</p>
    </div>

    <div class="portada-badge">
      <div class="badge-item">
        <div class="num">+20</div>
        <div class="label">años de experiencia</div>
      </div>
      <div class="badge-item">
        <div class="num">+150</div>
        <div class="label">webs desarrolladas</div>
      </div>
      <div class="badge-item">
        <div class="num">48h</div>
        <div class="label">presupuesto cerrado</div>
      </div>
      <div class="badge-item">
        <div class="num">0</div>
        <div class="label">reuniones previas</div>
      </div>
    </div>

    <div class="page-footer">Documento confidencial — Internet Operadores © ${new Date().getFullYear()}</div>
  </div>

  <!-- PÁGINA 2: DIAGNÓSTICO + POR QUÉ SOMOS DIFERENTES -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">AUDITORÍA WEB PERSONALIZADA</div>
    </div>

    <h2 class="seccion-titulo">Diagnóstico de <em>${lead.nombreEmpresa}</em></h2>
    <div class="diagnostico">
      ${(auditoria.diagnostico || '').split('\n').filter((p: string) => p.trim()).map((p: string) => `<p>${p}</p>`).join('')}
    </div>

    <h3 class="bloque-titulo">Problemas detectados</h3>
    ${problemasHtml}

    <h3 class="bloque-titulo">Oportunidades de mejora</h3>
    ${oportunidadesHtml}

    <div class="page-footer">Auditoría Web — ${lead.nombreEmpresa} — Pág. 2</div>
  </div>

  <!-- PÁGINA 3: SOLUCIÓN + ESTIMACIÓN + DIFERENCIACIÓN -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">SOLUCIÓN PROPUESTA</div>
    </div>

    <h2 class="seccion-titulo">Lo que proponemos para <em>${lead.nombreEmpresa}</em></h2>
    <div class="diagnostico">
      ${(auditoria.solucionPropuesta || '').split('\n').filter((p: string) => p.trim()).map((p: string) => `<p>${p}</p>`).join('')}
    </div>

    <h3 class="bloque-titulo">Tecnologías recomendadas</h3>
    <div style="margin-bottom:20px;">${techHtml}</div>

    <div class="estimacion-box">
      <h3>Estimación de inversión</h3>
      <div class="rango">
        ${auditoria.estimacionAlcance?.rangoInversion?.min?.toLocaleString('es-ES') || '?'} — ${auditoria.estimacionAlcance?.rangoInversion?.max?.toLocaleString('es-ES') || '?'}
        <span class="rango-unidad"> €</span>
      </div>
      <div class="meta">
        <div class="meta-item"><div class="val">${auditoria.estimacionAlcance?.tipo || 'Web'}</div><div class="lbl">Tipo proyecto</div></div>
        <div class="meta-item"><div class="val">${auditoria.estimacionAlcance?.complejidad || 'Media'}</div><div class="lbl">Complejidad</div></div>
        <div class="meta-item"><div class="val">${auditoria.estimacionAlcance?.plazoEstimado || '6-10 sem'}</div><div class="lbl">Plazo</div></div>
      </div>
      <p class="nota">Precio final cerrado tras completar el cuestionario técnico (10 min). Sin sorpresas.</p>
    </div>

    <h3 class="bloque-titulo">¿Por qué Internet Operadores?</h3>
    <div class="diferencia-grid">
      <div class="diferencia-item malo">
        <h4>Lo que hace la competencia</h4>
        <ul>
          <li>Reunión "para conocernos" (1-2h)</li>
          <li>Segunda reunión "de briefing" (1-2h)</li>
          <li>Esperar 2-4 semanas al presupuesto</li>
          <li>Presupuesto genérico tipo catálogo</li>
          <li>Más reuniones "para ajustar"</li>
        </ul>
      </div>
      <div class="diferencia-item bueno">
        <h4>Lo que hacemos nosotros</h4>
        <ul>
          <li>Analizamos sus datos (ya hecho ✓)</li>
          <li>Le enviamos esta auditoría (este PDF ✓)</li>
          <li>Usted rellena cuestionario (10 min)</li>
          <li>Precio cerrado en 48h</li>
          <li>Una reunión: para arrancar el proyecto</li>
        </ul>
      </div>
    </div>

    <div class="page-footer">Auditoría Web — ${lead.nombreEmpresa} — Pág. 3</div>
  </div>

  <!-- PÁGINA 4: SIGUIENTE PASO + CTA -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">SIGUIENTE PASO</div>
    </div>

    <h2 class="seccion-titulo">Su siguiente paso: <em>10 minutos</em> para un precio cerrado</h2>
    
    <p style="font-size:12px;color:#444;line-height:1.8;margin-bottom:25px;">
      Ya tiene el diagnóstico inicial. Ahora solo necesitamos <strong>10 minutos de su tiempo</strong> 
      para darle un presupuesto definitivo sin sorpresas. Así de simple:
    </p>

    <div class="proceso-pasos">
      <div class="paso">
        <div class="paso-num">1</div>
        <div class="paso-content paso-highlight">
          <h4>Rellene el cuestionario técnico online</h4>
          <p>10 minutos, cuando le venga bien. Sin agendar nada. Preguntas específicas sobre su negocio para dimensionar exactamente lo que necesita su nueva web.</p>
        </div>
      </div>
      <div class="paso">
        <div class="paso-num">2</div>
        <div class="paso-content">
          <h4>Reciba su presupuesto a precio cerrado (48h)</h4>
          <p>Nuestro equipo analiza sus respuestas y le envía un presupuesto desglosado por partidas. Sin letra pequeña, sin costes ocultos, sin "depende".</p>
        </div>
      </div>
      <div class="paso">
        <div class="paso-num">3</div>
        <div class="paso-content">
          <h4>Decida con tranquilidad</h4>
          <p>Sin presión, sin compromiso. Si le encaja, arrancamos el proyecto. Si no, tan amigos. Así de fácil.</p>
        </div>
      </div>
    </div>

    ${cuestionarioUrl ? `
    <div class="cta-box">
      <h3>Complete el cuestionario ahora</h3>
      <p>No necesita agendar nada. Puede hacerlo desde el móvil, la tablet o el ordenador.<br>Cuando tenga un rato libre, en 10 minutos lo tiene hecho.</p>
      <div class="url">${cuestionarioUrl}</div>
      <p class="tiempo">⏱ 10 minutos · 📱 Compatible con móvil · 🔒 100% confidencial</p>
    </div>` : `
    <div class="cta-box">
      <h3>¿Listo para dar el siguiente paso?</h3>
      <p>Contacte con nosotros y le enviaremos el enlace a su cuestionario técnico personalizado.<br>En 48h tendrá su precio cerrado.</p>
      <div class="url">900 730 034 (gratuito) · comercial@internetoperadores.com</div>
      <p class="tiempo">Sin compromiso · Sin reuniones innecesarias</p>
    </div>`}

    <div style="margin-top:25px;background:#f9fafb;border-radius:8px;padding:15px;border:1px solid #e5e7eb;">
      <p style="font-size:11px;color:#555;text-align:center;margin:0;">
        <strong>¿Prefiere hablar primero?</strong> Sin problema. Llámenos al <strong>900 730 034</strong> (gratuito) 
        o escríbanos a <strong>comercial@internetoperadores.com</strong>. Pero le prometemos que con el cuestionario 
        iremos más rápido y le daremos un precio más ajustado.
      </p>
    </div>

    <div class="confidencial" style="margin-top:25px;">
      Este documento es confidencial y está destinado exclusivamente a ${lead.nombreEmpresa}. 
      Las estimaciones indicadas son orientativas hasta completar el cuestionario técnico.
      Validez: 30 días desde la fecha de emisión.
    </div>

    <div class="page-footer">Auditoría Web — ${lead.nombreEmpresa} — Pág. 4</div>
  </div>

  <!-- CONTRAPORTADA -->
  <div class="page">
    <div class="contraportada">
      <div class="logo-contra">internet<span>operadores</span></div>
      <div class="slogan-contra">DESARROLLO WEB PROFESIONAL</div>
      <div class="separador"></div>
      <div class="contacto-contra">
        <h3>¿Hablamos?</h3>
        <p>900 730 034 (gratuito)</p>
        <p>comercial@internetoperadores.com</p>
        <p>www.internetoperadores.com</p>
      </div>
      <div class="footer-contra">
        <p>Internet Operadores — Partner tecnológico de confianza</p>
        <p>Más de 20 años transformando empresas digitalmente</p>
      </div>
    </div>
  </div>

</body>
</html>`;
}
