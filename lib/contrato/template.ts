export interface ContratoData {
  // Fecha
  fechaContrato: string

  // Datos titular
  nombreTitular: string
  dniCifNie: string
  direccionCompleta: string
  localidad: string
  provincia: string
  codigoPostal: string
  email: string
  personaContacto: string

  // Dirección instalación (si diferente)
  direccionInstalacion?: string
  localidadInstalacion?: string
  provinciaInstalacion?: string
  cpInstalacion?: string

  // Servicios contratados
  servicios: ServicioContratado[]

  // Importes
  cuotaMensualConDescuento: string
  cuotaMensualSinDescuento: string
  cuotaInstalacion: string
  dispositivosCedidos: string

  // Observaciones
  observaciones?: string

  // SEPA
  iban?: string

  // Tipo cliente
  tipoCliente: 'PARTICULAR' | 'EMPRESA'
}

export interface ServicioContratado {
  tipo: 'INTERNET' | 'TELEFONIA_FIJA' | 'TELEFONIA_MOVIL' | 'OTROS'
  linea?: string
  tarifa: string
  detalle: string
  tipoAlta?: string
  precio: string
  descuento?: string
  permanencia: string
}

export function generarContratoHTML(data: ContratoData): string {
  const serviciosInternet = data.servicios.filter(s => s.tipo === 'INTERNET')
  const serviciosFija = data.servicios.filter(s => s.tipo === 'TELEFONIA_FIJA')
  const serviciosMovil = data.servicios.filter(s => s.tipo === 'TELEFONIA_MOVIL')
  const serviciosOtros = data.servicios.filter(s => s.tipo === 'OTROS')

  const ibanFormateado = data.iban
    ? data.iban.replace(/(.{4})/g, '$1 ').trim()
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Resumen del Contrato - Internet Operadores</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', 'Segoe UI', -apple-system, sans-serif; font-size: 11px; color: #1a1a2e; line-height: 1.5; background: #fff; }
    .page { width: 210mm; min-height: 297mm; padding: 12mm 18mm; margin: 0 auto; position: relative; page-break-after: always; }
    
    /* Header corporativo */
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 3px solid #EA580C; }
    .header-left { display: flex; align-items: center; gap: 12px; }
    .header-logo { width: 50px; height: 50px; }
    .header-logo img { width: 100%; height: 100%; object-fit: contain; }
    .header-brand h1 { font-size: 16px; font-weight: 800; color: #1a1a2e; letter-spacing: -0.5px; }
    .header-brand p { font-size: 9px; color: #64748b; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; }
    .header-right { text-align: right; font-size: 9px; color: #64748b; line-height: 1.6; }
    .header-right strong { color: #1a1a2e; }
    
    /* Título del documento */
    .doc-title { background: linear-gradient(135deg, #EA580C 0%, #C2410C 100%); color: white; padding: 8px 20px; font-size: 12px; font-weight: 700; display: inline-block; margin: 6px 0 14px; letter-spacing: 1.5px; border-radius: 4px; }
    .fecha-box { font-size: 10px; color: #475569; float: right; margin-top: 8px; padding: 4px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
    
    /* Secciones */
    .seccion-titulo { font-size: 11px; font-weight: 700; color: #EA580C; margin: 14px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #fed7aa; text-transform: uppercase; letter-spacing: 0.5px; }
    
    /* Campos de datos */
    .campo { display: inline-block; margin-bottom: 8px; }
    .campo-label { font-size: 8px; color: #64748b; display: block; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 2px; }
    .campo-valor { background: #fafafa; border: 1px solid #e2e8f0; padding: 4px 10px; min-height: 22px; font-size: 11px; min-width: 120px; display: inline-block; border-radius: 3px; color: #1a1a2e; font-weight: 500; }
    
    /* Grids */
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
    .grid-2-1 { display: grid; grid-template-columns: 2fr 1fr; gap: 8px; }
    
    /* Tablas */
    table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 10px; border-radius: 4px; overflow: hidden; }
    table th { background: #1a1a2e; color: white; padding: 6px 8px; text-align: center; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
    table td { border: 1px solid #e2e8f0; padding: 5px 8px; text-align: center; color: #334155; }
    table td.left { text-align: left; }
    table tr:nth-child(even) { background: #f8fafc; }
    
    /* Observaciones */
    .observaciones-box { background: #fffbeb; border: 1px solid #fbbf24; border-left: 4px solid #EA580C; padding: 10px 12px; min-height: 40px; margin: 8px 0; font-size: 10px; border-radius: 4px; color: #1a1a2e; }
    
    /* Texto legal */
    .texto-legal { font-size: 8.5px; color: #475569; line-height: 1.6; margin: 8px 0; text-align: justify; }
    
    /* Firma */
    .firma-box { border: 2px solid #1a1a2e; padding: 8px 16px; text-align: center; font-size: 10px; font-weight: 600; float: right; margin-top: 12px; border-radius: 4px; min-width: 140px; }
    
    /* IBAN */
    .iban-grid { display: grid; grid-template-columns: repeat(24, 1fr); gap: 1px; margin: 8px 0; }
    .iban-cell { border: 1px solid #1a1a2e; text-align: center; padding: 4px 2px; font-size: 11px; font-weight: 700; min-width: 18px; background: #fafafa; border-radius: 2px; }
    
    /* Checkboxes */
    .checkbox-row { margin: 5px 0; font-size: 10px; color: #334155; }
    .checkbox-row span { display: inline-block; width: 14px; height: 14px; border: 2px solid #1a1a2e; margin-right: 8px; vertical-align: middle; text-align: center; line-height: 14px; border-radius: 3px; }
    
    .link-condiciones { color: #EA580C; text-decoration: underline; font-weight: 500; }
    .clearfix::after { content: ''; display: table; clear: both; }
    
    /* Footer */
    .page-footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; text-align: center; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 6px; }
    
    @media print { .page { margin: 0; padding: 10mm 15mm; } }
  </style>
</head>
<body>

<!-- PÁGINA 1 -->
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="header-logo">
        <img src="/images/logo-internetoperadores.png" alt="IO" />
      </div>
      <div class="header-brand">
        <h1>Internet Operadores</h1>
        <p>Servicios Convergentes de Telecomunicaciones</p>
      </div>
    </div>
    <div class="header-right">
      <strong>Internet Operadores SL</strong><br>
      CIF: B25808619<br>
      900 730 034 | internetoperadores.com
    </div>
  </div>
  
  <div class="doc-title">RESUMEN DEL CONTRATO</div>
  <div class="fecha-box">Fecha: ${data.fechaContrato}</div>
  <div class="clearfix"></div>

  <div class="seccion-titulo">1. Datos del Titular</div>
  <div class="grid-2-1">
    <div class="campo">
      <span class="campo-label">Nombre y Apellidos / Empresa</span>
      <div class="campo-valor" style="width:100%">${data.nombreTitular}</div>
    </div>
    <div class="campo">
      <span class="campo-label">DNI / CIF / NIE</span>
      <div class="campo-valor">${data.dniCifNie}</div>
    </div>
  </div>
  <div class="campo" style="width:100%">
    <span class="campo-label">Dirección completa</span>
    <div class="campo-valor" style="width:100%">${data.direccionCompleta}</div>
  </div>
  <div class="grid-3">
    <div class="campo">
      <span class="campo-label">Localidad</span>
      <div class="campo-valor">${data.localidad}</div>
    </div>
    <div class="campo">
      <span class="campo-label">Provincia</span>
      <div class="campo-valor">${data.provincia}</div>
    </div>
    <div class="campo">
      <span class="campo-label">Código Postal</span>
      <div class="campo-valor">${data.codigoPostal}</div>
    </div>
  </div>
  <div class="grid-2">
    <div class="campo">
      <span class="campo-label">Correo electrónico</span>
      <div class="campo-valor">${data.email}</div>
    </div>
    <div class="campo">
      <span class="campo-label">Persona de Contacto</span>
      <div class="campo-valor">${data.personaContacto}</div>
    </div>
  </div>

  ${data.direccionInstalacion ? `
  <div class="seccion-titulo">2. Domicilio de Instalación <span style="font-weight:normal;font-size:8px;color:#64748b">(diferente a la dirección anterior)</span></div>
  <div class="campo" style="width:100%">
    <span class="campo-label">Dirección Instalación</span>
    <div class="campo-valor" style="width:100%">${data.direccionInstalacion}</div>
  </div>
  <div class="grid-3">
    <div class="campo">
      <span class="campo-label">Localidad</span>
      <div class="campo-valor">${data.localidadInstalacion || ''}</div>
    </div>
    <div class="campo">
      <span class="campo-label">Provincia</span>
      <div class="campo-valor">${data.provinciaInstalacion || ''}</div>
    </div>
    <div class="campo">
      <span class="campo-label">Código Postal</span>
      <div class="campo-valor">${data.cpInstalacion || ''}</div>
    </div>
  </div>
  ` : ''}

  <div class="seccion-titulo">3. Resumen de Servicios Contratados <span style="font-weight:normal;font-size:8px;color:#64748b">(precios con IVA incluido)</span></div>

  ${serviciosInternet.length > 0 ? `
  <p style="font-size:10px;font-weight:700;margin:8px 0 4px;color:#1a1a2e;">Servicios de Internet</p>
  <table>
    <tr><th>Tarifa</th><th>Detalle del Servicio (Mb)</th><th>Precio (€/mes)</th><th>Descuento</th><th>Permanencia</th></tr>
    ${serviciosInternet.map(s => `<tr><td class="left">${s.tarifa}</td><td>${s.detalle}</td><td>${s.precio}</td><td>${s.descuento || '-'}</td><td>${s.permanencia}</td></tr>`).join('')}
  </table>
  ` : ''}

  ${serviciosFija.length > 0 ? `
  <p style="font-size:10px;font-weight:700;margin:8px 0 4px;color:#1a1a2e;">Servicios de Telefonía Fija</p>
  <table>
    <tr><th>Línea</th><th>Tarifa</th><th>Detalles</th><th>Tipo Alta</th><th>Precio</th><th>Descuento</th><th>Permanencia</th></tr>
    ${serviciosFija.map(s => `<tr><td>${s.linea || '-'}</td><td class="left">${s.tarifa}</td><td>${s.detalle}</td><td>${s.tipoAlta || '-'}</td><td>${s.precio}</td><td>${s.descuento || '-'}</td><td>${s.permanencia}</td></tr>`).join('')}
  </table>
  ` : ''}

  ${serviciosMovil.length > 0 ? `
  <p style="font-size:10px;font-weight:700;margin:8px 0 4px;color:#1a1a2e;">Servicios de Telefonía Móvil</p>
  <table>
    <tr><th>Línea</th><th>Tarifa</th><th>Llamadas/Datos</th><th>Tipo Alta</th><th>Precio</th><th>Descuento</th><th>Permanencia</th></tr>
    ${serviciosMovil.map(s => `<tr><td>${s.linea || '-'}</td><td class="left">${s.tarifa}</td><td>${s.detalle}</td><td>${s.tipoAlta || '-'}</td><td>${s.precio}</td><td>${s.descuento || '-'}</td><td>${s.permanencia}</td></tr>`).join('')}
  </table>
  ` : ''}

  ${serviciosOtros.length > 0 ? `
  <p style="font-size:10px;font-weight:700;margin:8px 0 4px;color:#1a1a2e;">Otros Servicios</p>
  <table>
    <tr><th>Tarifa</th><th>Detalle del Servicio</th><th>Precio (€/mes)</th><th>Descuento</th><th>Permanencia</th></tr>
    ${serviciosOtros.map(s => `<tr><td class="left">${s.tarifa}</td><td>${s.detalle}</td><td>${s.precio}</td><td>${s.descuento || '-'}</td><td>${s.permanencia}</td></tr>`).join('')}
  </table>
  ` : ''}

  <div class="firma-box">Firma Cliente<br><span style="font-size:8px;font-weight:400;color:#64748b">(todas las páginas)</span></div>
  <div class="clearfix"></div>
  <div class="page-footer">Internet Operadores SL · CIF B25808619 · Paseo De La Habana 26 1-1, 28036 Madrid · 900 730 034</div>
</div>

<!-- PÁGINA 2 -->
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="header-logo">
        <img src="/images/logo-internetoperadores.png" alt="IO" />
      </div>
      <div class="header-brand">
        <h1>Internet Operadores</h1>
        <p>Servicios Convergentes de Telecomunicaciones</p>
      </div>
    </div>
    <div class="header-right">
      <strong>Internet Operadores SL</strong><br>
      CIF: B25808619<br>
      900 730 034 | internetoperadores.com
    </div>
  </div>

  <div class="seccion-titulo">4. Importe Total de los Servicios Contratados <span style="font-weight:normal;font-size:8px;color:#64748b">(IVA incluido)</span></div>
  <div style="margin: 10px 0; font-size: 11px; line-height: 1.8; color: #1a1a2e;">
    <p>✓ <strong>Cuota mensual total con descuentos:</strong> ${data.cuotaMensualConDescuento}€/mes. INTERNET OPERADORES facturará los servicios ofrecidos por mes anticipado y consumos a mes vencido.</p>
    <p>✓ <strong>Cuota mensual total sin descuentos:</strong> ${data.cuotaMensualSinDescuento}€/mes.</p>
    <p>✓ <strong>Instalación:</strong> ${data.cuotaInstalacion}€/cuota única.</p>
    <p>✓ <strong>Nombre de los dispositivos cedidos:</strong> ${data.dispositivosCedidos || 'N/A'}</p>
  </div>

  <div class="seccion-titulo">5. Observaciones</div>
  <div class="observaciones-box">${data.observaciones || ''}</div>
  <div class="texto-legal">
    Las bajas o cambios en el servicio se deben solicitar en cualquier momento, haciéndose efectiva en un plazo máximo de 2 días hábiles, enviando un email a info@internetoperadores.com indicando el nombre del titular, DNI/CIF, fecha de la baja y servicio que desea dar de baja y el motivo de esta. Si se solicita la baja sin permanencia y no se devuelve el equipo cedido en 30 días se cobrará una penalización equivalente al valor residual del equipo. Así mismo, si el servicio aún tiene permanencia se le cobrará la penalización proporcional al tiempo restante.
  </div>
  <div class="texto-legal">
    INTERNET OPERADORES SL se compromete a prestar los servicios contratados en las condiciones descritas en este contrato y en las Condiciones Generales del Servicio. El cliente declara conocer y aceptar las condiciones generales disponibles en la web.
  </div>
  <p style="text-align:center;margin:10px 0;font-size:10px;">
    <a href="https://internetoperadores.com/condiciones-generales" class="link-condiciones">Consultar Condiciones Generales del Servicio</a>
  </p>

  <div class="seccion-titulo">6. Orden de Domiciliación de Adeudo Directo SEPA</div>
  <div class="texto-legal">
    Mediante la firma de esta orden de domiciliación de adeudo, el titular de la cuenta autoriza al acreedor del presente contrato a enviar instrucciones a su entidad bancaria para emitir una deuda en la misma, y a la entidad a efectuar las deudas en su cuenta siguiendo las instrucciones del acreedor.<br><br>
    Como parte de sus derechos, el deudor está legitimado al reembolso por parte de su entidad, en los términos y condiciones del contrato suscrito con la misma. La solicitud del reembolso se tendrá que efectuar dentro de las ocho semanas siguientes a la fecha de la deuda en la cuenta.<br><br>
    Para obtener información adicional, consulte sus derechos con su propia entidad financiera.
  </div>
  <p style="font-size:10px;font-weight:700;margin:10px 0 6px;color:#1a1a2e;">NÚMERO DE CUENTA DEL CLIENTE <span style="font-weight:normal;color:#64748b">(En España, el IBAN consta de 24 dígitos, empezando por ES)</span></p>
  
  ${data.iban ? `
  <div class="iban-grid">
    ${data.iban.padEnd(24, ' ').split('').map(c => `<div class="iban-cell">${c.trim()}</div>`).join('')}
  </div>
  ` : `
  <div class="iban-grid">
    ${Array(24).fill('').map(() => `<div class="iban-cell"></div>`).join('')}
  </div>
  `}

  <div class="firma-box">Firma Cliente<br><span style="font-size:8px;font-weight:400;color:#64748b">(todas las páginas)</span></div>
  <div class="clearfix"></div>
  <div class="page-footer">Internet Operadores SL · CIF B25808619 · Paseo De La Habana 26 1-1, 28036 Madrid · 900 730 034</div>
</div>

<!-- PÁGINA 3 -->
<div class="page">
  <div class="header">
    <div class="header-left">
      <div class="header-logo">
        <img src="/images/logo-internetoperadores.png" alt="IO" />
      </div>
      <div class="header-brand">
        <h1>Internet Operadores</h1>
        <p>Servicios Convergentes de Telecomunicaciones</p>
      </div>
    </div>
    <div class="header-right">
      <strong>Internet Operadores SL</strong><br>
      CIF: B25808619<br>
      900 730 034 | internetoperadores.com
    </div>
  </div>

  <div class="seccion-titulo">7. Protección de Datos</div>
  <div class="texto-legal">
    INTERNET OPERADORES SL tratará tus datos con la finalidad de elaborar su oferta en base la aplicación de medidas precontractuales. No comunicaremos sus datos a terceros salvo obligación legal.<br><br>
    Según lo dispuesto en el Reglamento (UE) 2016/679 de 27 de abril de 2016 (RGPD), la Ley Orgánica 3/2018 de 5 de diciembre (LOPDGDD) y el resto de normativa vigente en materia de protección de datos personales informamos que los datos personales aportados serán tratados por INTERNET OPERADORES SL (Responsable del Tratamiento), con domicilio en Paseo De La Habana 26 1-1, 28036 Madrid y CIF B25808619.<br><br>
    Los datos se conservarán mientras dure la relación contractual con usted y, una vez finalizada, durante un plazo de 5 años para atender posibles responsabilidades legales. Se informa al interesado que tiene derecho a retirar el consentimiento para tratar sus datos en cualquier momento. Sin embargo, si ejerce este derecho, se tendrá que proceder a la rescisión del contrato en los términos previstos en el mismo, ya que el tratamiento de datos es imprescindible para la ejecución del contrato.<br><br>
    Asimismo, podrá ejercer sus derechos de acceso, rectificación, supresión, portabilidad de sus datos y los de limitación u oposición al tratamiento dirigiéndose a INTERNET OPERADORES SL con domicilio en Paseo De La Habana 26 1-1, 28036 Madrid o enviando un correo electrónico a <a href="mailto:info@internetoperadores.com" style="color:#EA580C">info@internetoperadores.com</a>.<br><br>
    Si considera que el tratamiento de sus datos no se ajusta a la normativa vigente, tiene derecho a presentar una reclamación ante la Autoridad de Control (www.aepd.es).
  </div>
  <div style="margin: 12px 0;">
    <div class="checkbox-row"><span></span> Deseo recibir ofertas personalizadas de INTERNET OPERADORES</div>
    <div class="checkbox-row"><span></span> No deseo recibir ofertas personalizadas de INTERNET OPERADORES</div>
  </div>

  <div class="seccion-titulo">8. Otra Información</div>
  <div class="texto-legal">
    Si necesita cualquier aclaración puede consultar con nosotros llamándonos o enviándonos un mensaje al WhatsApp 900 730 034 de Lunes a Jueves de 8 a 18h y Viernes de 8 a 15h.<br>
    Para incidencias técnicas fuera de dicho horario pueden enviar un email a <a href="mailto:sat@internetoperadores.com" style="color:#EA580C">sat@internetoperadores.com</a> o dejar un mensaje en el contestador o si tiene conexión de empresa puede llamar directamente indicando el documento de identidad.<br><br>
    Información sobre la Oficina de Atención al Usuario de Telecomunicaciones:<br>
    <a href="https://www.usuariosteleco.gob.es/reclamaciones/Paginas/reclamaciones.asp" style="color:#EA580C">https://www.usuariosteleco.gob.es/reclamaciones/Paginas/reclamaciones.asp</a>
  </div>

  <div style="display:flex; justify-content:space-between; margin-top:40px;">
    <div style="border:2px solid #1a1a2e; padding:12px 24px; text-align:center; width:45%; border-radius:6px;">
      <p style="font-size:10px; font-weight:700; margin-bottom:30px; color:#1a1a2e;">Por INTERNET OPERADORES SL</p>
      <p style="font-size:11px; font-style:italic; color:#1a1a2e;">David Pérez</p>
      <p style="font-size:9px; color:#64748b;">Director General</p>
      <p style="font-size:8px; color:#94a3b8; margin-top:4px;">[Firma digital]</p>
    </div>
    <div style="border:2px solid #1a1a2e; padding:12px 24px; text-align:center; width:45%; border-radius:6px;">
      <p style="font-size:10px; font-weight:700; margin-bottom:30px; color:#1a1a2e;">Firma Cliente</p>
      <p style="font-size:8px; color:#64748b;">(todas las páginas)</p>
    </div>
  </div>
  <div class="clearfix"></div>
  <div class="page-footer">Internet Operadores SL · CIF B25808619 · Paseo De La Habana 26 1-1, 28036 Madrid · 900 730 034</div>
</div>

</body>
</html>`
}
