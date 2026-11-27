import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isIspMirror } from '@/lib/isp-origen-policy';
import { checkAdminAreaRead, checkAdminAreaWrite } from '@/lib/api-admin-area-read';
import { assertFinanceRuntimeReady } from '@/lib/finanzas/finance-runtime-safety';
import { readBankInvoicingPopulation, type B7ReadDatabase } from '@/lib/finanzas/bank-invoicing-db';
import { summarizeBankInvoicing, type BankInvoicingSummary, type InvoiceSettlement } from '@/lib/finanzas/bank-invoicing-core';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store' };

type ExactMoney = Readonly<{
  cents: number | null;
  exactCents: string | null;
  unknownInvoiceCount: number;
}>;

/** No Float/rounding conversion: null is a visible unknown, not a zero balance. */
function strictMoneyCanonical(value: { cents: number | null; unknownInvoiceCount: number }): ExactMoney {
  return {
    cents: value.cents,
    exactCents: value.cents === null ? null : String(value.cents),
    unknownInvoiceCount: value.unknownInvoiceCount,
  };
}

function hasActualDebt(invoice: InvoiceSettlement): boolean {
  const remaining = invoice.remainingCents;
  return Number.isSafeInteger(remaining) && remaining !== 0;
}

/** Works symmetrically for credit notes: no positive-only shortcut. */
function isActualPartialCollection(invoice: InvoiceSettlement): boolean {
  const target = invoice.targetCents;
  const paid = invoice.paidDocumentaryCents;
  const remaining = invoice.remainingCents;
  return invoice.paymentState === 'PENDIENTE_COBRO'
    && Number.isSafeInteger(target) && target !== 0
    && Number.isSafeInteger(paid) && paid !== 0
    && Number.isSafeInteger(remaining) && remaining !== 0
    && Math.sign(target) === Math.sign(paid)
    && Math.sign(target) === Math.sign(remaining)
    && target === paid + remaining;
}

function legacyEstadoFiscal(raw: unknown): string {
  return typeof raw === 'string' ? raw : '';
}

function matchesCobroFilter(invoice: InvoiceSettlement, fiscalEstado: string, estado: string | null, today: string): boolean {
  if (!estado) return true;
  if (estado === 'ANULADA') return fiscalEstado === 'ANULADA';
  if (estado === 'COBRADA') return invoice.paymentState === 'COBRADA_CALCULADA';
  if (estado === 'COBRADA_PARCIAL') return isActualPartialCollection(invoice);
  if (estado === 'EMITIDA' || estado === 'PENDIENTE') return invoice.paymentState === 'PENDIENTE_COBRO' && !isActualPartialCollection(invoice);
  if (estado === 'VENCIDA') return Boolean(invoice.fechaVencimientoISO && invoice.fechaVencimientoISO < today && hasActualDebt(invoice));
  // An unknown historic filter is fiscal metadata only. It never marks a B7
  // collection state and is intentionally not mapped through guessed semantics.
  return fiscalEstado === estado;
}

function displayCobroState(invoice: InvoiceSettlement, fiscalEstado: string): string {
  // Cancellation is fiscal metadata and deliberately takes no position on B7
  // settlement.  It gets an explicit UI label rather than an ISP-style cobrada.
  if (fiscalEstado === 'ANULADA') return 'ANULADA';
  if (invoice.paymentState === 'COBRADA_CALCULADA') return 'COBRADA';
  if (isActualPartialCollection(invoice)) return 'COBRADA_PARCIAL';
  return invoice.paymentState === 'PENDIENTE_COBRO' ? 'PENDIENTE' : 'PENDIENTE_COBRO_REVISION';
}

function groupBankStates(invoices: Array<{ settlement: InvoiceSettlement }>) {
  const groups = new Map<string, { estado: string; _sum: { totalCents: number | null; exactCents: string | null }; _count: number }>();
  for (const { settlement } of invoices) {
    const key = settlement.paymentState;
    const current = groups.get(key) ?? { estado: key, _sum: { totalCents: 0, exactCents: '0' }, _count: 0 };
    current._count += 1;
    if (current._sum.totalCents === null || settlement.targetCents === null) {
      current._sum = { totalCents: null, exactCents: null };
    } else {
      const next=current._sum.totalCents+settlement.targetCents; current._sum = Number.isSafeInteger(next)?{totalCents:next,exactCents:String(next)}:{totalCents:null,exactCents:null};
    }
    groups.set(key, current);
  }
  return [...groups.values()];
}

