import prisma from '@/lib/prisma';
import { downloadCostesFile } from '@/lib/microsoft-graph';
import { parsePayrollProfessionalCategory } from '@/lib/nominas-parser';
import { calculateSalarySimulation } from '@/lib/simulacion-salarial';

export async function buildSalarySimulationContext({
  empleadoId,
  fechaEfectiva,
  brutoAnualPropuesto,
  includePayrollCategory = false,
}: {
  empleadoId: string;
  fechaEfectiva: string;
  brutoAnualPropuesto: number;
  includePayrollCategory?: boolean;
}) {
  const effectiveDate = new Date(`${fechaEfectiva}T00:00:00.000Z`);
  if (Number.isNaN(effectiveDate.getTime())) throw new Error('La fecha efectiva no es válida');

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    select: {
      id: true,
      nombreCompleto: true,
      nif: true,
      email: true,
      departamento: true,
      categoria: true,
      estado: true,
      condicionesSalariales: {
        where: { fechaEfectiva: { lte: effectiveDate } },
        orderBy: { fechaEfectiva: 'desc' },
        take: 1,
        select: { id: true, brutoAnual: true, fechaEfectiva: true, motivo: true },
      },
      nominas: {
        where: {
          OR: [
            { anio: { lt: effectiveDate.getUTCFullYear() } },
            { anio: effectiveDate.getUTCFullYear(), mes: { lte: effectiveDate.getUTCMonth() + 1 } },
          ],
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
        take: 6,
        select: {
          anio: true,
          mes: true,
          devengadoTotal: true,
          baseSS: true,
          ssEmpresa: true,
          gastosDesplazamiento: true,
          archivoUrl: true,
          archivoNombre: true,
        },
      },
    },
  });

  if (!empleado) throw new Error('Empleado no encontrado');

  const condicionVigente = empleado.condicionesSalariales[0] || null;
  const ultimaNomina = empleado.nominas[0] || null;
  const nominaConPdf = empleado.nominas.find(nomina => Boolean(nomina.archivoUrl)) || null;
  let categoriaNomina: string | null = null;

  if (includePayrollCategory && nominaConPdf?.archivoUrl) {
    const fileId = nominaConPdf.archivoUrl.match(/\/api\/admin\/nominas\/download\/([^/?#]+)/)?.[1];
    if (fileId) {
      try {
        const pdfBuffer = await downloadCostesFile(fileId);
        categoriaNomina = await parsePayrollProfessionalCategory(Buffer.from(pdfBuffer));
      } catch (error) {
        console.warn('No se pudo extraer la categoría profesional de la nómina de referencia:', error);
      }
    }
  }

  const brutoAnualActual = condicionVigente?.brutoAnual || (ultimaNomina ? ultimaNomina.devengadoTotal * 12 : 0);
  if (brutoAnualActual <= 0) throw new Error('No hay condición salarial ni nómina disponible para establecer el bruto anual actual');

  return {
    empleado: {
      id: empleado.id,
      nombreCompleto: empleado.nombreCompleto,
      nif: empleado.nif,
      email: empleado.email,
      departamento: empleado.departamento,
      categoria: categoriaNomina || empleado.categoria,
      categoriaOrigen: categoriaNomina ? ('nomina' as const) : ('ficha_empleado' as const),
      categoriaNominaPeriodo: categoriaNomina && nominaConPdf
        ? { mes: nominaConPdf.mes, anio: nominaConPdf.anio, archivoNombre: nominaConPdf.archivoNombre }
        : null,
      estado: empleado.estado,
    },
    referenciaActual: condicionVigente
      ? {
          origen: 'condicion_salarial' as const,
          fecha: condicionVigente.fechaEfectiva,
          motivo: condicionVigente.motivo,
        }
      : {
          origen: 'ultima_nomina' as const,
          fecha: ultimaNomina ? new Date(Date.UTC(ultimaNomina.anio, ultimaNomina.mes - 1, 1)) : null,
          motivo: null,
        },
    simulacion: calculateSalarySimulation({
      brutoAnualActual,
      brutoAnualPropuesto,
      fechaEfectiva,
      nominas: empleado.nominas,
    }),
  };
}
