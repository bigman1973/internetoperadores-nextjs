import { ValoracionGenerada, DatosLead } from './generar-valoracion';

export function generarPDFHtml(
  valoracion: ValoracionGenerada,
  datosLead: DatosLead
): string {
  const fecha = new Date().toLocaleDateString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const stackRows = valoracion.stackTecnologico
    .map(
      (s) => `
    <tr>
      <td>${s.software}</td>
      <td>${s.funcion}</td>
      <td>${s.apiDisponible}</td>
      <td>${s.tipoIntegracion}</td>
    </tr>`
    )
    .join('');

  const bloquesHtml = valoracion.bloques
    .map(
      (bloque) => `
    <div class="bloque">
      <h3 class="bloque-titulo">BLOQUE ${bloque.numero}: ${bloque.titulo.toUpperCase()}</h3>
      <table class="tabla-partidas">
        <thead>
          <tr>
            <th style="width:50px">#</th>
            <th style="width:160px">Partida</th>
            <th>Descripción</th>
            <th style="width:60px">Horas</th>
            <th style="width:80px">Precio</th>
          </tr>
        </thead>
        <tbody>
          ${bloque.partidas
            .map(
              (p) => `
          <tr>
            <td>${p.numero}</td>
            <td>${p.nombre}</td>
            <td>${p.descripcion}</td>
            <td>${p.horas}h</td>
            <td>${p.precio.toLocaleString('es-ES')}€</td>
          </tr>`
            )
            .join('')}
          <tr class="subtotal-row">
            <td colspan="3"><strong>Subtotal Bloque ${bloque.numero}</strong></td>
            <td><strong>${bloque.subtotalHoras}h</strong></td>
            <td><strong>${bloque.subtotalPrecio.toLocaleString('es-ES')}€</strong></td>
          </tr>
        </tbody>
      </table>
    </div>`
    )
    .join('');

  const resumenRows = valoracion.bloques
    .map(
      (b) => `
    <tr>
      <td>${b.numero}</td>
      <td>${b.titulo}</td>
      <td>${b.subtotalHoras}h</td>
      <td>${b.subtotalPrecio.toLocaleString('es-ES')}€</td>
    </tr>`
    )
    .join('');

  const fasesRows = valoracion.opcionC.fases
    .map(
      (f) => `
    <tr>
      <td><strong>${f.numero}</strong></td>
      <td>${f.contenido} (partidas ${f.partidas})</td>
      <td>${f.horas}h</td>
      <td>${f.importe.toLocaleString('es-ES')}€</td>
      <td>${f.plazo}</td>
    </tr>`
    )
    .join('');

  const cronogramaHtml = valoracion.cronograma
    .map(
      (c) => `
    <h4 class="fase-titulo">Fase ${c.fase}: ${c.titulo} (${c.duracion || ''})</h4>
    <table class="tabla-partidas">
      <thead>
        <tr>
          <th style="width:100px">Semana</th>
          <th>Actuación</th>
        </tr>
      </thead>
      <tbody>
        ${c.semanas
          .map(
            (s) => `
        <tr>
          <td>${s.rango}</td>
          <td>${s.actuacion}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>`
    )
    .join('');

  const pasosRows = valoracion.siguientesPasos
    .map(
      (p, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${p.accion}</td>
      <td>${p.responsable}</td>
    </tr>`
    )
    .join('');

  const notasHtml = valoracion.notasCondiciones
    .map((n) => {
      // Si la nota ya empieza con número, no añadir otro
      if (/^\d+\./.test(n)) {
        const match = n.match(/^(\d+\.)\s*(.*)/);
        return `<p><strong>${match?.[1]}</strong> ${match?.[2]}</p>`;
      }
      return `<p>${n}</p>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Valoración - ${datosLead.empresa}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: 'Inter', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #333;
    }

    @page { size: A4; margin: 0; }
    @media print {
      .page { height: 297mm; page-break-after: always; page-break-inside: avoid; overflow: hidden; }
      .page:last-child { page-break-after: auto; }
      body { margin: 0; padding: 0; }
    }

    .page {
      width: 210mm;
      height: 297mm;
      padding: 25mm 20mm;
      margin: 0 auto;
      position: relative;
      page-break-after: always;
      page-break-inside: avoid;
      overflow: hidden;
      box-sizing: border-box;
    }

    .page:last-child {
      page-break-after: auto;
    }

    /* PORTADA */
    .portada {
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      padding-top: 40mm;
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
      font-size: 36px;
      font-weight: 700;
      color: #E87A2E;
      margin-top: 30px;
      line-height: 1.2;
    }

    .portada h2 {
      font-size: 20px;
      font-weight: 600;
      color: #333;
      margin-top: 10px;
    }

    .portada-cita {
      border-left: 3px solid #333;
      padding-left: 15px;
      margin-top: 25px;
      font-style: italic;
      color: #555;
      font-size: 12px;
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
      margin-top: 40px;
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
      font-size: 22px;
      font-weight: 700;
      color: #E87A2E;
      margin-bottom: 15px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }

    h3.bloque-titulo {
      font-size: 13px;
      font-weight: 700;
      color: #333;
      margin: 20px 0 10px 0;
      padding-left: 10px;
      border-left: 3px solid #E87A2E;
    }

    h4.fase-titulo {
      font-size: 12px;
      font-weight: 600;
      color: #333;
      margin: 15px 0 8px 0;
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

    .subtotal-row {
      background: #f5f5f5 !important;
      border-top: 2px solid #ddd;
    }

    .total-row {
      background: #E87A2E !important;
      color: white;
    }

    .total-row td {
      font-weight: 700;
      border-bottom: none;
    }

    /* OPCIONES */
    .opcion {
      margin-bottom: 15px;
    }

    .opcion h4 {
      font-size: 12px;
      font-weight: 600;
      color: #333;
      padding-left: 10px;
      border-left: 3px solid #E87A2E;
      margin-bottom: 5px;
    }

    .opcion p {
      font-size: 11px;
      color: #555;
      margin-left: 13px;
    }

    .opcion .precio {
      font-weight: 700;
      color: #333;
    }

    /* RECUADRO */
    .recuadro {
      border: 2px solid #E87A2E;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      background: #fff9f5;
    }

    .recuadro h4 {
      color: #E87A2E;
      font-size: 12px;
      margin-bottom: 8px;
    }

    .recuadro p {
      font-size: 11px;
      color: #555;
    }

    /* NOTAS */
    .notas p {
      font-size: 10px;
      margin-bottom: 8px;
      color: #555;
    }

    .condiciones-box {
      background: #f9f9f9;
      border: 1px solid #ddd;
      border-radius: 6px;
      padding: 15px;
      margin-top: 15px;
    }

    .condiciones-box h4 {
      color: #E87A2E;
      font-size: 11px;
      margin-bottom: 8px;
    }

    .condiciones-box p {
      font-size: 10px;
      margin-bottom: 4px;
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

    /* FOOTER PAGINAS */
    .page-footer {
      position: absolute;
      bottom: 15mm;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 9px;
      color: #999;
    }

    .resumen-texto {
      font-size: 11px;
      line-height: 1.6;
      color: #444;
      margin-bottom: 20px;
    }

    .tarifa-box {
      margin-top: 15px;
    }

    .tarifa-box h4 {
      font-size: 12px;
      font-weight: 600;
      color: #333;
      padding-left: 10px;
      border-left: 3px solid #E87A2E;
      margin-bottom: 8px;
    }

    @media print {
      .page { margin: 0; padding: 20mm; }
    }
  </style>
</head>
<body>

  <!-- PORTADA -->
  <div class="page portada">
    <div class="logo-text">internet <span>operadores</span></div>
    <h1>Valoración de Tiempos y Presupuesto</h1>
    <h2>${datosLead.empresa}</h2>
    <div class="portada-cita">
      ${valoracion.resumenEjecutivo.substring(0, 150)}...
    </div>
    <div class="portada-datos">
      <p><strong>Cliente:</strong> ${datosLead.empresa}</p>
      <p><strong>Contactos:</strong> ${datosLead.contactoNombre}</p>
      <p><strong>Email:</strong> ${datosLead.contactoEmail}</p>
      <p><strong>Teléfono:</strong> ${datosLead.telefono}</p>
      <p><strong>Versión:</strong> 1.0 · ${fecha}</p>
    </div>
    <div class="portada-box">
      <h4>Preparado por Internet Operadores</h4>
      <p>David Pérez — Project Manager & IT Advisor</p>
      <p>Tel.: 900 730 034 · david.perez@internetoperadores.es</p>
    </div>
  </div>

  <!-- RESUMEN EJECUTIVO + STACK -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet <span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
    </div>
    <h2 class="seccion-titulo">1. Resumen Ejecutivo</h2>
    <p class="resumen-texto">${valoracion.resumenEjecutivo}</p>
    
    <h2 class="seccion-titulo">2. Stack Tecnológico del Cliente</h2>
    <table>
      <thead>
        <tr>
          <th>Software</th>
          <th>Función</th>
          <th>API Disponible</th>
          <th>Tipo de Integración</th>
        </tr>
      </thead>
      <tbody>
        ${stackRows}
      </tbody>
    </table>

    <div class="tarifa-box">
      <h4>Tarifa Aplicada</h4>
      <table>
        <thead>
          <tr><th>Concepto</th><th>Valor</th></tr>
        </thead>
        <tbody>
          <tr><td>Tarifa hora desarrollo</td><td>60€/h</td></tr>
          <tr><td>Tarifa hora diseño UX/UI</td><td>60€/h</td></tr>
          <tr><td>Tarifa hora consultoría/integración</td><td>60€/h</td></tr>
        </tbody>
      </table>
    </div>
    <div class="page-footer">2</div>
  </div>

  <!-- DESGLOSE POR PARTIDAS -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet <span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
    </div>
    <h2 class="seccion-titulo">3. Desglose por Partidas</h2>
    ${bloquesHtml}
    <div class="page-footer">3</div>
  </div>

  <!-- RESUMEN ECONÓMICO + OPCIONES -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet <span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
    </div>
    <h2 class="seccion-titulo">4. Resumen Económico</h2>
    <table>
      <thead>
        <tr><th>Bloque</th><th>Concepto</th><th>Horas</th><th>Importe</th></tr>
      </thead>
      <tbody>
        ${resumenRows}
        <tr class="total-row">
          <td colspan="2">TOTAL PROYECTO</td>
          <td>${valoracion.totalHoras}h</td>
          <td>${valoracion.totalPrecio.toLocaleString('es-ES')}€</td>
        </tr>
      </tbody>
    </table>

    <h2 class="seccion-titulo">5. Opciones de Ejecución</h2>
    <div class="opcion">
      <h4>Opción A: Proyecto Completo</h4>
      <p><span class="precio">Total: ${valoracion.opcionA.total.toLocaleString('es-ES')}€</span> · Plazo estimado: ${valoracion.opcionA.plazo} · Pago: ${valoracion.opcionA.pago}</p>
    </div>
    <div class="opcion">
      <h4>Opción B: ${valoracion.opcionB.descripcion}</h4>
      <p><span class="precio">Total: ${valoracion.opcionB.total.toLocaleString('es-ES')}€</span> · Plazo estimado: ${valoracion.opcionB.plazo}</p>
    </div>
    <div class="opcion">
      <h4>Opción C: Fases Progresivas (Recomendada)</h4>
    </div>
    <table>
      <thead>
        <tr><th>Fase</th><th>Contenido</th><th>Horas</th><th>Importe</th><th>Plazo</th></tr>
      </thead>
      <tbody>
        ${fasesRows}
      </tbody>
    </table>
    <div class="recuadro">
      <h4>Recomendación</h4>
      <p>La Opción C permite iniciar con el bloque de mayor impacto y escalar progresivamente según resultados y disponibilidad presupuestaria.</p>
    </div>
    <div class="page-footer">4</div>
  </div>

  <!-- CRONOGRAMA -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet <span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
    </div>
    <h2 class="seccion-titulo">6. Cronograma (Opción C — Fases Progresivas)</h2>
    ${cronogramaHtml}
    <div class="page-footer">5</div>
  </div>

  <!-- MANTENIMIENTO + NOTAS -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet <span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
    </div>
    <h2 class="seccion-titulo">7. Mantenimiento Mensual (Post-Proyecto)</h2>
    <table>
      <thead>
        <tr><th>Concepto</th><th>Mensual</th></tr>
      </thead>
      <tbody>
        ${(valoracion.mantenimiento || [
          {concepto: 'Hosting + infraestructura (servidor cloud privado)', mensual: '50€/mes'},
          {concepto: 'Mantenimiento correctivo + actualizaciones de seguridad', mensual: '150€/mes'},
          {concepto: 'Soporte técnico (hasta 5h/mes)', mensual: '200€/mes'},
          {concepto: 'Total mantenimiento', mensual: '400€/mes'}
        ]).map((m, i, arr) => i === arr.length - 1 
          ? `<tr class="subtotal-row"><td><strong>${m.concepto}</strong></td><td><strong>${m.mensual}</strong></td></tr>`
          : `<tr><td>${m.concepto}</td><td>${m.mensual}</td></tr>`
        ).join('')}
      </tbody>
    </table>

    <h2 class="seccion-titulo">8. Notas y Condiciones</h2>
    <div class="notas">
      ${notasHtml}
    </div>
    <div class="condiciones-box">
      <h4>Condiciones</h4>
      <p><strong>Validez de la oferta:</strong> ${valoracion.condiciones?.validez || '30 días desde la fecha de emisión'}.</p>
      <p><strong>IVA:</strong> ${valoracion.condiciones?.iva || 'Todos los importes son sin IVA (21%)'}.</p>
      <p><strong>Licencias:</strong> ${valoracion.condiciones?.licencias || 'El coste de licencias de software de terceros no está incluido y corre a cargo del cliente'}.</p>
    </div>
    <div class="page-footer">6</div>
  </div>

  <!-- SIGUIENTES PASOS -->
  <div class="page">
    <div class="header">
      <div class="header-logo">internet <span>operadores</span></div>
      <div class="header-slogan">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
    </div>
    <h2 class="seccion-titulo">9. Siguientes Pasos</h2>
    <p class="resumen-texto">Para iniciar el proyecto, necesitamos:</p>
    <table>
      <thead>
        <tr><th>#</th><th>Acción requerida</th><th>Responsable</th></tr>
      </thead>
      <tbody>
        ${pasosRows}
      </tbody>
    </table>
    <div class="recuadro">
      <h4>Reunión de arranque propuesta</h4>
      <p>${valoracion.reunionArranque || `Proponemos una reunión presencial o por videollamada con ${datosLead.contactoNombre} y el responsable de administración para validar los KPIs del dashboard y definir los criterios antes de iniciar el desarrollo.`}</p>
    </div>
    <div class="page-footer">7</div>
  </div>

  <!-- CONTRAPORTADA -->
  <div class="page">
    <div class="contraportada">
      <div class="logo-contra">internet <span>operadores</span></div>
      <div class="slogan-contra">SERVICIOS IT / CIBER SEGURIDAD / IA //</div>
      <div class="separador"></div>
      <div class="contacto-contra">
        <h3>David Pérez</h3>
        <p>Project Manager & IT Advisor</p>
        <p>Tel.: 900 730 034</p>
        <p>david.perez@internetoperadores.es</p>
      </div>
      <div class="footer-contra">
        <p>© 2026 Internet Operadores. Todos los derechos reservados.</p>
        <p>www.internetoperadores.com</p>
      </div>
    </div>
  </div>

</body>
</html>`;
}
