import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function generarHTMLPropuestaMantenimiento(lead: any): string {
  const datos = lead.datos || {};
  const oferta = datos.ofertaGenerada || {};
  const fecha = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const serviciosHtml = (oferta.serviciosRecomendados || [])
    .map((s: string, i: number) => `
      <tr>
        <td style="width:30px;text-align:center;font-weight:700;color:#E87A2E;">${i + 1}</td>
        <td>${s}</td>
      </tr>`)
    .join('');

  const puntosHtml = (oferta.puntosFuertes || [])
    .map((p: string) => `
      <div class="punto-fuerte">
        <span class="check">✓</span>
        <span>${p}</span>
      </div>`)
    .join('');

  const pasosHtml = (oferta.siguientesPasos || [])
    .map((p: string, i: number) => `
      <tr>
        <td style="width:30px;text-align:center;font-weight:700;color:#E87A2E;">${i + 1}</td>
        <td>${p}</td>
      </tr>`)
    .join('');

  // Cuestionario técnico avanzado para guardias nocturnas y 24/7
  const cuestionarioAvanzado = [
    {
      seccion: 'INFRAESTRUCTURA ACTUAL',
      preguntas: [
        '¿Cuántos servidores físicos y virtuales tienen actualmente? ¿Qué sistema operativo utilizan?',
        '¿Tienen infraestructura en la nube (AWS, Azure, Google Cloud)? ¿Qué servicios?',
        '¿Cuál es la topología de red actual? (switches, firewalls, VPN, SD-WAN...)',
        '¿Tienen sistema de virtualización? (VMware, Hyper-V, Proxmox...)',
        '¿Qué solución de backup utilizan actualmente? ¿Se prueban las restauraciones periódicamente?',
      ]
    },
    {
      seccion: 'SISTEMAS CRÍTICOS Y PRODUCCIÓN 24H',
      preguntas: [
        '¿Qué sistemas son imprescindibles para mantener la producción? (ERP, SCADA, MES, PLCs...)',
        '¿Cuál es el tiempo máximo de parada aceptable (RTO) para cada sistema crítico?',
        '¿Tienen redundancia en los sistemas de producción? (servidores en HA, doble línea de internet...)',
        '¿Qué pasa actualmente si un sistema crítico falla durante la noche? ¿Quién responde?',
        '¿Tienen documentado un plan de contingencia o disaster recovery?',
      ]
    },
    {
      seccion: 'COBERTURA NOCTURNA Y GUARDIAS 24/7',
      preguntas: [
        '¿En qué horario exacto necesitan cobertura nocturna? (ej: 22:00 a 06:00, fines de semana...)',
        '¿Qué tipo de incidencias suelen ocurrir fuera de horario? (caídas de red, fallos de servidor, errores ERP...)',
        '¿Necesitan presencia física nocturna o es suficiente con soporte remoto + desplazamiento si es necesario?',
        '¿Cuál es el tiempo de respuesta máximo aceptable para incidencias nocturnas? (15min, 30min, 1h...)',
        '¿Tienen personal de planta/fábrica que pueda ejecutar instrucciones básicas guiadas por teléfono?',
        '¿Necesitan monitorización proactiva 24/7 con alertas automáticas o solo respuesta reactiva?',
      ]
    },
    {
      seccion: 'INTEGRACIÓN CON EQUIPO IT INTERNO',
      preguntas: [
        '¿Cuántas personas forman su equipo IT interno? ¿Qué horario cubren?',
        '¿Qué herramientas de ticketing/gestión utilizan actualmente? (ServiceNow, Jira, Freshdesk...)',
        '¿Cómo prefieren el protocolo de escalado? (niveles, tiempos, contactos de guardia...)',
        '¿Necesitan informes periódicos de las actuaciones nocturnas? ¿Con qué frecuencia?',
        '¿Tienen acceso VPN configurado para soporte remoto externo?',
      ]
    },
    {
      seccion: 'SLA Y EXPECTATIVAS',
      preguntas: [
        '¿Qué SLA de disponibilidad necesitan para sus sistemas críticos? (99.5%, 99.9%, 99.99%...)',
        '¿Tienen penalizaciones contractuales con sus clientes por paradas de producción?',
        '¿Cuál es el coste estimado por hora de parada de producción para su empresa?',
        '¿Necesitan un período de transición/onboarding? ¿De cuánto tiempo?',
        '¿Prefieren contrato anual con revisión o compromiso a más largo plazo?',
      ]
    },
  ];

  const cuestionarioHtml = cuestionarioAvanzado.map(seccion => `
    <div class="cuestionario-seccion">
      <h3 class="bloque-titulo">${seccion.seccion}</h3>
      <table class="tabla-cuestionario">
        <tbody>
          ${seccion.preguntas.map((p, i) => `
            <tr>
              <td class="pregunta-num">${i + 1}</td>
              <td class="pregunta-texto">${p}</td>
            </tr>
            <tr>
              <td></td>
              <td class="respuesta-espacio"></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propuesta Mantenimiento IT - ${lead.empresa}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #333;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 25mm 20mm;
      margin: 0 auto;
      position: relative;
      page-break-after: always;
    }

    .page:last-child {
      page-break-after: avoid;
      min-height: auto;
    }

    /* PORTADA */
    .portada {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding-top: 35mm;
    }

    .logo-text {
      font-size: 22px;
      font-weight: 300;
      color: #333;
    }

    .logo-text span {
      color: #E87A2E;
      font-weight: 700;
    }

    .portada h1 {
      font-size: 32px;
      font-weight: 700;
      color: #E87A2E;
      margin-top: 30px;
      line-height: 1.2;
    }

    .portada h2 {
      font-size: 18px;
      font-weight: 600;
      color: #333;
      margin-top: 8px;
    }

    .portada-subtitulo {
      font-size: 14px;
      color: #666;
      margin-top: 5px;
    }

    .portada-cita {
      border-left: 3px solid #E87A2E;
      padding-left: 15px;
      margin-top: 30px;
      font-style: italic;
      color: #555;
      font-size: 12px;
      line-height: 1.6;
    }

    .portada-datos {
      margin-top: 40px;
      font-size: 12px;
    }

    .portada-datos p {
      margin-bottom: 5px;
    }

    .portada-datos strong {
      color: #333;
    }

    .portada-box {
      margin-top: 35px;
      border: 2px solid #E87A2E;
      border-radius: 8px;
      padding: 20px;
    }

    .portada-box h4 {
      color: #E87A2E;
      font-size: 13px;
      margin-bottom: 8px;
    }

    .portada-box p {
      font-size: 11px;
      color: #555;
      margin-bottom: 3px;
    }

    /* HEADER */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #E87A2E;
      padding-bottom: 10px;
      margin-bottom: 25px;
    }

    .header-logo {
      font-size: 16px;
      font-weight: 300;
    }

    .header-logo span {
      color: #E87A2E;
      font-weight: 700;
    }

    .header-slogan {
      font-size: 9px;
      font-weight: 700;
      color: #666;
      letter-spacing: 1px;
    }

    /* SECCIONES */
    h2.seccion-titulo {
      font-size: 20px;
      font-weight: 700;
      color: #E87A2E;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }

    h3.bloque-titulo {
      font-size: 12px;
      font-weight: 700;
      color: #333;
      margin: 18px 0 10px 0;
      padding-left: 10px;
      border-left: 3px solid #E87A2E;
    }

    /* TABLAS */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 10px;
    }

    table thead tr {
      background: #E87A2E;
      color: white;
    }

    table th {
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 10px;
    }

    table td {
      padding: 8px 10px;
      border-bottom: 1px solid #eee;
      vertical-align: top;
    }

    table tbody tr:nth-child(even) {
      background: #fafafa;
    }

    /* PROPUESTA VALOR */
    .propuesta-valor {
      font-size: 11px;
      line-height: 1.7;
      color: #444;
      margin-bottom: 20px;
      text-align: justify;
    }

    /* PUNTOS FUERTES */
    .punto-fuerte {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      margin-bottom: 12px;
      padding: 10px 15px;
      background: #f8faf8;
      border-radius: 6px;
      border-left: 3px solid #28a745;
    }

    .punto-fuerte .check {
      color: #28a745;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .punto-fuerte span {
      font-size: 11px;
      color: #444;
    }

    /* ESTIMACIÓN */
    .estimacion-box {
      background: #fff9f5;
      border: 2px solid #E87A2E;
      border-radius: 10px;
      padding: 25px;
      text-align: center;
      margin: 25px 0;
    }

    .estimacion-box h3 {
      color: #E87A2E;
      font-size: 14px;
      margin-bottom: 10px;
    }

    .estimacion-box .rango {
      font-size: 36px;
      font-weight: 700;
      color: #333;
    }

    .estimacion-box .rango-unidad {
      font-size: 16px;
      color: #666;
      font-weight: 400;
    }

    .estimacion-box .nota {
      font-size: 10px;
      color: #888;
      margin-top: 10px;
    }

    /* CUESTIONARIO */
    .cuestionario-seccion {
      margin-bottom: 20px;
    }

    .tabla-cuestionario {
      width: 100%;
    }

    .tabla-cuestionario td {
      border-bottom: none;
      padding: 5px 10px;
    }

    .pregunta-num {
      width: 25px;
      font-weight: 700;
      color: #E87A2E;
      vertical-align: top;
      padding-top: 8px !important;
    }

    .pregunta-texto {
      font-size: 10.5px;
      color: #333;
      padding-top: 8px !important;
    }

    .respuesta-espacio {
      border-bottom: 1px solid #ddd !important;
      height: 30px;
      padding-bottom: 0 !important;
    }

    /* CONTRAPORTADA */
    .contraportada {
      background: #E87A2E;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      color: white;
      height: 247mm;
      margin: -25mm -20mm;
      padding: 25mm 20mm;
    }

    .contraportada .logo-contra {
      font-size: 32px;
      font-weight: 300;
    }

    .contraportada .logo-contra span {
      font-weight: 700;
    }

    .contraportada .slogan-contra {
      font-size: 11px;
      letter-spacing: 2px;
      margin-top: 10px;
      font-weight: 600;
    }

    .contraportada .separador {
      width: 60px;
      height: 3px;
      background: white;
      margin: 30px auto;
    }

    .contraportada .contacto-contra h3 {
      font-size: 18px;
      margin-bottom: 8px;
    }

    .contraportada .contacto-contra p {
      font-size: 12px;
      opacity: 0.9;
      margin-bottom: 4px;
    }

    .contraportada .footer-contra {
      margin-top: 40px;
      font-size: 10px;
      opacity: 0.7;
    }

    /* FOOTER */
    .page-footer {
      position: absolute;
      bottom: 15mm;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 9px;
      color: #999;
    }

    .confidencial {
      background: #f0f0f0;
      border-radius: 4px;
      padding: 8px 15px;
      font-size: 9px;
      color: #666;
      text-align: center;
      margin-top: 20px;
    }

    @media print {
      .page { margin: 0; padding: 20mm 18mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>

  <!-- PORTADA -->
  <div class="page portada">
    <div class="logo-text">internet<span>operadores</span></div>
    
    <h1>Propuesta de Servicios<br>Mantenimiento IT</h1>
    <h2>${lead.empresa}</h2>
    <p class="portada-subtitulo">Servicios IT Gestionados — Cobertura ${datos.coberturaHoraria || '24/7'}</p>

    <div class="portada-cita">
      "Garantizamos la continuidad operativa de su negocio con un equipo técnico especializado, 
      monitorización proactiva y tiempos de respuesta garantizados por SLA."
    </div>

    <div class="portada-datos">
      <p><strong>Preparado para:</strong> ${lead.nombre} — ${lead.empresa}</p>
      <p><strong>Email:</strong> ${lead.email}</p>
      ${lead.telefono ? `<p><strong>Teléfono:</strong> ${lead.telefono}</p>` : ''}
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Referencia:</strong> PROP-MIT-${lead.id.substring(0, 8).toUpperCase()}</p>
    </div>

    <div class="portada-box">
      <h4>RESUMEN EJECUTIVO</h4>
      <p><strong>Tipo de servicio:</strong> Mantenimiento IT Gestionado — Mediana/Gran Empresa</p>
      <p><strong>Equipos a gestionar:</strong> ${datos.numEquipos || 'A determinar'}</p>
      <p><strong>Servidores:</strong> ${datos.numServidores || 'A determinar'}</p>
      <p><strong>Cobertura:</strong> ${datos.coberturaHoraria || '24x7'}</p>
      <p><strong>Sistemas críticos:</strong> ${datos.sistemasCriticos || 'A determinar en auditoría'}</p>
      <p><strong>Estimación mensual:</strong> ${oferta.estimacionRango ? `${oferta.estimacionRango.min?.toLocaleString('es-ES')} - ${oferta.estimacionRango.max?.toLocaleString('es-ES')} €/mes` : 'A determinar tras auditoría'}</p>
    </div>

    <div class="page-footer">Documento confidencial — Internet Operadores © ${new Date().getFullYear()}</div>
  </div>

  <!-- PÁGINA 2: PROPUESTA DE VALOR -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT GESTIONADOS</div>
    </div>

    <h2 class="seccion-titulo">Propuesta de valor</h2>
    <div class="propuesta-valor">
      ${(oferta.propuestaValor || '').split('\n').filter((p: string) => p.trim()).map((p: string) => `<p style="margin-bottom:12px">${p}</p>`).join('')}
    </div>

    <h2 class="seccion-titulo" style="margin-top:30px">¿Por qué Internet Operadores?</h2>
    ${puntosHtml}

    <div class="page-footer">Propuesta Mantenimiento IT — ${lead.empresa} — Pág. 2</div>
  </div>

  <!-- PÁGINA 3: SERVICIOS Y ESTIMACIÓN -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT GESTIONADOS</div>
    </div>

    <h2 class="seccion-titulo">Servicios recomendados</h2>
    <p style="font-size:11px;color:#555;margin-bottom:15px;">
      Basándonos en las necesidades identificadas para ${lead.empresa}, recomendamos los siguientes servicios:
    </p>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Servicio</th>
        </tr>
      </thead>
      <tbody>
        ${serviciosHtml}
      </tbody>
    </table>

    <div class="estimacion-box">
      <h3>Estimación económica mensual</h3>
      <div class="rango">
        ${oferta.estimacionRango ? `${oferta.estimacionRango.min?.toLocaleString('es-ES')} — ${oferta.estimacionRango.max?.toLocaleString('es-ES')}` : 'A determinar'}
        <span class="rango-unidad"> €/mes</span>
      </div>
      <p class="nota">${oferta.estimacionRango?.nota || 'El importe final se determinará tras la auditoría técnica y la definición del alcance exacto de los servicios.'}</p>
    </div>

    <h2 class="seccion-titulo" style="margin-top:25px">Siguientes pasos</h2>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th>Acción</th>
        </tr>
      </thead>
      <tbody>
        ${pasosHtml}
      </tbody>
    </table>

    <div class="confidencial">
      Este documento es confidencial y está destinado exclusivamente a ${lead.empresa}. 
      Los precios indicados son orientativos y están sujetos a la auditoría técnica previa.
      Validez de la propuesta: 30 días desde la fecha de emisión.
    </div>

    <div class="page-footer">Propuesta Mantenimiento IT — ${lead.empresa} — Pág. 3</div>
  </div>

  <!-- PÁGINA 4: CUESTIONARIO TÉCNICO AVANZADO (portada) -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">CUESTIONARIO TÉCNICO AVANZADO</div>
    </div>

    <h2 class="seccion-titulo">Cuestionario técnico previo a la auditoría</h2>
    <p style="font-size:11px;color:#555;margin-bottom:8px;line-height:1.6;">
      Para poder dimensionar correctamente el servicio de <strong>guardias IT 24/7</strong> y 
      <strong>cobertura nocturna</strong> que necesita ${lead.empresa}, necesitamos conocer en detalle 
      su infraestructura actual y requisitos específicos. Por favor, complete este cuestionario 
      con la mayor precisión posible.
    </p>
    <p style="font-size:10px;color:#888;margin-bottom:20px;">
      Puede responder directamente sobre este documento o enviarnos las respuestas por email a 
      <strong>soluciones@internetoperadores.com</strong>
    </p>

    ${cuestionarioAvanzado.slice(0, 2).map(seccion => `
      <div class="cuestionario-seccion">
        <h3 class="bloque-titulo">${seccion.seccion}</h3>
        <table class="tabla-cuestionario">
          <tbody>
            ${seccion.preguntas.map((p, i) => `
              <tr>
                <td class="pregunta-num">${i + 1}</td>
                <td class="pregunta-texto">${p}</td>
              </tr>
              <tr>
                <td></td>
                <td class="respuesta-espacio"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}

    <div class="page-footer">Cuestionario Técnico — ${lead.empresa} — Pág. 4</div>
  </div>

  <!-- PÁGINA 5: CUESTIONARIO (continuación) -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">CUESTIONARIO TÉCNICO AVANZADO</div>
    </div>

    ${cuestionarioAvanzado.slice(2, 4).map(seccion => `
      <div class="cuestionario-seccion">
        <h3 class="bloque-titulo">${seccion.seccion}</h3>
        <table class="tabla-cuestionario">
          <tbody>
            ${seccion.preguntas.map((p, i) => `
              <tr>
                <td class="pregunta-num">${i + 1}</td>
                <td class="pregunta-texto">${p}</td>
              </tr>
              <tr>
                <td></td>
                <td class="respuesta-espacio"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}

    <div class="page-footer">Cuestionario Técnico — ${lead.empresa} — Pág. 5</div>
  </div>

  <!-- PÁGINA 6: CUESTIONARIO (final) + SLA -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">CUESTIONARIO TÉCNICO AVANZADO</div>
    </div>

    ${cuestionarioAvanzado.slice(4).map(seccion => `
      <div class="cuestionario-seccion">
        <h3 class="bloque-titulo">${seccion.seccion}</h3>
        <table class="tabla-cuestionario">
          <tbody>
            ${seccion.preguntas.map((p, i) => `
              <tr>
                <td class="pregunta-num">${i + 1}</td>
                <td class="pregunta-texto">${p}</td>
              </tr>
              <tr>
                <td></td>
                <td class="respuesta-espacio"></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `).join('')}

    <div style="margin-top:25px;background:#f9f9f9;border:1px solid #ddd;border-radius:6px;padding:15px;">
      <h4 style="color:#E87A2E;font-size:11px;margin-bottom:8px;">INFORMACIÓN ADICIONAL</h4>
      <p style="font-size:10px;color:#555;margin-bottom:4px;">• Puede adjuntar diagramas de red, inventarios o cualquier documentación técnica relevante.</p>
      <p style="font-size:10px;color:#555;margin-bottom:4px;">• Si prefiere realizar esta revisión en una reunión presencial o por videollamada, indíquenoslo.</p>
      <p style="font-size:10px;color:#555;margin-bottom:4px;">• Toda la información proporcionada será tratada con total confidencialidad.</p>
    </div>

    <div class="page-footer">Cuestionario Técnico — ${lead.empresa} — Pág. 6</div>
  </div>

  <!-- CONTRAPORTADA -->
  <div class="page">
    <div class="contraportada">
      <div class="logo-contra">internet<span>operadores</span></div>
      <div class="slogan-contra">SERVICIOS IT GESTIONADOS</div>
      <div class="separador"></div>
      <div class="contacto-contra">
        <h3>¿Hablamos?</h3>
        <p>900 730 034 (gratuito)</p>
        <p>soluciones@internetoperadores.com</p>
        <p>www.internetoperadores.com</p>
      </div>
      <div class="footer-contra">
        <p>Internet Operadores — Partner tecnológico de confianza</p>
        <p>Especialistas en servicios IT gestionados para empresas</p>
      </div>
    </div>
  </div>

</body>
</html>`;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    if (lead.tipo !== 'MANTENIMIENTO_IT') {
      return NextResponse.json({ error: 'Este lead no es de Mantenimiento IT' }, { status: 400 });
    }

    const datos = lead.datos as any;
    if (!datos?.ofertaGenerada) {
      return NextResponse.json({ error: 'Primero debe generar la propuesta a medida' }, { status: 400 });
    }

    const html = generarHTMLPropuestaMantenimiento(lead);

    // Devolver HTML para renderizar como PDF en el navegador
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    console.error('[PDF-MANTENIMIENTO] Error:', error);
    return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
  }
}
