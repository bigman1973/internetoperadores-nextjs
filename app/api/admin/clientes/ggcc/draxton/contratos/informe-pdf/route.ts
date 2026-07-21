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
    const tipo = searchParams.get('tipo') || 'interno'; // 'interno' | 'cliente'

    // Fetch contracts with providers and personal
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

    // Calculate totals
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

      // Balance de horas
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

    const html = tipo === 'interno'
      ? generarHTMLInterno(contratosData, totalMensual, totalCostes, totalMargen, fecha)
      : generarHTMLCliente(contratosData, fecha);

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function generarHTMLInterno(contratos: any[], totalMensual: number, totalCostes: number, totalMargen: number, fecha: string): string {
  const margenPctTotal = totalMensual > 0 ? ((totalMargen / totalMensual) * 100).toFixed(1) : '0';

  const filasContratos = contratos.map(c => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;font-weight:500;">${c.titulo}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${c.tipo || '—'}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(c.mensual)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#dc2626;">${formatCurrency(c.costeTotal)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;color:#16a34a;font-weight:600;">${formatCurrency(c.margen)} <span style="font-size:9px;color:#666;">(${c.margenPct}%)</span></td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${c.balanceHoras ? `<span style="color:${c.balanceHoras.balance >= 0 ? '#0d9488' : '#dc2626'}">${c.balanceHoras.balance >= 0 ? '+' : ''}${c.balanceHoras.balance.toFixed(1)}h</span>` : '—'}</td>
    </tr>
  `).join('');

  const detalleContratos = contratos.map(c => {
    const proveedoresHtml = c.contratosProveedor.length > 0 ? `
      <div style="margin-top:8px;">
        <strong style="font-size:10px;color:#666;">Proveedores:</strong>
        <table style="width:100%;margin-top:4px;font-size:10px;">
          ${c.contratosProveedor.map((p: any) => `
            <tr><td style="padding:2px 4px;">${p.proveedor || '—'}</td><td style="padding:2px 4px;text-align:right;color:#dc2626;">${formatCurrency(p.importeMensual)}/mes</td></tr>
          `).join('')}
        </table>
      </div>
    ` : '';

    const personalHtml = c.personalDelContrato.length > 0 ? `
      <div style="margin-top:8px;">
        <strong style="font-size:10px;color:#666;">Personal asignado:</strong>
        <table style="width:100%;margin-top:4px;font-size:10px;">
          <tr style="background:#f3f4f6;"><th style="padding:3px 4px;text-align:left;">Nombre</th><th style="padding:3px 4px;text-align:center;">Nivel</th><th style="padding:3px 4px;text-align:center;">Dedicación</th><th style="padding:3px 4px;text-align:right;">Coste imputado</th></tr>
          ${c.personalDelContrato.map((p: any) => `
            <tr><td style="padding:3px 4px;">${p.empleado?.nombreCompleto || '—'}</td><td style="padding:3px 4px;text-align:center;">N${p.nivelTecnico || 1}</td><td style="padding:3px 4px;text-align:center;">${p.porcentajeDedicacion}%</td><td style="padding:3px 4px;text-align:right;color:#dc2626;">${formatCurrency(p.costeMensualImputado)}</td></tr>
          `).join('')}
        </table>
      </div>
    ` : '';

    const balanceHtml = c.balanceHoras ? `
      <div style="margin-top:8px;padding:6px;background:${c.balanceHoras.balance >= 0 ? '#f0fdfa' : '#fef2f2'};border-radius:4px;">
        <strong style="font-size:10px;">Balance de horas:</strong> ${c.balanceHoras.contratadas}h contratadas - ${c.balanceHoras.consumidas.toFixed(1)}h consumidas = <span style="color:${c.balanceHoras.balance >= 0 ? '#0d9488' : '#dc2626'};font-weight:700;">${c.balanceHoras.balance >= 0 ? '+' : ''}${c.balanceHoras.balance.toFixed(1)}h</span>
      </div>
    ` : '';

    return `
      <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="font-size:13px;margin:0;">${c.titulo}</h3>
          <span style="font-size:10px;padding:2px 8px;background:#f3f4f6;border-radius:10px;">${c.tipo}</span>
        </div>
        <div style="margin-top:6px;display:flex;gap:16px;font-size:10px;color:#666;">
          <span>Inicio: ${formatDate(c.fechaInicio)}</span>
          <span>Fin: ${formatDate(c.fechaFin)}</span>
          ${c.modalidadContrato ? `<span>Modalidad: ${c.modalidadContrato === 'horas' ? 'Por Horas' : 'Por Recurso'}</span>` : ''}
          ${c.horasContratadas ? `<span>Horas: ${c.horasContratadas}h/mes (N${c.nivelContratado || 1})</span>` : ''}
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
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; font-size:11px; line-height:1.5; color:#333; padding:40px; }
    @page { size:A4; margin:20mm; }
    @media print { body { padding:0; } }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #E87A2E; padding-bottom:16px; margin-bottom:24px; }
    .logo { font-size:18px; font-weight:700; color:#E87A2E; }
    .subtitle { font-size:10px; color:#666; }
    h2 { font-size:14px; color:#1f2937; margin:20px 0 12px; }
    .kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:24px; }
    .kpi { padding:12px; background:#f9fafb; border-radius:6px; border:1px solid #e5e7eb; }
    .kpi-label { font-size:9px; text-transform:uppercase; color:#666; letter-spacing:0.5px; }
    .kpi-value { font-size:18px; font-weight:700; margin-top:4px; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    th { background:#f3f4f6; padding:8px; text-align:left; font-weight:600; font-size:9px; text-transform:uppercase; color:#666; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">INTERNET OPERADORES</div>
      <div class="subtitle">Informe Interno de Contratos — Draxton</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#666;">
      <div>Fecha: ${fecha}</div>
      <div style="color:#dc2626;font-weight:600;margin-top:4px;">⚠ CONFIDENCIAL — USO INTERNO</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi">
      <div class="kpi-label">Facturación mensual</div>
      <div class="kpi-value" style="color:#1f2937;">${formatCurrency(totalMensual)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Costes mensuales</div>
      <div class="kpi-value" style="color:#dc2626;">${formatCurrency(totalCostes)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Margen mensual</div>
      <div class="kpi-value" style="color:#16a34a;">${formatCurrency(totalMargen)}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">% Margen</div>
      <div class="kpi-value" style="color:#16a34a;">${margenPctTotal}%</div>
    </div>
  </div>

  <h2>Resumen de Contratos</h2>
  <table>
    <thead>
      <tr>
        <th>Contrato</th>
        <th style="text-align:center;">Tipo</th>
        <th style="text-align:right;">€/mes</th>
        <th style="text-align:right;">Coste/mes</th>
        <th style="text-align:right;">Margen</th>
        <th style="text-align:center;">Balance h.</th>
      </tr>
    </thead>
    <tbody>
      ${filasContratos}
      <tr style="background:#f3f4f6;font-weight:700;">
        <td style="padding:8px;">TOTAL</td>
        <td></td>
        <td style="padding:8px;text-align:right;">${formatCurrency(totalMensual)}</td>
        <td style="padding:8px;text-align:right;color:#dc2626;">${formatCurrency(totalCostes)}</td>
        <td style="padding:8px;text-align:right;color:#16a34a;">${formatCurrency(totalMargen)} (${margenPctTotal}%)</td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <h2>Detalle por Contrato</h2>
  ${detalleContratos}

  <div style="margin-top:30px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#999;text-align:center;">
    Internet Operadores S.L. — Informe generado automáticamente el ${fecha} — CONFIDENCIAL
  </div>
</body>
</html>`;
}

function generarHTMLCliente(contratos: any[], fecha: string): string {
  const detalleContratos = contratos.map(c => {
    const serviciosHtml = c.contratosProveedor.length > 0 ? `
      <div style="margin-top:8px;">
        <strong style="font-size:10px;color:#666;">Servicios incluidos:</strong>
        <table style="width:100%;margin-top:4px;font-size:10px;">
          <tr style="background:#f3f4f6;"><th style="padding:3px 4px;text-align:left;">Servicio/Proveedor</th><th style="padding:3px 4px;text-align:left;">Descripción</th></tr>
          ${c.contratosProveedor.map((p: any) => `
            <tr><td style="padding:3px 4px;">${p.proveedor || '—'}</td><td style="padding:3px 4px;">${p.titulo || p.descripcion || '—'}</td></tr>
          `).join('')}
        </table>
      </div>
    ` : '';

    const personalHtml = c.personalDelContrato.length > 0 ? `
      <div style="margin-top:8px;">
        <strong style="font-size:10px;color:#666;">Recursos asignados:</strong>
        <table style="width:100%;margin-top:4px;font-size:10px;">
          <tr style="background:#f3f4f6;"><th style="padding:3px 4px;text-align:left;">Recurso</th><th style="padding:3px 4px;text-align:center;">Nivel</th><th style="padding:3px 4px;text-align:center;">Dedicación</th><th style="padding:3px 4px;text-align:left;">Rol</th></tr>
          ${c.personalDelContrato.map((p: any) => `
            <tr><td style="padding:3px 4px;">${p.empleado?.nombreCompleto || '—'}</td><td style="padding:3px 4px;text-align:center;">N${p.nivelTecnico || 1}</td><td style="padding:3px 4px;text-align:center;">${p.porcentajeDedicacion}%</td><td style="padding:3px 4px;">${p.rol || '—'}</td></tr>
          `).join('')}
        </table>
      </div>
    ` : '';

    const horasHtml = c.balanceHoras ? `
      <div style="margin-top:8px;padding:6px;background:#f0fdfa;border-radius:4px;">
        <strong style="font-size:10px;">Horas contratadas:</strong> ${c.balanceHoras.contratadas}h/mes — Nivel técnico: N${c.nivelContratado || 1}
        ${c.precioHoraContrato ? ` — Precio/hora: ${formatCurrency(c.precioHoraContrato)}` : ''}
      </div>
    ` : '';

    return `
      <div style="margin-bottom:16px;padding:12px;border:1px solid #e5e7eb;border-radius:6px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h3 style="font-size:13px;margin:0;">${c.titulo}</h3>
          <span style="font-size:10px;padding:2px 8px;background:#FFF3E8;color:#E87A2E;border-radius:10px;font-weight:500;">${c.tipo}</span>
        </div>
        <div style="margin-top:6px;display:flex;gap:16px;font-size:10px;color:#666;">
          <span>Inicio: ${formatDate(c.fechaInicio)}</span>
          <span>Fin: ${formatDate(c.fechaFin)}</span>
          ${c.modalidadContrato ? `<span>Modalidad: ${c.modalidadContrato === 'horas' ? 'Por Horas' : 'Por Recurso'}</span>` : ''}
        </div>
        <div style="margin-top:8px;font-size:11px;">
          <strong>Importe mensual:</strong> ${formatCurrency(c.mensual)}
        </div>
        ${serviciosHtml}
        ${personalHtml}
        ${horasHtml}
      </div>
    `;
  }).join('');

  const totalMensual = contratos.reduce((s, c) => s + c.mensual, 0);

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Informe de Servicios - Draxton</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:'Inter',sans-serif; font-size:11px; line-height:1.5; color:#333; padding:40px; }
    @page { size:A4; margin:20mm; }
    @media print { body { padding:0; } }
    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #E87A2E; padding-bottom:16px; margin-bottom:24px; }
    .logo { font-size:18px; font-weight:700; color:#E87A2E; }
    .subtitle { font-size:10px; color:#666; }
    h2 { font-size:14px; color:#1f2937; margin:20px 0 12px; }
    table { width:100%; border-collapse:collapse; font-size:10px; }
    th { background:#f3f4f6; padding:8px; text-align:left; font-weight:600; font-size:9px; text-transform:uppercase; color:#666; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">INTERNET OPERADORES</div>
      <div class="subtitle">Informe de Servicios Contratados</div>
    </div>
    <div style="text-align:right;font-size:10px;color:#666;">
      <div>Cliente: <strong>Draxton</strong></div>
      <div>Fecha: ${fecha}</div>
    </div>
  </div>

  <div style="padding:12px;background:#f9fafb;border-radius:6px;border:1px solid #e5e7eb;margin-bottom:24px;">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:9px;text-transform:uppercase;color:#666;">Contratos activos</div>
        <div style="font-size:20px;font-weight:700;color:#1f2937;">${contratos.length}</div>
      </div>
      <div>
        <div style="font-size:9px;text-transform:uppercase;color:#666;">Facturación mensual total</div>
        <div style="font-size:20px;font-weight:700;color:#E87A2E;">${formatCurrency(totalMensual)}</div>
      </div>
      <div>
        <div style="font-size:9px;text-transform:uppercase;color:#666;">Recursos asignados</div>
        <div style="font-size:20px;font-weight:700;color:#1f2937;">${contratos.reduce((s, c) => s + c.personalDelContrato.length, 0)}</div>
      </div>
    </div>
  </div>

  <h2>Resumen de Servicios</h2>
  <table>
    <thead>
      <tr>
        <th>Contrato</th>
        <th style="text-align:center;">Tipo</th>
        <th style="text-align:center;">Modalidad</th>
        <th style="text-align:center;">Recursos</th>
        <th style="text-align:center;">Horas/mes</th>
        <th style="text-align:right;">Importe/mes</th>
      </tr>
    </thead>
    <tbody>
      ${contratos.map(c => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #eee;font-weight:500;">${c.titulo}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${c.tipo || '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${c.modalidadContrato === 'horas' ? 'Por Horas' : c.modalidadContrato === 'recurso' ? 'Por Recurso' : '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${c.personalDelContrato.length || '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${c.horasContratadas ? c.horasContratadas + 'h' : '—'}</td>
          <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;font-weight:600;">${formatCurrency(c.mensual)}</td>
        </tr>
      `).join('')}
      <tr style="background:#f3f4f6;font-weight:700;">
        <td style="padding:8px;" colspan="5">TOTAL</td>
        <td style="padding:8px;text-align:right;">${formatCurrency(totalMensual)}</td>
      </tr>
    </tbody>
  </table>

  <h2>Detalle de Servicios</h2>
  ${detalleContratos}

  <div style="margin-top:30px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:9px;color:#999;text-align:center;">
    Internet Operadores S.L. — Informe generado el ${fecha}
  </div>
</body>
</html>`;
}
