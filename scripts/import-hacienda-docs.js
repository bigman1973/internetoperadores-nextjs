const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const BASE_DIR = '/home/ubuntu/hacienda_docs/2. Agencia Tributaria - Internet Operadores';

// Función para encontrar archivo por patrón parcial
function findFile(pattern) {
  try {
    const files = fs.readdirSync(BASE_DIR);
    const match = files.find(f => f.includes(pattern));
    if (match) return path.join(BASE_DIR, match);
    // Buscar en subdirectorio 036
    const subdir = path.join(BASE_DIR, '036');
    if (fs.existsSync(subdir)) {
      const subfiles = fs.readdirSync(subdir);
      const submatch = subfiles.find(f => f.includes(pattern));
      if (submatch) return path.join(subdir, submatch);
    }
  } catch(e) {}
  return null;
}

const DOCS = [
  // === APREMIOS Y LIQUIDACIONES EJECUTIVAS ===
  { titulo: 'Apremio Impuesto Sociedades 2021', categoria: 'apremio', fechaDocumento: '2023-02-02', ejercicio: 2021, estado: 'pagado', descripcion: 'Providencia de apremio por impago del Impuesto de Sociedades del ejercicio 2021.', pattern: 'APREMIO IMPUESTO SOCIEDADES' },
  { titulo: 'Apremio IVA 3T 2022', categoria: 'apremio', fechaDocumento: '2023-02-02', ejercicio: 2022, estado: 'pagado', descripcion: 'Providencia de apremio por impago del IVA del tercer trimestre de 2022.', pattern: 'APREMIO IVA 3T 2022' },
  { titulo: 'Providencia de apremio', categoria: 'apremio', fechaDocumento: '2023-10-16', estado: 'pagado', descripcion: 'Providencia de apremio general de la Agencia Tributaria.', pattern: 'PROVIDENCIA DE APREMIO' },
  { titulo: 'IVA Autoliquidacion 1T-2025 (Modelo 303)', categoria: 'iva', fechaDocumento: '2025-09-08', ejercicio: 2025, estado: 'pendiente', descripcion: 'Notificacion relativa a la autoliquidacion del IVA del primer trimestre de 2025 (Modelo 303).', pattern: 'IVA AUTOLIQUIDACI' },
  { titulo: 'Modelo 111 2T-2025 - No ingreso domiciliacion', categoria: 'irpf', fechaDocumento: '2025-09-08', ejercicio: 2025, estado: 'pendiente', descripcion: 'Notificacion de no ingreso por domiciliacion del Modelo 111 (retenciones IRPF) del segundo trimestre de 2025.', pattern: '2T-2025 MOD.111' },
  { titulo: 'Apremio IVA Autoliquidacion 2T 2025', categoria: 'apremio', fechaDocumento: '2026-02-09', ejercicio: 2025, estado: 'pendiente', descripcion: 'Apremio por impago de la autoliquidacion del IVA del segundo trimestre de 2025.', pattern: 'APREMIO IVA AUTOLIQUIDACI.*2T 2025' },
  { titulo: 'Apremio IVA Autoliquidacion 3T 2025', categoria: 'apremio', fechaDocumento: '2026-02-09', ejercicio: 2025, estado: 'pendiente', descripcion: 'Apremio por impago de la autoliquidacion del IVA del tercer trimestre de 2025.', pattern: 'APREMIO IVA AUTOLIQUIDACI.*3T 2025' },
  { titulo: 'Liquidacion en ejecutiva A2681225530169974', categoria: 'apremio', fechaDocumento: '2026-01-27', estado: 'pendiente', expediente: 'A2681225530169974', descripcion: 'Liquidacion en via ejecutiva de deuda tributaria.', pattern: 'LIQ. EN EJECUTIVA' },

  // === EMBARGOS ===
  { titulo: 'Embargo de cuentas bancarias', categoria: 'embargo', fechaDocumento: '2023-07-05', estado: 'resuelto', descripcion: 'Diligencia de embargo de cuentas bancarias por deudas tributarias pendientes.', pattern: 'EMBARGO DE CUENTAS' },
  { titulo: 'Notificacion embargo creditos VOLA', categoria: 'embargo', fechaDocumento: '2026-02-07', estado: 'pendiente', descripcion: 'Notificacion de embargo de creditos que Internet Operadores tiene con VOLA LOS DEL INTERNET SL (B25636572).', pattern: 'EMBARGO CREDITOS VOLA' },

  // === APLAZAMIENTOS Y FRACCIONAMIENTOS ===
  { titulo: 'Concesion aplazamiento/fraccionamiento de pago', categoria: 'aplazamiento', fechaDocumento: '2024-07-22', estado: 'resuelto', descripcion: 'Resolucion de concesion de aplazamiento y fraccionamiento de pago de deudas tributarias.', pattern: 'CONCESI.*APLAZAMIENTO' },
  { titulo: 'Aplazamiento - Resolucion', categoria: 'aplazamiento', fechaDocumento: '2024-10-15', estado: 'resuelto', descripcion: 'Resolucion de aplazamiento de deuda tributaria.', pattern: 'APLAZAMIENTO-RESOLUCI' },
  { titulo: 'Resolucion aplazamiento 282540447957B', categoria: 'aplazamiento', fechaDocumento: '2025-04-28', estado: 'resuelto', expediente: '282540447957B', descripcion: 'Resolucion de aplazamiento-fraccionamiento de pago.', pattern: '282540447957B' },
  { titulo: 'Resolucion aplazamiento-fraccionamiento (30/07/2025)', categoria: 'aplazamiento', fechaDocumento: '2025-07-30', estado: 'resuelto', descripcion: 'Resolucion de aplazamiento-fraccionamiento de pago.', pattern: '30.07.2025.*RESOLUCION APLAZAMIENTO' },
  { titulo: 'Resolucion aplazamiento-fraccionamiento (01/08/2025)', categoria: 'aplazamiento', fechaDocumento: '2025-08-01', estado: 'resuelto', descripcion: 'Resolucion de aplazamiento-fraccionamiento de pago.', pattern: '01.08.2025.*RESOLUCION APLAZAMIENTO' },
  { titulo: 'Resolucion aplazamiento 282540681191W (20/10/2025)', categoria: 'aplazamiento', fechaDocumento: '2025-10-20', estado: 'resuelto', expediente: '282540681191W', descripcion: 'Resolucion de aplazamiento-fraccionamiento.', pattern: '20.10.2025.*282540681191W' },
  { titulo: 'Resolucion aplazamiento 282540681191W (31/12/2025)', categoria: 'aplazamiento', fechaDocumento: '2025-12-31', estado: 'resuelto', expediente: '282540681191W', descripcion: 'Resolucion de aplazamiento-fraccionamiento.', pattern: '31.12.2025.*282540681191W' },
  { titulo: 'Resolucion aplazamiento 2825540587860M', categoria: 'aplazamiento', fechaDocumento: '2025-12-31', estado: 'resuelto', expediente: '2825540587860M', descripcion: 'Resolucion de aplazamiento-fraccionamiento.', pattern: '2825540587860M' },
  { titulo: 'Resolucion aplazamiento 2825540604965K', categoria: 'aplazamiento', fechaDocumento: '2025-12-31', estado: 'resuelto', expediente: '2825540604965K', descripcion: 'Resolucion de aplazamiento-fraccionamiento.', pattern: '2825540604965K' },
  { titulo: 'Resolucion aplazamiento 282640357748X', categoria: 'aplazamiento', fechaDocumento: '2026-01-29', estado: 'resuelto', expediente: '282640357748X', descripcion: 'Resolucion de aplazamiento-fraccionamiento.', pattern: '282640357748X' },
  { titulo: 'Resolucion aplazamiento 282026000160428', categoria: 'aplazamiento', fechaDocumento: '2026-05-22', estado: 'resuelto', expediente: '282026000160428', descripcion: 'Resolucion de aplazamiento.', pattern: '282026000160428' },
  { titulo: 'Resolucion aplazamiento 282640639993E', categoria: 'aplazamiento', fechaDocumento: '2026-07-27', estado: 'resuelto', expediente: '282640639993E', descripcion: 'Resolucion de aplazamiento-fraccionamiento.', pattern: '282640639993E' },

  // === REQUERIMIENTOS ===
  { titulo: 'Requerimiento informacion operaciones con VOLA', categoria: 'requerimiento', fechaDocumento: '2026-08-10', expediente: 'RECAU-R258522026000670', estado: 'pendiente', fechaLimite: '2026-09-01', descripcion: 'Requerimiento de informacion de la Dependencia Regional de Recaudacion de Lleida sobre relaciones comerciales con VOLA LOS DEL INTERNET SL (B25636572) desde 2023. Piden contratos, facturas, medios de pago, personas de contacto y locales vinculados.', notas: 'URGENTE: Plazo 15 dias habiles. Contacto: Ma Antonia Sabate Farrus (maantonieta.sabate@correo.aeat.es). Responder via sede electronica AEAT.', pattern: '10.08.2026.*REQUERIMIENTO' },
  { titulo: 'Requerimiento anexo diligencia creditos VOLA', categoria: 'requerimiento', fechaDocumento: '2026-03-18', estado: 'pendiente', descripcion: 'Requerimiento con anexo de diligencia relativo a los creditos con VOLA LOS DEL INTERNET SL.', pattern: 'REQUERIMIENTO ANEXO DE DILIGENCIA' },
  { titulo: 'Requerimiento datos aplazamiento IVA', categoria: 'requerimiento', fechaDocumento: '2026-04-20', estado: 'pendiente', descripcion: 'Requerimiento de datos adicionales para el aplazamiento de IVA en autoliquidacion.', pattern: 'REQUERIMIENTO DATOS APLAZAMIENTO' },
  { titulo: 'Reiteracion requerimiento', categoria: 'requerimiento', fechaDocumento: '2026-04-27', estado: 'pendiente', descripcion: 'Reiteracion de requerimiento previo no atendido.', notas: 'Reiteracion: indica que un requerimiento anterior no fue contestado en plazo.', pattern: 'REITERACI' },

  // === DEVOLUCIONES ===
  { titulo: 'Pago devoluciones Modelo 200 ejercicio 2023', categoria: 'devolucion', fechaDocumento: '2024-09-24', ejercicio: 2023, estado: 'resuelto', descripcion: 'Pago de devolucion del Impuesto de Sociedades (Modelo 200) del ejercicio 2023.', pattern: 'Pago devoluciones 200' },

  // === DOCUMENTOS CENSALES Y ADMINISTRATIVOS ===
  { titulo: 'Alta operador intracomunitario', categoria: 'censal', fechaDocumento: '2023-03-15', estado: 'resuelto', descripcion: 'Alta en el registro de operadores intracomunitarios (ROI).', pattern: 'ALTA INTRACOMUNITARIO' },
  { titulo: 'Emision NIF', categoria: 'censal', fechaDocumento: '2023-08-28', estado: 'resuelto', descripcion: 'Emision del Numero de Identificacion Fiscal de Internet Operadores.', pattern: 'EMISI.*NIF' },
  { titulo: 'Modelo 036 - Cambio domicilio fiscal', categoria: 'censal', fechaDocumento: '2023-11-07', estado: 'resuelto', descripcion: 'Presentacion del Modelo 036 para cambio de domicilio fiscal.', pattern: 'MODELO 036-CAMBIO DOMICILIO' },
  { titulo: 'Modelo 036 - Cambio domicilio Paseo de la Habana', categoria: 'censal', fechaDocumento: '2023-11-07', estado: 'resuelto', descripcion: 'Modelo 036 para cambio de domicilio a Paseo de la Habana.', pattern: 'Modelo 036 - Cambio de Domicilio Paseo' },
  { titulo: 'Campana Verifactu', categoria: 'comunicacion', fechaDocumento: '2025-10-30', estado: 'resuelto', descripcion: 'Comunicacion de la AEAT sobre la campana Verifactu para la facturacion electronica.', pattern: 'VERIFACTU' },
  { titulo: 'IRPF Internet Operadores 2024 (Modelo 331)', categoria: 'irpf', fechaDocumento: '2025-01-01', ejercicio: 2024, estado: 'presentado', descripcion: 'Declaracion IRPF de Internet Operadores del ejercicio 2024.', pattern: '331. IRPF' },
  { titulo: 'Certificado Censal Internet Operadores 2025', categoria: 'censal', fechaDocumento: '2025-01-01', estado: 'resuelto', descripcion: 'Certificado censal actualizado de Internet Operadores para el ejercicio 2025.', pattern: 'Certificado Censal Internet Operadores 2025' },
  { titulo: 'Certificado Declaracion Censal', categoria: 'censal', fechaDocumento: '2023-01-01', estado: 'resuelto', descripcion: 'Certificado de declaracion censal de Internet Operadores.', pattern: 'CERTIFICADO DECLARACION CENSAL' },
  { titulo: 'CIF Internet Operadores S.L.', categoria: 'censal', fechaDocumento: '2023-01-01', estado: 'resuelto', descripcion: 'Tarjeta del CIF de Internet Operadores S.L. (B25808619).', pattern: 'CIF INTERNET OPERADORES' },
];

