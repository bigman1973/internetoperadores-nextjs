import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { serializeScenario } from '@/lib/escenarios-salariales';

export const dynamic = 'force-dynamic';

const DOCUMENT_AUTHOR = { name: 'David Pérez', email: 'david.perez@internetoperadores.com' };

function escapeHtml(value: string | null | undefined) {
  return (value || '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
const eur = (value: number) => value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const pct = (value: number) => `${value >= 0 ? '+' : ''}${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const date = (value: string | Date) => new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (session.user.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'El informe es exclusivo para SUPER_ADMIN' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'Falta el escenario' }, { status: 400 });
    const raw = await prisma.escenarioSalarial.findUnique({
      where: { id },
      include: { lineas: { orderBy: { empleadoNombre: 'asc' } } },
    });
    if (!raw) return NextResponse.json({ error: 'Escenario no encontrado' }, { status: 404 });

    const scenario = serializeScenario(raw);
    const summary = scenario.resumen;
    const included = scenario.lineas.filter(line => line.incluido);
    const excluded = scenario.lineas.filter(line => !line.incluido);
    const logo = await readFile(path.join(process.cwd(), 'public/images/logo-internetoperadores.png'));
    const logoUrl = `data:image/png;base64,${logo.toString('base64')}`;
    const adjustment = scenario.tipoAjusteGeneral === 'porcentaje'
      ? `${Number(scenario.valorAjusteGeneral).toLocaleString('es-ES')}% general`
      : `${eur(Number(scenario.valorAjusteGeneral))} anuales por persona`;

    const rows = included.map(line => `
      <tr>
        <td><strong>${escapeHtml(String(line.empleadoNombre))}</strong><small>${escapeHtml(String(line.categoria || 'Sin categoría'))}</small></td>
        <td>${eur(Number(line.brutoActual))}</td>
        <td>${eur(Number(line.brutoPropuesto))}</td>
        <td class="positive">${eur(Number(line.incrementoBrutoAnual))}<small>${pct(Number(line.porcentajeSubida))}</small></td>
        <td>${eur(Number(line.costeEmpresaActual))}</td>
        <td>${eur(Number(line.costeEmpresaPropuesto))}</td>
        <td class="accent">${eur(Number(line.incrementoCosteEmpresaAnual))}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(scenario.nombre)} — Escenario salarial</title>
<style>
@page{size:A4 portrait;margin:13mm 14mm}*{box-sizing:border-box}body{margin:0;background:#eef1f5;color:#182033;font:10.5px/1.4 Arial,Helvetica,sans-serif}.actions{position:sticky;top:0;z-index:10;background:#182033;padding:10px;text-align:center}.actions button{border:0;border-radius:7px;background:#ed6b21;color:#fff;padding:10px 18px;font-weight:700;cursor:pointer}.page{width:210mm;min-height:297mm;margin:14px auto;background:#fff;padding:13mm 14mm;box-shadow:0 8px 30px rgba(24,32,51,.12);page-break-after:always}.page:last-of-type{page-break-after:auto}.header{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid #ed6b21;padding-bottom:10px}.logo{width:170px;max-height:45px;object-fit:contain;object-position:left}.conf{color:#b54222;font-size:9px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;text-align:right}h1{font-size:23px;line-height:1.16;margin:20px 0 4px}h2{font-size:14px;color:#26344f;margin:18px 0 8px;border-bottom:1px solid #dce1e8;padding-bottom:5px}.subtitle{color:#687489;margin:0}.notice{margin-top:14px;border:1px solid #f1b18d;background:#fff6f0;color:#8d3d16;padding:9px 11px;font-weight:700}.meta{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px 14px;margin-top:15px}.meta div{border-bottom:1px solid #dce1e8;padding:5px 0}.label{display:block;color:#7b8597;text-transform:uppercase;font-size:8px;font-weight:700;letter-spacing:.05em}.value{display:block;margin-top:2px;font-weight:700}.kpis{display:grid;grid-template-columns:1fr 1fr 1fr;gap:9px;margin-top:14px}.kpi{border:1px solid #dce1e8;padding:11px}.kpi.highlight{border-color:#969dde;background:#f6f6ff}.kpi strong{display:block;margin-top:4px;font-size:17px}.kpi small{display:block;color:#667185;margin-top:3px}.impact{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.impact div{border-left:3px solid #6d75c9;background:#f5f6ff;padding:10px 12px}.impact strong{display:block;font-size:16px;margin-top:3px}.notes{white-space:pre-wrap;border:1px solid #dce1e8;min-height:56px;padding:9px}.method{border-left:3px solid #6d75c9;background:#f5f6ff;color:#4d586b;padding:9px 11px}.review{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-top:28px}.line{border-top:1px solid #7b8493;padding-top:4px;color:#737d8e;margin-top:25px}.footer{display:flex;justify-content:space-between;gap:15px;border-top:1px solid #dce1e8;margin-top:22px;padding-top:7px;color:#7b8496;font-size:8px}table{width:100%;border-collapse:collapse;font-size:9px}th{background:#f1f3f6;color:#5c677b;padding:7px 5px;text-align:right;text-transform:uppercase;font-size:7.5px}th:first-child,td:first-child{text-align:left}td{padding:7px 5px;border-bottom:1px solid #e0e4ea;text-align:right;vertical-align:top}td small{display:block;color:#8790a0;margin-top:2px}.positive{color:#167047;font-weight:700}.accent{color:#4f56a9;font-weight:800}.summary-row td{background:#f6f6ff;font-weight:800}.excluded{color:#737d8e}.excluded li{margin:4px 0}
@media print{body{background:#fff;font-size:9.5px}.actions{display:none}.page{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.header{padding-bottom:6px}.logo{width:150px;max-height:36px}h1{font-size:19px;margin:12px 0 2px}h2{margin:11px 0 5px;font-size:12px}.notice{margin-top:8px;padding:6px 8px}.meta{margin-top:9px;gap:5px 10px}.meta div{padding:3px 0}.kpis{margin-top:9px;gap:6px}.kpi{padding:7px}.kpi strong{font-size:14px}.impact{margin-top:8px;gap:6px}.impact div{padding:7px 9px}.impact strong{font-size:13px}th,td{padding:5px 4px}.footer{margin-top:12px}.review{margin-top:16px}.line{margin-top:17px}}
@media screen and (max-width:850px){.page{width:calc(100% - 16px);min-height:auto;margin:8px;padding:20px}.meta,.kpis,.impact{grid-template-columns:1fr}.page:nth-of-type(2){overflow-x:auto}table{min-width:760px}}
</style></head><body>
<div class="actions"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div>
<main class="page">
<header class="header"><img class="logo" src="${logoUrl}" alt="Internet Operadores"/><div><div class="conf">Confidencial</div><div style="margin-top:5px;color:#647084;text-align:right">Documento interno</div></div></header>
<h1>Escenario de revisión salarial</h1><p class="subtitle">${escapeHtml(scenario.nombre)} · ${date(new Date())}</p>
<div class="notice">SIMULACIÓN NO VINCULANTE. Este escenario guardado no registra ni modifica condiciones salariales reales.</div>
<div class="meta">
<div><span class="label">Escenario</span><span class="value">${escapeHtml(scenario.nombre)}</span></div><div><span class="label">Estado</span><span class="value">${escapeHtml(scenario.estado)}</span></div><div><span class="label">Personas incluidas</span><span class="value">${summary.empleadosIncluidos}</span></div>
<div><span class="label">Fecha efectiva</span><span class="value">${date(`${scenario.fechaEfectiva}T00:00:00.000Z`)}</span></div><div><span class="label">Criterio inicial</span><span class="value">${escapeHtml(adjustment)}</span></div><div><span class="label">Fotografía económica</span><span class="value">${date(scenario.snapshotFecha)}</span></div>
</div>
<div class="kpis">
<div class="kpi"><span class="label">Masa salarial actual</span><strong>${eur(summary.brutoActual)}</strong><small>${summary.empleadosIncluidos} empleados incluidos</small></div>
<div class="kpi highlight"><span class="label">Nueva masa salarial</span><strong>${eur(summary.brutoPropuesto)}</strong><small>${eur(summary.incrementoBrutoAnual)} · ${pct(summary.porcentajeMedioPonderado)}</small></div>
<div class="kpi"><span class="label">Nuevo coste empresa</span><strong>${eur(summary.costeEmpresaPropuesto)}</strong><small>Antes ${eur(summary.costeEmpresaActual)}</small></div>
</div>
<div class="impact"><div><span class="label">Sobrecoste empresa anual</span><strong>${eur(summary.incrementoCosteEmpresaAnual)}</strong><span>${eur(summary.incrementoCosteEmpresaMensual)} mensuales equivalentes</span></div><div><span class="label">Impacto en el ejercicio ${new Date(`${scenario.fechaEfectiva}T12:00:00`).getFullYear()}</span><strong>${eur(summary.impactoCosteEmpresaEjercicio)}</strong><span>${summary.mesesImpactoEjercicio} meses desde la fecha efectiva</span></div></div>
<h2>Notas generales</h2><div class="notes">${scenario.notas ? escapeHtml(scenario.notas) : 'Sin notas generales.'}</div>
<h2>Metodología</h2><div class="method">Cada persona conserva el bruto actual y la tasa efectiva de Seguridad Social empresarial calculada con hasta seis nóminas anteriores a la fecha efectiva. El coste no incluye desplazamientos ni conceptos extraordinarios. Las bases máximas, bonificaciones y variables futuras pueden producir diferencias con la nómina real.</div>
${excluded.length ? `<h2>Personas excluidas</h2><ul class="excluded">${excluded.map(line => `<li>${escapeHtml(String(line.empleadoNombre))}</li>`).join('')}</ul>` : ''}
<section class="review"><div><div class="line">Revisado con / responsable</div><div class="line">Fecha</div></div><div><div class="line">Conclusión</div><div class="line">Observaciones</div></div></section>
<footer class="footer"><span>Internet Operadores S.L. · Documento interno confidencial</span><span>Generado por ${DOCUMENT_AUTHOR.name} · ${DOCUMENT_AUTHOR.email}</span></footer>
</main>
<main class="page">
<header class="header"><img class="logo" src="${logoUrl}" alt="Internet Operadores"/><div><div class="conf">Confidencial</div><div style="margin-top:5px;color:#647084;text-align:right">Detalle del escenario</div></div></header>
<h1>Detalle por empleado</h1><p class="subtitle">${escapeHtml(scenario.nombre)} · efecto desde ${date(`${scenario.fechaEfectiva}T00:00:00.000Z`)}</p>
<h2>Comparativa económica individual</h2>
<table><thead><tr><th>Empleado</th><th>Bruto actual</th><th>Nuevo bruto</th><th>Subida</th><th>Coste actual</th><th>Nuevo coste</th><th>Impacto anual</th></tr></thead><tbody>${rows}<tr class="summary-row"><td>TOTAL</td><td>${eur(summary.brutoActual)}</td><td>${eur(summary.brutoPropuesto)}</td><td class="positive">${eur(summary.incrementoBrutoAnual)}<small>${pct(summary.porcentajeMedioPonderado)}</small></td><td>${eur(summary.costeEmpresaActual)}</td><td>${eur(summary.costeEmpresaPropuesto)}</td><td class="accent">${eur(summary.incrementoCosteEmpresaAnual)}</td></tr></tbody></table>
<div class="method" style="margin-top:14px">La fotografía salarial se conserva aunque posteriormente se importen nóminas o cambien condiciones. Los ajustes individuales del escenario aparecen reflejados en el nuevo bruto y en el porcentaje calculado sobre cada situación de partida.</div>
<footer class="footer"><span>Internet Operadores S.L. · Documento interno confidencial</span><span>${summary.empleadosIncluidos} empleados · ${date(new Date())}</span></footer>
</main></body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
        'Content-Disposition': `inline; filename="escenario-salarial-${scenario.id}.html"`,
      },
    });
  } catch (error) {
    console.error('Error generando informe de escenario salarial:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo generar el informe' }, { status: 400 });
  }
}