function bankSummary(summary: BankInvoicingSummary) {
  return {
    totalFacturado: strictMoneyCanonical(summary.facturado),
    totalCobrado: strictMoneyCanonical(summary.cobroDocumentalConfirmado),
    pendienteCobro: strictMoneyCanonical(summary.pendienteNoConfirmado),
    diferenciasCaja: {
      atribuible: strictMoneyCanonical(summary.diferenciasCaja.atribuible),
      sinAtribuir: strictMoneyCanonical(summary.diferenciasCaja.sinAtribuir),
    },
    count: summary.invoicesTotal,
    cobradasCalculadas: summary.cobradasCalculadas,
    pendientesCobro: summary.pendientesCobro,
    revisiones: summary.revisiones,
  };
}

// GET - Listar facturas emitidas.  Cobro/calculation is B7 only; legacy fields remain metadata.
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const denied = await checkAdminAreaRead('admin.finanzas.facturas_emitidas', [], session);
    if (denied) { denied.headers.set('Cache-Control', privateHeaders['Cache-Control']); return denied; }

    const { searchParams } = new URL(req.url);
    const pageRaw = Number(searchParams.get('page') || '1');
    const limitRaw = Number(searchParams.get('limit') || '50');
    const page = Number.isInteger(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 && limitRaw <= 100 ? limitRaw : 50;
    const estado = searchParams.get('estado');
    const cliente = searchParams.get('cliente');
    const serie = searchParams.get('serie');
    const desde = searchParams.get('desde');
    const hasta = searchParams.get('hasta');
    const imputacion = searchParams.get('imputacion');
    const busqueda = searchParams.get('q');

    // Staging is checked before the readonly REPEATABLE READ snapshot.  The
    // population helper receives this transaction and cannot open/commit/mutate one.
    await assertFinanceRuntimeReady();
    const data = await prisma.$transaction(async (tx) => {
      const actor = await tx.usuarioAdmin.findUnique({
        where: { id: Number(session!.user.id) }, select: { activo: true },
      });
      if (!actor?.activo) throw new Error('ACTOR_ADMIN_INACTIVO');

      const population = await readBankInvoicingPopulation(tx as unknown as B7ReadDatabase, {
        enabled: true,
        assertIsolatedStaging: async () => undefined,
      });
      const where: any = {};
      if (cliente) where.cliente = { contains: cliente, mode: 'insensitive' };
      if (serie) where.serie = serie;
      if (imputacion) where.imputacion = imputacion;
      // ANULADA is metadata, not a payment inference; filtering it early is safe.
      if (estado === 'ANULADA') where.estado = 'ANULADA';
      if (desde) where.fecha = { ...where.fecha, gte: new Date(desde) };
      if (hasta) { const nextDay=new Date(hasta); nextDay.setUTCDate(nextDay.getUTCDate()+1); where.fecha = { ...where.fecha, lt: nextDay }; }
      if (busqueda) where.OR = [
        { cliente: { contains: busqueda, mode: 'insensitive' } },
        { numFactura: { contains: busqueda, mode: 'insensitive' } },
        { concepto: { contains: busqueda, mode: 'insensitive' } },
        { cif: { contains: busqueda, mode: 'insensitive' } },
      ];
      const legacyRows = await tx.facturaEmitida.findMany({ where, orderBy: { fecha: 'desc' } });
      const settlementById = new Map(population.invoices.map((invoice) => [invoice.invoiceId, invoice]));
      const today = new Date().toISOString().slice(0, 10);
      const matching = legacyRows.map((legacy) => ({ legacy, settlement: settlementById.get(legacy.id) }))
        .filter((row): row is { legacy: (typeof legacyRows)[number]; settlement: InvoiceSettlement } => row.settlement !== undefined)
        .filter(({ legacy, settlement }) => matchesCobroFilter(settlement, legacyEstadoFiscal(legacy.estado), estado, today));
      const matchingSettlements = matching.map(({ settlement }) => settlement);
      // This mirrors B7's strict aggregate behavior for this metadata-filtered full
      // population.  Unattributable cash is intentionally unknown here: legacy
      // metadata filters cannot allocate a global B4 difference to a FI subset.
      const summary = summarizeBankInvoicing(matchingSettlements, null);
      const facturas = matching.slice((page - 1) * limit, page * limit).map(({ legacy, settlement }) => ({
        ...legacy,
        // Preserve the old source verbatim and expose its actual semantic role.
        estadoFiscalLegacy: legacy.estado,
        importeCobradoLegacy: legacy.importeCobrado,
        // `estado` remains for old clients; new UI uses the explicit bank field.
        estadoCobroBanco: displayCobroState(settlement, legacyEstadoFiscal(legacy.estado)),
        bankCalculation: {
          targetCents: settlement.targetCents,
          paidDocumentaryCents: settlement.paidDocumentaryCents,
          remainingCents: settlement.remainingCents,
          cashCents: settlement.cashCents,
          attributableCashDifferenceCents: settlement.attributableCashDifferenceCents,
          paymentState: settlement.paymentState,
          paymentSources: settlement.paymentSources,
          reasons: settlement.reasons,
          unknown: settlement.targetCents === null || settlement.paidDocumentaryCents === null || settlement.remainingCents === null,
        },
      }));
      return {
        facturas,
        total: matching.length,
        page,
        totalPages: Math.ceil(matching.length / limit),
        resumen: { ...bankSummary(summary), porEstado: groupBankStates(matching) },
        bankCalculation: {
          calculationBasis: population.calculationBasis,
          bankCoverage: population.bankCoverage,
          // Global differences are not falsely balanced against this filtered FI set.
          diferenciasCajaGlobales: bankSummary(population.summary).diferenciasCaja,
        },
      };
    }, { isolationLevel: 'RepeatableRead', maxWait: 10_000, timeout: 60_000 });
    return NextResponse.json(data, { headers: privateHeaders });
  } catch (error: any) {
    if (error?.message === 'ACTOR_ADMIN_INACTIVO') return NextResponse.json({ error: 'Usuario no activo.' }, { status: 403, headers: privateHeaders });
    console.error('Lectura de facturas emitidas no completada.');
    return NextResponse.json({ error: 'No se pudo comprobar la facturación desde el banco. Los importes desconocidos no se sustituyen por cero.' }, { status: 500, headers: privateHeaders });
  }
}

