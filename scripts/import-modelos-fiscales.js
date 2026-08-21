const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

const BASE_DIR = '/home/ubuntu/upload';

// Datos extraídos de los PDFs
const DOCS = [
  // === MODELO 200 (IS) ===
  { file: 'MOD2002016.pdf', titulo: 'Impuesto Sociedades 2016 (Mod. 200)', categoria: 'sociedades', ejercicio: 2016, trimestre: null, fechaDocumento: '2017-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002017.pdf', titulo: 'Impuesto Sociedades 2017 (Mod. 200)', categoria: 'sociedades', ejercicio: 2017, trimestre: null, fechaDocumento: '2018-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002018.pdf', titulo: 'Impuesto Sociedades 2018 (Mod. 200)', categoria: 'sociedades', ejercicio: 2018, trimestre: null, fechaDocumento: '2019-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002019.pdf', titulo: 'Impuesto Sociedades 2019 (Mod. 200)', categoria: 'sociedades', ejercicio: 2019, trimestre: null, fechaDocumento: '2020-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002020.pdf', titulo: 'Impuesto Sociedades 2020 (Mod. 200)', categoria: 'sociedades', ejercicio: 2020, trimestre: null, fechaDocumento: '2021-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002021.pdf', titulo: 'Impuesto Sociedades 2021 (Mod. 200)', categoria: 'sociedades', ejercicio: 2021, trimestre: null, fechaDocumento: '2022-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002022.pdf', titulo: 'Impuesto Sociedades 2022 (Mod. 200)', categoria: 'sociedades', ejercicio: 2022, trimestre: null, fechaDocumento: '2023-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002023.pdf', titulo: 'Impuesto Sociedades 2023 (Mod. 200)', categoria: 'sociedades', ejercicio: 2023, trimestre: null, fechaDocumento: '2024-07-25', importe: null, estado: 'presentado' },
  { file: 'MOD2002024.pdf', titulo: 'Impuesto Sociedades 2024 (Mod. 200)', categoria: 'sociedades', ejercicio: 2024, trimestre: null, fechaDocumento: '2025-07-25', importe: 2254.58, estado: 'pagado' },
  { file: 'MOD2002025.pdf', titulo: 'Impuesto Sociedades 2025 (Mod. 200)', categoria: 'sociedades', ejercicio: 2025, trimestre: null, fechaDocumento: '2026-07-25', importe: 12588.71, estado: 'aplazado' },

  // === MODELO 347 (Informativa) ===
  { file: 'MOD3472016.pdf', titulo: 'Operaciones Terceros 2016 (Mod. 347)', categoria: 'declaracion', ejercicio: 2016, trimestre: null, fechaDocumento: '2017-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472017.pdf', titulo: 'Operaciones Terceros 2017 (Mod. 347)', categoria: 'declaracion', ejercicio: 2017, trimestre: null, fechaDocumento: '2018-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472018.pdf', titulo: 'Operaciones Terceros 2018 (Mod. 347)', categoria: 'declaracion', ejercicio: 2018, trimestre: null, fechaDocumento: '2019-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472019.pdf', titulo: 'Operaciones Terceros 2019 (Mod. 347)', categoria: 'declaracion', ejercicio: 2019, trimestre: null, fechaDocumento: '2020-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472020.pdf', titulo: 'Operaciones Terceros 2020 (Mod. 347)', categoria: 'declaracion', ejercicio: 2020, trimestre: null, fechaDocumento: '2021-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472021.pdf', titulo: 'Operaciones Terceros 2021 (Mod. 347)', categoria: 'declaracion', ejercicio: 2021, trimestre: null, fechaDocumento: '2022-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472022.pdf', titulo: 'Operaciones Terceros 2022 (Mod. 347)', categoria: 'declaracion', ejercicio: 2022, trimestre: null, fechaDocumento: '2023-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472023.pdf', titulo: 'Operaciones Terceros 2023 (Mod. 347)', categoria: 'declaracion', ejercicio: 2023, trimestre: null, fechaDocumento: '2024-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472024.pdf', titulo: 'Operaciones Terceros 2024 (Mod. 347)', categoria: 'declaracion', ejercicio: 2024, trimestre: null, fechaDocumento: '2025-02-28', importe: null, estado: 'presentado' },
  { file: 'MOD3472025.pdf', titulo: 'Operaciones Terceros 2025 (Mod. 347)', categoria: 'declaracion', ejercicio: 2025, trimestre: null, fechaDocumento: '2026-02-28', importe: null, estado: 'presentado' },

  // === MODELO 390 (Resumen anual IVA - Informativa) ===
  { file: 'MOD3902016.pdf', titulo: 'Resumen Anual IVA 2016 (Mod. 390)', categoria: 'iva', ejercicio: 2016, trimestre: null, fechaDocumento: '2017-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902017.pdf', titulo: 'Resumen Anual IVA 2017 (Mod. 390)', categoria: 'iva', ejercicio: 2017, trimestre: null, fechaDocumento: '2018-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902018.pdf', titulo: 'Resumen Anual IVA 2018 (Mod. 390)', categoria: 'iva', ejercicio: 2018, trimestre: null, fechaDocumento: '2019-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902019.pdf', titulo: 'Resumen Anual IVA 2019 (Mod. 390)', categoria: 'iva', ejercicio: 2019, trimestre: null, fechaDocumento: '2020-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902020.pdf', titulo: 'Resumen Anual IVA 2020 (Mod. 390)', categoria: 'iva', ejercicio: 2020, trimestre: null, fechaDocumento: '2021-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902021.pdf', titulo: 'Resumen Anual IVA 2021 (Mod. 390)', categoria: 'iva', ejercicio: 2021, trimestre: null, fechaDocumento: '2022-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902022.pdf', titulo: 'Resumen Anual IVA 2022 (Mod. 390)', categoria: 'iva', ejercicio: 2022, trimestre: null, fechaDocumento: '2023-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902023.pdf', titulo: 'Resumen Anual IVA 2023 (Mod. 390)', categoria: 'iva', ejercicio: 2023, trimestre: null, fechaDocumento: '2024-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902024.pdf', titulo: 'Resumen Anual IVA 2024 (Mod. 390)', categoria: 'iva', ejercicio: 2024, trimestre: null, fechaDocumento: '2025-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3902025.pdf', titulo: 'Resumen Anual IVA 2025 (Mod. 390)', categoria: 'iva', ejercicio: 2025, trimestre: null, fechaDocumento: '2026-01-30', importe: null, estado: 'presentado' },

  // === MODELO 190 (Resumen anual retenciones - Informativa) ===
  { file: 'MOD1902016.pdf', titulo: 'Resumen Anual Retenciones 2016 (Mod. 190)', categoria: 'irpf', ejercicio: 2016, trimestre: null, fechaDocumento: '2017-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902017.pdf', titulo: 'Resumen Anual Retenciones 2017 (Mod. 190)', categoria: 'irpf', ejercicio: 2017, trimestre: null, fechaDocumento: '2018-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902018.pdf', titulo: 'Resumen Anual Retenciones 2018 (Mod. 190)', categoria: 'irpf', ejercicio: 2018, trimestre: null, fechaDocumento: '2019-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902020.pdf', titulo: 'Resumen Anual Retenciones 2020 (Mod. 190)', categoria: 'irpf', ejercicio: 2020, trimestre: null, fechaDocumento: '2021-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902021.pdf', titulo: 'Resumen Anual Retenciones 2021 (Mod. 190)', categoria: 'irpf', ejercicio: 2021, trimestre: null, fechaDocumento: '2022-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902022.pdf', titulo: 'Resumen Anual Retenciones 2022 (Mod. 190)', categoria: 'irpf', ejercicio: 2022, trimestre: null, fechaDocumento: '2023-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902023.pdf', titulo: 'Resumen Anual Retenciones 2023 (Mod. 190)', categoria: 'irpf', ejercicio: 2023, trimestre: null, fechaDocumento: '2024-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902024.pdf', titulo: 'Resumen Anual Retenciones 2024 (Mod. 190)', categoria: 'irpf', ejercicio: 2024, trimestre: null, fechaDocumento: '2025-01-31', importe: null, estado: 'presentado' },
  { file: 'MOD1902025.pdf', titulo: 'Resumen Anual Retenciones 2025 (Mod. 190)', categoria: 'irpf', ejercicio: 2025, trimestre: null, fechaDocumento: '2026-01-31', importe: null, estado: 'presentado' },

  // === MODELO 303 (IVA Trimestral) ===
  { file: 'MOD3031T2021.pdf', titulo: 'IVA 1T 2021 (Mod. 303)', categoria: 'iva', ejercicio: 2021, trimestre: 1, fechaDocumento: '2021-04-20', importe: null, estado: 'presentado' },
  { file: 'MOD3032T2021.pdf', titulo: 'IVA 2T 2021 (Mod. 303)', categoria: 'iva', ejercicio: 2021, trimestre: 2, fechaDocumento: '2021-07-20', importe: null, estado: 'presentado' },
  { file: 'MOD3033T2021.pdf', titulo: 'IVA 3T 2021 (Mod. 303)', categoria: 'iva', ejercicio: 2021, trimestre: 3, fechaDocumento: '2021-10-20', importe: null, estado: 'presentado' },
  { file: 'MOD3034T2021.pdf', titulo: 'IVA 4T 2021 (Mod. 303)', categoria: 'iva', ejercicio: 2021, trimestre: 4, fechaDocumento: '2022-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3031T2022.pdf', titulo: 'IVA 1T 2022 (Mod. 303)', categoria: 'iva', ejercicio: 2022, trimestre: 1, fechaDocumento: '2022-04-20', importe: null, estado: 'presentado' },
  { file: 'MOD3032T2022.pdf', titulo: 'IVA 2T 2022 (Mod. 303)', categoria: 'iva', ejercicio: 2022, trimestre: 2, fechaDocumento: '2022-07-20', importe: null, estado: 'presentado' },
  { file: 'MOD3033T2022.pdf', titulo: 'IVA 3T 2022 (Mod. 303)', categoria: 'iva', ejercicio: 2022, trimestre: 3, fechaDocumento: '2022-10-20', importe: null, estado: 'presentado' },
  { file: 'MOD3034T2022.pdf', titulo: 'IVA 4T 2022 (Mod. 303)', categoria: 'iva', ejercicio: 2022, trimestre: 4, fechaDocumento: '2023-01-30', importe: null, estado: 'presentado' },
  { file: 'MOD3031T2023.pdf', titulo: 'IVA 1T 2023 (Mod. 303)', categoria: 'iva', ejercicio: 2023, trimestre: 1, fechaDocumento: '2023-04-20', importe: null, estado: 'presentado' },
  { file: 'MOD3032T2023.pdf', titulo: 'IVA 2T 2023 (Mod. 303)', categoria: 'iva', ejercicio: 2023, trimestre: 2, fechaDocumento: '2023-07-20', importe: null, estado: 'presentado' },
  { file: 'MOD3033T2023.pdf', titulo: 'IVA 3T 2023 (Mod. 303)', categoria: 'iva', ejercicio: 2023, trimestre: 3, fechaDocumento: '2023-10-20', importe: null, estado: 'presentado' },
  { file: 'MOD3034T2023.pdf', titulo: 'IVA 4T 2023 (Mod. 303)', categoria: 'iva', ejercicio: 2023, trimestre: 4, fechaDocumento: '2024-01-30', importe: 1685.89, estado: 'pagado' },
  { file: 'MOD3031T2024.pdf', titulo: 'IVA 1T 2024 (Mod. 303)', categoria: 'iva', ejercicio: 2024, trimestre: 1, fechaDocumento: '2024-04-20', importe: null, estado: 'presentado' },
  { file: 'MOD3032T2024.pdf', titulo: 'IVA 2T 2024 (Mod. 303)', categoria: 'iva', ejercicio: 2024, trimestre: 2, fechaDocumento: '2024-07-20', importe: 7230.27, estado: 'pagado' },
  { file: 'MOD3033T2024.pdf', titulo: 'IVA 3T 2024 (Mod. 303)', categoria: 'iva', ejercicio: 2024, trimestre: 3, fechaDocumento: '2024-10-20', importe: 2803.58, estado: 'pagado' },
  { file: 'MOD3034T2024.pdf', titulo: 'IVA 4T 2024 (Mod. 303)', categoria: 'iva', ejercicio: 2024, trimestre: 4, fechaDocumento: '2025-01-30', importe: 7.33, estado: 'pagado' },
  { file: 'MOD3031T2025.pdf', titulo: 'IVA 1T 2025 (Mod. 303)', categoria: 'iva', ejercicio: 2025, trimestre: 1, fechaDocumento: '2025-04-20', importe: 13987.37, estado: 'pendiente' },

  // === MODELO 111 (IRPF Trimestral) ===
  { file: 'MOD1112T2021.pdf', titulo: 'IRPF 2T 2021 (Mod. 111)', categoria: 'irpf', ejercicio: 2021, trimestre: 2, fechaDocumento: '2021-07-20', importe: 427.43, estado: 'pagado' },
  { file: 'MOD1113T2021.pdf', titulo: 'IRPF 3T 2021 (Mod. 111)', categoria: 'irpf', ejercicio: 2021, trimestre: 3, fechaDocumento: '2021-10-20', importe: 189.23, estado: 'pagado' },
  { file: 'MOD1114T2021.pdf', titulo: 'IRPF 4T 2021 (Mod. 111)', categoria: 'irpf', ejercicio: 2021, trimestre: 4, fechaDocumento: '2022-01-20', importe: null, estado: 'presentado' },
  { file: 'MOD1111T2022.pdf', titulo: 'IRPF 1T 2022 (Mod. 111)', categoria: 'irpf', ejercicio: 2022, trimestre: 1, fechaDocumento: '2022-04-20', importe: 5.71, estado: 'pagado' },
  { file: 'MOD1112T2022.pdf', titulo: 'IRPF 2T 2022 (Mod. 111)', categoria: 'irpf', ejercicio: 2022, trimestre: 2, fechaDocumento: '2022-07-20', importe: null, estado: 'presentado' },
  { file: 'MOD1113T2022.pdf', titulo: 'IRPF 3T 2022 (Mod. 111)', categoria: 'irpf', ejercicio: 2022, trimestre: 3, fechaDocumento: '2022-10-20', importe: null, estado: 'presentado' },
  { file: 'MOD1114T2022.pdf', titulo: 'IRPF 4T 2022 (Mod. 111)', categoria: 'irpf', ejercicio: 2022, trimestre: 4, fechaDocumento: '2023-01-20', importe: null, estado: 'presentado' },
  { file: 'MOD1111T2023.pdf', titulo: 'IRPF 1T 2023 (Mod. 111)', categoria: 'irpf', ejercicio: 2023, trimestre: 1, fechaDocumento: '2023-04-20', importe: null, estado: 'presentado' },
  { file: 'MOD1112T2023.pdf', titulo: 'IRPF 2T 2023 (Mod. 111)', categoria: 'irpf', ejercicio: 2023, trimestre: 2, fechaDocumento: '2023-07-20', importe: 8.08, estado: 'pagado' },
  { file: 'MOD1113T2023.pdf', titulo: 'IRPF 3T 2023 (Mod. 111)', categoria: 'irpf', ejercicio: 2023, trimestre: 3, fechaDocumento: '2023-10-20', importe: null, estado: 'presentado' },
  { file: 'MOD1114T2023.pdf', titulo: 'IRPF 4T 2023 (Mod. 111)', categoria: 'irpf', ejercicio: 2023, trimestre: 4, fechaDocumento: '2024-01-20', importe: null, estado: 'presentado' },
  { file: 'MOD1111T2024.pdf', titulo: 'IRPF 1T 2024 (Mod. 111)', categoria: 'irpf', ejercicio: 2024, trimestre: 1, fechaDocumento: '2024-04-20', importe: null, estado: 'presentado' },
  { file: 'MOD1112T2024.pdf', titulo: 'IRPF 2T 2024 (Mod. 111)', categoria: 'irpf', ejercicio: 2024, trimestre: 2, fechaDocumento: '2024-07-20', importe: 9.34, estado: 'pagado' },
  { file: 'MOD1113T2024.pdf', titulo: 'IRPF 3T 2024 (Mod. 111)', categoria: 'irpf', ejercicio: 2024, trimestre: 3, fechaDocumento: '2024-10-20', importe: null, estado: 'presentado' },
  { file: 'MOD1114T2024.pdf', titulo: 'IRPF 4T 2024 (Mod. 111)', categoria: 'irpf', ejercicio: 2024, trimestre: 4, fechaDocumento: '2025-01-20', importe: 8.08, estado: 'pagado' },
];

