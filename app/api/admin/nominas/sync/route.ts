import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { findCostesFiles, downloadCostesFile } from '@/lib/microsoft-graph';
import { parseCostesIOPdf, type ParseSummary } from '@/lib/nominas-parser';

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
    // STEP 2: Process individual nóminas (link PDFs + David Pérez)
    // ============================================================
    const individualByMonth = new Map<number, typeof individualFiles>();
    for (const file of individualFiles) {
      if (!individualByMonth.has(file.monthNum)) {
        individualByMonth.set(file.monthNum, []);
      }
      individualByMonth.get(file.monthNum)!.push(file);
    }

    for (const [monthNum, files] of individualByMonth) {
      let vinculadas = 0;

      for (const file of files) {
        try {
          // Extract employee name from filename
          // Pattern: "NÓMINA IO JULIO 2026_DAVID PÉREZ.pdf"
          const nameMatch = file.name.match(/_([^.]+)\.pdf$/i);
          const rawEmployeeName = nameMatch ? nameMatch[1].trim() : '';

          if (!rawEmployeeName) {
            console.warn(`No se pudo extraer nombre del archivo: ${file.name}`);
            continue;
          }

          const employeeName = normalizeStr(rawEmployeeName);

          // Find employee by name (try multiple strategies)
          let empleado = empleadoByName.get(employeeName);

          // Try partial matching if exact match fails
          if (!empleado) {
            // Split the filename name into parts and try matching
            const nameParts = employeeName.split(/\s+/);
            for (const [key, emp] of empleadoByName) {
              // Check if all parts of the filename name appear in the full name
              if (nameParts.every(part => key.includes(part))) {
                empleado = emp;
                break;
              }
            }
          }

          // Last resort: check if the full name contains the file name or vice versa
          if (!empleado) {
            for (const emp of empleados) {
              const empNorm = normalizeStr(emp.nombreCompleto);
              if (empNorm.includes(employeeName) || employeeName.includes(empNorm)) {
                empleado = emp;
                break;
              }
            }
          }

          if (!empleado) {
            debugLog.push(`SKIP: Empleado no encontrado por nombre: "${rawEmployeeName}" (archivo: ${file.name})`);
            continue;
          }
          debugLog.push(`MATCH: "${rawEmployeeName}" → ${empleado.nombreCompleto} (id: ${empleado.id})`);

          // Check if nómina record already exists for this employee/month
          const existingNomina = await prisma.nomina.findUnique({
            where: {
              empleadoId_mes_anio: {
                empleadoId: empleado.id,
                mes: monthNum,
                anio,
              },
            },
          });

          // Build the download URL (API route that proxies from OneDrive)
          const downloadUrl = `/api/admin/nominas/download/${file.id}`;

          debugLog.push(`  existingNomina for ${empleado.nombreCompleto} mes=${monthNum}: ${existingNomina ? `YES (dev=${existingNomina.devengadoTotal})` : 'NO'}`);

          if (existingNomina) {
            // Record exists: link the individual PDF
            // If existing record has zero values (placeholder), try to fill with parsed data
            if (existingNomina.devengadoTotal === 0 && existingNomina.netoPercibir === 0) {
              // Placeholder record - try to parse and fill with real data
              try {
                const pdfBuffer = await downloadCostesFile(file.id);
                const parsed = await parseCostesIOPdf(pdfBuffer, file.name);
                if (parsed.nominas.length > 0) {
                  const nominaData = parsed.nominas.find(n => n.nif === empleado!.nif) || parsed.nominas[0];
                  await prisma.nomina.update({
                    where: { id: existingNomina.id },
                    data: {
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
                    },
                  });
                } else {
                  await prisma.nomina.update({
                    where: { id: existingNomina.id },
                    data: { archivoUrl: downloadUrl, archivoNombre: file.name },
                  });
                }
              } catch {
                await prisma.nomina.update({
                  where: { id: existingNomina.id },
                  data: { archivoUrl: downloadUrl, archivoNombre: file.name },
                });
              }
            } else {
              // Record has real data from COSTES IO: just link the PDF
              await prisma.nomina.update({
                where: { id: existingNomina.id },
                data: {
                  archivoUrl: downloadUrl,
                  archivoNombre: file.name,
                },
              });
            }
            vinculadas++;
          } else {
            // Record does NOT exist (e.g., David Pérez not in COSTES IO)
            // Download and parse the individual nómina to get numeric data
            try {
              const pdfBuffer = await downloadCostesFile(file.id);
              const parsed = await parseCostesIOPdf(pdfBuffer, file.name);

              if (parsed.nominas.length > 0) {
                const nominaData = parsed.nominas.find(n => n.nif === empleado!.nif) || parsed.nominas[0];

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
                  },
                });
                vinculadas++;
              } else {
                // Parser couldn't extract data - do NOT create placeholder
                console.warn(`No se pudieron extraer datos numéricos de: ${file.name} - skipping`);
              }
            } catch (parseErr: any) {
              debugLog.push(`  ERROR parsing ${file.name}: ${parseErr.message}`);
              console.error(`Error parsing individual nómina ${file.name}:`, parseErr.message, parseErr.stack);
            }
          }
        } catch (e: any) {
          debugLog.push(`  OUTER ERROR ${file.name}: ${e.message}`);
          console.error(`Error procesando nómina individual ${file.name}:`, e.message);
        }
      }

      // Update or add result for this month
      const existingResult = results.find(r => r.mes === monthNum);
      if (existingResult) {
        existingResult.individualesVinculadas = vinculadas;
      } else {
        results.push({
          mes: monthNum,
          success: vinculadas > 0,
          summary: { mes: monthNum, anio, empleados: vinculadas, formato: 'nomina_individual' as const },
          individualesVinculadas: vinculadas,
        });
      }
    }

    return NextResponse.json({
      success: true,
      anio,
      resultados: results,
      resumen: {
        totalArchivos: costesFiles.length + individualByMonth.size,
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
