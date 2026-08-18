const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const DOCS = [
  { titulo: 'Recargo ejecutivo - Liquidacion 62321126210', categoria: 'recargo', expediente: 'TASAS/SG/070/24', fechaDocumento: '2024-11-15', fechaNotificacion: '2024-11-27', importe: 1.21, estado: 'pagado', ejercicio: 2023, descripcion: 'Recargo ejecutivo del 5% sobre cuota tributaria de 24,27 EUR por pago fuera de plazo voluntario de la TGO. Pagado el 12/12/2024.', archivo: '1.NOTIFICACIONCNMC27.11.2024.pdf' },
  { titulo: 'Recargo ejecutivo - Liquidacion 62319123397', categoria: 'recargo', expediente: 'TASAS/SG/070/24', fechaDocumento: '2024-11-15', fechaNotificacion: '2024-11-27', importe: 1.56, estado: 'pagado', ejercicio: 2023, descripcion: 'Recargo ejecutivo del 5% sobre cuota tributaria de 31,27 EUR por pago fuera de plazo voluntario de la TGO. Pagado el 12/12/2024.', archivo: '2.NOTIFICACIONCNMC27.11.2024.pdf' },
  { titulo: 'Pago recargo ejecutivo 1 (1,21 EUR)', categoria: 'pago', expediente: 'TASAS/SG/070/24', fechaDocumento: '2024-12-12', importe: 1.21, estado: 'pagado', ejercicio: 2023, descripcion: 'Justificante de pago del recargo ejecutivo de 1,21 EUR via Santander.', archivo: '1.PAGO12.12.2024NOTIFICACIONCNMC27.11.2024.pdf' },
  { titulo: 'Pago recargo ejecutivo 2 (1,56 EUR)', categoria: 'pago', expediente: 'TASAS/SG/070/24', fechaDocumento: '2024-12-12', importe: 1.56, estado: 'pagado', ejercicio: 2023, descripcion: 'Justificante de pago del recargo ejecutivo de 1,56 EUR via Santander.', archivo: '2.PAGO12.12.2024NOTIFICACIONCNMC27.11.2024.pdf' },
  { titulo: 'Recargo ejecutivo - Notificacion sede 62321126210', categoria: 'recargo', expediente: '07208-RTGO-62321126210', fechaDocumento: '2024-11-27', importe: 1.21, estado: 'pagado', ejercicio: 2023, descripcion: 'Notificacion formal del recargo ejecutivo por la sede electronica de la CNMC.', archivo: 'IO_RecExt062321126210-7208-258-sign_27.11.2024.pdf' },
  { titulo: 'Recargo ejecutivo - Notificacion sede 62319123397', categoria: 'recargo', expediente: '07208-RTGO-62319123397', fechaDocumento: '2024-11-27', importe: 1.56, estado: 'pagado', ejercicio: 2023, descripcion: 'Notificacion formal del recargo ejecutivo por la sede electronica de la CNMC.', archivo: 'IO_RecExt062319123397-7208-258-sign_27.11.2024.pdf' },
  { titulo: 'Propuesta liquidacion TGO ejercicio 2020 por estimacion indirecta', categoria: 'tasa_tgo', expediente: 'TGO/SG/063/24 EI 2020', fechaDocumento: '2024-09-24', fechaNotificacion: '2024-10-02', importe: 23.38, estado: 'pendiente', ejercicio: 2020, descripcion: 'Propuesta de resolucion para liquidar la TGO 2020 por estimacion indirecta. Base imponible estimada: 23.378,76 EUR. Importe TGO: 23,38 EUR + intereses de demora. IO no presento la declaracion IBE 2020 pese al requerimiento de 26/12/2021.', notas: 'PENDIENTE: Verificar si se presentaron alegaciones en plazo (10 dias naturales). Si no, la liquidacion es firme.', archivo: 'IO_PropDecl.20.25.09.24-7208-258-sign_02.10.2024.pdf' },
  { titulo: 'Declaracion IBE 2023 - Requerimiento y recordatorio', categoria: 'declaracion_ibe', expediente: 'DIBE.23.05.06.24', fechaDocumento: '2024-06-05', fechaNotificacion: '2024-06-05', estado: 'pendiente', ejercicio: 2023, descripcion: 'Recordatorio/requerimiento de presentacion de la declaracion de ingresos brutos de explotacion del ejercicio 2023.', archivo: 'IO_RecDIBE.23.05.06.24-7208-258-sign_05.06.2024.pdf' },
  { titulo: 'Declaracion IBE 2023 - Segundo recordatorio', categoria: 'declaracion_ibe', expediente: 'DIBE.23.05.06.24', fechaDocumento: '2024-06-12', fechaNotificacion: '2024-06-12', estado: 'pendiente', ejercicio: 2023, descripcion: 'Segundo recordatorio de presentacion de la declaracion IBE 2023.', archivo: 'IO_RecDIBE.23.05.06.24-7208-258-sign_12.06.2024.pdf' },
  { titulo: 'Requerimiento presentacion IBE 2023', categoria: 'requerimiento', fechaDocumento: '2025-04-02', fechaNotificacion: '2025-04-02', fechaLimite: '2025-04-16', estado: 'vencido', ejercicio: 2023, descripcion: 'Requerimiento formal de la CNMC para presentar la declaracion de ingresos brutos de explotacion 2023 en 10 dias habiles. Leido por Victor Giro el 02/04/2025.', notas: 'URGENTE: Plazo vencido. Si no se presento, la CNMC liquidara por estimacion indirecta con sancion e intereses.', archivo: 'IO_CNMC_REQUERIMIENTOPRESENTACIÓNINGRESOSBRUTOS2023_02.04.2025.pdf' },
  { titulo: 'Recordatorio obligacion presentacion IBE 2024', categoria: 'declaracion_ibe', fechaDocumento: '2025-06-06', fechaNotificacion: '2025-06-06', fechaLimite: '2025-06-30', estado: 'vencido', ejercicio: 2024, descripcion: 'Nota informativa recordando la obligacion de presentar la declaracion IBE 2024 antes del 30/06/2025.', archivo: '13.06.2025_IO_CNMC_OBLIGACIÓNDEPRESENTACIÓNIBE.pdf' },
  { titulo: 'Requerimiento presentacion IBE 2024', categoria: 'requerimiento', fechaDocumento: '2026-06-02', fechaLimite: '2026-06-16', estado: 'vencido', ejercicio: 2024, descripcion: 'Requerimiento formal para presentar la declaracion IBE 2024 en 10 dias habiles. Plazo vencido.', notas: 'URGENTE: Plazo vencido. Riesgo de liquidacion por estimacion indirecta.', archivo: '02.06.2026_IO_CNMC_PRESENTACIONTASAS2024.pdf' },
  { titulo: 'Nota informativa obligacion presentacion IBE 2025', categoria: 'declaracion_ibe', fechaDocumento: '2026-06-01', fechaLimite: '2026-06-30', estado: 'vencido', ejercicio: 2025, descripcion: 'Nota informativa sobre la obligacion de presentar la declaracion IBE 2025 antes del 30/06/2026.', notas: 'Plazo vencido el 30/06/2026. Pendiente de presentar.', archivo: '01.06.2026_IO_CNMC_PRESENTACIONPARATASAS.pdf' },
  { titulo: 'Subasignacion numeracion geografica Air Networks', categoria: 'subasignacion', fechaDocumento: '2025-03-27', estado: 'resuelto', descripcion: 'Solicitud de subasignacion de numeracion geografica a Air Networks.', archivo: 'IO_CNMC_SUBASIGNACIONNUMERACIONGEOGRAFICAAIRENETWORKS_27.03.2025.pdf' },
  { titulo: 'Resolucion subasignacion Air Networks', categoria: 'resolucion', fechaDocumento: '2025-04-23', estado: 'resuelto', descripcion: 'Resolucion favorable de la subasignacion de numeracion a Air Networks.', archivo: 'IO_CNMC_RESOLUCIÓNSUBASIGNACIÓNAIRENETWORKS_23.04.2025.pdf' },
  { titulo: 'Modificacion datos registro operadores', categoria: 'cambio_datos', fechaDocumento: '2025-03-28', estado: 'resuelto', descripcion: 'Modificacion de datos en el registro de operadores de la CNMC.', archivo: 'IO_CNMC_MODIFICACIÓNDATOS_28.03.2025.pdf' },
  { titulo: 'Comunicacion procedimiento revision portas fijas y moviles', categoria: 'comunicacion', fechaDocumento: '2025-07-25', estado: 'resuelto', descripcion: 'Comunicacion sobre el procedimiento de revision de portabilidades fijas y moviles.', archivo: '25072025_IO_CNMC_COMUNICACIÓNPROCEDIMIENTOREVISIÓNPORTASFIJASYMÓVILES.pdf' },
  { titulo: 'Anexo oficio CNMC', categoria: 'comunicacion', fechaDocumento: '2026-02-20', estado: 'resuelto', descripcion: 'Anexo a oficio de la CNMC con documentacion complementaria.', archivo: '20.02.2026_IO_CNMC_ANEXIOOFICIO.pdf' },
  { titulo: 'Subasignaciones junio 2026', categoria: 'subasignacion', fechaDocumento: '2026-06-18', estado: 'resuelto', descripcion: 'Nuevas subasignaciones de numeracion.', archivo: '18.06.2026_IO_CNMC_SUBASIGNACIONES.pdf' },
  { titulo: 'Cambio apoderado CNMC', categoria: 'cambio_datos', fechaDocumento: '2025-01-15', estado: 'resuelto', descripcion: 'Solicitud de cambio de apoderado/representante legal ante la CNMC.', archivo: 'CambioApoderadoCNMCIO_firmado.pdf' },
  { titulo: 'Justificante cambio representante IO CNMC', categoria: 'cambio_datos', fechaDocumento: '2025-01-20', estado: 'resuelto', descripcion: 'Justificante del cambio de representante de Internet Operadores ante la CNMC.', archivo: 'JustificantecambiorepresentanteIOCNMC.pdf' },
  { titulo: 'Justificante cambio representante y domicilio social IO CNMC', categoria: 'cambio_datos', fechaDocumento: '2025-01-25', estado: 'resuelto', descripcion: 'Justificante del cambio de representante y domicilio social ante la CNMC.', archivo: 'JustificantecambiorepresentanteydomiciliosocialIOCNMC.pdf' },
  { titulo: 'Continuidad Internet Operadores', categoria: 'comunicacion', fechaDocumento: '2023-01-01', estado: 'resuelto', descripcion: 'Documento de continuidad del servicio de Internet Operadores.', archivo: 'Continuidad_InternetOperadores.pdf' },
  { titulo: 'Acuse recibo modelo 349', categoria: 'otro', fechaDocumento: '2023-02-07', estado: 'resuelto', descripcion: 'Acuse de recibo de la presentacion del modelo 349 (declaracion recapitulativa de operaciones intracomunitarias).', archivo: 'Acuse_de_recibo_349_202302071332.pdf' },
];

