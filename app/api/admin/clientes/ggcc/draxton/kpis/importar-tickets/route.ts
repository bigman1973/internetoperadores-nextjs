import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const planta = (formData.get('planta') as string) || 'LLEIDA';

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado archivo' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Buscar la hoja "Ticketing"
    const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('ticketing')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron datos en la hoja de ticketing' }, { status: 400 });
    }

    let ticketsNuevos = 0;
    let ticketsDuplicados = 0;
    let fechaMin: Date | null = null;
    let fechaMax: Date | null = null;

    for (const row of rows) {
      const ticketId = String(row['Ticket'] || '').trim();
      if (!ticketId) continue;

      // Parse dates
      const fechaCreacion = parseExcelDate(row['Fecha_Creación'] || row['Fecha_Creacion']);
      const fechaObjetivo = parseExcelDate(row['TargetEndDate']);
      const fechaCierre = parseExcelDate(row['Fecha_Cierre']);

      if (!fechaCreacion) continue;

      // Track date range
      if (!fechaMin || fechaCreacion < fechaMin) fechaMin = fechaCreacion;
      if (!fechaMax || fechaCreacion > fechaMax) fechaMax = fechaCreacion;

      const mes = fechaCreacion.getMonth() + 1;
      const anio = fechaCreacion.getFullYear();

      // Determine category (nivel 2) from the data
      const categoriaNivel2 = String(row['Category_2nd_Level'] || row['Category_1rs_Tipo'] || '').trim() || null;
      const categoriaTipo = String(row['Category_1rs_Tipo'] || '').trim() || null;

      const data = {
        ticketId,
        titulo: String(row['Titulo'] || row['Title'] || '').trim(),
        prioridad: String(row['priority'] || row['Priority'] || '').trim() || null,
        severidad: String(row['Severidad'] || row['Severity'] || '').trim() || null,
        estatus: String(row['Estatus'] || row['Status'] || '').trim(),
        usuario: String(row['Usuario'] || row['User'] || '').trim() || null,
        fechaCreacion,
        fechaObjetivo,
        fechaCierre,
        asignadoA: String(row['AssignedTo'] || '').trim() || null,
        grupoResolucion: String(row['Resolution_Group'] || '').trim() || null,
        slaStatus: String(row['SLA_Status'] || '').trim() || null,
        localidad: String(row['Localidad'] || '').trim() || null,
        gerencia: String(row['GERENCIA'] || '').trim() || null,
        categoriaTipo,
        categoriaNivel2,
        categoriaNivel3: String(row['Category_3rd_Level'] || '').trim() || null,
        descripcion: String(row['Descripción'] || row['Descripcion'] || '').trim() || null,
        categoriaResolucion: String(row['Categoría de Resolución'] || row['Categoria de Resolucion'] || '').trim() || null,
        descripcionResolucion: String(row['Resolution_Description'] || '').trim() || null,
        metodoContacto: String(row['Método de Contacto'] || row['Metodo de Contacto'] || '').trim() || null,
        creadoPor: String(row['CreatedBy'] || '').trim() || null,
        planta,
        mesImportacion: mes,
        anioImportacion: anio,
      };

      try {
        await prisma.ticketDraxton.upsert({
          where: { ticketId_planta: { ticketId, planta } },
          create: data,
          update: data,
        });
        ticketsNuevos++;
      } catch (e: any) {
        if (e.code === 'P2002') {
          ticketsDuplicados++;
        } else {
          console.error(`Error ticket ${ticketId}:`, e.message);
        }
      }
    }

    // Registrar importación
    await prisma.importacionTicketsDraxton.create({
      data: {
        planta,
        nombreArchivo: file.name,
        totalTickets: rows.length,
        ticketsNuevos,
        ticketsDuplicados,
        periodoDesde: fechaMin,
        periodoHasta: fechaMax,
        importadoPor: session.user?.email || null,
      },
    });

    return NextResponse.json({
      success: true,
      planta,
      totalFilas: rows.length,
      ticketsImportados: ticketsNuevos,
      ticketsDuplicados,
      periodoDesde: fechaMin?.toISOString(),
      periodoHasta: fechaMax?.toISOString(),
    });
  } catch (e: any) {
    console.error('Error importación tickets:', e);
    return NextResponse.json({ error: e.message || 'Error al importar' }, { status: 500 });
  }
}

function parseExcelDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;

  const str = String(value).trim();
  if (!str) return null;

  // Try ISO format: 2026-07-01 07:16:31.943000
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  // Try Excel serial number
  const num = Number(value);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

// GET: Listar importaciones realizadas
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const importaciones = await prisma.importacionTicketsDraxton.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return NextResponse.json({ importaciones });
}
