import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findCostesFiles, downloadCostesFile } from '@/lib/microsoft-graph';
import { parseCostesIOPdf, type ParseSummary } from '@/lib/nominas-parser';

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH'];

/**
 * GET /api/admin/nominas/sync
 * Check which months are available in OneDrive vs already loaded in DB
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const anio = parseInt(searchParams.get('anio') || '2026');

    // Get files available in OneDrive
    const oneDriveFiles = await findCostesFiles(anio);

    // Get months already loaded in DB
    const loadedMonths = await prisma.nomina.groupBy({
      by: ['mes'],
      where: { anio },
      _count: true,
    });
    const loadedMonthSet = new Set(loadedMonths.map(m => m.mes));

    // Build status for each file
    const status = oneDriveFiles.map(file => ({
      ...file,
      loaded: loadedMonthSet.has(file.monthNum),
      empleadosEnBD: loadedMonths.find(m => m.mes === file.monthNum)?._count || 0,
    }));

    return NextResponse.json({
      anio,
      archivosOneDrive: status,
      mesesCargados: Array.from(loadedMonthSet).sort(),
      totalMesesDisponibles: oneDriveFiles.length,
      totalMesesCargados: loadedMonths.length,
    });
  } catch (error: any) {
    console.error('Error en GET /api/admin/nominas/sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/admin/nominas/sync
 * Sync nóminas from OneDrive - download, parse and load into DB
 * Body: { anio: number, meses?: number[] } - if meses not specified, sync all available
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
      return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
    }

    const body = await req.json();
    const anio = body.anio || 2026;
    const mesesFilter: number[] | null = body.meses || null;

    // Find available COSTES IO files
    const costesFiles = await findCostesFiles(anio);
    
    // Filter by requested months if specified
    const filesToSync = mesesFilter
      ? costesFiles.filter(f => mesesFilter.includes(f.monthNum))
      : costesFiles;

    if (filesToSync.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se encontraron archivos COSTES IO para sincronizar',
        archivosDisponibles: costesFiles.map(f => f.name),
      });
    }

    // Get all employees by NIF for matching
    const empleados = await prisma.empleado.findMany();
    const empleadoByNif = new Map(empleados.map(e => [e.nif, e]));
    const empleadoByCodigo = new Map(empleados.map(e => [e.codigoNomina, e]));

    const results: { mes: number; success: boolean; summary?: ParseSummary; error?: string }[] = [];

    for (const file of filesToSync) {
      try {
        // Download PDF
        const pdfBuffer = await downloadCostesFile(file.id);
        
        // Parse PDF
        const summary = await parseCostesIOPdf(pdfBuffer, file.name);
        
        if (summary.nominas.length === 0) {
          results.push({ mes: file.monthNum, success: false, error: 'No se encontraron datos de nómina en el PDF' });
          continue;
        }

        // Delete existing nóminas for this month/year to avoid duplicates
        await prisma.nomina.deleteMany({
          where: { mes: summary.mes, anio: summary.anio },
        });

        // Insert new nóminas
        let inserted = 0;
        for (const nomina of summary.nominas) {
          // Find employee by NIF
          const empleado = empleadoByNif.get(nomina.nif);
          if (!empleado) {
            console.warn(`Empleado no encontrado por NIF: ${nomina.nif} (${nomina.nombre})`);
            continue;
          }

          await prisma.nomina.create({
            data: {
              empleadoId: empleado.id,
              mes: nomina.mes,
              anio: nomina.anio,
              devengadoTotal: nomina.devengadoTotal,
              netoPercibir: nomina.netoPercibir,
              irpf: nomina.irpf,
              ssTrabajador: nomina.ssTrabajador,
              ssEmpresa: nomina.ssEmpresa,
              baseIrpf: nomina.baseIrpf,
              costeTotalEmpresa: nomina.costeTotalEmpresa,
              complementoEspecie: nomina.complementoEspecie > 0 ? nomina.complementoEspecie : null,
              archivoNombre: file.name,
            },
          });
          inserted++;
        }

        results.push({
          mes: file.monthNum,
          success: true,
          summary: { ...summary, nominas: [] }, // Don't send full nominas in response
        });
      } catch (e: any) {
        results.push({ mes: file.monthNum, success: false, error: e.message });
      }
    }

    return NextResponse.json({
      success: true,
      anio,
      resultados: results,
      resumen: {
        totalArchivos: filesToSync.length,
        exitosos: results.filter(r => r.success).length,
        fallidos: results.filter(r => !r.success).length,
      },
    });
  } catch (error: any) {
    console.error('Error en POST /api/admin/nominas/sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