async function main() {
  console.log('Importando documentos CNMC...');
  let imported = 0;
  for (const doc of DOCS) {
    let archivoPdf = null;
    const filePath = path.join('/home/ubuntu/upload', doc.archivo);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      archivoPdf = 'data:application/pdf;base64,' + buffer.toString('base64');
      console.log(`  PDF: ${doc.archivo} (${(buffer.length / 1024).toFixed(0)} KB)`);
    } else {
      console.log(`  WARN: No se encontro ${doc.archivo}`);
    }
    await prisma.documentoAAPP.create({
      data: {
        organismo: 'cnmc',
        categoria: doc.categoria,
        titulo: doc.titulo,
        descripcion: doc.descripcion || null,
        expediente: doc.expediente || null,
        fechaDocumento: new Date(doc.fechaDocumento),
        fechaNotificacion: doc.fechaNotificacion ? new Date(doc.fechaNotificacion) : null,
        fechaLimite: doc.fechaLimite ? new Date(doc.fechaLimite) : null,
        importe: doc.importe || null,
        estado: doc.estado,
        ejercicio: doc.ejercicio || null,
        archivoPdf,
        nombreArchivo: doc.archivo,
        notas: doc.notas || null
      }
    });
    imported++;
  }
  console.log(`\nImportados ${imported} documentos CNMC.`);

  // Crear obligaciones
  console.log('\nCreando obligaciones CNMC...');
  await prisma.obligacionAAPP.createMany({
    data: [
      { organismo: 'cnmc', nombre: 'Declaracion IBE (Ingresos Brutos Explotacion)', descripcion: 'Presentar declaracion anual de ingresos brutos de explotacion para la liquidacion de la Tasa General de Operadores (TGO). Obligatoria si ingresos > 1M EUR.', periodicidad: 'anual', mesVencimiento: 6, diaVencimiento: 30, ejercicioActual: 2025, estadoActual: 'pendiente', importeEstimado: 25, notas: 'Sede electronica: https://sede.cnmc.gob.es/tramites/telecomunicaciones/tasas-de-telecomunicaciones' },
      { organismo: 'cnmc', nombre: 'Pago Tasa General de Operadores (TGO)', descripcion: 'Pago de la TGO una vez presentada la declaracion IBE. Importe = 1 por mil de los ingresos brutos de explotacion.', periodicidad: 'anual', mesVencimiento: 6, diaVencimiento: 30, ejercicioActual: 2025, estadoActual: 'pendiente', importeEstimado: 25, notas: 'Se paga junto con la declaracion IBE o tras la liquidacion.' },
      { organismo: 'cnmc', nombre: 'Revision datos Registro de Operadores', descripcion: 'Mantener actualizados los datos del registro de operadores (representante legal, domicilio social, servicios).', periodicidad: 'anual', mesVencimiento: 1, diaVencimiento: 31, estadoActual: 'presentado', notas: 'Ultimo cambio: enero 2025 (cambio apoderado y domicilio).' }
    ]
  });
  console.log('Obligaciones creadas.');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
