import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function formatCurrency(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00 €';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
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
    const logoUrl = `${baseUrl}/images/logo-internetoperadores.png`;

    const proyectos = await prisma.proyectoContratoDraxton.findMany({
      where: { activo: true, categoria: 'singular' },
      orderBy: { createdAt: 'desc' },
      include: {
        responsable: { select: { nombreCompleto: true } },
        proveedores: true,
        personalAsignado: {
          include: { empleado: { select: { nombreCompleto: true, costeHoraActual: true } } },
        },
        facturasVinculadas: {
          select: { numFactura: true, total: true, importeCobrado: true, estado: true, fecha: true, cliente: true },
        },
      },
    });

    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const proyectosData = proyectos.map(p => {
      const ventaConIva = Number(p.importeVenta) || 0;
      const ventaBase = ventaConIva / 1.21;
      const costeProv = Number(p.costeProveedores) || 0;
      const costePersonal = p.personalAsignado.reduce((s, pa) => s + (Number(pa.costeTotal) || 0), 0);
      const margen = ventaBase - costeProv - costePersonal;
      const facturado = p.facturasVinculadas.reduce((s, f) => s + (Number(f.total) || 0), 0);
      const cobrado = p.facturasVinculadas.reduce((s, f) => s + (Number(f.importeCobrado) || 0), 0);
      return {
        ...p,
        ventaConIva, ventaBase, costeProv, costePersonal, margen,
        facturado, cobrado, pendienteCobro: facturado - cobrado,
        margenPct: ventaBase > 0 ? (margen / ventaBase * 100) : 0,
      };
    });

    const totales = {
      ventaBase: proyectosData.reduce((s, p) => s + p.ventaBase, 0),
      ventaConIva: proyectosData.reduce((s, p) => s + p.ventaConIva, 0),
      costeProv: proyectosData.reduce((s, p) => s + p.costeProv, 0),
      costePersonal: proyectosData.reduce((s, p) => s + p.costePersonal, 0),
      margen: proyectosData.reduce((s, p) => s + p.margen, 0),
      facturado: proyectosData.reduce((s, p) => s + p.facturado, 0),
      cobrado: proyectosData.reduce((s, p) => s + p.cobrado, 0),
    };

    const html = tipo === 'interno'
      ? generarHTMLInterno(proyectosData, totales, fecha, logoUrl)
      : generarHTMLCliente(proyectosData, totales, fecha, logoUrl);

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

const estilosBase = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1f2937; line-height: 1.4; padding: 20px; }
  .page-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; border-bottom: 3px solid #E87A2E; margin-bottom: 20px; }
  .page-header img { height: 40px; }
  .page-header-right { text-align: right; font-size: 10px; color: #6b7280; }
  h1 { font-size: 18px; color: #1f2937; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #E87A2E; margin: 16px 0 8px; border-bottom: 1px solid #fed7aa; padding-bottom: 4px; }
  h3 { font-size: 12px; color: #374151; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
  th { background: #f9fafb; padding: 6px 8px; text-align: left; font-weight: 600; border-bottom: 2px solid #e5e7eb; }
  td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 700; }
  .text-green { color: #15803d; }
  .text-red { color: #dc2626; }
  .text-orange { color: #E87A2E; }
  .text-blue { color: #1d4ed8; }
  .text-purple { color: #7c3aed; }
  .text-gray { color: #6b7280; }
  .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
  .kpi-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; text-align: center; }
  .kpi-label { font-size: 9px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
  .kpi-value { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .kpi-sub { font-size: 9px; color: #9ca3af; margin-top: 2px; }
  .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
  .badge-green { background: #dcfce7; color: #15803d; }
  .badge-yellow { background: #fef9c3; color: #854d0e; }
  .badge-blue { background: #dbeafe; color: #1d4ed8; }
  .badge-red { background: #fee2e2; color: #dc2626; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; display: flex; justify-content: space-between; font-size: 9px; color: #9ca3af; }
  .print-btn { position: fixed; top: 10px; right: 10px; background: #E87A2E; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; }
  @media print { .print-btn { display: none; } }
`;

function getEstadoBadge(estado: string): string {
  const map: Record<string, string> = {
    'Planificado': 'badge-blue', 'En Curso': 'badge-yellow',
    'Completado': 'badge-green', 'Cancelado': 'badge-red',
  };
  return `<span class="badge ${map[estado] || 'badge-blue'}">${estado}</span>`;
}

function generarHTMLInterno(proyectos: any[], totales: any, fecha: string, logoUrl: string): string {
  const margenPct = totales.ventaBase > 0 ? (totales.margen / totales.ventaBase * 100).toFixed(1) : '0';

  let proyectosRows = '';
  for (const p of proyectos) {
    proyectosRows += `<tr>
      <td class="font-bold">${p.titulo}</td>
      <td>${p.ubicacion || '—'}</td>
      <td class="text-center">${getEstadoBadge(p.estado)}</td>
      <td class="text-right">${formatCurrency(p.ventaBase)}</td>
      <td class="text-right text-red">${formatCurrency(p.costeProv)}</td>
      <td class="text-right text-purple">${formatCurrency(p.costePersonal)}</td>
      <td class="text-right ${p.margen >= 0 ? 'text-green' : 'text-red'} font-bold">${formatCurrency(p.margen)}<br/><span class="text-gray" style="font-size:9px">${p.margenPct.toFixed(1)}%</span></td>
      <td class="text-right text-blue">${formatCurrency(p.facturado)}</td>
      <td class="text-right text-green">${formatCurrency(p.cobrado)}</td>
    </tr>`;
  }

  let detalleProyectos = '';
  for (const p of proyectos) {
    detalleProyectos += `<h3>${p.titulo} — ${p.ubicacion || ''} ${getEstadoBadge(p.estado)}</h3>`;
    
    // Proveedores
    if (p.proveedores?.length > 0) {
      detalleProyectos += `<table><thead><tr><th>Proveedor</th><th>Concepto</th><th class="text-right">Importe</th><th class="text-center">Estado</th></tr></thead><tbody>`;
      for (const prov of p.proveedores) {
        detalleProyectos += `<tr><td>${prov.proveedor}</td><td>${prov.concepto || '—'}</td><td class="text-right">${formatCurrency(Number(prov.importe))}</td><td class="text-center">${prov.estado}</td></tr>`;
      }
      detalleProyectos += `</tbody></table>`;
    }

    // Personal
    if (p.personalAsignado?.length > 0) {
      detalleProyectos += `<table><thead><tr><th>Persona</th><th>Rol</th><th class="text-center">Imputación</th><th class="text-right">Coste/h</th><th class="text-right">Coste Total</th></tr></thead><tbody>`;
      for (const pa of p.personalAsignado) {
        const imputacion = pa.tipoImputacion === 'horas' ? `${pa.horasImputadas || 0}h` : `${pa.porcentajeDedicacion || 0}%`;
        detalleProyectos += `<tr><td>${pa.empleado.nombreCompleto}</td><td>${pa.rol || '—'}</td><td class="text-center">${imputacion}</td><td class="text-right">${Number(pa.costeHora)?.toFixed(2) || '—'} €</td><td class="text-right font-bold">${formatCurrency(Number(pa.costeTotal))}</td></tr>`;
      }
      detalleProyectos += `</tbody></table>`;
    }

    // Facturas
    if (p.facturasVinculadas?.length > 0) {
      detalleProyectos += `<table><thead><tr><th>Nº Factura</th><th>Cliente</th><th>Fecha</th><th class="text-right">Total</th><th class="text-right">Cobrado</th><th class="text-center">Estado</th></tr></thead><tbody>`;
      for (const f of p.facturasVinculadas) {
        detalleProyectos += `<tr><td>${f.numFactura}</td><td>${f.cliente || '—'}</td><td>${formatDate(f.fecha)}</td><td class="text-right">${formatCurrency(Number(f.total))}</td><td class="text-right">${formatCurrency(Number(f.importeCobrado))}</td><td class="text-center"><span class="badge ${f.estado === 'COBRADA' ? 'badge-green' : 'badge-yellow'}">${f.estado}</span></td></tr>`;
      }
      detalleProyectos += `</tbody></table>`;
    }
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Interno — Proyectos Singulares Draxton</title><style>${estilosBase}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div>Informe Interno — Proyectos Singulares</div>
        <div>Generado: ${fecha}</div>
        <div style="color:#dc2626;font-weight:700;margin-top:4px;">⚠ CONFIDENCIAL</div>
      </div>
    </div>

    <h1>Proyectos Singulares — Draxton</h1>
    <p class="text-gray" style="margin-bottom:12px">Trabajos puntuales adjudicados por el grupo Draxton</p>

    <div class="kpi-grid">
      <div class="kpi-box"><div class="kpi-label">Venta (Base Imp.)</div><div class="kpi-value">${formatCurrency(totales.ventaBase)}</div><div class="kpi-sub">Con IVA: ${formatCurrency(totales.ventaConIva)}</div></div>
      <div class="kpi-box"><div class="kpi-label">Coste Proveedores</div><div class="kpi-value text-red">${formatCurrency(totales.costeProv)}</div></div>
      <div class="kpi-box"><div class="kpi-label">Coste Personal</div><div class="kpi-value text-purple">${formatCurrency(totales.costePersonal)}</div></div>
      <div class="kpi-box"><div class="kpi-label">Margen Neto</div><div class="kpi-value ${totales.margen >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(totales.margen)}</div><div class="kpi-sub">${margenPct}% s/venta</div></div>
      <div class="kpi-box"><div class="kpi-label">Facturado / Cobrado</div><div class="kpi-value text-blue">${formatCurrency(totales.facturado)}</div><div class="kpi-sub">Cobrado: ${formatCurrency(totales.cobrado)}</div></div>
    </div>

    <h2>Resumen de Proyectos</h2>
    <table>
      <thead><tr><th>Proyecto</th><th>Ubicación</th><th class="text-center">Estado</th><th class="text-right">Venta Base</th><th class="text-right">Coste Prov.</th><th class="text-right">Coste Pers.</th><th class="text-right">Margen</th><th class="text-right">Facturado</th><th class="text-right">Cobrado</th></tr></thead>
      <tbody>${proyectosRows}
        <tr style="border-top:2px solid #e5e7eb;font-weight:700">
          <td colspan="3">TOTAL</td>
          <td class="text-right">${formatCurrency(totales.ventaBase)}</td>
          <td class="text-right text-red">${formatCurrency(totales.costeProv)}</td>
          <td class="text-right text-purple">${formatCurrency(totales.costePersonal)}</td>
          <td class="text-right ${totales.margen >= 0 ? 'text-green' : 'text-red'}">${formatCurrency(totales.margen)}</td>
          <td class="text-right text-blue">${formatCurrency(totales.facturado)}</td>
          <td class="text-right text-green">${formatCurrency(totales.cobrado)}</td>
        </tr>
      </tbody>
    </table>

    <h2>Detalle por Proyecto</h2>
    ${detalleProyectos}

    <div class="footer">
      <span>Internet Operadores S.L. — Documento confidencial</span>
      <span>${fecha}</span>
    </div>
  </body></html>`;
}

function generarHTMLCliente(proyectos: any[], totales: any, fecha: string, logoUrl: string): string {
  let proyectosRows = '';
  for (const p of proyectos) {
    proyectosRows += `<tr>
      <td class="font-bold">${p.titulo}</td>
      <td>${p.ubicacion || '—'}</td>
      <td class="text-center">${getEstadoBadge(p.estado)}</td>
      <td class="text-right">${formatCurrency(p.ventaConIva)}</td>
      <td>${p.responsable?.nombreCompleto || '—'}</td>
      <td class="text-center">${formatDate(p.fechaInicio)}</td>
      <td class="text-center">${formatDate(p.fechaFinPrevista)}</td>
      <td class="text-right text-blue">${formatCurrency(p.facturado)}</td>
      <td class="text-right">${formatCurrency(p.ventaConIva - p.facturado)}</td>
    </tr>`;
  }

  let detalleProyectos = '';
  for (const p of proyectos) {
    detalleProyectos += `<h3>${p.titulo} — ${p.ubicacion || ''}</h3>`;
    if (p.descripcion) detalleProyectos += `<p style="margin-bottom:8px;color:#4b5563">${p.descripcion}</p>`;
    
    detalleProyectos += `<table><thead><tr><th>Concepto</th><th class="text-right">Importe</th><th class="text-center">Estado</th></tr></thead><tbody>`;
    detalleProyectos += `<tr><td>Importe del proyecto (con IVA)</td><td class="text-right font-bold">${formatCurrency(p.ventaConIva)}</td><td class="text-center">${getEstadoBadge(p.estado)}</td></tr>`;
    detalleProyectos += `<tr><td>Facturado a fecha</td><td class="text-right text-blue">${formatCurrency(p.facturado)}</td><td class="text-center">${p.facturasVinculadas?.length || 0} facturas</td></tr>`;
    detalleProyectos += `<tr><td>Pendiente de facturar</td><td class="text-right text-orange">${formatCurrency(p.ventaConIva - p.facturado)}</td><td></td></tr>`;
    detalleProyectos += `</tbody></table>`;

    if (p.facturasVinculadas?.length > 0) {
      detalleProyectos += `<p style="font-size:10px;font-weight:600;margin:6px 0 4px">Facturas emitidas:</p>`;
      detalleProyectos += `<table><thead><tr><th>Nº Factura</th><th>Fecha</th><th class="text-right">Importe</th><th class="text-center">Estado</th></tr></thead><tbody>`;
      for (const f of p.facturasVinculadas) {
        detalleProyectos += `<tr><td>${f.numFactura}</td><td>${formatDate(f.fecha)}</td><td class="text-right">${formatCurrency(Number(f.total))}</td><td class="text-center"><span class="badge ${f.estado === 'COBRADA' ? 'badge-green' : 'badge-yellow'}">${f.estado}</span></td></tr>`;
      }
      detalleProyectos += `</tbody></table>`;
    }
  }

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Informe Proyectos — Draxton</title><style>${estilosBase}</style></head><body>
    <button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
    <div class="page-header">
      <img src="${logoUrl}" alt="Internet Operadores" />
      <div class="page-header-right">
        <div>Informe de Proyectos Singulares</div>
        <div>Generado: ${fecha}</div>
      </div>
    </div>

    <h1>Proyectos Singulares — Grupo Draxton</h1>
    <p class="text-gray" style="margin-bottom:12px">Estado de los trabajos puntuales adjudicados</p>

    <div class="kpi-grid" style="grid-template-columns: repeat(4, 1fr)">
      <div class="kpi-box"><div class="kpi-label">Proyectos Activos</div><div class="kpi-value">${proyectos.length}</div></div>
      <div class="kpi-box"><div class="kpi-label">Importe Total</div><div class="kpi-value">${formatCurrency(totales.ventaConIva)}</div></div>
      <div class="kpi-box"><div class="kpi-label">Facturado</div><div class="kpi-value text-blue">${formatCurrency(totales.facturado)}</div></div>
      <div class="kpi-box"><div class="kpi-label">Pendiente Facturar</div><div class="kpi-value text-orange">${formatCurrency(totales.ventaConIva - totales.facturado)}</div></div>
    </div>

    <h2>Resumen de Proyectos</h2>
    <table>
      <thead><tr><th>Proyecto</th><th>Ubicación</th><th class="text-center">Estado</th><th class="text-right">Importe</th><th>Responsable</th><th class="text-center">Inicio</th><th class="text-center">Fin Prev.</th><th class="text-right">Facturado</th><th class="text-right">Pendiente</th></tr></thead>
      <tbody>${proyectosRows}</tbody>
    </table>

    <h2>Detalle por Proyecto</h2>
    ${detalleProyectos}

    <div class="footer">
      <span>Internet Operadores S.L.</span>
      <span>${fecha}</span>
    </div>
  </body></html>`;
}
