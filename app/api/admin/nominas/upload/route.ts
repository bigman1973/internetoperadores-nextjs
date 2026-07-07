import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { parseCostesIOPdf } from '@/lib/nominas-parser';

const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'CONTABILIDAD', 'RRHH'];

/**
 * POST /api/admin/nominas/upload
 * Upload a COSTES IO PDF file, parse it and load into DB
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

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha proporcionado ningún archivo' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'El archivo debe ser un PDF' }, { status: 400 });
    }

    // Read file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);

    // Parse PDF
    const summary = await parseCostesIOPdf(pdfBuffer, file.name);

    if (summary.nominas.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se encontraron datos de nómina en el PDF. Formatos soportados: "COSTES IO" (resumen gestoría) y nóminas individuales (detalle por empleado).',
      }, { status: 400 });
    }

    if (summary.mes === 0 || summary.anio === 0) {
      return NextResponse.json({
        success: false,
        error: 'No se pudo detectar el mes/año del archivo. Verifica que el PDF contiene datos de periodo válidos.',
      }, { status: 400 });
    }

    if (!summary.verificado) {
      return NextResponse.json({
        success: false,
        error: `Los datos no verifican: Bruto (${summary.totalBruto.toFixed(2)}) ≠ Neto + IRPF + SS Trab (${(summary.totalNeto + summary.totalIRPF + summary.totalSSTrabajador).toFixed(2)}). Revisa el archivo.`,
        summary: { ...summary, nominas: [] },
      }, { status: 400 });
    }

    // Get all employees by NIF for matching
    const empleados = await prisma.empleado.findMany();
    const empleadoByNif = new Map(empleados.map(e => [e.nif, e]));

    // Determine which employees are in this PDF
    const empleadoIdsEnPdf: string[] = [];
    for (const nomina of summary.nominas) {
      const empleado = empleadoByNif.get(nomina.nif);
      if (empleado) empleadoIdsEnPdf.push(empleado.id);
    }

    // Delete strategy:
    // - COSTES IO (full summary): delete ALL nóminas for this month/year (replaces everything)
    // - Nómina individual: only delete records for the specific employees in the PDF
    let deleted;
    if (summary.formato === 'costes_io') {
      deleted = await prisma.nomina.deleteMany({
        where: { mes: summary.mes, anio: summary.anio },
      });
    } else {
      deleted = await prisma.nomina.deleteMany({
        where: {
          mes: summary.mes,
          anio: summary.anio,
          empleadoId: { in: empleadoIdsEnPdf },
        },
      });
    }

    // Insert new nóminas
    let inserted = 0;
    const noEncontrados: string[] = [];

    for (const nomina of summary.nominas) {
      const empleado = empleadoByNif.get(nomina.nif);
      if (!empleado) {
        noEncontrados.push(`${nomina.nombre} (${nomina.nif})`);
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

    return NextResponse.json({
      success: true,
      archivo: file.name,
      mes: summary.mes,
      anio: summary.anio,
      empleadosProcesados: inserted,
      empleadosEnPDF: summary.nominas.length,
      eliminadosPrevios: deleted.count,
      noEncontrados: noEncontrados.length > 0 ? noEncontrados : undefined,
      resumen: {
        totalBruto: summary.totalBruto,
        totalNeto: summary.totalNeto,
        totalIRPF: summary.totalIRPF,
        totalSSTrabajador: summary.totalSSTrabajador,
        totalSSEmpresa: summary.totalSSEmpresa,
        totalCosteEmpresa: summary.totalCosteEmpresa,
        verificado: summary.verificado,
      },
    });
  } catch (error: any) {
    console.error('Error en POST /api/admin/nominas/upload:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