async function main() {
  let imported = 0;
  let skipped = 0;

  for (const doc of DOCS) {
    const filePath = path.join(BASE_DIR, doc.file);
    if (!fs.existsSync(filePath)) {
      console.log(`SKIP (no existe): ${doc.file}`);
      skipped++;
      continue;
    }

    // Verificar si ya existe
    const existing = await prisma.documentoAAPP.findFirst({
      where: { titulo: doc.titulo, organismo: 'hacienda' }
    });
    if (existing) {
      console.log(`SKIP (ya existe ID ${existing.id}): ${doc.titulo}`);
      skipped++;
      continue;
    }

    // Leer PDF
    const pdfBuffer = fs.readFileSync(filePath);
    const pdfBase64 = pdfBuffer.toString('base64');

    const trimestreInfo = doc.trimestre ? ` (${doc.trimestre}T)` : '';
    await prisma.documentoAAPP.create({
      data: {
        organismo: 'hacienda',
        titulo: doc.titulo,
        categoria: doc.categoria,
        fechaDocumento: new Date(doc.fechaDocumento),
        ejercicio: doc.ejercicio,
        estado: doc.estado,
        importe: doc.importe,
        descripcion: `Modelo fiscal presentado${trimestreInfo}. ${doc.importe ? 'Importe: ' + doc.importe.toLocaleString('es-ES', {minimumFractionDigits: 2}) + ' \u20ac' : 'Declaraci\u00f3n informativa (sin importe a ingresar)'}`,
        archivoPdf: pdfBase64,
        notas: doc.importe ? `Importe a ingresar: ${doc.importe.toLocaleString('es-ES', {minimumFractionDigits: 2})} \u20ac${trimestreInfo}` : `Declaraci\u00f3n informativa${trimestreInfo}`,
      }
    });
    imported++;
    console.log(`OK: ${doc.titulo} ${doc.importe ? '(' + doc.importe.toLocaleString('es-ES', {minimumFractionDigits: 2}) + ' €)' : '(informativa)'}`);
  }

  console.log(`\nResumen: ${imported} importados, ${skipped} omitidos`);
}

main().then(() => prisma.$disconnect()).catch(e => { console.error(e); prisma.$disconnect(); });