async function main() {
  console.log('Importando documentos de Hacienda...\n');
  let imported = 0;
  let notFound = 0;

  for (const doc of DOCS) {
    let archivoPdf = null;
    let nombreArchivo = null;
    
    const filePath = findFile(doc.pattern);
    if (filePath) {
      const buffer = fs.readFileSync(filePath);
      archivoPdf = 'data:application/pdf;base64,' + buffer.toString('base64');
      nombreArchivo = path.basename(filePath);
      console.log(`  OK: ${doc.titulo} -> ${nombreArchivo} (${(buffer.length / 1024).toFixed(0)} KB)`);
    } else {
      console.log(`  WARN: No encontrado para patron "${doc.pattern}"`);
      notFound++;
    }

    await prisma.documentoAAPP.create({
      data: {
        organismo: 'hacienda',
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
        nombreArchivo,
        notas: doc.notas || null
      }
    });
    imported++;
  }

  console.log(`\nImportados: ${imported} documentos (${notFound} sin PDF)`);

  // Crear obligaciones fiscales
  console.log('\nCreando obligaciones fiscales...');
  await prisma.obligacionAAPP.createMany({
    data: [
      { organismo: 'hacienda', nombre: 'IVA Trimestral (Modelo 303)', descripcion: 'Autoliquidacion trimestral del IVA. Plazos: 1T (20 abril), 2T (20 julio), 3T (20 octubre), 4T (30 enero siguiente).', periodicidad: 'trimestral', mesVencimiento: 4, diaVencimiento: 20, estadoActual: 'pendiente', notas: 'Presentacion y pago via sede electronica AEAT.' },
      { organismo: 'hacienda', nombre: 'Retenciones IRPF (Modelo 111)', descripcion: 'Declaracion trimestral de retenciones e ingresos a cuenta del IRPF de trabajadores y profesionales.', periodicidad: 'trimestral', mesVencimiento: 4, diaVencimiento: 20, estadoActual: 'pendiente', notas: 'Coincide con los mismos plazos que el IVA trimestral.' },
      { organismo: 'hacienda', nombre: 'Impuesto de Sociedades (Modelo 200)', descripcion: 'Declaracion anual del Impuesto de Sociedades. Plazo: 25 dias naturales siguientes a los 6 meses posteriores al cierre del ejercicio.', periodicidad: 'anual', mesVencimiento: 7, diaVencimiento: 25, estadoActual: 'pendiente', notas: 'Para ejercicios que cierran el 31/12, el plazo es hasta el 25 de julio.' },
      { organismo: 'hacienda', nombre: 'Resumen anual IVA (Modelo 390)', descripcion: 'Resumen anual de las operaciones de IVA del ejercicio.', periodicidad: 'anual', mesVencimiento: 1, diaVencimiento: 30, estadoActual: 'pendiente', notas: 'Plazo hasta el 30 de enero del ano siguiente.' },
      { organismo: 'hacienda', nombre: 'Resumen anual retenciones (Modelo 190)', descripcion: 'Resumen anual de retenciones e ingresos a cuenta del IRPF.', periodicidad: 'anual', mesVencimiento: 1, diaVencimiento: 31, estadoActual: 'pendiente', notas: 'Plazo hasta el 31 de enero del ano siguiente.' },
    ]
  });
  console.log('Obligaciones fiscales creadas.');
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
