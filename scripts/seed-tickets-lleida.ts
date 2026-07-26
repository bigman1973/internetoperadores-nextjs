import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';

const prisma = new PrismaClient();

function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const str = String(value).trim();
  if (!str) return null;
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }
  const num = Number(value);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

async function main() {
  const filePath = path.resolve('/home/ubuntu/upload/DraxtonLleida-Perfomance2026.xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets['Ticketing'];
  const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  console.log(`Total filas en Excel: ${rows.length}`);

  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const ticketId = String(row['Ticket'] || '').trim();
    if (!ticketId) { skipped++; continue; }

    const fechaCreacion = parseExcelDate(row['Fecha_Creación'] || row['Fecha_Creacion']);
    if (!fechaCreacion) { skipped++; continue; }

    const fechaObjetivo = parseExcelDate(row['TargetEndDate']);
    const fechaCierre = parseExcelDate(row['Fecha_Cierre']);
    const mes = fechaCreacion.getMonth() + 1;
    const anio = fechaCreacion.getFullYear();

    const data = {
      ticketId,
      titulo: String(row['Titulo'] || '').trim(),
      prioridad: String(row['priority'] || '').trim() || null,
      severidad: String(row['Severidad'] || '').trim() || null,
      estatus: String(row['Estatus'] || '').trim(),
      usuario: String(row['Usuario'] || '').trim() || null,
      fechaCreacion,
      fechaObjetivo,
      fechaCierre,
      asignadoA: String(row['AssignedTo'] || '').trim() || null,
      grupoResolucion: String(row['Resolution_Group'] || '').trim() || null,
      slaStatus: String(row['SLA_Status'] || '').trim() || null,
      localidad: String(row['Localidad'] || '').trim() || null,
      gerencia: String(row['GERENCIA'] || '').trim() || null,
      categoriaTipo: String(row['Category_1rs_Tipo'] || '').trim() || null,
      categoriaNivel2: String(row['Category_2nd_Level'] || '').trim() || null,
      categoriaNivel3: String(row['Category_3rd_Level'] || '').trim() || null,
      descripcion: String(row['Descripción'] || '').trim() || null,
      categoriaResolucion: String(row['Categoría de Resolución'] || '').trim() || null,
      descripcionResolucion: String(row['Resolution_Description'] || '').trim() || null,
      metodoContacto: String(row['Método de Contacto'] || '').trim() || null,
      creadoPor: String(row['CreatedBy'] || '').trim() || null,
      planta: 'LLEIDA',
      mesImportacion: mes,
      anioImportacion: anio,
    };

    try {
      await prisma.ticketDraxton.upsert({
        where: { ticketId_planta: { ticketId, planta: 'LLEIDA' } },
        create: data,
        update: data,
      });
      imported++;
    } catch (e: any) {
      console.error(`Error ${ticketId}: ${e.message}`);
      skipped++;
    }
  }

  // Registrar importación
  await prisma.importacionTicketsDraxton.create({
    data: {
      planta: 'LLEIDA',
      nombreArchivo: 'DraxtonLleida-Perfomance2026.xlsx',
      totalTickets: rows.length,
      ticketsNuevos: imported,
      ticketsDuplicados: skipped,
      importadoPor: 'seed-script',
    },
  });

  console.log(`✓ Importados: ${imported}, Saltados: ${skipped}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
