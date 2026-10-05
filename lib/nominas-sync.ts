import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { downloadCostesFile, type PayrollDriveFile } from '@/lib/microsoft-graph';
import { extractProfessionalCategoryFromPayrollText, extractPayrollPdfText, parseCostesIOPdf, type NominaParseResult } from '@/lib/nominas-parser';

type Pdf = { file: PayrollDriveFile; records: NominaParseResult[]; verified: boolean; category?: string | null };
type Result = { mes: number; success: boolean; empleados: number; documentos: number; liquidacionesEnResumen?: number; sinReciboIndividual?: number; incidencias: string[]; error?: string };

function normaliseNif(s: string) { return s.replace(/[\s.-]/g, '').toUpperCase(); }
function normaliseName(s: string) { return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
export function nameSuffixMatchesPerson(suffix: string, fullName: string) {
  const parts = normaliseName(fullName).split(/[^A-Z]+/).filter(part => part.length > 2);
  // La gestoría usa tanto _DAVID PÉREZ como _DAVIDPÉREZ; comprobar que
  // cada token sucesivo pertenece al nombre impreso, aunque cambie el orden.
  let remaining = normaliseName(suffix).replace(/[^A-Z]/g, '');
  if (!remaining) return true;
  const available = [...parts];
  while (remaining) {
    const next = available.filter(part => remaining.startsWith(part)).sort((a, b) => b.length - a.length)[0];
    if (!next) return false;
    remaining = remaining.slice(next.length);
    available.splice(available.indexOf(next), 1);
  }
  return true;
}
function cents(n: number) { return Math.round((n + Number.EPSILON) * 100); }
export function payrollAmountsMatch(summary: NominaParseResult, individual: NominaParseResult) {
  const fields = ['devengadoTotal', 'netoPercibir', 'irpf', 'ssTrabajador', 'ssEmpresa', 'baseIrpf', 'costeTotalEmpresa'] as const;
  return fields.every(field => Math.abs(cents(summary[field]) - cents(individual[field])) <= 1);
}
function sum(a: NominaParseResult, b: NominaParseResult): NominaParseResult {
  const result = { ...a };
  for (const key of ['devengadoTotal', 'netoPercibir', 'irpf', 'ssTrabajador', 'ssEmpresa', 'baseIrpf', 'costeTotalEmpresa', 'complementoEspecie'] as const) {
    result[key] = (cents(a[key]) + cents(b[key])) / 100;
  }
  return result;
}

/** Un mes se prepara por completo antes de escribir nada; los documentos ambiguos lo bloquean. */
export async function syncPayrollMonth(year: number, month: number, files: PayrollDriveFile[], dryRun = false): Promise<Result> {
  const candidates = files.filter(f => f.monthNum === month);
  const bulk = candidates.filter(f => f.tipo === 'costes_io');
  if (bulk.length > 1) return { mes: month, success: false, empleados: 0, documentos: 0, incidencias: [], error: 'Hay más de un resumen de costes: revisar manualmente' };
  if (!candidates.length) return { mes: month, success: false, empleados: 0, documentos: 0, incidencias: [], error: 'No hay PDF reconocibles para este mes' };

  const parsed: Pdf[] = [];
  const incidencias: string[] = [];
  for (const [position, file] of candidates.entries()) {
    try {
      // OneDrive puede servir temporalmente un PDF ilegible aun cuando el mismo
      // drive item sea correcto en la siguiente lectura. Reintentar SOLO la
      // descarga/extracción, nunca las discrepancias de importe o identidad.
      let read: { summary: Awaited<ReturnType<typeof parseCostesIOPdf>>; category: string | null } | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const buffer = await downloadCostesFile(file.id);
          if (buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('El archivo no tiene formato PDF');
          const summary = await parseCostesIOPdf(buffer, file.name);
          const category = file.tipo === 'liquidacion' ? null : extractProfessionalCategoryFromPayrollText(await extractPayrollPdfText(buffer));
          read = { summary, category };
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 350));
        }
      }
      if (!read) throw new Error('El PDF no se ha podido leer');
      const { summary, category } = read;
      if (!summary.nominas.length) throw new Error('No se han podido leer líneas de nómina');
      if (summary.mes !== month || summary.anio !== year || summary.nominas.some(n => n.mes !== month || n.anio !== year)) {
        throw new Error('El período impreso no coincide con la carpeta');
      }
      if (file.tipo === 'costes_io' && !summary.verificado) throw new Error('El resumen de costes no cuadra: verificar con gestoría');
      if (file.tipo !== 'costes_io' && summary.nominas.length !== 1) throw new Error('Se esperaba una única persona en este PDF');
      if (file.tipo === 'nomina_individual' && !summary.verificado) throw new Error('Los importes de la nómina individual no cuadran');
      // Comprobar identidad por nombre para impedir asignar un PDF individual a otra persona.
      if (file.tipo !== 'costes_io') {
        const fileName = normaliseName(file.name);
        const suffix = fileName.includes('_') ? fileName.split('_').pop()?.replace(/\.PDF$/, '').trim() || '' : '';
        if (suffix && !nameSuffixMatchesPerson(suffix, summary.nominas[0].nombre)) throw new Error('La persona en el PDF no coincide con el nombre del archivo');
      }
      parsed.push({ file, records: summary.nominas, verified: summary.verificado, category });
    } catch (error) {
      // Jamás grabar una importación parcial que oculte un documento o duplique importes.
      const known = ['El archivo no tiene formato PDF', 'No se han podido leer líneas de nómina', 'El período impreso no coincide con la carpeta',
        'El resumen de costes no cuadra: verificar con gestoría', 'Se esperaba una única persona en este PDF',
        'Los importes de la nómina individual no cuadran', 'La persona en el PDF no coincide con el nombre del archivo'];
      const reason = error instanceof Error && known.includes(error.message) ? error.message : 'El PDF no se ha podido leer; revisa el documento en OneDrive';
      return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: `No se importó el PDF ${position + 1} de ${candidates.length} (tipo ${file.tipo}): ${reason}` };
    }
  }

  const empleados = await prisma.empleado.findMany({ select: { id: true, nif: true, nombreCompleto: true } });
  const employeeByNif = new Map(empleados.map(e => [normaliseNif(e.nif), e]));
  const values = new Map<string, NominaParseResult>();
  const fromBulk = new Set<string>();
  const bulkComponents = new Map<string, Map<'NOMINA' | 'LIQUIDACION', NominaParseResult>>();
  const linked = new Map<string, { file: PayrollDriveFile; tipo: 'NOMINA' | 'LIQUIDACION'; category?: string | null }[]>();
  const individualSeen = new Set<string>();

  for (const pdf of parsed) {
    for (const record of pdf.records) {
      const employee = employeeByNif.get(normaliseNif(record.nif));
      if (!employee) {
        incidencias.push(`Hay una persona en un PDF de tipo ${pdf.file.tipo} que no consta en Personal`);
        continue;
      }
      const employeeId = employee.id;
      if (pdf.file.tipo === 'costes_io') {
        values.set(employeeId, values.has(employeeId) ? sum(values.get(employeeId)!, record) : record);
        fromBulk.add(employeeId);
        const componentType = record.tipo === 'LIQUIDACION' ? 'LIQUIDACION' : 'NOMINA';
        const components = bulkComponents.get(employeeId) || new Map<'NOMINA' | 'LIQUIDACION', NominaParseResult>();
        components.set(componentType, components.has(componentType) ? sum(components.get(componentType)!, record) : record);
        bulkComponents.set(employeeId, components);
      } else {
        const tipo = pdf.file.tipo === 'liquidacion' ? 'LIQUIDACION' : 'NOMINA';
        if (record.tipo && record.tipo !== tipo) {
          return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
            error: 'El contenido del PDF no coincide con su clasificación como nómina o liquidación' };
        }
        const key = `${employeeId}:${tipo}`;
        if (individualSeen.has(key)) {
          return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: `Hay dos PDF de ${tipo.toLowerCase()} del mismo empleado; revisar antes de sumar` };
        }
        individualSeen.add(key);
        const docs = linked.get(employeeId) || [];
        docs.push({ file: pdf.file, tipo, category: pdf.category });
        linked.set(employeeId, docs);
        // La liquidación puede venir ya incluida en el resumen de gestoría. Ese resumen
        // es la única fuente de cifras cuando existe la persona, pero conservamos ambos PDF.
        if (!fromBulk.has(employeeId)) {
          if (tipo === 'LIQUIDACION' && !pdf.verified) {
            return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
              error: 'La liquidación no cuadra y no hay resumen autorizado para verificarla' };
          }
          if (values.has(employeeId)) {
            return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
              error: 'Hay nómina y liquidación separadas sin resumen de costes: requieren conciliación antes de contabilizarlas' };
          }
          values.set(employeeId, record);
        }
        else {
          const component = bulkComponents.get(employeeId)?.get(tipo);
          if (!component) {
            return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
              error: 'El PDF individual no tiene un componente correspondiente en el resumen de costes. Se requiere conciliación manual.' };
          }
          if (!payrollAmountsMatch(component, record)) {
            return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
              error: 'Los importes de un PDF individual no concuerdan con el resumen de costes. No se ha contabilizado el mes.' };
          }
        }
      }
    }
  }

  if (incidencias.some(message => message.startsWith('Hay una persona'))) {
    return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: 'Hay personas sin ficha en Personal: no se ha escrito nada' };
  }
  if (!values.size) return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: 'No se extrajeron importes válidos' };

  if (bulk.length) {
    const previouslyLoaded = await prisma.nomina.findMany({ where: { mes: month, anio: year }, select: { empleadoId: true } });
    if (previouslyLoaded.some(n => !values.has(n.empleadoId))) {
      return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
        error: 'El resumen no incluye a todos los empleados que ya constaban ese mes. No se ha modificado nada.' };
    }
  }

  const linkedCount = [...linked.values()].reduce((count, docs) => count + docs.length, 0);
  const liquidacionesEnResumen = [...bulkComponents.values()].filter(components => components.has('LIQUIDACION')).length;
  const sinReciboIndividual = [...values.keys()].filter(id => !(linked.get(id) || []).some(doc => doc.tipo === 'NOMINA')).length;
  if (dryRun) return { mes: month, success: true, empleados: values.size, documentos: linkedCount, liquidacionesEnResumen, sinReciboIndividual, incidencias };
  await prisma.$transaction(async tx => {
    for (const [employeeId, record] of values) {
      const docs = linked.get(employeeId) || [];
      const payslip = docs.find(d => d.tipo === 'NOMINA');
      const settlement = bulkComponents.get(employeeId)?.get('LIQUIDACION');
      const data = {
        devengadoTotal: record.devengadoTotal, netoPercibir: record.netoPercibir,
        irpf: record.irpf, ssTrabajador: record.ssTrabajador, ssEmpresa: record.ssEmpresa,
        baseIrpf: record.baseIrpf, costeTotalEmpresa: record.costeTotalEmpresa,
        complementoEspecie: record.complementoEspecie || null,
        liquidacionDevengado: settlement?.devengadoTotal ?? null,
        liquidacionNeto: settlement?.netoPercibir ?? null,
        liquidacionCoste: settlement?.costeTotalEmpresa ?? null,
        ...(payslip ? { archivoNombre: payslip.file.name, archivoUrl: `/api/admin/nominas/download/${encodeURIComponent(payslip.file.id)}` } : {}),
        ...(payslip?.category ? { categoriaProfesional: payslip.category, categoriaExtraidaAt: new Date() } : {}),
      };
      const payroll = await tx.nomina.upsert({
        where: { empleadoId_mes_anio: { empleadoId: employeeId, mes: month, anio: year } },
        create: { empleadoId: employeeId, mes: month, anio: year, ...data, archivoNombre: payslip?.file.name || bulk[0]?.name || null },
        update: data,
      });
      for (const { file, tipo } of docs) {
        const previous = await tx.nominaDocumento.findUnique({
          where: { nominaId_tipo: { nominaId: payroll.id, tipo } }, select: { driveItemId: true },
        });
        if (previous && previous.driveItemId !== file.id) {
          throw new Error('El PDF vigente fue sustituido en OneDrive. Se requiere revisión manual antes de reemplazarlo.');
        }
        const original = await tx.nominaDocumento.findUnique({ where: { driveItemId: file.id }, select: { nominaId: true } });
        if (original && original.nominaId !== payroll.id) throw new Error('El mismo PDF aparece en dos nóminas diferentes');
        await tx.nominaDocumento.upsert({
          where: { driveItemId: file.id }, create: { nominaId: payroll.id, driveItemId: file.id, nombre: file.name, tipo },
          update: { nombre: file.name, tipo },
        });
      }
    }
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { mes: month, success: true, empleados: values.size, documentos: linkedCount, liquidacionesEnResumen, sinReciboIndividual, incidencias };
}