const manualFields = ['cliente', 'cif', 'numFactura', 'serie', 'fecha', 'fechaVencimiento', 'base', 'tipoIva', 'importeIva',
  'tipoIrpf', 'importeIrpf', 'total', 'concepto', 'lineas', 'estado', 'imputacion', 'formaCobro', 'importeCobrado', 'fechaCobro',
  'remesaRef', 'proyectoSingularId'] as const;
const bankFields = new Set(['estado', 'imputacion', 'formaCobro', 'importeCobrado', 'fechaCobro', 'remesaRef', 'proyectoSingularId']);
const invoiceConflict = () => Object.assign(new Error('Los datos de origen ISP no son editables.'), { code: 'ISP_ORIGEN_NO_EDITABLE', status: 409 });
function closedInvoice(body: unknown, withId = false): Record<string, any> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invoiceConflict();
  const record = body as Record<string, any>;
  for (const [key, value] of Object.entries(record)) {
    if (![...manualFields, 'origenSistema', 'idExterno', ...(withId ? ['id'] : [])].includes(key)) throw invoiceConflict();
    if (key === 'origenSistema' && value !== 'Manual') throw invoiceConflict();
    if (key === 'idExterno' && value !== null && value !== '') throw invoiceConflict();
    // lineas es JSON fiscal explícito; nunca un delegate nested Prisma.
    if (key !== 'lineas' && value !== null && !['string', 'number'].includes(typeof value)) throw invoiceConflict();
    if (key === 'lineas' && value !== null && typeof value !== 'string' && !Array.isArray(value)) throw invoiceConflict();
  }
  return record;
}
function invoiceData(record: Record<string, any>): any {
  const result: any = {};
  for (const field of manualFields) if (record[field] !== undefined) result[field] = record[field];
  for (const field of ['fecha', 'fechaVencimiento', 'fechaCobro']) {
    if (field in result && result[field] !== null) {
      if (typeof result[field] !== 'string') throw invoiceConflict();
      const parsed = new Date(result[field]);
      if (!Number.isFinite(parsed.getTime())) throw invoiceConflict();
      result[field] = parsed;
    }
  }
  for (const field of ['base', 'tipoIva', 'importeIva', 'tipoIrpf', 'importeIrpf', 'total', 'importeCobrado']) {
    if (field in result && (result[field] === null || !/^-?\d+(?:\.\d+)?$/.test(String(result[field])))) throw invoiceConflict();
  }
  if (Array.isArray(result.lineas)) result.lineas = JSON.stringify(result.lineas);
  return result;
}
function invoiceFailure(error: any) {
  if (error?.code === 'ISP_ORIGEN_NO_EDITABLE') return NextResponse.json({ error: 'Los datos de origen ISP no son editables.', code: error.code }, { status: 409 });
  return NextResponse.json({ error: 'No se pudo guardar la factura.', code: 'FACTURA_WRITE_FAILED' }, { status: 500 });
}
// POST siempre manual. Un lote se valida íntegro antes de escribir y revierte íntegro.
export async function POST(req: NextRequest) {
  try {
    const denied = await checkAdminAreaWrite('admin.finanzas.facturas_emitidas');
    if (denied) return denied;
    const body = await req.json();
    const bulk = Array.isArray(body?.facturas);
    if (bulk && Object.keys(body).some(key => key !== 'facturas')) throw invoiceConflict();
    const records = (bulk ? body.facturas : [body]).map((value: unknown) => closedInvoice(value));
    const prepared = records.map((record: Record<string, any>) => {
      const fields = invoiceData(record);
      if (!fields.cliente || !fields.numFactura || !fields.fecha || fields.base === undefined || fields.importeIva === undefined || fields.total === undefined) throw invoiceConflict();
      return { ...fields, origenSistema: 'Manual', idExterno: null, serie: fields.serie || extraerSerie(fields.numFactura),
        tipoIva: fields.tipoIva ?? 21, tipoIrpf: fields.tipoIrpf ?? 0, importeIrpf: fields.importeIrpf ?? 0,
        estado: fields.estado ?? 'EMITIDA', importeCobrado: fields.importeCobrado ?? 0 };
    });
    const created = await prisma.$transaction(async (tx) => {
      const result = [];
      for (const data of prepared) result.push(await tx.facturaEmitida.create({ data }));
      return result;
    });
    return NextResponse.json(bulk ? { success: true, insertadas: created.length, duplicadas: 0 } : { success: true, factura: created[0] });
  } catch (error: any) { return invoiceFailure(error); }
}
export async function PUT(req: NextRequest) {
  try {
    const denied = await checkAdminAreaWrite('admin.finanzas.facturas_emitidas');
    if (denied) return denied;
    const body = closedInvoice(await req.json(), true);
    if (typeof body.id !== 'string' || !body.id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 });
    const data = invoiceData(body);
    const factura = await prisma.$transaction(async (tx) => {
      const current = await tx.facturaEmitida.findUnique({ where: { id: body.id } });
      if (!current) throw invoiceConflict();
      if (isIspMirror(current)) {
        // Conserva la edición bancaria/clasificación local con la ACL financiera normal.
        // Cualquier cambio fiscal efectivo rechaza todo el payload.
        for (const [key, value] of Object.entries(data)) {
          if (bankFields.has(key)) continue;
          const old = (current as any)[key];
          const equal = value instanceof Date && old instanceof Date ? value.getTime() === old.getTime()
            : value === old || (old !== null && value !== null && ['base', 'tipoIva', 'importeIva', 'tipoIrpf', 'importeIrpf', 'total'].includes(key) && String(old) === String(value));
          if (!equal) throw invoiceConflict();
          delete data[key];
        }
        if (body.origenSistema !== undefined && body.origenSistema !== current.origenSistema) throw invoiceConflict();
        if (body.idExterno !== undefined && body.idExterno !== current.idExterno) throw invoiceConflict();
      }
      return tx.facturaEmitida.update({ where: { id: body.id }, data });
    }, { isolationLevel: 'Serializable' });
    return NextResponse.json({ success: true, factura });
  } catch (error: any) { return invoiceFailure(error); }
}
function extraerSerie(numFactura: string): string | null {
  const match = numFactura.match(/^([A-Z]+)/);
  return match ? match[1] : null;
}
