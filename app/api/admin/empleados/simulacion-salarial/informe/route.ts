import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildSalarySimulationContext } from '@/lib/simulacion-salarial-server';

export const dynamic = 'force-dynamic';

const MOTIVOS: Record<string, string> = {
  incorporacion: 'Incorporación',
  subida_anual: 'Subida anual',
  promocion: 'Promoción',
  revision: 'Revisión',
  otro: 'Otro',
};

function escapeHtml(value: string | null | undefined) {
  return (value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatEur(value: number) {
  return value.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
}

function formatPct(value: number) {
  return `${value > 0 ? '+' : ''}${value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid' });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    if (session.user.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'El informe de simulación es exclusivo para SUPER_ADMIN' }, { status: 403 });
    }

    const body = await req.json();
    const empleadoId = typeof body.empleadoId === 'string' ? body.empleadoId : '';
    const fechaEfectiva = typeof body.fechaEfectiva === 'string' ? body.fechaEfectiva : '';
    const brutoAnualPropuesto = Number(body.brutoAnualPropuesto);
    const motivo = typeof body.motivo === 'string' ? body.motivo : 'subida_anual';
    const notas = typeof body.notas === 'string' ? body.notas.trim() : '';

    if (!empleadoId || !fechaEfectiva || !Number.isFinite(brutoAnualPropuesto) || brutoAnualPropuesto <= 0) {
      return NextResponse.json({ error: 'Empleado, fecha efectiva y bruto anual propuesto son obligatorios' }, { status: 400 });
    }

    const context = await buildSalarySimulationContext({ empleadoId, fechaEfectiva, brutoAnualPropuesto });
    const { empleado, simulacion, referenciaActual } = context;
    const logoBuffer = await readFile(path.join(process.cwd(), 'public/images/logo-internetoperadores.png'));
    const logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;
    const positive = simulacion.incremento.brutoAnual >= 0;
    const referenceLabel = referenciaActual.origen === 'condicion_salarial' ? 'Condición salarial vigente' : 'Proyección de la última nómina disponible';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Simulación salarial — ${escapeHtml(empleado.nombreCompleto)}</title>
  <style>
    @page { size: A4 portrait; margin: 13mm 14mm 13mm 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #182033; background: #eef1f5; font-family: Arial, Helvetica, sans-serif; font-size: 11px; line-height: 1.45; }
    .actions { position: sticky; top: 0; z-index: 10; padding: 10px; text-align: center; background: #182033; }
    .actions button { border: 0; border-radius: 7px; padding: 10px 18px; color: white; background: #ed6b21; font-size: 13px; font-weight: 700; cursor: pointer; }
    .page { width: 210mm; min-height: 297mm; margin: 16px auto; padding: 13mm 14mm; background: white; box-shadow: 0 8px 30px rgba(24,32,51,.12); }
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; border-bottom: 3px solid #ed6b21; padding-bottom: 11px; }
    .logo { width: 178px; max-height: 48px; object-fit: contain; object-position: left center; }
    .confidential { color: #b54222; font-size: 10px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; text-align: right; }
    h1 { margin: 22px 0 5px; color: #182033; font-size: 24px; line-height: 1.15; }
    .subtitle { margin: 0; color: #647084; font-size: 12px; }
    .notice { margin-top: 16px; border: 1px solid #f2b18c; background: #fff6f0; color: #8d3d16; padding: 10px 12px; font-weight: 700; }
    .section { margin-top: 18px; page-break-inside: avoid; }
    .section h2 { margin: 0 0 8px; border-bottom: 1px solid #dce1e8; padding-bottom: 5px; color: #26344f; font-size: 14px; }
    .meta { display: grid; grid-template-columns: 1.6fr 1fr 1fr; gap: 10px; }
    .meta div { border-bottom: 1px solid #dce1e8; padding: 6px 0; }
    .label { display: block; color: #798397; font-size: 9px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
    .value { display: block; margin-top: 2px; color: #182033; font-size: 11px; font-weight: 700; }
    .hero { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 14px; }
    .hero-card { border: 1px solid #dce1e8; padding: 12px; }
    .hero-card.proposed { border-color: #929bdc; background: #f5f5ff; }
    .hero-card.increase { border-color: ${positive ? '#8ac7a5' : '#d99a9a'}; background: ${positive ? '#eefaf3' : '#fff2f2'}; }
    .hero-card strong { display: block; margin-top: 5px; font-size: 18px; color: #182033; }
    .percentage { display: inline-block; margin-top: 5px; border-radius: 999px; padding: 3px 8px; background: ${positive ? '#d5f1df' : '#f7dcdc'}; color: ${positive ? '#17643a' : '#8c2626'}; font-size: 12px; font-weight: 800; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 7px 8px; color: #5f6a7e; background: #f2f4f7; font-size: 9px; text-align: right; text-transform: uppercase; }
    th:first-child, td:first-child { text-align: left; }
    td { border-bottom: 1px solid #e2e6ec; padding: 8px; text-align: right; }
    td.emphasis { color: #d45918; font-weight: 800; }
    .method { border-left: 3px solid #6d75c9; background: #f5f6ff; padding: 10px 12px; color: #4a5367; }
    .notes { min-height: 44px; border: 1px solid #dce1e8; padding: 9px; white-space: pre-wrap; }
    .review { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
    .line { margin-top: 25px; border-top: 1px solid #737d8e; padding-top: 4px; color: #737d8e; }
    .footer { margin-top: 24px; border-top: 1px solid #dce1e8; padding-top: 8px; color: #7b8496; font-size: 9px; display: flex; justify-content: space-between; gap: 18px; }
    @media print {
      body { background: white; font-size: 9px; line-height: 1.28; }
      .actions { display: none; }
      .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
      .header { padding-bottom: 6px; }
      .logo { width: 150px; max-height: 38px; }
      h1 { margin: 12px 0 2px; font-size: 20px; }
      .subtitle { font-size: 10px; }
      .notice { margin-top: 9px; padding: 6px 8px; }
      .section { margin-top: 10px; }
      .section h2 { margin-bottom: 4px; padding-bottom: 3px; font-size: 12px; }
      .meta { gap: 6px; }
      .meta div { padding: 3px 0; }
      .value { margin-top: 1px; font-size: 9px; }
      .hero { gap: 6px; margin-top: 8px; }
      .hero-card { padding: 8px; }
      .hero-card strong { margin-top: 3px; font-size: 15px; }
      .percentage { margin-top: 3px; padding: 2px 6px; font-size: 10px; }
      th, td { padding: 4px 6px; }
      .method { padding: 6px 8px; }
      .notes { min-height: 28px; padding: 6px; }
      .review { gap: 18px; margin-top: 10px; }
      .line { margin-top: 14px; padding-top: 3px; }
      .footer { margin-top: 12px; padding-top: 5px; font-size: 8px; }
    }
    @media screen and (max-width: 850px) {
      .page { width: calc(100% - 16px); min-height: auto; margin: 8px; padding: 20px; }
      .meta, .hero { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="actions"><button type="button" onclick="window.print()">Imprimir / Guardar como PDF</button></div>
  <main class="page">
    <header class="header">
      <img class="logo" src="${logoDataUrl}" alt="Internet Operadores" />
      <div><div class="confidential">Confidencial</div><div style="margin-top:5px;color:#647084;text-align:right">Documento interno</div></div>
    </header>

    <h1>Simulación de revisión salarial</h1>
    <p class="subtitle">Análisis previo para revisión presencial · ${formatDate(new Date())}</p>
    <div class="notice">SIMULACIÓN NO VINCULANTE. Este documento no registra ni modifica ninguna condición salarial.</div>

    <section class="section">
      <h2>Datos de la propuesta</h2>
      <div class="meta">
        <div><span class="label">Empleado</span><span class="value">${escapeHtml(empleado.nombreCompleto)}</span></div>
        <div><span class="label">Categoría</span><span class="value">${escapeHtml(empleado.categoria || 'No informada')}</span></div>
        <div><span class="label">Departamento</span><span class="value">${escapeHtml(empleado.departamento || 'No informado')}</span></div>
        <div><span class="label">Fecha efectiva propuesta</span><span class="value">${formatDate(`${fechaEfectiva}T00:00:00.000Z`)}</span></div>
        <div><span class="label">Motivo</span><span class="value">${escapeHtml(MOTIVOS[motivo] || motivo)}</span></div>
        <div><span class="label">Referencia actual</span><span class="value">${referenceLabel}</span></div>
      </div>
    </section>

    <div class="hero">
      <div class="hero-card"><span class="label">Bruto anual actual</span><strong>${formatEur(simulacion.actual.brutoAnual)}</strong><span>${formatEur(simulacion.actual.brutoMensual)}/mes</span></div>
      <div class="hero-card proposed"><span class="label">Bruto anual propuesto</span><strong>${formatEur(simulacion.propuesta.brutoAnual)}</strong><span>${formatEur(simulacion.propuesta.brutoMensual)}/mes</span></div>
      <div class="hero-card increase"><span class="label">Incremento propuesto</span><strong>${formatEur(simulacion.incremento.brutoAnual)}</strong><span class="percentage">${formatPct(simulacion.incremento.porcentaje)}</span><div style="margin-top:4px">${formatEur(simulacion.incremento.brutoMensual)}/mes</div></div>
    </div>

    <section class="section">
      <h2>Comparativa económica</h2>
      <table>
        <thead><tr><th>Concepto</th><th>Situación actual</th><th>Propuesta</th><th>Variación</th></tr></thead>
        <tbody>
          <tr><td>Bruto anual</td><td>${formatEur(simulacion.actual.brutoAnual)}</td><td>${formatEur(simulacion.propuesta.brutoAnual)}</td><td class="emphasis">${formatEur(simulacion.incremento.brutoAnual)} · ${formatPct(simulacion.incremento.porcentaje)}</td></tr>
          <tr><td>Bruto mensual equivalente (12 meses)</td><td>${formatEur(simulacion.actual.brutoMensual)}</td><td>${formatEur(simulacion.propuesta.brutoMensual)}</td><td class="emphasis">${formatEur(simulacion.incremento.brutoMensual)}</td></tr>
          <tr><td>Coste empresa anual estimado</td><td>${formatEur(simulacion.actual.costeEmpresaAnual)}</td><td>${formatEur(simulacion.propuesta.costeEmpresaAnual)}</td><td class="emphasis">${formatEur(simulacion.incremento.costeEmpresaAnual)}</td></tr>
          <tr><td>Coste empresa mensual estimado</td><td>${formatEur(simulacion.actual.costeEmpresaMensual)}</td><td>${formatEur(simulacion.propuesta.costeEmpresaMensual)}</td><td class="emphasis">${formatEur(simulacion.incremento.costeEmpresaMensual)}</td></tr>
        </tbody>
      </table>
    </section>

    <section class="section">
      <h2>Impacto estimado en el ejercicio ${simulacion.impactoEjercicio.anio}</h2>
      <table><tbody>
        <tr><td>Meses computados desde la fecha efectiva</td><td><strong>${simulacion.impactoEjercicio.mesesComputados} meses</strong></td></tr>
        <tr><td>Incremento bruto en el ejercicio</td><td><strong>${formatEur(simulacion.impactoEjercicio.incrementoBruto)}</strong></td></tr>
        <tr><td>Incremento del coste empresa en el ejercicio</td><td class="emphasis">${formatEur(simulacion.impactoEjercicio.incrementoCosteEmpresa)}</td></tr>
      </tbody></table>
    </section>

    <section class="section">
      <h2>Base del cálculo</h2>
      <div class="method">${escapeHtml(simulacion.baseCalculo.advertencia)} Se ha aplicado una tasa efectiva de Seguridad Social de empresa del <strong>${simulacion.baseCalculo.tasaSSEmpresaPct.toLocaleString('es-ES')}%</strong>, calculada con ${simulacion.baseCalculo.nominasUtilizadas} nómina${simulacion.baseCalculo.nominasUtilizadas === 1 ? '' : 's'} disponible${simulacion.baseCalculo.nominasUtilizadas === 1 ? '' : 's'}. No incluye desplazamientos ni costes extraordinarios. La nómina real puede variar por bases máximas, bonificaciones, IRPF y conceptos variables.</div>
    </section>

    <section class="section">
      <h2>Notas para la revisión</h2>
      <div class="notes">${notas ? escapeHtml(notas) : 'Sin notas previas.'}</div>
    </section>

    <section class="review">
      <div><div class="line">Revisado con / responsable</div><div class="line">Fecha</div></div>
      <div><div class="line">Conclusión de la revisión</div><div class="line">Observaciones</div></div>
    </section>

    <footer class="footer"><span>Internet Operadores S.L. · Documento interno confidencial</span><span>Generado por ${escapeHtml(session.user.email)} · ${formatDate(new Date())}</span></footer>
  </main>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
        'Content-Disposition': `inline; filename="simulacion-salarial-${empleado.id}.html"`,
      },
    });
  } catch (error) {
    console.error('Error generando informe de simulación salarial:', error);
    const message = error instanceof Error ? error.message : 'No se pudo generar el informe';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
