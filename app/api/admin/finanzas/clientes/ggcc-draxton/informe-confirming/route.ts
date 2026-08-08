import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function formatCurrency(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00 €';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
}

function diasDesde(fecha: Date | string): number {
  const d = new Date(fecha);
  const hoy = new Date();
  return Math.floor((hoy.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const baseUrl = new URL(req.url).origin;
    const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;
    const tipo = searchParams.get('tipo') || 'resumen'; // 'resumen' o 'reclamacion'
    const anio = parseInt(searchParams.get('anio') || '2026');
    const mes = searchParams.get('mes'); // null = todo el año, '1'-'12' = mes específico
    const trimestre = searchParams.get('trimestre'); // 'T1','T2','T3','T4'

    // Rango de fechas
    let fechaInicio = new Date(`${anio}-01-01`);
    let fechaFin = new Date(`${anio + 1}-01-01`);
    let periodoLabel = `Año ${anio}`;

    if (mes) {
      const m = parseInt(mes);
      fechaInicio = new Date(anio, m - 1, 1);
      fechaFin = new Date(anio, m, 1);
      periodoLabel = `${MESES[m - 1]} ${anio}`;
    } else if (trimestre) {
      const t = parseInt(trimestre.replace('T', ''));
      fechaInicio = new Date(anio, (t - 1) * 3, 1);
      fechaFin = new Date(anio, t * 3, 1);
      periodoLabel = `${trimestre} ${anio} (${MESES[(t-1)*3]} - ${MESES[t*3-1]})`;
    }

    // Facturas emitidas del periodo
    const facturasEmitidas = await prisma.facturaEmitida.findMany({
      where: {
        fecha: { gte: fechaInicio, lt: fechaFin },
        OR: [
          { cliente: { contains: 'Draxton', mode: 'insensitive' } },
          { cliente: { contains: 'Fuchosa', mode: 'insensitive' } },
          { cliente: { contains: 'Altec', mode: 'insensitive' } },
          { cliente: { contains: 'Infun', mode: 'insensitive' } },
        ],
      },
      orderBy: { fecha: 'asc' },
    });

    // Documentos de confirming del periodo
    const documentos = await prisma.facturaRecibida.findMany({
      where: {
        fecha: { gte: fechaInicio, lt: fechaFin },
        carpetaOrigen: { contains: 'Confirming' },
      },
      include: {
        confirmingLineas: {
          include: { facturaEmitida: { select: { numFactura: true, cliente: true, total: true } } },
        },
      },
      orderBy: { fecha: 'asc' },
    });

    // Movimientos bancarios del periodo
    const movimientos = await prisma.movimientoBancario.findMany({
      where: {
        fechaOperacion: { gte: fechaInicio, lt: fechaFin },
        importe: { gt: 0 },
        OR: [
          { concepto: { contains: 'CONFIRMING', mode: 'insensitive' } },
          { concepto: { contains: 'Draxton', mode: 'insensitive' } },
          { concepto: { contains: 'Cesion De Creditos', mode: 'insensitive' } },
          { concepto: { contains: 'ANTICIPO', mode: 'insensitive' } },
          { concepto: { contains: 'Abono Facturas A Vto', mode: 'insensitive' } },
          { concepto: { contains: 'Bilbao Vizcaya', mode: 'insensitive' } },
        ],
        NOT: {
          OR: [
            { concepto: { contains: 'Claveria', mode: 'insensitive' } },
            { notaConciliacion: { startsWith: 'Descartado' } },
          ],
        },
      },
      include: { cuenta: { select: { banco: true } } },
      orderBy: { fechaOperacion: 'asc' },
    });

    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    let html: string;
    if (tipo === 'reclamacion') {
      html = generarReclamacion(facturasEmitidas, periodoLabel, fecha, anio, logoUrl);
    } else {
      html = generarResumenInterno(facturasEmitidas, documentos, movimientos, periodoLabel, fecha, anio, logoUrl);
    }

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function estilosBase(): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; font-size: 10px; line-height: 1.6; color: #1f2937; background: white; }
    @page { size: A4 portrait; margin: 0; }
    @media print { body { margin: 0; padding: 0; } .page { page-break-after: always; } .page:last-child { page-break-after: auto; } .no-print { display: none !important; } }
    .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 18mm 25mm 18mm; position: relative; background: white; }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 2px solid #E87A2E; margin-bottom: 20px; }
    .page-header img { height: 36px; object-fit: contain; }
    .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
    .page-footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .section { margin-bottom: 16px; }
    .section h2 { font-size: 13px; font-weight: 700; color: #E87A2E; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
    .section h3 { font-size: 11px; font-weight: 600; color: #374151; margin: 8px 0 4px; }
    h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 12px; }
    th { background: #f3f4f6; font-weight: 600; text-align: left; padding: 5px 6px; border-bottom: 1px solid #d1d5db; }
    td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .total-row { font-weight: 700; background: #f9fafb; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
    .badge-green { background: #F0FDF4; color: #16a34a; }
    .badge-yellow { background: #FFF3E8; color: #E87A2E; }
    .badge-red { background: #FEF2F2; color: #dc2626; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-orange { background: #FFF3E8; color: #E87A2E; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .kpi-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; text-align: center; }
    .kpi-box .label { font-size: 8px; color: #6b7280; text-transform: uppercase; }
    .kpi-box .value { font-size: 16px; font-weight: 700; margin-top: 2px; }
    .print-btn { position: fixed; top: 10px; right: 10px; background: #E87A2E; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; z-index: 1000; }
    .print-btn:hover { background: #d06a20; }
  `;
}

function generarResumenInterno(facturas: any[], documentos: any[], movimientos: any[], periodo: string, fecha: string, anio: number, logoUrl: string): string {
  // Agrupar documentos por empresa (DEA/DPC/CaixaBank)
  const docsPorEmpresa: Record<string, any[]> = {};
  documentos.forEach(d => {
    const empresa = d.confirmingProveedor || 'Sin clasificar';
    if (!docsPorEmpresa[empresa]) docsPorEmpresa[empresa] = [];
    docsPorEmpresa[empresa].push(d);
  });

  // KPIs
  const totalFacturado = facturas.reduce((s, f) => s + f.total, 0);
  const totalCobrado = facturas.reduce((s, f) => s + (f.importeCobrado || 0), 0);
  const facturasConConfirming = facturas.filter(f => f.estado === 'COBRADA' && f.formaCobro === 'Confirming');
  const facturasPendientes = facturas.filter(f => f.estado !== 'COBRADA');
  const totalIngresado = movimientos.reduce((s, m) => s + m.importe, 0);
  const movsVinculados = movimientos.filter(m => m.facturaEmitidaId);
  
  let totalGastos = 0;
  let totalComisiones = 0;
  let totalIntereses = 0;
  documentos.forEach(d => {
    d.confirmingLineas.forEach((l: any) => {
      totalGastos += l.gastosFinancieros || 0;
      totalComisiones += l.comision || 0;
      totalIntereses += l.intereses || 0;
    });
  });

  // Secciones de documentos por empresa
  let seccionesEmpresas = '';
  for (const [empresa, docs] of Object.entries(docsPorEmpresa)) {
    const totalEmpresa = docs.reduce((s, d) => s + (d.total || 0), 0);
    const netoEmpresa = docs.reduce((s, d) => s + (d.totalConfirming || d.total || 0), 0);
    const numFacturas = docs.reduce((s, d) => s + d.confirmingLineas.length, 0);
    
    seccionesEmpresas += `
      <div class="section">
        <h3>${empresa} — ${docs.length} documentos · ${numFacturas} facturas · Total: ${formatCurrency(totalEmpresa)} · Neto banco: ${formatCurrency(netoEmpresa)}</h3>
        <table>
          <thead><tr>
            <th>Documento</th><th>Fecha</th><th class="text-center">Facturas</th>
            <th class="text-right">Total</th><th class="text-right">Neto banco</th>
            <th class="text-right">Gastos fin.</th><th class="text-center">TAE</th>
          </tr></thead>
          <tbody>
            ${docs.map((d: any) => {
              const gastos = d.confirmingLineas.reduce((s: number, l: any) => s + (l.gastosFinancieros || 0), 0);
              const tae = d.confirmingLineas[0]?.tipoInteres;
              return `<tr>
                <td>${d.numFactura || '—'}</td>
                <td>${formatDate(d.fecha)}</td>
                <td class="text-center">${d.confirmingLineas.length}</td>
                <td class="text-right">${formatCurrency(d.total)}</td>
                <td class="text-right">${formatCurrency(d.totalConfirming || d.base)}</td>
                <td class="text-right">${formatCurrency(gastos)}</td>
                <td class="text-center">${tae ? tae.toFixed(2) + '%' : '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Abonos en banco
  let seccionBanco = '';
  if (movimientos.length > 0) {
    seccionBanco = `
      <div class="section">
        <h2>Abonos en banco — ${movimientos.length} movimientos · Total: ${formatCurrency(totalIngresado)}</h2>
        <table>
          <thead><tr>
            <th>Fecha</th><th>Banco</th><th>Concepto</th>
            <th class="text-right">Importe</th><th class="text-center">Estado</th>
          </tr></thead>
          <tbody>
            ${movimientos.map((m: any) => `<tr>
              <td>${formatDate(m.fechaOperacion)}</td>
              <td>${m.cuenta?.banco || '—'}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${m.concepto}</td>
              <td class="text-right" style="font-weight:600;color:#059669;">${formatCurrency(m.importe)}</td>
              <td class="text-center">${m.facturaEmitidaId ? '<span class="badge badge-green">Conciliado</span>' : '<span class="badge badge-yellow">Sin vincular</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // Facturas pendientes de confirming
  let seccionPendientes = '';
  if (facturasPendientes.length > 0) {
    const pendientesPorCliente: Record<string, any[]> = {};
    facturasPendientes.forEach(f => {
      const c = f.cliente || 'Sin cliente';
      if (!pendientesPorCliente[c]) pendientesPorCliente[c] = [];
      pendientesPorCliente[c].push(f);
    });

    seccionPendientes = `
      <div class="section">
        <h2>Facturas pendientes de confirming — ${facturasPendientes.length} facturas · ${formatCurrency(facturasPendientes.reduce((s: number, f: any) => s + f.total, 0))}</h2>
        ${Object.entries(pendientesPorCliente).map(([cliente, facts]) => `
          <h3>${cliente} — ${facts.length} facturas · ${formatCurrency(facts.reduce((s: number, f: any) => s + f.total, 0))}</h3>
          <table>
            <thead><tr>
              <th>Nº Factura</th><th>Fecha</th><th class="text-right">Total</th><th class="text-center">Días</th>
            </tr></thead>
            <tbody>
              ${facts.map((f: any) => `<tr>
                <td>${f.numFactura}</td>
                <td>${formatDate(f.fecha)}</td>
                <td class="text-right">${formatCurrency(f.total)}</td>
                <td class="text-center"><span class="badge ${diasDesde(f.fecha) > 60 ? 'badge-red' : diasDesde(f.fecha) > 30 ? 'badge-yellow' : 'badge-blue'}">${diasDesde(f.fecha)}d</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        `).join('')}
      </div>
    `;
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Resumen Confirmings Draxton — ${periodo}</title><style>${estilosBase()}</style></head><body>
    <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button>
    <div class="page">
      <div class="page-header">
        <img src="${logoUrl}" alt="Internet Operadores" />
        <div class="page-header-right">
          <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
          <div>Periodo: ${periodo}</div>
          <div>${fecha}</div>
          <div style="color:#dc2626;font-weight:700;margin-top:4px;">⚠ CONFIDENCIAL</div>
        </div>
      </div>

      <h1>Resumen Confirmings Draxton</h1>
      <p style="font-size:11px;color:#6b7280;margin-bottom:20px;">Conciliación de cobros por confirming — ${periodo}</p>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="label">Facturado</div><div class="value" style="color:#1f2937;">${formatCurrency(totalFacturado)}</div><div class="label">${facturas.length} facturas</div></div>
        <div class="kpi-box"><div class="label">Cobrado (Confirming)</div><div class="value" style="color:#059669;">${formatCurrency(totalCobrado)}</div><div class="label">${facturasConConfirming.length} facturas</div></div>
        <div class="kpi-box"><div class="label">Ingresado (Banco)</div><div class="value" style="color:#2563eb;">${formatCurrency(totalIngresado)}</div><div class="label">${movsVinculados.length} conciliados</div></div>
        <div class="kpi-box"><div class="label">Gastos Financieros</div><div class="value" style="color:#dc2626;">${formatCurrency(totalGastos)}</div><div class="label">Com. ${formatCurrency(totalComisiones)} + Int. ${formatCurrency(totalIntereses)}</div></div>
      </div>

      <div class="section">
        <h2>Documentos de confirming por empresa</h2>
      </div>
      ${seccionesEmpresas}
      ${seccionBanco}
      ${seccionPendientes}
    </div>
  </body></html>`;
}

function generarReclamacion(facturas: any[], periodo: string, fecha: string, anio: number, logoUrl: string): string {
  // Solo facturas pendientes (sin confirming)
  const pendientes = facturas.filter(f => f.estado !== 'COBRADA');
  
  // Agrupar por empresa
  const porEmpresa: Record<string, any[]> = {};
  pendientes.forEach(f => {
    const empresa = f.cliente || 'Sin cliente';
    if (!porEmpresa[empresa]) porEmpresa[empresa] = [];
    porEmpresa[empresa].push(f);
  });

  const totalPendiente = pendientes.reduce((s, f) => s + f.total, 0);

  let seccionesEmpresas = '';
  for (const [empresa, facts] of Object.entries(porEmpresa)) {
    const totalEmpresa = facts.reduce((s, f) => s + f.total, 0);
    seccionesEmpresas += `
      <div class="section">
        <h2>${empresa}</h2>
        <p style="font-size:10px;color:#6b7280;margin-bottom:8px;">${facts.length} facturas pendientes · Total: ${formatCurrency(totalEmpresa)}</p>
        <table>
          <thead><tr>
            <th>Nº Factura</th><th>Fecha emisión</th><th>Concepto</th>
            <th class="text-right">Base</th><th class="text-right">Total</th>
            <th class="text-center">Antigüedad</th>
          </tr></thead>
          <tbody>
            ${facts.sort((a: any, b: any) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).map((f: any) => {
              const dias = diasDesde(f.fecha);
              return `<tr>
                <td style="font-weight:600;">${f.numFactura}</td>
                <td>${formatDate(f.fecha)}</td>
                <td>${f.concepto || 'Factura Ventas'}</td>
                <td class="text-right">${formatCurrency(f.base)}</td>
                <td class="text-right" style="font-weight:600;">${formatCurrency(f.total)}</td>
                <td class="text-center"><span class="badge ${dias > 60 ? 'badge-red' : dias > 30 ? 'badge-yellow' : 'badge-blue'}">${dias} días</span></td>
              </tr>`;
            }).join('')}
            <tr class="total-row">
              <td colspan="4">TOTAL ${empresa}</td>
              <td class="text-right">${formatCurrency(totalEmpresa)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Facturas pendientes de confirming — ${periodo}</title><style>${estilosBase()}</style></head><body>
    <button class="print-btn no-print" onclick="window.print()">🖨 Imprimir</button>
    <div class="page">
      <div class="page-header">
        <img src="${logoUrl}" alt="Internet Operadores" />
        <div class="page-header-right">
          <div style="font-size:10px;font-weight:600;color:#1f2937;">RECLAMACIÓN DE COBROS</div>
          <div>Periodo: ${periodo}</div>
          <div>${fecha}</div>
          <div style="color:#dc2626;font-weight:700;margin-top:4px;">Total pendiente: ${formatCurrency(totalPendiente)}</div>
        </div>
      </div>

      <h1>Facturas pendientes de confirming</h1>
      <p style="font-size:11px;color:#6b7280;margin-bottom:20px;">Listado para reclamación de cobros — ${periodo}</p>

      <div class="kpi-grid" style="grid-template-columns: repeat(3, 1fr);">
        <div class="kpi-box"><div class="label">Facturas pendientes</div><div class="value" style="color:#dc2626;">${pendientes.length}</div></div>
        <div class="kpi-box"><div class="label">Total pendiente</div><div class="value" style="color:#dc2626;">${formatCurrency(totalPendiente)}</div></div>
        <div class="kpi-box"><div class="label">Empresas</div><div class="value" style="color:#4f46e5;">${Object.keys(porEmpresa).length}</div></div>
      </div>

      ${seccionesEmpresas}

      <div class="section" style="margin-top:20px;padding-top:12px;border-top:2px solid #e5e7eb;">
        <table>
          <tr class="total-row" style="font-size:12px;">
            <td><strong>TOTAL PENDIENTE DE CONFIRMING</strong></td>
            <td class="text-right" style="font-size:14px;color:#dc2626;"><strong>${formatCurrency(totalPendiente)}</strong></td>
          </tr>
        </table>
      </div>
    </div>
  </body></html>`;
}
