import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function formatCurrency(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00 EUR';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' EUR';
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));
    const baseUrl = new URL(req.url).origin;
    const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;

    // Obtener contratos activos
    const contratos = await prisma.contratoDraxton.findMany({
      where: { estado: 'Activo' },
      orderBy: { titulo: 'asc' },
      select: {
        id: true,
        titulo: true,
        tipo: true,
        importeMensual: true,
        horasContratadas: true,
        modalidadContrato: true,
        fechaInicio: true,
        fechaFin: true,
      },
    });

    // Obtener facturas vinculadas a contratos
    const vinculaciones = await prisma.facturaContratoDraxton.findMany({
      where: {
        factura: {
          fecha: { gte: new Date(`${anio}-01-01`), lt: new Date(`${anio + 1}-01-01`) },
        },
      },
      include: {
        factura: {
          select: {
            id: true,
            numeroDocumento: true,
            serieFactura: true,
            fecha: true,
            base: true,
            total: true,
            nombreCompleto: true,
            situacion: true,
          },
        },
      },
    });

    // Obtener facturas emitidas (para cruzar cobros via confirming)
    const facturasEmitidas = await prisma.facturaEmitida.findMany({
      where: {
        fecha: { gte: new Date(`${anio}-01-01`), lt: new Date(`${anio + 1}-01-01`) },
        OR: [
          { cliente: { contains: 'Draxton', mode: 'insensitive' } },
          { cliente: { contains: 'Fuchosa', mode: 'insensitive' } },
          { cliente: { contains: 'Altec', mode: 'insensitive' } },
          { cliente: { contains: 'Infun', mode: 'insensitive' } },
        ],
      },
      select: {
        numFactura: true,
        importeTotal: true,
        importeCobrado: true,
        estadoCobro: true,
        fechaCobro: true,
      },
    });

    const cobradoMap = new Map(facturasEmitidas.map(f => [f.numFactura, f]));

    // Construir resumen por contrato
    interface ContratoFacturacion {
      id: string;
      titulo: string;
      tipo: string | null;
      importeMensual: number;
      horasContratadas: number | null;
      modalidadContrato: string | null;
      facturado: number;
      cobrado: number;
      pendiente: number;
      numFacturas: number;
      numCobradas: number;
      facturas: { numFactura: string; fecha: Date; importe: number; empresa: string | null; concepto: string | null; cobrada: boolean; importeCobrado: number; fechaCobro: Date | null }[];
    }

    const resumen: ContratoFacturacion[] = contratos.map(c => ({
      id: c.id,
      titulo: c.titulo,
      tipo: c.tipo,
      importeMensual: Number(c.importeMensual || 0),
      horasContratadas: c.horasContratadas ? Number(c.horasContratadas) : null,
      modalidadContrato: c.modalidadContrato,
      facturado: 0,
      cobrado: 0,
      pendiente: 0,
      numFacturas: 0,
      numCobradas: 0,
      facturas: [],
    }));

    const resumenMap = new Map(resumen.map(r => [r.id, r]));

    // Facturas sin contrato asignado
    let facturadoSinContrato = 0;
    let cobradoSinContrato = 0;
    const facturasSinContrato: any[] = [];

    for (const vinc of vinculaciones) {
      const contrato = resumenMap.get(vinc.contratoDraxtonId);
      const importe = Number(vinc.importeAsignado || 0);
      const numDoc = vinc.factura.numeroDocumento;
      const fe = numDoc ? cobradoMap.get(numDoc) : null;
      const importeCobrado = fe ? Number(fe.importeCobrado || 0) : 0;
      const proporcion = fe && Number(fe.importeTotal) > 0 ? importe / Number(fe.importeTotal) : 1;
      const cobradoProporcional = importeCobrado * proporcion;
      const cobrada = fe ? (fe.estadoCobro === 'cobrada' || importeCobrado > 0) : (vinc.factura.situacion === 'COBRADA');

      const facturaData = {
        numFactura: vinc.factura.numeroDocumento,
        fecha: vinc.factura.fecha,
        importe,
        empresa: vinc.factura.nombreCompleto,
        concepto: null as string | null,
        cobrada,
        importeCobrado: cobradoProporcional,
        fechaCobro: fe?.fechaCobro || null,
      };

      if (contrato) {
        contrato.facturado += importe;
        contrato.cobrado += cobradoProporcional;
        contrato.numFacturas++;
        if (cobrada) contrato.numCobradas++;
        contrato.facturas.push(facturaData);
      } else {
        facturadoSinContrato += importe;
        cobradoSinContrato += cobradoProporcional;
        facturasSinContrato.push(facturaData);
      }
    }

    // Calcular pendientes
    resumen.forEach(r => { r.pendiente = r.facturado - r.cobrado; });
    const pendienteSinContrato = facturadoSinContrato - cobradoSinContrato;

    // Totales
    const totalFacturado = resumen.reduce((s, r) => s + r.facturado, 0) + facturadoSinContrato;
    const totalCobrado = resumen.reduce((s, r) => s + r.cobrado, 0) + cobradoSinContrato;
    const totalPendiente = totalFacturado - totalCobrado;
    const totalFacturas = resumen.reduce((s, r) => s + r.numFacturas, 0) + facturasSinContrato.length;
    const totalCobradas = resumen.reduce((s, r) => s + r.numCobradas, 0);
    const pctCobrado = totalFacturado > 0 ? (totalCobrado / totalFacturado * 100) : 0;

    // Obtener actualizaciones imputadas por contrato
    const imputaciones = await prisma.actualizacionImputacion.findMany({
      where: {
        ejecucion: { fecha: { gte: new Date(`${anio}-01-01`), lt: new Date(`${anio + 1}-01-01`) } },
      },
      include: { ejecucion: { select: { horasDedicadas: true } } },
    });
    const tarifaVig = await prisma.actualizacionTarifaConversion.findFirst({ where: { fechaHasta: null }, orderBy: { fechaDesde: 'desc' } });
    const factor = tarifaVig ? Number(tarifaVig.factorConversion) : 4;
    const actualizPorContrato: Record<string, number> = {};
    imputaciones.forEach(imp => {
      const hEquiv = Number(imp.horasImputadas) * factor;
      actualizPorContrato[imp.contratoId] = (actualizPorContrato[imp.contratoId] || 0) + hEquiv;
    });

    const fechaGeneracion = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const horaGeneracion = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Situacion de Facturacion - Draxton ${anio}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    @media print { .no-print { display: none !important; } .page { break-after: page; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1f2937; line-height: 1.4; background: #f9fafb; }
    .page { background: white; max-width: 210mm; margin: 0 auto; padding: 25px 30px; min-height: 297mm; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 2px solid #1f2937; margin-bottom: 20px; }
    .page-header img { height: 40px; }
    .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
    .print-btn { position: fixed; top: 15px; right: 15px; z-index: 999; padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .print-btn:hover { background: #4338ca; }
    h1 { font-size: 18px; color: #1f2937; margin-bottom: 5px; }
    h2 { font-size: 14px; color: #1f2937; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .kpi-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
    .kpi-label { font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.5px; }
    .kpi-value { font-size: 20px; font-weight: 800; margin-top: 4px; }
    .kpi-sub { font-size: 9px; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; }
    th { background: #1f2937; color: white; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
    tr:nth-child(even) { background: #f9fafb; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .text-green { color: #059669; }
    .text-red { color: #dc2626; }
    .text-blue { color: #2563eb; }
    .text-orange { color: #d97706; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 600; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-orange { background: #fef3c7; color: #92400e; }
    .progress-bar { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 3px; }
    .contract-section { margin-bottom: 20px; padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .contract-title { font-size: 12px; font-weight: 700; color: #1f2937; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .actualiz-box { margin-top: 8px; padding: 6px 10px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; font-size: 9px; color: #4338ca; }
    .page-footer { position: absolute; bottom: 15px; left: 30px; right: 30px; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .confidencial { position: absolute; top: 60px; right: 30px; font-size: 8px; color: #dc2626; font-weight: 700; letter-spacing: 1px; opacity: 0.7; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  <!-- PAGINA 1: Resumen -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">SITUACION DE FACTURACION</div>
        <div>Cliente: <strong>Draxton Group</strong></div>
        <div>Periodo: Enero - Diciembre ${anio}</div>
        <div>${fechaGeneracion} ${horaGeneracion}</div>
      </div>
    </div>
    <div class="confidencial">CONFIDENCIAL - USO INTERNO</div>

    <h1>Situacion de Facturacion ${anio}</h1>
    <p style="font-size:10px;color:#6b7280;margin-bottom:15px;">Resumen de facturacion emitida, cobros recibidos y pendientes de cobro por contrato de servicio</p>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">Total Facturado</div>
        <div class="kpi-value text-blue">${formatCurrency(totalFacturado)}</div>
        <div class="kpi-sub">${totalFacturas} facturas emitidas</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Total Cobrado</div>
        <div class="kpi-value text-green">${formatCurrency(totalCobrado)}</div>
        <div class="kpi-sub">${totalCobradas} facturas cobradas</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Pendiente de Cobro</div>
        <div class="kpi-value text-red">${formatCurrency(totalPendiente)}</div>
        <div class="kpi-sub">${totalFacturas - totalCobradas} facturas pendientes</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">% Cobrado</div>
        <div class="kpi-value" style="color:${pctCobrado >= 80 ? '#059669' : pctCobrado >= 50 ? '#d97706' : '#dc2626'};">${pctCobrado.toFixed(1)}%</div>
        <div class="progress-bar" style="margin-top:6px;">
          <div class="progress-fill" style="width:${Math.min(pctCobrado, 100)}%;background:${pctCobrado >= 80 ? '#059669' : pctCobrado >= 50 ? '#d97706' : '#dc2626'};"></div>
        </div>
      </div>
    </div>

    <!-- Tabla resumen por contrato -->
    <h2>Resumen por Contrato</h2>
    <table>
      <thead>
        <tr>
          <th>Contrato</th>
          <th class="text-center">Tipo</th>
          <th class="text-right">Facturado</th>
          <th class="text-right">Cobrado</th>
          <th class="text-right">Pendiente</th>
          <th class="text-center">% Cobro</th>
          <th class="text-center">Facturas</th>
        </tr>
      </thead>
      <tbody>
        ${resumen.filter(r => r.numFacturas > 0).map(r => {
          const pct = r.facturado > 0 ? (r.cobrado / r.facturado * 100) : 0;
          return `<tr>
            <td class="font-bold">${r.titulo}</td>
            <td class="text-center"><span class="badge badge-orange">${r.tipo || '—'}</span></td>
            <td class="text-right">${formatCurrency(r.facturado)}</td>
            <td class="text-right text-green">${formatCurrency(r.cobrado)}</td>
            <td class="text-right ${r.pendiente > 0 ? 'text-red font-bold' : ''}">${formatCurrency(r.pendiente)}</td>
            <td class="text-center">${pct.toFixed(0)}%</td>
            <td class="text-center">${r.numCobradas}/${r.numFacturas}</td>
          </tr>`;
        }).join('')}
        ${facturasSinContrato.length > 0 ? `<tr>
          <td class="font-bold" style="color:#6b7280;">Sin contrato asignado</td>
          <td class="text-center">—</td>
          <td class="text-right">${formatCurrency(facturadoSinContrato)}</td>
          <td class="text-right text-green">${formatCurrency(cobradoSinContrato)}</td>
          <td class="text-right ${pendienteSinContrato > 0 ? 'text-red font-bold' : ''}">${formatCurrency(pendienteSinContrato)}</td>
          <td class="text-center">${facturadoSinContrato > 0 ? (cobradoSinContrato / facturadoSinContrato * 100).toFixed(0) : 0}%</td>
          <td class="text-center">${facturasSinContrato.length}</td>
        </tr>` : ''}
        <tr style="border-top:2px solid #1f2937;font-weight:800;background:#f3f4f6;">
          <td>TOTAL</td>
          <td></td>
          <td class="text-right">${formatCurrency(totalFacturado)}</td>
          <td class="text-right text-green">${formatCurrency(totalCobrado)}</td>
          <td class="text-right text-red">${formatCurrency(totalPendiente)}</td>
          <td class="text-center">${pctCobrado.toFixed(0)}%</td>
          <td class="text-center">${totalCobradas}/${totalFacturas}</td>
        </tr>
      </tbody>
    </table>

    <!-- Actualizaciones imputadas -->
    ${Object.keys(actualizPorContrato).length > 0 ? `
    <h2>Horas de Actualizaciones Imputadas a Contratos</h2>
    <table>
      <thead><tr><th>Contrato</th><th class="text-right">Horas equiv. (x${factor})</th><th>Observaciones</th></tr></thead>
      <tbody>
        ${resumen.filter(r => actualizPorContrato[r.id]).map(r => `<tr>
          <td class="font-bold">${r.titulo}</td>
          <td class="text-right text-blue font-bold">${(actualizPorContrato[r.id] || 0).toFixed(0)}h</td>
          <td style="font-size:9px;color:#6b7280;">N2 (x2) + Fin de semana (x2) = Factor x${factor}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ` : ''}

    <div class="page-footer">
      <span>Internet Operadores S.L. - ${fechaGeneracion} ${horaGeneracion}</span>
      <span>Situacion de Facturacion Draxton ${anio}</span>
    </div>
  </div>

  <!-- PAGINA 2: Detalle por contrato -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">DETALLE DE FACTURACION</div>
        <div>Draxton Group - ${anio}</div>
      </div>
    </div>

    <h1>Detalle de Facturas por Contrato</h1>
    <p style="font-size:10px;color:#6b7280;margin-bottom:15px;">Listado completo de facturas emitidas, estado de cobro y fechas</p>

    ${resumen.filter(r => r.numFacturas > 0).map(r => {
      const pct = r.facturado > 0 ? (r.cobrado / r.facturado * 100) : 0;
      const actualizH = actualizPorContrato[r.id] || 0;
      return `
      <div class="contract-section">
        <div class="contract-title">
          <span>${r.titulo}</span>
          <span style="font-size:10px;">
            <span class="text-blue">${formatCurrency(r.facturado)}</span> |
            <span class="text-green">${formatCurrency(r.cobrado)}</span> |
            <span class="${r.pendiente > 0 ? 'text-red' : 'text-green'}">${r.pendiente > 0 ? 'Pdte: ' : ''}${formatCurrency(r.pendiente)}</span>
          </span>
        </div>
        <div class="progress-bar" style="margin-bottom:8px;">
          <div class="progress-fill" style="width:${Math.min(pct, 100)}%;background:${pct >= 80 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626'};"></div>
        </div>
        <table>
          <thead><tr><th>Factura</th><th>Fecha</th><th>Empresa</th><th class="text-right">Importe</th><th class="text-center">Estado</th><th class="text-right">Cobrado</th></tr></thead>
          <tbody>
            ${r.facturas.sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()).map(f => `<tr>
              <td class="font-bold">${f.numFactura}</td>
              <td>${formatDate(f.fecha)}</td>
              <td style="font-size:9px;">${f.empresa || '—'}</td>
              <td class="text-right">${formatCurrency(f.importe)}</td>
              <td class="text-center"><span class="badge ${f.cobrada ? 'badge-green' : 'badge-red'}">${f.cobrada ? 'Cobrada' : 'Pendiente'}</span></td>
              <td class="text-right ${f.cobrada ? 'text-green' : ''}">${f.cobrada ? formatCurrency(f.importeCobrado) : '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        ${actualizH > 0 ? `<div class="actualiz-box">Actualizaciones imputadas: <strong>${actualizH.toFixed(0)}h equivalentes</strong> (factor x${factor})</div>` : ''}
      </div>`;
    }).join('')}

    ${facturasSinContrato.length > 0 ? `
    <div class="contract-section" style="border-color:#fca5a5;">
      <div class="contract-title">
        <span style="color:#dc2626;">Facturas sin contrato asignado</span>
        <span style="font-size:10px;color:#dc2626;">${formatCurrency(facturadoSinContrato)} | Pdte: ${formatCurrency(pendienteSinContrato)}</span>
      </div>
      <table>
        <thead><tr><th>Factura</th><th>Fecha</th><th>Empresa</th><th class="text-right">Importe</th><th class="text-center">Estado</th><th class="text-right">Cobrado</th></tr></thead>
        <tbody>
          ${facturasSinContrato.map((f: any) => `<tr>
            <td class="font-bold">${f.numFactura}</td>
            <td>${formatDate(f.fecha)}</td>
            <td style="font-size:9px;">${f.empresa || '—'}</td>
            <td class="text-right">${formatCurrency(f.importe)}</td>
            <td class="text-center"><span class="badge ${f.cobrada ? 'badge-green' : 'badge-red'}">${f.cobrada ? 'Cobrada' : 'Pendiente'}</span></td>
            <td class="text-right ${f.cobrada ? 'text-green' : ''}">${f.cobrada ? formatCurrency(f.importeCobrado) : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    <div class="page-footer">
      <span>Internet Operadores S.L. - ${fechaGeneracion} ${horaGeneracion}</span>
      <span>Detalle Facturacion Draxton ${anio} - Pagina 2</span>
    </div>
  </div>

</body>
</html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error: any) {
    console.error('Error generando informe facturacion:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
