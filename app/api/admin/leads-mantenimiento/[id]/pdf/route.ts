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

  const cuestionarioToken = datos.cuestionarioTecnico?.token || '';
  const cuestionarioUrl = cuestionarioToken 
    ? `www.internetoperadores.com/cuestionario-mantenimiento/${cuestionarioToken}` 
    : '';

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

  // Determinar tipo de empresa para personalizar el mensaje
  const esGrande = datos.tipoNegocio === 'MEDIANA_GRANDE';
  const esFarmacia = datos.tipoNegocio === 'FARMACIA';
  const esHoreca = datos.tipoNegocio === 'HORECA';
  
  // Texto personalizado según tipo
  let contextoSector = '';
  if (esFarmacia) {
    contextoSector = 'Sabemos que en una farmacia cada minuto de sistema caído es una venta perdida y un paciente que se va a la de al lado. Su TPV, el robot de dispensación, la conexión con el Colegio de Farmacéuticos... todo tiene que funcionar. Siempre.';
  } else if (esHoreca) {
    contextoSector = 'En hostelería y restauración, un TPV que no funciona en hora punta es un desastre. Comandas perdidas, cocina parada, clientes esperando. Entendemos que su tecnología tiene que ser invisible: funcionar sin que nadie tenga que pensar en ella.';
  } else if (esGrande) {
    contextoSector = `Con ${datos.numEquipos || 'múltiples'} equipos, ${datos.numServidores || 'varios'} servidores y la necesidad de cobertura ${datos.coberturaHoraria || 'extendida'}, su empresa necesita un partner IT que no solo apague fuegos, sino que los prevenga. Un equipo que conozca su infraestructura como la palma de su mano.`;
  } else {
    contextoSector = 'Sabemos que para una PYME, la tecnología tiene que funcionar sin complicaciones. No necesita un departamento IT entero, necesita un partner que responda cuando las cosas fallan y que se asegure de que fallen lo menos posible.';
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Propuesta Mantenimiento IT - ${lead.empresa}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      line-height: 1.6;
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
      padding-top: 30mm;
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
      font-size: 34px;
      font-weight: 800;
      color: #1a1a1a;
      margin-top: 30px;
      line-height: 1.15;
    }

    .portada h1 em {
      color: #E87A2E;
      font-style: normal;
    }

    .portada-subtitulo {
      font-size: 15px;
      color: #555;
      margin-top: 8px;
      font-weight: 500;
    }

    .portada-claim {
      margin-top: 30px;
      background: linear-gradient(135deg, #fff8f3 0%, #fff 100%);
      border: 2px solid #E87A2E;
      border-radius: 12px;
      padding: 25px;
    }

    .portada-claim h3 {
      color: #E87A2E;
      font-size: 14px;
      margin-bottom: 10px;
      font-weight: 700;
    }

    .portada-claim p {
      font-size: 12px;
      color: #444;
      line-height: 1.7;
    }

    .portada-datos {
      margin-top: 35px;
      font-size: 12px;
      color: #555;
    }

    .portada-datos p {
      margin-bottom: 5px;
    }

    .portada-datos strong {
      color: #333;
    }

    .portada-badge {
      margin-top: 30px;
      display: flex;
      gap: 15px;
    }

    .badge-item {
      background: #f5f5f5;
      border-radius: 8px;
      padding: 12px 16px;
      text-align: center;
      flex: 1;
    }

    .badge-item .num {
      font-size: 20px;
      font-weight: 800;
      color: #E87A2E;
    }

    .badge-item .label {
      font-size: 9px;
      color: #666;
      margin-top: 3px;
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
      color: #1a1a1a;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }

    h2.seccion-titulo em {
      color: #E87A2E;
      font-style: normal;
    }

    h3.bloque-titulo {
      font-size: 13px;
      font-weight: 700;
      color: #333;
      margin: 20px 0 10px 0;
      padding-left: 12px;
      border-left: 3px solid #E87A2E;
    }

    /* TABLAS */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 15px;
      font-size: 10.5px;
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
      font-size: 11.5px;
      line-height: 1.8;
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
      padding: 12px 15px;
      background: #f8faf8;
      border-radius: 8px;
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
      background: linear-gradient(135deg, #fff9f5 0%, #fff 100%);
      border: 2px solid #E87A2E;
      border-radius: 12px;
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
      font-weight: 800;
      color: #1a1a1a;
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

    /* DIFERENCIACIÓN */
    .diferencia-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 15px;
      margin: 20px 0;
    }

    .diferencia-item {
      padding: 15px;
      border-radius: 8px;
    }

    .diferencia-item.malo {
      background: #fef2f2;
      border: 1px solid #fecaca;
    }

    .diferencia-item.bueno {
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
    }

    .diferencia-item h4 {
      font-size: 11px;
      margin-bottom: 8px;
      font-weight: 700;
    }

    .diferencia-item.malo h4 { color: #dc2626; }
    .diferencia-item.bueno h4 { color: #16a34a; }

    .diferencia-item ul {
      list-style: none;
      padding: 0;
    }

    .diferencia-item ul li {
      font-size: 10px;
      color: #555;
      margin-bottom: 4px;
      padding-left: 15px;
      position: relative;
    }

    .diferencia-item.malo ul li::before { content: "✗"; position: absolute; left: 0; color: #dc2626; font-weight: 700; }
    .diferencia-item.bueno ul li::before { content: "✓"; position: absolute; left: 0; color: #16a34a; font-weight: 700; }

    /* CTA */
    .cta-box {
      background: #E87A2E;
      border-radius: 12px;
      padding: 30px;
      text-align: center;
      color: white;
      margin: 25px 0;
    }

    .cta-box h3 {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .cta-box p {
      font-size: 12px;
      opacity: 0.9;
      margin-bottom: 15px;
      line-height: 1.6;
    }

    .cta-box .url {
      background: white;
      color: #E87A2E;
      font-weight: 700;
      font-size: 13px;
      padding: 12px 20px;
      border-radius: 8px;
      display: inline-block;
    }

    .cta-box .tiempo {
      margin-top: 12px;
      font-size: 11px;
      opacity: 0.8;
    }

    /* PROCESO */
    .proceso-pasos {
      margin: 20px 0;
    }

    .paso {
      display: flex;
      align-items: flex-start;
      gap: 15px;
      margin-bottom: 20px;
    }

    .paso-num {
      width: 36px;
      height: 36px;
      background: #E87A2E;
      color: white;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 14px;
      flex-shrink: 0;
    }

    .paso-content h4 {
      font-size: 12px;
      font-weight: 700;
      color: #333;
      margin-bottom: 3px;
    }

    .paso-content p {
      font-size: 10.5px;
      color: #666;
      line-height: 1.5;
    }

    .paso-highlight {
      background: #fff8f3;
      border: 1px solid #fed7aa;
      border-radius: 8px;
      padding: 12px 15px;
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
      background: #f5f5f5;
      border-radius: 6px;
      padding: 10px 15px;
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
    
    <h1>Su IT, <em>resuelto.</em><br>Sin reuniones innecesarias.</h1>
    <p class="portada-subtitulo">Propuesta personalizada de Mantenimiento IT para ${lead.empresa}</p>

    <div class="portada-claim">
      <h3>¿POR QUÉ RECIBE ESTE DOCUMENTO?</h3>
      <p>${contextoSector}</p>
      <p style="margin-top:10px;">Hemos analizado la información que nos ha proporcionado y le presentamos una <strong>propuesta inicial personalizada</strong>. No es un catálogo genérico: está pensada para su realidad.</p>
    </div>

    <div class="portada-datos">
      <p><strong>Preparado para:</strong> ${lead.nombre} — ${lead.empresa}</p>
      <p><strong>Email:</strong> ${lead.email}</p>
      ${lead.telefono ? `<p><strong>Teléfono:</strong> ${lead.telefono}</p>` : ''}
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Ref:</strong> PROP-MIT-${lead.id.substring(0, 8).toUpperCase()}</p>
    </div>

    <div class="portada-badge">
      <div class="badge-item">
        <div class="num">+20</div>
        <div class="label">años de experiencia</div>
      </div>
      <div class="badge-item">
        <div class="num">99.7%</div>
        <div class="label">disponibilidad SLA</div>
      </div>
      <div class="badge-item">
        <div class="num">&lt;2h</div>
        <div class="label">tiempo respuesta</div>
      </div>
      <div class="badge-item">
        <div class="num">0€</div>
        <div class="label">compromiso inicial</div>
      </div>
    </div>

    <div class="page-footer">Documento confidencial — Internet Operadores © ${new Date().getFullYear()}</div>
  </div>

  <!-- PÁGINA 2: POR QUÉ SOMOS DIFERENTES -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">MANTENIMIENTO IT GESTIONADO</div>
    </div>

    <h2 class="seccion-titulo">Por qué hacemos las cosas <em>diferente</em></h2>
    
    <p style="font-size:12px;color:#444;line-height:1.8;margin-bottom:20px;">
      Seguramente ya ha contactado con otras empresas de IT. Y seguramente le habrán dicho: 
      <em>"Agendemos una reunión para conocer sus necesidades"</em>. Después otra reunión. Y otra. 
      Y al final, un presupuesto genérico que podría ser para cualquier empresa.
    </p>
    <p style="font-size:12px;color:#444;line-height:1.8;margin-bottom:25px;">
      <strong>Nosotros no trabajamos así.</strong> Respetamos su tiempo porque sabemos que dirigir 
      ${esFarmacia ? 'una farmacia' : esHoreca ? 'un negocio de hostelería' : 'una empresa'} 
      ya es suficientemente exigente como para perderlo en reuniones que no aportan valor.
    </p>

    <div class="diferencia-grid">
      <div class="diferencia-item malo">
        <h4>Lo que hace la competencia</h4>
        <ul>
          <li>Reunión "para conocernos" (1-2h)</li>
          <li>Segunda reunión "técnica" (1-2h)</li>
          <li>Esperar 2-3 semanas al presupuesto</li>
          <li>Presupuesto genérico de catálogo</li>
          <li>Tercera reunión "para explicarlo"</li>
          <li>Total: 3-4 semanas perdidas</li>
        </ul>
      </div>
      <div class="diferencia-item bueno">
        <h4>Lo que hacemos nosotros</h4>
        <ul>
          <li>Analizamos sus datos (ya hecho ✓)</li>
          <li>Le enviamos propuesta inicial (este PDF ✓)</li>
          <li>Usted rellena cuestionario técnico (10 min)</li>
          <li>Le damos precio cerrado en 48h</li>
          <li>Una sola reunión: para firmar</li>
          <li>Total: 3-5 días y a trabajar</li>
        </ul>
      </div>
    </div>

    <div style="background:#f8f9fa;border-radius:10px;padding:20px;margin-top:20px;">
      <h3 style="font-size:13px;color:#333;margin-bottom:10px;">¿Por qué le pedimos un cuestionario técnico?</h3>
      <p style="font-size:11px;color:#555;line-height:1.7;margin-bottom:8px;">
        Porque queremos darle un <strong>precio real y cerrado</strong>, no una estimación que luego suba. 
        Para eso necesitamos conocer exactamente qué tiene y qué necesita. El cuestionario:
      </p>
      <ul style="list-style:none;padding:0;margin:0;">
        <li style="font-size:11px;color:#555;padding:4px 0 4px 20px;position:relative;">
          <span style="position:absolute;left:0;color:#E87A2E;font-weight:700;">→</span>
          Se completa en <strong>10-15 minutos</strong> (no necesita agendar nada)
        </li>
        <li style="font-size:11px;color:#555;padding:4px 0 4px 20px;position:relative;">
          <span style="position:absolute;left:0;color:#E87A2E;font-weight:700;">→</span>
          Puede hacerlo <strong>cuando le venga bien</strong> (no hay prisa, no hay horario)
        </li>
        <li style="font-size:11px;color:#555;padding:4px 0 4px 20px;position:relative;">
          <span style="position:absolute;left:0;color:#E87A2E;font-weight:700;">→</span>
          Nos permite dimensionar <strong>exactamente</strong> lo que necesita (ni más, ni menos)
        </li>
        <li style="font-size:11px;color:#555;padding:4px 0 4px 20px;position:relative;">
          <span style="position:absolute;left:0;color:#E87A2E;font-weight:700;">→</span>
          El resultado: <strong>precio cerrado en 48h</strong> sin sorpresas ni letra pequeña
        </li>
      </ul>
    </div>

    <div class="page-footer">Propuesta Mantenimiento IT — ${lead.empresa} — Pág. 2</div>
  </div>

  <!-- PÁGINA 3: PROPUESTA DE VALOR + SERVICIOS -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">MANTENIMIENTO IT GESTIONADO</div>
    </div>

    <h2 class="seccion-titulo">Lo que hemos preparado para <em>${lead.empresa}</em></h2>
    
    ${oferta.propuestaValor ? `
    <div class="propuesta-valor">
      ${(oferta.propuestaValor || '').split('\n').filter((p: string) => p.trim()).map((p: string) => `<p style="margin-bottom:12px">${p}</p>`).join('')}
    </div>` : `
    <div class="propuesta-valor">
      <p style="margin-bottom:12px">Basándonos en la información que nos ha proporcionado, hemos diseñado una propuesta de mantenimiento IT que se adapta a las necesidades específicas de ${lead.empresa}.</p>
      <p style="margin-bottom:12px">Nuestro equipo técnico certificado (Microsoft, Cisco, VMware, Fortinet) le ofrece un servicio integral con técnicos asignados que conocerán su infraestructura, tiempos de respuesta garantizados por contrato y monitorización proactiva 24/7.</p>
    </div>`}

    ${oferta.serviciosRecomendados?.length > 0 ? `
    <h3 class="bloque-titulo">Servicios incluidos en su plan</h3>
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
    </table>` : ''}

    ${oferta.tipo === 'OFERTA_AUTOMATICA' && oferta.tarifaRecomendada ? `
    <div class="estimacion-box">
      <h3>Plan recomendado para ${lead.empresa}</h3>
      <p style="font-size:13px;font-weight:600;color:#333;margin-bottom:5px;">${oferta.tarifaRecomendada.nombre}</p>
      <div class="rango">
        ${oferta.tarifaRecomendada.precioMensual}
        <span class="rango-unidad"> €/mes</span>
      </div>
      <p class="nota">${oferta.tarifaRecomendada.horasIncluidas}h incluidas · Nivel ${oferta.nivelRecomendado} · ${oferta.modalidadRecomendada} · Sin permanencia</p>
      ${oferta.condiciones ? `<p class="nota" style="margin-top:5px;">SLA: ${oferta.condiciones.sla} · Horas excedidas: ${oferta.condiciones.horasExcedidas}</p>` : ''}
    </div>` : ''}

    ${oferta.tipo === 'PROPUESTA_MEDIDA' && oferta.estimacionRango ? `
    <div class="estimacion-box">
      <h3>Estimación económica mensual</h3>
      <div class="rango">
        ${oferta.estimacionRango.min?.toLocaleString('es-ES')} — ${oferta.estimacionRango.max?.toLocaleString('es-ES')}
        <span class="rango-unidad"> €/mes</span>
      </div>
      <p class="nota">${oferta.estimacionRango.nota || 'Precio final cerrado tras completar el cuestionario técnico (10 min).'}</p>
    </div>` : ''}

    ${puntosHtml ? `
    <h3 class="bloque-titulo">¿Por qué Internet Operadores?</h3>
    ${puntosHtml}` : ''}

    <div class="page-footer">Propuesta Mantenimiento IT — ${lead.empresa} — Pág. 3</div>
  </div>

  <!-- PÁGINA 4: SIGUIENTE PASO + CTA -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet<span>operadores</span></div>
      <div class="header-slogan">SIGUIENTE PASO</div>
    </div>

    <h2 class="seccion-titulo">Su siguiente paso: <em>10 minutos</em> para un precio cerrado</h2>
    
    <p style="font-size:12px;color:#444;line-height:1.8;margin-bottom:25px;">
      Ya tiene la propuesta inicial. Ahora solo necesitamos <strong>10 minutos de su tiempo</strong> 
      para darle un precio definitivo sin sorpresas. Así de simple:
    </p>

    <div class="proceso-pasos">
      <div class="paso">
        <div class="paso-num">1</div>
        <div class="paso-content paso-highlight">
          <h4>Rellene el cuestionario técnico online</h4>
          <p>10-15 minutos, cuando le venga bien. Sin agendar nada. Preguntas concretas sobre su infraestructura actual para dimensionar el servicio exacto que necesita.</p>
        </div>
      </div>
      <div class="paso">
        <div class="paso-num">2</div>
        <div class="paso-content">
          <h4>Reciba su presupuesto a precio cerrado (48h)</h4>
          <p>Nuestro equipo técnico analiza sus respuestas y le envía un presupuesto definitivo. Sin letra pequeña, sin costes ocultos, sin "depende".</p>
        </div>
      </div>
      <div class="paso">
        <div class="paso-num">3</div>
        <div class="paso-content">
          <h4>Decida con tranquilidad</h4>
          <p>Sin presión, sin permanencia. Si le encaja, arrancamos. Si no, tan amigos. Así de fácil.</p>
        </div>
      </div>
    </div>

    ${cuestionarioUrl ? `
    <div class="cta-box">
      <h3>Complete el cuestionario ahora</h3>
      <p>No necesita agendar nada. Puede hacerlo desde el móvil, la tablet o el ordenador.<br>Cuando tenga un rato libre, en 10 minutos lo tiene hecho.</p>
      <div class="url">${cuestionarioUrl}</div>
      <p class="tiempo">⏱ Tiempo estimado: 10-15 minutos · 📱 Compatible con móvil · 🔒 Datos 100% confidenciales</p>
    </div>` : `
    <div class="cta-box">
      <h3>¿Listo para dar el siguiente paso?</h3>
      <p>Contacte con nosotros y le enviaremos el enlace a su cuestionario técnico personalizado.<br>En 48h tendrá su precio cerrado.</p>
      <div class="url">900 730 034 (gratuito) · comercial@internetoperadores.com</div>
      <p class="tiempo">Sin compromiso · Sin permanencia · Sin reuniones innecesarias</p>
    </div>`}

    <div style="margin-top:25px;background:#f9fafb;border-radius:8px;padding:15px;border:1px solid #e5e7eb;">
      <p style="font-size:11px;color:#555;text-align:center;margin:0;">
        <strong>¿Prefiere hablar primero?</strong> Sin problema. Llámenos al <strong>900 730 034</strong> (gratuito) 
        o escríbanos a <strong>comercial@internetoperadores.com</strong>. Pero le prometemos que con el cuestionario 
        iremos más rápido y le daremos un precio más ajustado.
      </p>
    </div>

    <div class="confidencial" style="margin-top:25px;">
      Este documento es confidencial y está destinado exclusivamente a ${lead.empresa}. 
      Los precios indicados son orientativos hasta completar el cuestionario técnico.
      Validez: 30 días desde la fecha de emisión.
    </div>

    <div class="page-footer">Propuesta Mantenimiento IT — ${lead.empresa} — Pág. 4</div>
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
        <p>comercial@internetoperadores.com</p>
        <p>www.internetoperadores.com</p>
      </div>
      <div class="footer-contra">
        <p>Internet Operadores — Partner tecnológico de confianza</p>
        <p>Más de 20 años cuidando la tecnología de empresas como la suya</p>
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
