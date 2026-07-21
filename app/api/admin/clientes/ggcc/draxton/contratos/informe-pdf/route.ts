import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function formatCurrency(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00€';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '€';
}

function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo') || 'interno';
    const baseUrl = new URL(req.url).origin;

    const contratos = await prisma.contratoDraxton.findMany({
      where: { estado: 'Activo' },
      orderBy: { createdAt: 'desc' },
      include: {
        contratosProveedor: { where: { estado: 'Activo' } },
      },
    });

    const personalAsignado = await prisma.personalContratoDraxton.findMany({
      where: { activo: true },
      include: {
        empleado: {
          select: { id: true, nombreCompleto: true, categoria: true, costeHoraActual: true },
        },
      },
    });

    const fecha = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });

    let totalMensual = 0;
    let totalCostes = 0;
    let totalMargen = 0;

    const contratosData = contratos.map(c => {
      const mensual = Number(c.importeMensual) || 0;
      const costeProveedores = c.contratosProveedor.reduce((s, p) => s + (Number(p.importeMensual) || 0), 0);
      const personalDelContrato = personalAsignado.filter(p => p.contratoDraxtonId === c.id);
      const costePersonal = personalDelContrato.reduce((s, p) => s + (Number(p.costeMensualImputado) || 0), 0);
      const costeTotal = costeProveedores + costePersonal;
      const margen = mensual - costeTotal;
      const margenPct = mensual > 0 ? ((margen / mensual) * 100).toFixed(1) : '0';

      let balanceHoras = null;
      if (c.modalidadContrato === 'horas' && c.horasContratadas) {
        const nivelContratado = c.nivelContratado || 1;
        let horasConsumidas = 0;
        personalDelContrato.forEach(p => {
          const nivel = p.nivelTecnico || 1;
          const horasBase = 128.67 * ((p.porcentajeDedicacion || 0) / 100);
          horasConsumidas += horasBase * (nivel / nivelContratado);
        });
        balanceHoras = {
          contratadas: c.horasContratadas,
          consumidas: horasConsumidas,
          balance: c.horasContratadas - horasConsumidas,
        };
      }

      totalMensual += mensual;
      totalCostes += costeTotal;
      totalMargen += margen;

      return { ...c, mensual, costeProveedores, costePersonal, costeTotal, margen, margenPct, personalDelContrato, balanceHoras };
    });

    const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;
    const html = tipo === 'interno'
      ? generarHTMLInterno(contratosData, totalMensual, totalCostes, totalMargen, fecha, logoUrl)
      : generarHTMLCliente(contratosData, fecha, logoUrl);

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
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 10px;
      line-height: 1.6;
      color: #1f2937;
      background: white;
    }
    @page {
      size: A4 portrait;
      margin: 0;
    }
    @media print {
      body { margin: 0; padding: 0; }
      .page { page-break-after: always; page-break-inside: avoid; }
      .page:last-child { page-break-after: auto; }
      .no-print { display: none !important; }
    }
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 20mm 18mm 25mm 18mm;
      position: relative;
      background: white;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 14px;
      border-bottom: 2px solid #E87A2E;
      margin-bottom: 20px;
    }
    .page-header img {
      height: 36px;
      object-fit: contain;
    }
    .page-header-right {
      text-align: right;
      font-size: 9px;
      color: #6b7280;
    }
    .page-footer {
      position: absolute;
      bottom: 12mm;
      left: 18mm;
      right: 18mm;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8px;
      color: #9ca3af;
      border-top: 1px solid #e5e7eb;
      padding-top: 8px;
    }
    h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
    h2 { font-size: 13px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
    h3 { font-size: 11px; font-weight: 600; color: #1f2937; margin: 0; }
    .badge {
      display: inline-block;
      font-size: 8px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 10px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .badge-orange { background: #FFF3E8; color: #E87A2E; }
    .badge-red { background: #FEF2F2; color: #dc2626; }
    .badge-green { background: #F0FDF4; color: #16a34a; }
    .badge-gray { background: #f3f4f6; color: #6b7280; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-box {
      padding: 14px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      text-align: center;
    }
    .kpi-label {
      font-size: 8px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .kpi-value {
      font-size: 20px;
      font-weight: 800;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
      margin-bottom: 16px;
    }
    thead th {
      background: #1f2937;
      color: white;
      padding: 8px 10px;
      text-align: left;
      font-weight: 600;
      font-size: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    tbody td {
      padding: 7px 10px;
      border-bottom: 1px solid #f3f4f6;
    }
    tbody tr:nth-child(even) { background: #fafafa; }
    tbody tr:last-child td { border-bottom: none; }
    .total-row {
      background: #f3f4f6 !important;
      font-weight: 700;
    }
    .total-row td { border-top: 2px solid #e5e7eb; }
    .contract-card {
      margin-bottom: 14px;
      padding: 14px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      border-left: 4px solid #E87A2E;
    }
    .contract-meta {
      display: flex;
      gap: 14px;
      margin-top: 6px;
      font-size: 9px;
      color: #6b7280;
    }
    .sub-table {
      width: 100%;
      margin-top: 8px;
      border-collapse: collapse;
      font-size: 9px;
    }
    .sub-table th {
      background: #f9fafb;
      color: #374151;
      padding: 5px 8px;
      text-align: left;
      font-weight: 600;
      font-size: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .sub-table td {
      padding: 4px 8px;
      border-bottom: 1px solid #f3f4f6;
    }
    .balance-box {
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 9px;
      font-weight: 500;
    }
    .balance-positive { background: #f0fdfa; border: 1px solid #99f6e4; }
    .balance-negative { background: #fef2f2; border: 1px solid #fecaca; }
    .print-btn {
      position: fixed;
      top: 16px;
      right: 16px;
      padding: 10px 20px;
      background: #E87A2E;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(232,122,46,0.3);
    }
    .print-btn:hover { background: #d06a1f; }
  `;
}

function generarHTMLInterno(contratos: any[], totalMensual: number, totalCostes: number, totalMargen: number, fecha: string, logoUrl: string): string {
  const margenPctTotal = totalMensual > 0 ? ((totalMargen / totalMensual) * 100).toFixed(1) : '0';

  const filasContratos = contratos.map(c => `
    <tr>
      <td style="font-weight:500;">${c.titulo}</td>
      <td style="text-align:center;"><span class="badge badge-gray">${c.tipo || '—'}</span></td>
      <td style="text-align:right;font-weight:600;">${formatCurrency(c.mensual)}</td>
      <td style="text-align:right;color:#dc2626;">${formatCurrency(c.costeTotal)}</td>
      <td style="text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(c.margen)}</td>
      <td style="text-align:center;font-weight:600;color:${Number(c.margenPct) >= 30 ? '#16a34a' : Number(c.margenPct) >= 15 ? '#d97706' : '#dc2626'};">${c.margenPct}%</td>
      <td style="text-align:center;font-weight:600;color:${c.balanceHoras ? (c.balanceHoras.balance >= 0 ? '#0d9488' : '#dc2626') : '#9ca3af'};">${c.balanceHoras ? `${c.balanceHoras.balance >= 0 ? '+' : ''}${c.balanceHoras.balance.toFixed(1)}h` : '—'}</td>
    </tr>
  `).join('');

  const detalleContratos = contratos.map(c => {
    const proveedoresHtml = c.contratosProveedor.length > 0 ? `
      <table class="sub-table">
        <thead><tr><th>Proveedor</th><th style="text-align:right;">Coste/mes</th></tr></thead>
        <tbody>
          ${c.contratosProveedor.map((p: any) => `
            <tr><td>${p.proveedor || '—'}</td><td style="text-align:right;color:#dc2626;font-weight:500;">${formatCurrency(p.importeMensual)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const personalHtml = c.personalDelContrato.length > 0 ? `
      <table class="sub-table">
        <thead><tr><th>Recurso</th><th style="text-align:center;">Nivel</th><th style="text-align:center;">Dedicación</th><th style="text-align:right;">Coste imputado</th></tr></thead>
        <tbody>
          ${c.personalDelContrato.map((p: any) => `
            <tr><td>${p.empleado?.nombreCompleto || '—'}</td><td style="text-align:center;">N${p.nivelTecnico || 1}</td><td style="text-align:center;">${p.porcentajeDedicacion}%</td><td style="text-align:right;color:#dc2626;font-weight:500;">${formatCurrency(p.costeMensualImputado)}</td></tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const balanceHtml = c.balanceHoras ? `
      <div class="balance-box ${c.balanceHoras.balance >= 0 ? 'balance-positive' : 'balance-negative'}">
        <strong>Balance de horas:</strong> ${c.balanceHoras.contratadas}h contratadas − ${c.balanceHoras.consumidas.toFixed(1)}h consumidas = 
        <span style="font-weight:800;color:${c.balanceHoras.balance >= 0 ? '#0d9488' : '#dc2626'};">${c.balanceHoras.balance >= 0 ? '+' : ''}${c.balanceHoras.balance.toFixed(1)}h</span>
      </div>
    ` : '';

    return `
      <div class="contract-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3>${c.titulo}</h3>
          <div style="display:flex;gap:6px;align-items:center;">
            <span class="badge badge-orange">${c.tipo}</span>
            <span style="font-size:12px;font-weight:700;color:#16a34a;">${formatCurrency(c.margen)}/mes</span>
          </div>
        </div>
        <div class="contract-meta">
          <span>Inicio: ${formatDate(c.fechaInicio)}</span>
          <span>Fin: ${formatDate(c.fechaFin)}</span>
          <span>Facturación: ${formatCurrency(c.mensual)}/mes</span>
          ${c.modalidadContrato ? `<span>Modalidad: ${c.modalidadContrato === 'horas' ? 'Por Horas' : 'Por Recurso'}</span>` : ''}
          ${c.horasContratadas ? `<span>${c.horasContratadas}h/mes (N${c.nivelContratado || 1})</span>` : ''}
        </div>
        ${proveedoresHtml}
        ${personalHtml}
        ${balanceHtml}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe Interno - Contratos Draxton</title>
  <style>${estilosBase()}</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">⬇ Imprimir / Guardar PDF</button>

  <!-- PÁGINA 1: Resumen ejecutivo -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
        <div>${fecha}</div>
        <div style="color:#dc2626;font-weight:700;margin-top:4px;">⚠ CONFIDENCIAL</div>
      </div>
    </div>

    <h1>Informe de Rentabilidad</h1>
    <p style="font-size:11px;color:#6b7280;margin-bottom:20px;">Contratos activos con Draxton — Análisis de márgenes y recursos</p>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="kpi-label">Facturación mensual</div>
        <div class="kpi-value" style="color:#1f2937;">${formatCurrency(totalMensual)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Costes mensuales</div>
        <div class="kpi-value" style="color:#dc2626;">${formatCurrency(totalCostes)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Margen mensual</div>
        <div class="kpi-value" style="color:#16a34a;">${formatCurrency(totalMargen)}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">% Rentabilidad</div>
        <div class="kpi-value" style="color:${Number(margenPctTotal) >= 30 ? '#16a34a' : '#d97706'};">${margenPctTotal}%</div>
      </div>
    </div>

    <h2>Resumen de Contratos</h2>
    <table>
      <thead>
        <tr>
          <th>Contrato</th>
          <th style="text-align:center;">Tipo</th>
          <th style="text-align:right;">Facturación</th>
          <th style="text-align:right;">Coste</th>
          <th style="text-align:right;">Margen</th>
          <th style="text-align:center;">%</th>
          <th style="text-align:center;">Balance h.</th>
        </tr>
      </thead>
      <tbody>
        ${filasContratos}
        <tr class="total-row">
          <td>TOTAL</td>
          <td></td>
          <td style="text-align:right;">${formatCurrency(totalMensual)}</td>
          <td style="text-align:right;color:#dc2626;">${formatCurrency(totalCostes)}</td>
          <td style="text-align:right;color:#16a34a;">${formatCurrency(totalMargen)}</td>
          <td style="text-align:center;color:#16a34a;">${margenPctTotal}%</td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="page-footer">
      <span>Internet Operadores S.L. — Documento confidencial</span>
      <span>Página 1</span>
    </div>
  </div>

  <!-- PÁGINA 2+: Detalle por contrato -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME INTERNO</div>
        <div>${fecha}</div>
      </div>
    </div>

    <h2>Detalle por Contrato</h2>
    ${detalleContratos}

    <div class="page-footer">
      <span>Internet Operadores S.L. — Documento confidencial</span>
      <span>Página 2</span>
    </div>
  </div>
</body>
</html>`;
}

function generarHTMLCliente(contratos: any[], fecha: string, logoUrl: string): string {
  const totalMensual = contratos.reduce((s, c) => s + c.mensual, 0);
  const totalRecursos = contratos.reduce((s, c) => s + c.personalDelContrato.length, 0);

  const filasContratos = contratos.map(c => `
    <tr>
      <td style="font-weight:500;">${c.titulo}</td>
      <td style="text-align:center;"><span class="badge badge-orange">${c.tipo || '—'}</span></td>
      <td style="text-align:center;">${c.modalidadContrato === 'horas' ? 'Por Horas' : c.modalidadContrato === 'recurso' ? 'Por Recurso' : '—'}</td>
      <td style="text-align:center;">${c.personalDelContrato.length || '—'}</td>
      <td style="text-align:center;">${c.horasContratadas ? c.horasContratadas + 'h' : '—'}</td>
      <td style="text-align:right;font-weight:600;">${formatCurrency(c.mensual)}</td>
    </tr>
  `).join('');

  const detalleContratos = contratos.map(c => {
    const serviciosHtml = c.contratosProveedor.length > 0 ? `
      <table class="sub-table">
        <thead><tr><th>Servicio / Tecnología</th><th>Descripción</th></tr></thead>
        <tbody>
          ${c.contratosProveedor.map((p: any) => `
            <tr><td>${p.proveedor || '—'}</td><td>${p.titulo || p.descripcion || '—'}</td></tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const personalHtml = c.personalDelContrato.length > 0 ? `
      <table class="sub-table">
        <thead><tr><th>Recurso asignado</th><th style="text-align:center;">Nivel técnico</th><th style="text-align:center;">Dedicación</th><th>Rol / Función</th></tr></thead>
        <tbody>
          ${c.personalDelContrato.map((p: any) => `
            <tr><td>${p.empleado?.nombreCompleto || '—'}</td><td style="text-align:center;">Nivel ${p.nivelTecnico || 1}</td><td style="text-align:center;">${p.porcentajeDedicacion}%</td><td>${p.rol || '—'}</td></tr>
          `).join('')}
        </tbody>
      </table>
    ` : '';

    const horasHtml = c.balanceHoras ? `
      <div class="balance-box ${c.balanceHoras.balance >= 0 ? 'balance-positive' : 'balance-negative'}">
        <strong>Balance de horas:</strong> ${c.balanceHoras.contratadas}h contratadas — ${c.balanceHoras.consumidas.toFixed(1)}h consumidas = 
        <span style="font-weight:800;color:${c.balanceHoras.balance >= 0 ? '#0d9488' : '#dc2626'};">${c.balanceHoras.balance >= 0 ? '+' : ''}${c.balanceHoras.balance.toFixed(1)}h disponibles</span>
        — Nivel técnico base: N${c.nivelContratado || 1}
      </div>
    ` : '';

    return `
      <div class="contract-card">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3>${c.titulo}</h3>
          <span class="badge badge-orange">${c.tipo}</span>
        </div>
        <div class="contract-meta">
          <span>Inicio: ${formatDate(c.fechaInicio)}</span>
          <span>Fin: ${formatDate(c.fechaFin)}</span>
          <span>Importe: ${formatCurrency(c.mensual)}/mes</span>
          ${c.modalidadContrato ? `<span>Modalidad: ${c.modalidadContrato === 'horas' ? 'Por Horas' : 'Por Recurso'}</span>` : ''}
        </div>
        ${serviciosHtml}
        ${personalHtml}
        ${horasHtml}
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de Servicios - Draxton</title>
  <style>${estilosBase()}</style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">⬇ Imprimir / Guardar PDF</button>

  <!-- PÁGINA 1: Resumen -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME DE SERVICIOS</div>
        <div>Cliente: <strong>Draxton</strong></div>
        <div>${fecha}</div>
      </div>
    </div>

    <h1>Servicios Contratados</h1>
    <p style="font-size:11px;color:#6b7280;margin-bottom:20px;">Resumen de servicios activos, recursos asignados y cobertura técnica</p>

    <div class="kpi-grid" style="grid-template-columns:repeat(3,1fr);">
      <div class="kpi-box">
        <div class="kpi-label">Contratos activos</div>
        <div class="kpi-value" style="color:#1f2937;">${contratos.length}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Recursos asignados</div>
        <div class="kpi-value" style="color:#E87A2E;">${totalRecursos}</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Inversión mensual</div>
        <div class="kpi-value" style="color:#1f2937;">${formatCurrency(totalMensual)}</div>
      </div>
    </div>

    <h2>Resumen de Servicios</h2>
    <table>
      <thead>
        <tr>
          <th>Servicio</th>
          <th style="text-align:center;">Tipo</th>
          <th style="text-align:center;">Modalidad</th>
          <th style="text-align:center;">Recursos</th>
          <th style="text-align:center;">Horas/mes</th>
          <th style="text-align:right;">Importe/mes</th>
        </tr>
      </thead>
      <tbody>
        ${filasContratos}
        <tr class="total-row">
          <td colspan="3">TOTAL</td>
          <td style="text-align:center;">${totalRecursos}</td>
          <td></td>
          <td style="text-align:right;">${formatCurrency(totalMensual)}</td>
        </tr>
      </tbody>
    </table>

    <div class="page-footer">
      <span>Internet Operadores S.L. — www.internetoperadores.com</span>
      <span>Página 1</span>
    </div>
  </div>

  <!-- PÁGINA 2+: Detalle -->
  <div class="page">
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div style="font-size:10px;font-weight:600;color:#1f2937;">INFORME DE SERVICIOS</div>
        <div>Cliente: <strong>Draxton</strong></div>
        <div>${fecha}</div>
      </div>
    </div>

    <h2>Detalle de Servicios</h2>
    ${detalleContratos}

    <div style="margin-top:30px;padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;">
      <h3 style="margin-bottom:8px;">Contacto de soporte</h3>
      <div style="font-size:10px;color:#6b7280;line-height:1.8;">
        <div><strong>Email:</strong> soporte@internetoperadores.com</div>
        <div><strong>Teléfono:</strong> 900 730 034</div>
        <div><strong>Horario:</strong> L-V 8:00 - 18:00</div>
        <div><strong>Portal:</strong> www.internetoperadores.com</div>
      </div>
    </div>

    <div class="page-footer">
      <span>Internet Operadores S.L. — www.internetoperadores.com</span>
      <span>Página 2</span>
    </div>
  </div>
</body>
</html>`;
}
