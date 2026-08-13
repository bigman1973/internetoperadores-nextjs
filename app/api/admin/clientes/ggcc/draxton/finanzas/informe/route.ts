import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

const DRAXTON_CLIENTES = ['DRAXTON', 'INFUN', 'FUCHOSA', 'ALTEC'];

const SOCIEDADES: Record<string, string> = {
  'DRAXTON EUROPE': 'Draxton Europe & Asia',
  'DRAXTON POWERTRAIN': 'Draxton Powertrain & Chassis',
  'DRAXTON BRNO': 'Draxton Brno',
  'INFUN': 'Infun For',
  'FUCHOSA': 'Fuchosa',
  'ALTEC': 'Altec',
};

function getSociedad(cliente: string): string {
  const upper = (cliente || '').toUpperCase();
  for (const [key, value] of Object.entries(SOCIEDADES)) {
    if (upper.includes(key)) return value;
  }
  return cliente || 'Otros';
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatCurrency(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00 €';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const MESES_NOMBRE: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()));
    const tipo = searchParams.get('tipo') || 'interno'; // interno | cliente
    const baseUrl = new URL(req.url).origin;
    const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;

    const startDate = new Date(`${anio}-01-01`);
    const endDate = new Date(`${anio + 1}-01-01`);

    // Obtener facturas emitidas de Draxton del año
    const facturas = await prisma.facturaEmitida.findMany({
      where: {
        fecha: { gte: startDate, lt: endDate },
        OR: DRAXTON_CLIENTES.map(c => ({ cliente: { contains: c, mode: 'insensitive' as const } })),
      },
      select: {
        id: true,
        numFactura: true,
        serie: true,
        fecha: true,
        cliente: true,
        base: true,
        importeIva: true,
        total: true,
        estado: true,
        importeCobrado: true,
        formaCobro: true,
        fechaCobro: true,
        concepto: true,
      },
      orderBy: { fecha: 'asc' },
    });

    // Agrupar por mes
    interface MesData {
      mes: string;
      mesNombre: string;
      facturas: number;
      base: number;
      total: number;
      cobrado: number;
      pendiente: number;
    }

    const porMes: MesData[] = [];
    const mesMap: Record<string, MesData> = {};

    for (let m = 1; m <= 12; m++) {
      const key = String(m).padStart(2, '0');
      const data: MesData = {
        mes: key,
        mesNombre: MESES_NOMBRE[key],
        facturas: 0,
        base: 0,
        total: 0,
        cobrado: 0,
        pendiente: 0,
      };
      mesMap[key] = data;
    }

    let totalBase = 0;
    let totalTotal = 0;
    let totalCobrado = 0;
    let totalPendiente = 0;

    // Resumen por sociedad
    const sociedadesMap: Record<string, { nombre: string; facturas: number; base: number; total: number; cobrado: number; pendiente: number }> = {};

    for (const f of facturas) {
      const mesKey = String(f.fecha.getMonth() + 1).padStart(2, '0');
      const base = Number(f.base) || 0;
      const total = Number(f.total) || 0;
      const cobrado = Number(f.importeCobrado) || 0;
      const pendiente = total - cobrado;

      if (mesMap[mesKey]) {
        mesMap[mesKey].facturas++;
        mesMap[mesKey].base += base;
        mesMap[mesKey].total += total;
        mesMap[mesKey].cobrado += cobrado;
        mesMap[mesKey].pendiente += pendiente;
      }

      totalBase += base;
      totalTotal += total;
      totalCobrado += cobrado;
      totalPendiente += pendiente;

      const soc = getSociedad(f.cliente);
      if (!sociedadesMap[soc]) {
        sociedadesMap[soc] = { nombre: soc, facturas: 0, base: 0, total: 0, cobrado: 0, pendiente: 0 };
      }
      sociedadesMap[soc].facturas++;
      sociedadesMap[soc].base += base;
      sociedadesMap[soc].total += total;
      sociedadesMap[soc].cobrado += cobrado;
      sociedadesMap[soc].pendiente += pendiente;
    }

    // Filtrar meses con datos
    for (const [key, data] of Object.entries(mesMap)) {
      if (data.facturas > 0) porMes.push(data);
    }

    const porSociedad = Object.values(sociedadesMap).sort((a, b) => b.base - a.base);
    const mesesConFacturacion = porMes.length;
    const mediaMensual = mesesConFacturacion > 0 ? totalBase / mesesConFacturacion : 0;
    const pctCobrado = totalTotal > 0 ? (totalCobrado / totalTotal * 100) : 0;

    const fechaGeneracion = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    const horaGeneracion = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    // Top 10 facturas pendientes
    const facturasPendientes = facturas
      .filter(f => (Number(f.total) - (Number(f.importeCobrado) || 0)) > 0)
      .map(f => ({
        numero: f.numFactura,
        fecha: f.fecha,
        sociedad: getSociedad(f.cliente),
        base: Number(f.base) || 0,
        total: Number(f.total) || 0,
        pendiente: Number(f.total) - (Number(f.importeCobrado) || 0),
      }))
      .sort((a, b) => b.pendiente - a.pendiente)
      .slice(0, 15);

    // Facturas cobradas recientemente (últimas 10)
    const facturasCobradasRecientes = facturas
      .filter(f => f.fechaCobro && (Number(f.importeCobrado) || 0) > 0)
      .map(f => ({
        numero: f.numFactura,
        fecha: f.fecha,
        sociedad: getSociedad(f.cliente),
        total: Number(f.total) || 0,
        cobrado: Number(f.importeCobrado) || 0,
        fechaCobro: f.fechaCobro,
        formaCobro: f.formaCobro,
      }))
      .sort((a, b) => new Date(b.fechaCobro!).getTime() - new Date(a.fechaCobro!).getTime())
      .slice(0, 10);

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe Financiero - Draxton Group ${anio}</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    @media print { .no-print { display: none !important; } .page { break-after: page; } .page:last-child { break-after: auto; } }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1f2937; line-height: 1.4; background: #f9fafb; }
    .page { background: white; max-width: 210mm; min-height: 280mm; margin: 0 auto; padding: 25px 30px; position: relative; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 2px solid #1f2937; margin-bottom: 20px; }
    .page-header img { height: 40px; }
    .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
    .print-btn { position: fixed; top: 15px; right: 15px; z-index: 999; padding: 10px 20px; background: #4f46e5; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600; box-shadow: 0 2px 8px rgba(79,70,229,0.3); }
    .print-btn:hover { background: #4338ca; }
    h1 { font-size: 18px; color: #1f2937; margin-bottom: 5px; }
    h2 { font-size: 13px; color: #1f2937; margin: 20px 0 10px 0; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    h3 { font-size: 11px; color: #374151; margin: 12px 0 6px 0; }
    .subtitle { font-size: 10px; color: #6b7280; margin-bottom: 15px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 20px; }
    .kpi-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 10px; text-align: center; }
    .kpi-label { font-size: 8px; text-transform: uppercase; color: #6b7280; font-weight: 600; letter-spacing: 0.5px; }
    .kpi-value { font-size: 18px; font-weight: 800; margin-top: 4px; }
    .kpi-sub { font-size: 8px; color: #6b7280; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 15px; }
    th { background: #1f2937; color: white; padding: 6px 8px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; }
    td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
    tr:nth-child(even) { background: #f9fafb; }
    tr.total-row { border-top: 2px solid #1f2937; font-weight: 800; background: #f3f4f6 !important; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .font-bold { font-weight: 700; }
    .text-green { color: #059669; }
    .text-red { color: #dc2626; }
    .text-blue { color: #2563eb; }
    .text-orange { color: #d97706; }
    .text-indigo { color: #4f46e5; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 8px; font-weight: 600; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .badge-orange { background: #fef3c7; color: #92400e; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .progress-bar { width: 100%; height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden; margin-top: 4px; }
    .progress-fill { height: 100%; border-radius: 3px; }
    .chart-container { margin: 15px 0; padding: 15px; background: #f9fafb; border-radius: 8px; border: 1px solid #e5e7eb; }
    .bar-chart { display: flex; align-items: flex-end; gap: 6px; height: 120px; padding: 0 5px; }
    .bar-item { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; }
    .bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 2px; position: relative; }
    .bar-label { font-size: 7px; color: #6b7280; margin-top: 4px; text-align: center; }
    .bar-value { font-size: 7px; color: #374151; font-weight: 600; margin-bottom: 2px; }
    .legend { display: flex; gap: 15px; justify-content: center; margin-top: 10px; font-size: 9px; }
    .legend-item { display: flex; align-items: center; gap: 4px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
    .page-footer { position: absolute; bottom: 15px; left: 30px; right: 30px; display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
    .confidencial { text-align: right; font-size: 8px; color: #dc2626; font-weight: 700; letter-spacing: 1px; opacity: 0.7; margin-bottom: 10px; }
    .watermark { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-30deg); font-size: 60px; color: rgba(220,38,38,0.04); font-weight: 900; letter-spacing: 10px; pointer-events: none; }
    .summary-box { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; }
    .summary-card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; }
    .summary-card-title { font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: 600; margin-bottom: 6px; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  <!-- PAGINA 1: Resumen Ejecutivo -->
  <div class="page">
    ${tipo === 'interno' ? '<div class="watermark">INTERNO</div>' : ''}
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME FINANCIERO</div>
        <div>Cliente: <strong>Draxton Group</strong></div>
        <div>Periodo: Enero - Diciembre ${anio}</div>
        <div>${fechaGeneracion} ${horaGeneracion}</div>
      </div>
    </div>
    ${tipo === 'interno' ? '<div class="confidencial">CONFIDENCIAL - USO INTERNO</div>' : ''}

    <h1>Informe Financiero ${anio}</h1>
    <p class="subtitle">Resumen ejecutivo de facturacion, cobros y control financiero del cliente Draxton Group</p>

    <!-- KPIs principales -->
    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">Facturas Emitidas</div>
        <div class="kpi-value text-indigo">${facturas.length}</div>
        <div class="kpi-sub">${mesesConFacturacion} meses con facturacion</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Facturado (Base)</div>
        <div class="kpi-value text-blue">${formatCurrency(totalBase)}</div>
        <div class="kpi-sub">Total IVA inc.: ${formatCurrency(totalTotal)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Cobrado</div>
        <div class="kpi-value text-green">${formatCurrency(totalCobrado)}</div>
        <div class="kpi-sub">${pctCobrado.toFixed(0)}% del total</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Pendiente Cobro</div>
        <div class="kpi-value text-red">${formatCurrency(totalPendiente)}</div>
        <div class="kpi-sub">${(100 - pctCobrado).toFixed(0)}% del total</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Media Mensual</div>
        <div class="kpi-value text-orange">${formatCurrency(mediaMensual)}</div>
        <div class="kpi-sub">${mesesConFacturacion} meses con facturacion</div>
      </div>
    </div>

    <!-- Grafico de barras facturacion mensual -->
    <h2>Evolucion Mensual de Facturacion</h2>
    <div class="chart-container">
      <div class="bar-chart">
        ${porMes.map(m => {
          const maxBase = Math.max(...porMes.map(x => x.base));
          const heightBase = maxBase > 0 ? (m.base / maxBase * 90) : 0;
          const heightCobrado = maxBase > 0 ? (m.cobrado / maxBase * 90) : 0;
          return `<div class="bar-item">
            <div class="bar-value">${(m.base / 1000).toFixed(0)}k</div>
            <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:${heightBase + 10}px;">
              <div class="bar" style="height:${heightBase}%;background:#818cf8;flex:1;"></div>
              <div class="bar" style="height:${heightCobrado}%;background:#34d399;flex:1;"></div>
            </div>
            <div class="bar-label">${m.mesNombre.substring(0, 3)}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="legend">
        <div class="legend-item"><div class="legend-dot" style="background:#818cf8;"></div> Facturado (Base)</div>
        <div class="legend-item"><div class="legend-dot" style="background:#34d399;"></div> Cobrado</div>
      </div>
    </div>

    <!-- Barra de progreso cobro -->
    <div style="margin-top:15px;">
      <div style="display:flex;justify-content:space-between;font-size:9px;margin-bottom:4px;">
        <span><strong>Progreso de cobro</strong></span>
        <span>${pctCobrado.toFixed(1)}% cobrado (${formatCurrency(totalCobrado)} de ${formatCurrency(totalTotal)})</span>
      </div>
      <div class="progress-bar" style="height:10px;">
        <div class="progress-fill" style="width:${Math.min(pctCobrado, 100)}%;background: linear-gradient(90deg, #059669, #34d399);"></div>
      </div>
    </div>

    <div class="page-footer">
      <span>Internet Operadores S.L. - ${fechaGeneracion}</span>
      <span>Informe Financiero Draxton ${anio} - Pagina 1</span>
    </div>
  </div>

  <!-- PAGINA 2: Facturacion Mensual + Desglose Sociedad -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">DETALLE MENSUAL</div>
        <div>Draxton Group - ${anio}</div>
      </div>
    </div>
    ${tipo === 'interno' ? '<div class="confidencial">CONFIDENCIAL - USO INTERNO</div>' : ''}

    <h2>Facturacion Mensual (Base Imponible)</h2>
    <table>
      <thead>
        <tr>
          <th>Mes</th>
          <th class="text-center">Facturas</th>
          <th class="text-right">Base Imponible</th>
          <th class="text-right">Total IVA inc.</th>
          <th class="text-right">Cobrado</th>
          <th class="text-right">Pendiente</th>
          <th class="text-center">% Cobro</th>
        </tr>
      </thead>
      <tbody>
        ${porMes.map(m => {
          const pct = m.total > 0 ? (m.cobrado / m.total * 100) : 0;
          return `<tr>
            <td class="font-bold">${m.mesNombre}</td>
            <td class="text-center">${m.facturas}</td>
            <td class="text-right text-blue font-bold">${formatCurrency(m.base)}</td>
            <td class="text-right" style="color:#6b7280;">${formatCurrency(m.total)}</td>
            <td class="text-right text-green">${formatCurrency(m.cobrado)}</td>
            <td class="text-right ${m.pendiente > 0 ? 'text-red' : ''}">${m.pendiente > 0 ? formatCurrency(m.pendiente) : '—'}</td>
            <td class="text-center">
              <span class="badge ${pct >= 95 ? 'badge-green' : pct >= 50 ? 'badge-orange' : 'badge-red'}">${pct.toFixed(0)}%</span>
            </td>
          </tr>`;
        }).join('')}
        <tr class="total-row">
          <td>TOTAL</td>
          <td class="text-center">${facturas.length}</td>
          <td class="text-right text-blue">${formatCurrency(totalBase)}</td>
          <td class="text-right">${formatCurrency(totalTotal)}</td>
          <td class="text-right text-green">${formatCurrency(totalCobrado)}</td>
          <td class="text-right text-red">${formatCurrency(totalPendiente)}</td>
          <td class="text-center"><span class="badge badge-green">${pctCobrado.toFixed(0)}%</span></td>
        </tr>
      </tbody>
    </table>

    <h2>Desglose por Sociedad</h2>
    <table>
      <thead>
        <tr>
          <th>Sociedad</th>
          <th class="text-center">Facturas</th>
          <th class="text-right">Base Imponible</th>
          <th class="text-right">Total IVA inc.</th>
          <th class="text-right">Cobrado</th>
          <th class="text-right">Pendiente</th>
          <th class="text-center">% Total</th>
        </tr>
      </thead>
      <tbody>
        ${porSociedad.map(s => {
          const pctTotal = totalBase > 0 ? (s.base / totalBase * 100) : 0;
          return `<tr>
            <td class="font-bold">${escapeHtml(s.nombre)}</td>
            <td class="text-center">${s.facturas}</td>
            <td class="text-right text-blue">${formatCurrency(s.base)}</td>
            <td class="text-right" style="color:#6b7280;">${formatCurrency(s.total)}</td>
            <td class="text-right text-green">${formatCurrency(s.cobrado)}</td>
            <td class="text-right ${s.pendiente > 0 ? 'text-red' : ''}">${s.pendiente > 0 ? formatCurrency(s.pendiente) : '—'}</td>
            <td class="text-center"><span class="badge badge-blue">${pctTotal.toFixed(1)}%</span></td>
          </tr>`;
        }).join('')}
        <tr class="total-row">
          <td>TOTAL</td>
          <td class="text-center">${facturas.length}</td>
          <td class="text-right text-blue">${formatCurrency(totalBase)}</td>
          <td class="text-right">${formatCurrency(totalTotal)}</td>
          <td class="text-right text-green">${formatCurrency(totalCobrado)}</td>
          <td class="text-right text-red">${formatCurrency(totalPendiente)}</td>
          <td class="text-center">100%</td>
        </tr>
      </tbody>
    </table>

    ${tipo === 'interno' ? `
    <!-- Distribucion por sociedad visual -->
    <h3>Distribucion de facturacion por sociedad</h3>
    <div style="display:flex;gap:4px;height:20px;border-radius:4px;overflow:hidden;margin-top:8px;">
      ${porSociedad.map((s, i) => {
        const pctW = totalBase > 0 ? (s.base / totalBase * 100) : 0;
        const colors = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa'];
        return `<div style="width:${pctW}%;background:${colors[i % colors.length]};min-width:${pctW > 3 ? '0' : '3'}px;" title="${s.nombre}: ${pctW.toFixed(1)}%"></div>`;
      }).join('')}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
      ${porSociedad.map((s, i) => {
        const pctW = totalBase > 0 ? (s.base / totalBase * 100) : 0;
        const colors = ['#818cf8', '#34d399', '#fbbf24', '#f87171', '#60a5fa', '#a78bfa'];
        return `<span style="font-size:8px;display:flex;align-items:center;gap:3px;"><span style="width:8px;height:8px;border-radius:2px;background:${colors[i % colors.length]};"></span>${s.nombre} (${pctW.toFixed(1)}%)</span>`;
      }).join('')}
    </div>
    ` : ''}

    <div class="page-footer">
      <span>Internet Operadores S.L. - ${fechaGeneracion}</span>
      <span>Informe Financiero Draxton ${anio} - Pagina 2</span>
    </div>
  </div>

  ${tipo === 'interno' ? `
  <!-- PAGINA 3: Facturas Pendientes + Cobros Recientes (solo interno) -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">CONTROL DE COBROS</div>
        <div>Draxton Group - ${anio}</div>
      </div>
    </div>
    <div class="confidencial">CONFIDENCIAL - USO INTERNO</div>

    <h2>Facturas Pendientes de Cobro</h2>
    <p class="subtitle">Top ${facturasPendientes.length} facturas con mayor importe pendiente</p>
    ${facturasPendientes.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Factura</th>
          <th>Fecha</th>
          <th>Sociedad</th>
          <th class="text-right">Total</th>
          <th class="text-right">Pendiente</th>
          <th class="text-center">Antiguedad</th>
        </tr>
      </thead>
      <tbody>
        ${facturasPendientes.map(f => {
          const dias = Math.floor((Date.now() - new Date(f.fecha).getTime()) / (1000 * 60 * 60 * 24));
          return `<tr>
            <td class="font-bold">${f.numero}</td>
            <td>${formatDate(f.fecha)}</td>
            <td style="font-size:9px;">${escapeHtml(f.sociedad)}</td>
            <td class="text-right">${formatCurrency(f.total)}</td>
            <td class="text-right text-red font-bold">${formatCurrency(f.pendiente)}</td>
            <td class="text-center"><span class="badge ${dias > 90 ? 'badge-red' : dias > 60 ? 'badge-orange' : 'badge-blue'}">${dias}d</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
    ` : '<p style="color:#6b7280;font-style:italic;">No hay facturas pendientes de cobro</p>'}

    <h2>Ultimos Cobros Recibidos</h2>
    <p class="subtitle">Ultimos ${facturasCobradasRecientes.length} cobros registrados</p>
    ${facturasCobradasRecientes.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Factura</th>
          <th>Sociedad</th>
          <th class="text-right">Importe</th>
          <th class="text-right">Cobrado</th>
          <th>Fecha Cobro</th>
          <th>Forma</th>
        </tr>
      </thead>
      <tbody>
        ${facturasCobradasRecientes.map(f => `<tr>
          <td class="font-bold">${f.numero}</td>
          <td style="font-size:9px;">${escapeHtml(f.sociedad)}</td>
          <td class="text-right">${formatCurrency(f.total)}</td>
          <td class="text-right text-green font-bold">${formatCurrency(f.cobrado)}</td>
          <td>${formatDate(f.fechaCobro)}</td>
          <td style="font-size:9px;">${f.formaCobro || '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ` : '<p style="color:#6b7280;font-style:italic;">No hay cobros registrados</p>'}

    <!-- Resumen de riesgo -->
    <div class="summary-box">
      <div class="summary-card">
        <div class="summary-card-title">Antiguedad media pendientes</div>
        <div style="font-size:16px;font-weight:800;color:#d97706;">
          ${facturasPendientes.length > 0 ? Math.floor(facturasPendientes.reduce((s, f) => s + Math.floor((Date.now() - new Date(f.fecha).getTime()) / (1000 * 60 * 60 * 24)), 0) / facturasPendientes.length) : 0} dias
        </div>
        <div style="font-size:9px;color:#6b7280;margin-top:2px;">${facturasPendientes.length} facturas pendientes</div>
      </div>
      <div class="summary-card">
        <div class="summary-card-title">Prevision cierre anual</div>
        <div style="font-size:16px;font-weight:800;color:#2563eb;">
          ${formatCurrency(mediaMensual * 12)}
        </div>
        <div style="font-size:9px;color:#6b7280;margin-top:2px;">Basado en media mensual de ${formatCurrency(mediaMensual)}</div>
      </div>
    </div>

    <div class="page-footer">
      <span>Internet Operadores S.L. - ${fechaGeneracion}</span>
      <span>Informe Financiero Draxton ${anio} - Pagina 3</span>
    </div>
  </div>
  ` : ''}

</body>
</html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error: any) {
    console.error('Error generando informe finanzas Draxton:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
