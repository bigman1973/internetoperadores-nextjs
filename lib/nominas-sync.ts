import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { downloadCostesFile, type PayrollDriveFile } from '@/lib/microsoft-graph';
import { extractPayrollReimbursements, extractProfessionalCategoryFromPayrollText, extractPayrollPdfText, extractPayrollSeniorityDate, parseCombinedSettlementReceipt, parseCostesIOPdf, type NominaParseResult } from '@/lib/nominas-parser';

type Pdf = { file: PayrollDriveFile; records: NominaParseResult[]; verified: boolean; category?: string | null; seniority?: string | null; reimbursements?: number | null; mixedSettlement?: NonNullable<ReturnType<typeof parseCombinedSettlementReceipt>> };
type Result = { mes: number; success: boolean; empleados: number; documentos: number; liquidacionesEnResumen?: number; sinReciboIndividual?: number; empleadosFueraResumen?: number; davidSeparadoVerificado?: boolean; incidencias: string[]; error?: string };

function normaliseNif(s: string) { return s.replace(/[\s.-]/g, '').toUpperCase(); }
function normaliseName(s: string) { return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
export function requiresDavidSeparatePayslip(year: number, month: number) { return year > 2026 || (year === 2026 && month >= 9); }
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
export function liquidationFileMatchesPerson(fileName: string, fullName: string) {
  const normalized = normaliseName(fileName).trim();
  if (!/^(?:LIQUIDACION|FINIQUITO)[\s_-]/.test(normalized) || !normalized.endsWith('.PDF')) return false;
  // OneDrive añade «(1)» al guardar una copia. No forma parte del nombre
  // de la persona ni debe invalidar la comprobación del NIF del PDF.
  const stem = normalized.replace(/\.PDF$/, '').replace(/\s*\(\d{1,3}\)$/, '');
  const suffix = stem.includes('_') ? stem.split('_').at(-1)?.trim() || '' : stem.replace(/^(?:LIQUIDACION|FINIQUITO)[\s-]+/, '').trim();
  return Boolean(suffix) && nameSuffixMatchesPerson(suffix, fullName);
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
  if (requiresDavidSeparatePayslip(year, month) && !bulk.length) return { mes: month, success: false, empleados: 0, documentos: 0, incidencias: [], error: 'Falta el resumen de costes de la gestoría; no se importará solo la nómina separada de David.' };

  const parsed: Pdf[] = [];
  const incidencias: string[] = [];
  for (const [position, file] of candidates.entries()) {
    try {
      // OneDrive puede servir temporalmente un PDF ilegible aun cuando el mismo
      // drive item sea correcto en la siguiente lectura. Reintentar SOLO la
      // descarga/extracción, nunca las discrepancias de importe o identidad.
      let read: { summary: Awaited<ReturnType<typeof parseCostesIOPdf>> | null; category: string | null; seniority: string | null; reimbursements: number | null; mixedSettlement: ReturnType<typeof parseCombinedSettlementReceipt> } | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const buffer = await downloadCostesFile(file.id);
          if (buffer.subarray(0, 4).toString() !== '%PDF') throw new Error('El archivo no tiene formato PDF');
          const text = file.tipo === 'liquidacion' || file.tipo === 'nomina_individual' ? await extractPayrollPdfText(buffer) : null;
          const mixedSettlement = file.tipo === 'liquidacion' && text ? parseCombinedSettlementReceipt(text) : null;
          const summary = mixedSettlement ? null : await parseCostesIOPdf(buffer, file.name);
          const category = file.tipo === 'liquidacion' ? null : extractProfessionalCategoryFromPayrollText(text || await extractPayrollPdfText(buffer));
          const seniority = file.tipo === 'nomina_individual' && text ? extractPayrollSeniorityDate(text) : null;
          const reimbursements = file.tipo === 'nomina_individual' && text ? extractPayrollReimbursements(text) : null;
          read = { summary, category, seniority, reimbursements, mixedSettlement };
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 350));
        }
      }
      if (!read) throw new Error('El PDF no se ha podido leer');
      const { summary, category, seniority, reimbursements, mixedSettlement } = read;
      if (mixedSettlement) {
        if (mixedSettlement.mes !== month || mixedSettlement.anio !== year || mixedSettlement.dia < 1 || mixedSettlement.dia > 31) throw new Error('El período impreso no coincide con la carpeta');
        if (!liquidationFileMatchesPerson(file.name, mixedSettlement.nombre)) throw new Error('La persona en el PDF no coincide con el nombre del archivo');
        parsed.push({ file, records: [], verified: true, category, mixedSettlement });
        continue;
      }
      if (!summary) throw new Error('No se han podido leer líneas de nómina');
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
      parsed.push({ file, records: summary.nominas, verified: summary.verificado, category, seniority, reimbursements });
    } catch (error) {
      // Jamás grabar una importación parcial que oculte un documento o duplique importes.
      const known = ['El archivo no tiene formato PDF', 'No se han podido leer líneas de nómina', 'El período impreso no coincide con la carpeta',
        'El resumen de costes no cuadra: verificar con gestoría', 'Se esperaba una única persona en este PDF',
        'Los importes de la nómina individual no cuadran', 'La persona en el PDF no coincide con el nombre del archivo'];
      const reason = error instanceof Error && known.includes(error.message) ? error.message : 'El PDF no se ha podido leer; revisa el documento en OneDrive';
      return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: `No se importó el PDF ${position + 1} de ${candidates.length} (tipo ${file.tipo}): ${reason}` };
    }
  }

  const empleados = await prisma.empleado.findMany({ select: { id: true, nif: true, nombreCompleto: true, email: true, fechaAlta: true, antiguedadNomina: true } });
  const employeeByNif = new Map(empleados.map(e => [normaliseNif(e.nif), e]));
  const values = new Map<string, NominaParseResult>();
  const fromBulk = new Set<string>();
  const bulkComponents = new Map<string, Map<'NOMINA' | 'LIQUIDACION', NominaParseResult>>();
  const linked = new Map<string, { file: PayrollDriveFile; tipo: 'NOMINA' | 'LIQUIDACION'; category?: string | null; seniority?: string | null; reimbursements?: number | null }[]>();
  const individualSeen = new Set<string>();

  for (const pdf of parsed) {
    if (pdf.mixedSettlement) {
      const receipt = pdf.mixedSettlement;
      const employee = employeeByNif.get(normaliseNif(receipt.nif));
      if (!employee) { incidencias.push('Hay una persona en un PDF de tipo liquidacion que no consta en Personal'); continue; }
      const components = bulkComponents.get(employee.id);
      const total = values.get(employee.id);
      const settlement = components?.get('LIQUIDACION');
      if (!fromBulk.has(employee.id) || !total || !settlement || cents(total.devengadoTotal) !== receipt.devengado || cents(total.netoPercibir) !== receipt.liquido ||
          (receipt.indemnizacion !== null && (cents(settlement.devengadoTotal) !== receipt.indemnizacion || cents(settlement.netoPercibir) !== receipt.indemnizacion))) {
        return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: 'La liquidación conjunta no coincide al céntimo con nómina y finiquito del resumen de costes. No se ha contabilizado.' };
      }
      if (individualSeen.has(`${employee.id}:LIQUIDACION`)) {
        return { mes: month, success: false, empleados: 0, documentos: 0, incidencias, error: 'Hay dos PDF de liquidación del mismo empleado; revisión necesaria' };
      }
      individualSeen.add(`${employee.id}:LIQUIDACION`);
      linked.set(employee.id, [...(linked.get(employee.id) || []), { file: pdf.file, tipo: 'LIQUIDACION' }]);
      continue;
    }
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
        const reimbursements = tipo === 'NOMINA' && pdf.reimbursements !== null && pdf.reimbursements !== undefined && cents(pdf.reimbursements) < cents(record.devengadoTotal)
          ? pdf.reimbursements : null;
        if (tipo === 'NOMINA' && reimbursements === null) incidencias.push('Un recibo individual no permite verificar sus reintegros; su salario anual no se proyectará hasta revisión.');
        docs.push({ file: pdf.file, tipo, category: pdf.category, seniority: pdf.seniority, reimbursements });
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

  // El director general recibe un PDF separado y no consta en el resumen de
  // gestoría. Su NIF se verifica contra la ficha de Personal como los demás.
  // A partir de septiembre de 2026 no aceptar un mes que lo omita por error.
  const david = empleados.find(e => e.email?.toLowerCase() === 'david.perez@internetoperadores.com');
  const davidSeparadoVerificado = Boolean(david && linked.get(david.id)?.some(doc => doc.tipo === 'NOMINA') && values.has(david.id));
  if (requiresDavidSeparatePayslip(year, month) && !davidSeparadoVerificado) {
    return { mes: month, success: false, empleados: 0, documentos: 0, incidencias,
      error: 'Falta el recibo individual separado de David en OneDrive o no coincide con su ficha de Personal. No se ha importado el mes.' };
  }

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
  const empleadosFueraResumen = [...values.keys()].filter(id => !fromBulk.has(id)).length;
  const seniorityUpdates = new Map<string, Date>();
  const hireDateUpdates = new Map<string, Date>();
  const lastDayOfMonth = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  for (const employee of empleados) {
    const individualPayslip = linked.get(employee.id)?.find(doc => doc.tipo === 'NOMINA');
    const date = individualPayslip?.seniority;
    if (!date) {
      if (individualPayslip && !employee.fechaAlta) incidencias.push('Un recibo individual no permite leer la fecha de alta contractual: revisa la ficha de Personal.');
      continue;
    }
    if (date > lastDayOfMonth) {
      incidencias.push('Una fecha de antigüedad es posterior al período de su nómina y requiere revisión; no se ha usado para el alta.');
      continue;
    }
    const verifiedDate = new Date(`${date}T00:00:00.000Z`);
    if (!employee.antiguedadNomina) seniorityUpdates.set(employee.id, verifiedDate);
    else if (employee.antiguedadNomina.toISOString().slice(0, 10) !== date) {
      incidencias.push('Una antigüedad del recibo no coincide con la ya registrada en Personal; no se sustituirá automáticamente.');
      continue;
    }
    if (!employee.fechaAlta) hireDateUpdates.set(employee.id, verifiedDate);
    else if (employee.fechaAlta.toISOString().slice(0, 10) !== date) {
      incidencias.push('La fecha de alta contractual difiere de la antigüedad de la nómina; no se sustituirá automáticamente.');
    }
  }
  if (dryRun) return { mes: month, success: true, empleados: values.size, documentos: linkedCount, liquidacionesEnResumen, sinReciboIndividual, empleadosFueraResumen, davidSeparadoVerificado, incidencias };
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
        ...(payslip?.reimbursements !== null && payslip?.reimbursements !== undefined ? { gastosNoSalariales: payslip.reimbursements } : {}),
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
      const seniority = seniorityUpdates.get(employeeId);
      if (seniority) await tx.empleado.updateMany({ where: { id: employeeId, antiguedadNomina: null }, data: { antiguedadNomina: seniority } });
      const hireDate = hireDateUpdates.get(employeeId);
      if (hireDate) await tx.empleado.updateMany({ where: { id: employeeId, fechaAlta: null }, data: { fechaAlta: hireDate } });
    }
  }, { timeout: 30000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { mes: month, success: true, empleados: values.size, documentos: linkedCount, liquidacionesEnResumen, sinReciboIndividual, empleadosFueraResumen, davidSeparadoVerificado, incidencias };
}
