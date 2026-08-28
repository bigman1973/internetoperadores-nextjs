import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findCostesFiles, downloadCostesFile } from '@/lib/microsoft-graph';
import { extractProfessionalCategoryFromPayrollText, parseCostesIOPdf, type ParseSummary } from '@/lib/nominas-parser';

// Increase Vercel function timeout to avoid timeouts when downloading multiple PDFs
export const maxDuration = 120;

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH'];

/**
 * Normalize a string for name matching: uppercase, remove accents
 */
function normalizeStr(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

/**
 * GET /api/admin/nominas/sync
 * Check which months are available in OneDrive vs already loaded in DB
 * Groups files by month so the UI shows one entry per month (not per individual file)
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

    // Get files available in OneDrive (both COSTES IO and individual nóminas)
    const oneDriveFiles = await findCostesFiles(anio);

    // Get months already loaded in DB
    const loadedMonths = await prisma.nomina.groupBy({
      by: ['mes'],
      where: { anio },
      _count: true,
    });
    const loadedMonthSet = new Set(loadedMonths.map(m => m.mes));

    // Group files by month for the UI (one entry per month)
    const monthGroups = new Map<number, {
      costesFile: (typeof oneDriveFiles)[0] | null;
      individualFiles: (typeof oneDriveFiles);
      monthNum: number;
      month: string;
    }>();

    for (const file of oneDriveFiles) {
      if (!monthGroups.has(file.monthNum)) {
        monthGroups.set(file.monthNum, {
          costesFile: null,
          individualFiles: [],
          monthNum: file.monthNum,
          month: file.month,
        });
      }
      const group = monthGroups.get(file.monthNum)!;
      if (file.tipo === 'costes_io') {
        group.costesFile = file;
      } else {
        group.individualFiles.push(file);
      }
    }

    // Build status for each month (one entry per month for the UI)
    const status = Array.from(monthGroups.values())
      .sort((a, b) => a.monthNum - b.monthNum)
      .map(group => {
        const mainFile = group.costesFile || group.individualFiles[0];
        const empleadosEnBD = loadedMonths.find(m => m.mes === group.monthNum)?._count || 0;
        return {
          name: group.costesFile
            ? `${group.costesFile.name} (+${group.individualFiles.length} individuales)`
            : `Nóminas individuales ${group.month} ${anio} (${group.individualFiles.length})`,
          id: mainFile?.id || '',
          month: group.month,
          monthNum: group.monthNum,
          loaded: loadedMonthSet.has(group.monthNum),
          empleadosEnBD,
        };
      });

    return NextResponse.json({
      anio,
      archivosOneDrive: status,
      mesesCargados: Array.from(loadedMonthSet).sort(),
      totalMesesDisponibles: status.length,
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
 *
 * Process flow:
 * 1. Process COSTES IO files first (bulk data for all employees except David Pérez)
 * 2. Process individual nóminas (NÓMINA IO) to:
 *    a. Link PDF file (archivoUrl, archivoNombre) to existing employee records
 *    b. Create new records for employees not in COSTES IO (e.g., David Pérez)
 *
 * Body: { anio: number, meses?: number[] }
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

    // Find all available files (COSTES IO + individual nóminas)
    const allFiles = await findCostesFiles(anio);

    // Filter by requested months if specified
    const filesToProcess = mesesFilter
      ? allFiles.filter(f => mesesFilter.includes(f.monthNum))
      : allFiles;

    if (filesToProcess.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se encontraron archivos para sincronizar',
        archivosDisponibles: allFiles.map(f => f.name),
      });
    }

    // Separate by type
    const costesFiles = filesToProcess.filter(f => f.tipo === 'costes_io');
    const individualFiles = filesToProcess.filter(f => f.tipo === 'nomina_individual');

    // Get all employees for matching
    const empleados = await prisma.empleado.findMany();
    const empleadoByNif = new Map(empleados.map(e => [e.nif, e]));
    // Build name lookup using nombreCompleto (the only name field in the model)
    const empleadoByName = new Map(empleados.map(e => [normalizeStr(e.nombreCompleto), e]));

    const results: { mes: number; success: boolean; summary?: Partial<ParseSummary>; error?: string; individualesVinculadas?: number }[] = [];
    const debugLog: string[] = [];

    // ============================================================
    // STEP 1: Process COSTES IO files (bulk employee data)
    // ============================================================
    for (const file of costesFiles) {
      try {
        const pdfBuffer = await downloadCostesFile(file.id);
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
          const empleado = empleadoByNif.get(nomina.nif);
          if (!empleado) {
            console.warn(`Empleado no encontrado por NIF: ${nomina.nif} (${nomina.nombre})`);
            continue;
          }

          // Check if already inserted in this batch (e.g. MENSUAL + FINIQUITO)
          const existing = await prisma.nomina.findUnique({
            where: {
              empleadoId_mes_anio: {
                empleadoId: empleado.id,
                mes: nomina.mes,
                anio: nomina.anio,
              },
            },
          });

          if (existing) {
            // Sum values (MENSUAL + FINIQUITO)
            await prisma.nomina.update({
              where: { id: existing.id },
              data: {
                devengadoTotal: existing.devengadoTotal + nomina.devengadoTotal,
                netoPercibir: existing.netoPercibir + nomina.netoPercibir,
                irpf: (existing.irpf || 0) + nomina.irpf,
                ssTrabajador: (existing.ssTrabajador || 0) + nomina.ssTrabajador,
                ssEmpresa: (existing.ssEmpresa || 0) + nomina.ssEmpresa,
                baseIrpf: (existing.baseIrpf || 0) + nomina.baseIrpf,
                costeTotalEmpresa: (existing.costeTotalEmpresa || 0) + nomina.costeTotalEmpresa,
                complementoEspecie: (existing.complementoEspecie || 0) + (nomina.complementoEspecie || 0) > 0
                  ? (existing.complementoEspecie || 0) + (nomina.complementoEspecie || 0)
                  : null,
              },
            });
          } else {
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
          }
          inserted++;
        }

        results.push({
          mes: file.monthNum,
          success: true,
          summary: { mes: summary.mes, anio: summary.anio, empleados: inserted, formato: summary.formato },
        });
      } catch (e: any) {
        results.push({ mes: file.monthNum, success: false, error: e.message });
      }
    }

    // ============================================================
    // STEP 2: Process individual nóminas
    // Strategy: FIRST process employees that need PDF parsing (not in COSTES IO),
    // THEN link PDFs for employees that already have data from COSTES IO.
    // This avoids memory/state issues with pdf-parse after processing many PDFs.
    // ============================================================
    
    // Helper: find employee by filename
    function findEmpleadoByFileName(fileName: string) {
      const nameMatch = fileName.match(/_([^.]+)\.pdf$/i);
      const rawEmployeeName = nameMatch ? nameMatch[1].trim() : '';
      if (!rawEmployeeName) return { empleado: null, rawName: '' };
      
      const employeeName = normalizeStr(rawEmployeeName);
      let empleado = empleadoByName.get(employeeName);
      
      if (!empleado) {
        const nameParts = employeeName.split(/\s+/);
        for (const [key, emp] of empleadoByName) {
          if (nameParts.every(part => key.includes(part))) {
            empleado = emp;
            break;
          }
        }
      }
      if (!empleado) {
        for (const emp of empleados) {
          const empNorm = normalizeStr(emp.nombreCompleto);
          if (empNorm.includes(employeeName) || employeeName.includes(empNorm)) {
            empleado = emp;
            break;
          }
        }
      }
      return { empleado: empleado || null, rawName: rawEmployeeName };
    }

    // PHASE A: Identify which files need parsing (employee not in COSTES IO)
    // Process these FIRST while memory is clean
    const needsParsing: { file: typeof individualFiles[0]; empleado: typeof empleados[0]; monthNum: number }[] = [];
    const justLink: { file: typeof individualFiles[0]; empleado: typeof empleados[0]; monthNum: number }[] = [];
    
    for (const file of individualFiles) {
      const { empleado, rawName } = findEmpleadoByFileName(file.name);
      if (!empleado) {
        debugLog.push(`SKIP: Empleado no encontrado por nombre: "${rawName}" (archivo: ${file.name})`);
        continue;
      }
      
      const existingNomina = await prisma.nomina.findUnique({
        where: {
          empleadoId_mes_anio: {
            empleadoId: empleado.id,
            mes: file.monthNum,
            anio,
          },
        },
      });
      
      if (!existingNomina) {
        needsParsing.push({ file, empleado, monthNum: file.monthNum });
      } else {
        justLink.push({ file, empleado, monthNum: file.monthNum });
      }
    }

    debugLog.push(`STEP2 PHASE A: ${needsParsing.length} files need parsing, ${justLink.length} files just need linking`);

    // PHASE A: Parse PDFs for employees not in COSTES IO (e.g., David Pérez)
    // Done FIRST to avoid memory issues from processing many PDFs
    const vinculadasByMonth = new Map<number, number>();
    
    for (const { file, empleado, monthNum } of needsParsing) {
      try {
        debugLog.push(`MATCH: "${file.name.match(/_([^.]+)\.pdf$/i)?.[1] || ''}" → ${empleado.nombreCompleto} (id: ${empleado.id})`);
        debugLog.push(`  existingNomina for ${empleado.nombreCompleto} mes=${monthNum}: NO`);
        
        const pdfBuffer = await downloadCostesFile(file.id);
        debugLog.push(`  Downloaded ${pdfBuffer.length} bytes for ${file.name}`);
        
        // Extract text first to debug if parsing fails
        const pdfParse = (await import('pdf-parse')).default;
        const pdfData = await pdfParse(pdfBuffer);
        const extractedText = pdfData.text;
        debugLog.push(`  PDF text length: ${extractedText.length}, has NIF.B: ${extractedText.includes('NIF.')}, has LIQUIDO: ${extractedText.includes('LIQUIDO')}`);
        debugLog.push(`  First 300 chars: ${extractedText.substring(0, 300).replace(/\n/g, '|')}`);
        
          const parsed = await parseCostesIOPdf(pdfBuffer, file.name);
          const categoriaProfesional = extractProfessionalCategoryFromPayrollText(extractedText);
          debugLog.push(`  Parsed: ${parsed.nominas.length} nominas, format=${parsed.formato}, mes=${parsed.mes}, anio=${parsed.anio}, categoria=${categoriaProfesional || 'no detectada'}`);
        
        if (parsed.nominas.length > 0) {
          const nominaData = parsed.nominas.find(n => n.nif === empleado.nif) || parsed.nominas[0];
          const downloadUrl = `/api/admin/nominas/download/${file.id}`;
          await prisma.nomina.create({
            data: {
              empleadoId: empleado.id,
              mes: nominaData.mes || monthNum,
              anio: nominaData.anio || anio,
              devengadoTotal: nominaData.devengadoTotal,
              netoPercibir: nominaData.netoPercibir,
              irpf: nominaData.irpf,
              ssTrabajador: nominaData.ssTrabajador,
              ssEmpresa: nominaData.ssEmpresa,
              baseIrpf: nominaData.baseIrpf,
              costeTotalEmpresa: nominaData.costeTotalEmpresa,
              complementoEspecie: nominaData.complementoEspecie > 0 ? nominaData.complementoEspecie : null,
              archivoUrl: downloadUrl,
              archivoNombre: file.name,
              categoriaProfesional,
              categoriaExtraidaAt: categoriaProfesional ? new Date() : null,
            },
          });
          vinculadasByMonth.set(monthNum, (vinculadasByMonth.get(monthNum) || 0) + 1);
          debugLog.push(`  CREATED record for ${empleado.nombreCompleto} mes=${monthNum}`);
        } else {
          debugLog.push(`  WARN: No data extracted from ${file.name} - skipping`);
        }
      } catch (e: any) {
        debugLog.push(`  ERROR processing ${file.name}: ${e.message}`);
      }
    }

    // PHASE B: Link PDFs for employees that already have data from COSTES IO
    // No PDF parsing needed here - just update the archivoUrl/archivoNombre
    for (const { file, empleado, monthNum } of justLink) {
      try {
        const downloadUrl = `/api/admin/nominas/download/${file.id}`;
        const existingNomina = await prisma.nomina.findUnique({
          where: {
            empleadoId_mes_anio: {
              empleadoId: empleado.id,
              mes: monthNum,
              anio,
            },
          },
        });
        
        if (existingNomina) {
          let categoriaProfesional = existingNomina.categoriaProfesional;
          if (!categoriaProfesional) {
            try {
              const pdfBuffer = await downloadCostesFile(file.id);
              const pdfParse = (await import('pdf-parse')).default;
              const pdfData = await pdfParse(pdfBuffer);
              categoriaProfesional = extractProfessionalCategoryFromPayrollText(pdfData.text);
            } catch (categoryError: any) {
              debugLog.push(`  WARN categoría ${file.name}: ${categoryError.message}`);
            }
          }
          await prisma.nomina.update({
            where: { id: existingNomina.id },
            data: {
              archivoUrl: downloadUrl,
              archivoNombre: file.name,
              categoriaProfesional,
              categoriaExtraidaAt: categoriaProfesional ? new Date() : existingNomina.categoriaExtraidaAt,
            },
          });
          vinculadasByMonth.set(monthNum, (vinculadasByMonth.get(monthNum) || 0) + 1);
        }
      } catch (e: any) {
        debugLog.push(`  ERROR linking ${file.name}: ${e.message}`);
      }
    }

    // Update results with individual linking counts
    for (const [monthNum, count] of vinculadasByMonth) {
      const existingResult = results.find(r => r.mes === monthNum);
      if (existingResult) {
        existingResult.individualesVinculadas = count;
      } else {
        results.push({
          mes: monthNum,
          success: count > 0,
          summary: { mes: monthNum, anio, empleados: count, formato: 'nomina_individual' as const },
          individualesVinculadas: count,
        });
      }
    }

    return NextResponse.json({
      success: true,
      anio,
      resultados: results,
      resumen: {
        totalArchivos: costesFiles.length + individualFiles.length,
        exitosos: results.filter(r => r.success).length,
        fallidos: results.filter(r => !r.success).length,
        individualesVinculadas: results.reduce((sum, r) => sum + (r.individualesVinculadas || 0), 0),
      },
      debugLog,
    });
  } catch (error: any) {
    console.error('Error en POST /api/admin/nominas/sync:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
