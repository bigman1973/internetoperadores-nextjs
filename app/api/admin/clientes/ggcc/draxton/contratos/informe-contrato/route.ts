import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
export const dynamic = 'force-dynamic';

function fmtMoney(n: number | null | undefined): string {
  if (!n && n !== 0) return '0,00 €';
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function fmtDate(d: Date | string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function fmtPct(n: number): string { return n.toFixed(1) + '%'; }

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const contratoId = searchParams.get('id');
    const tipo = searchParams.get('tipo') || 'interno'; // interno o cliente
    if (!contratoId) return NextResponse.json({ error: 'Falta id del contrato' }, { status: 400 });

    const baseUrl = new URL(req.url).origin;

    // 1. Datos del contrato
    const contrato = await prisma.contratoDraxton.findUnique({
      where: { id: contratoId },
      include: {
        contratosProveedor: { where: { estado: 'Activo' } },
        clienteFacturacion: { select: { nombre: true } },
      },
    });
    if (!contrato) return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });

    // 2. Personal asignado (activo e inactivo)
    const personalRaw = await prisma.personalContratoDraxton.findMany({
      where: { contratoDraxtonId: contratoId },
      include: {
        empleado: {
          select: {
            id: true,
            nombreCompleto: true,
            categoria: true,
            costeHoraActual: true,
            nominas: {
              where: { anio: new Date().getFullYear() },
              orderBy: { mes: 'desc' },
              take: 6,
              select: { costeTotalEmpresa: true, gastosDesplazamiento: true },
            },
          },
        },
      },
    });

    const personal = personalRaw.map(a => {
      const nominas = a.empleado.nominas || [];
      let costeMensual = 0;
      if (nominas.length > 0) {
        const total = nominas.reduce((s: number, n: any) => {
          const ce = Number(n.costeTotalEmpresa) || 0;
          const gd = Number(n.gastosDesplazamiento) || 0;
          return s + (ce - gd);
        }, 0);
        costeMensual = total / nominas.length;
      }
      return {
        nombre: a.empleado.nombreCompleto,
        nivel: a.nivelTecnico || 1,
        dedicacion: a.porcentajeDedicacion || 0,
        rol: a.rol || '—',
        activo: a.activo,
        fechaInicio: a.fechaInicio,
        fechaFin: a.fechaFin,
        costeMensualImputado: costeMensual * ((a.porcentajeDedicacion || 0) / 100),
      };
    });

    const personalActivo = personal.filter(p => p.activo);
    const personalInactivo = personal.filter(p => !p.activo);

    // 3. Costes
    const costePersonal = personalActivo.reduce((s, p) => s + p.costeMensualImputado, 0);
    const costeProveedores = contrato.contratosProveedor.reduce((s: number, cp: any) => s + (Number(cp.importeMensual) || 0), 0);
    const mensual = Number(contrato.importeMensual) || 0;
    const costeTotal = costePersonal + costeProveedores;
    const margen = mensual - costeTotal;
    const margenPct = mensual > 0 ? (margen / mensual) * 100 : 0;

    // 4. Balance de horas
    let balanceHoras: any = null;
    if (contrato.modalidadContrato === 'horas' && contrato.horasContratadas) {
      const nivelContratado = contrato.nivelContratado || 1;
      const HORAS_NETAS_MES = 128.67;
      const mesActual = new Date().getMonth() + 1;
      const anioActual = new Date().getFullYear();
      let saldoAcumulado = 0;
      const detallesMensuales: any[] = [];

      for (let m = 1; m <= mesActual; m++) {
        let horasEquivMes = 0;
        let diasLab = 0;
        const diasEnMes = new Date(anioActual, m, 0).getDate();
        for (let d = 1; d <= diasEnMes; d++) {
          const day = new Date(anioActual, m - 1, d).getDay();
          if (day !== 0 && day !== 6) diasLab++;
        }
        for (const p of personalRaw) {
          const fi = p.fechaInicio ? new Date(p.fechaInicio) : null;
          const ff = p.fechaFin ? new Date(p.fechaFin) : null;
          const primerDia = new Date(anioActual, m - 1, 1);
          const ultimoDia = new Date(anioActual, m, 0);
          let inicio = primerDia;
          let fin = ultimoDia;
          if (fi && fi > primerDia) inicio = fi;
          if (ff && ff < ultimoDia) fin = ff;
          let diasActivos = 0;
          if (fin >= inicio) {
            const cur = new Date(inicio);
            while (cur <= fin) {
              if (cur.getDay() !== 0 && cur.getDay() !== 6) diasActivos++;
              cur.setDate(cur.getDate() + 1);
            }
          }
          const proporcion = diasLab > 0 ? diasActivos / diasLab : 0;
          const horasBase = HORAS_NETAS_MES * ((p.porcentajeDedicacion || 0) / 100) * proporcion;
          const multiplicador = (p.nivelTecnico || 1) / nivelContratado;
          horasEquivMes += horasBase * multiplicador;
        }
        const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        saldoAcumulado += (horasEquivMes - Number(contrato.horasContratadas));
        detallesMensuales.push({ mes: MESES[m], contratadas: Number(contrato.horasContratadas), ejecutadas: Math.round(horasEquivMes * 10) / 10, saldo: Math.round(saldoAcumulado * 10) / 10 });
      }

      // Actualizaciones imputadas
      const imputActualiz = await prisma.actualizacionImputacion.findMany({
        where: { contratoId: contrato.id },
        include: { ejecucion: { select: { fecha: true, horasDedicadas: true, tecnicoNombre: true } } }
      });
      const tarifaVig = await prisma.actualizacionTarifaConversion.findFirst({ where: { fechaHasta: null }, orderBy: { fechaDesde: 'desc' } });
      const factor = tarifaVig?.factorConversion || 1;
      const totalHorasActualiz = imputActualiz.reduce((s, i) => s + i.horas, 0);
      const totalHorasEquiv = totalHorasActualiz * factor;

      balanceHoras = {
        contratadas: Number(contrato.horasContratadas) * mesActual,
        saldo: Math.round(saldoAcumulado * 10) / 10,
        detalleMensual: detallesMensuales,
        actualizaciones: totalHorasActualiz > 0 ? { horas: totalHorasActualiz, equiv: Math.round(totalHorasEquiv * 10) / 10, factor } : null,
      };
    }

    // 5. Tickets de la planta (buscar por título del contrato)
    // Mapeo de palabras clave del título a nombres de planta en tickets_draxton
    const plantaMap: Record<string, string> = {
      'fonolleres': 'LLEIDA',
      'lleida': 'LLEIDA',
      'teruel': 'TERUEL',
      'barcelona': 'BARCELONA',
      'gonzalo': 'TODAS', // Gonzalo trabaja en todas las plantas
      'pol': 'TODAS', // Pol trabaja en todas las plantas
    };
    let plantaFilter = '';
    let plantaDisplay = '';
    const tituloLower = contrato.titulo.toLowerCase();
    for (const [keyword, planta] of Object.entries(plantaMap)) {
      if (tituloLower.includes(keyword)) {
        plantaFilter = planta;
        plantaDisplay = planta.charAt(0) + planta.slice(1).toLowerCase();
        break;
      }
    }
    if (!plantaFilter) { plantaFilter = 'LLEIDA'; plantaDisplay = 'Lleida'; }

    const ticketsTotal = await prisma.$queryRawUnsafe<any[]>(
      `SELECT COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1`, `%${plantaFilter}%`
    );
    const ticketsByEstatus = await prisma.$queryRawUnsafe<any[]>(
      `SELECT estatus, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 GROUP BY estatus ORDER BY total DESC`, `%${plantaFilter}%`
    );
    const ticketsByPrioridad = await prisma.$queryRawUnsafe<any[]>(
      `SELECT prioridad, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 GROUP BY prioridad ORDER BY total DESC`, `%${plantaFilter}%`
    );
    const ticketsByTecnico = await prisma.$queryRawUnsafe<any[]>(
      `SELECT asignado_a, COUNT(*) as total, COUNT(*) FILTER (WHERE estatus IN ('Completed','Resolved')) as resueltos FROM tickets_draxton WHERE planta ILIKE $1 GROUP BY asignado_a ORDER BY total DESC`, `%${plantaFilter}%`
    );
    const ticketsBySla = await prisma.$queryRawUnsafe<any[]>(
      `SELECT sla_status, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 GROUP BY sla_status ORDER BY total DESC`, `%${plantaFilter}%`
    );
    const ticketsByCategoria = await prisma.$queryRawUnsafe<any[]>(
      `SELECT categoria_tipo, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 GROUP BY categoria_tipo ORDER BY total DESC LIMIT 8`, `%${plantaFilter}%`
    );
    const ticketsByMes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT mes_importacion, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 AND anio_importacion = $2 GROUP BY mes_importacion ORDER BY mes_importacion`, `%${plantaFilter}%`, new Date().getFullYear()
    );
    // Tickets por técnico y mes (para tabla cruzada)
    const ticketsByTecnicoMes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT asignado_a, mes_importacion, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 AND anio_importacion = $2 GROUP BY asignado_a, mes_importacion ORDER BY asignado_a, mes_importacion`, `%${plantaFilter}%`, new Date().getFullYear()
    );
    // Tickets por categoría y mes
    const ticketsByCategoriaMes = await prisma.$queryRawUnsafe<any[]>(
      `SELECT categoria_tipo, mes_importacion, COUNT(*) as total FROM tickets_draxton WHERE planta ILIKE $1 AND anio_importacion = $2 GROUP BY categoria_tipo, mes_importacion ORDER BY categoria_tipo, mes_importacion`, `%${plantaFilter}%`, new Date().getFullYear()
    );

    const totalTk = Number(ticketsTotal[0]?.total || 0);
    const resueltosTk = ticketsByEstatus.filter((t: any) => t.estatus === 'Completed' || t.estatus === 'Resolved').reduce((s: number, t: any) => s + Number(t.total), 0);
    const slaMet = ticketsBySla.find((t: any) => t.sla_status === 'Met');
    const slaMetPct = slaMet && totalTk > 0 ? (Number(slaMet.total) / totalTk * 100) : 0;

    // Prioridades legibles
    const prioridadNombres: Record<string, string> = { '1': 'Crítica', '2': 'Alta', '3': 'Media', '4': 'Baja', '5': 'Normal' };
    const MESES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    // Función de matching mejorada: BD tiene "PARRA GARCIA, JESUS" y tickets "Jesús Parra García"
    function matchTecnico(ticketName: string, personalName: string): boolean {
      if (!ticketName || !personalName) return false;
      const tn = ticketName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const pn = personalName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      // personalName format: "APELLIDO1 APELLIDO2, NOMBRE" 
      const parts = pn.split(',').map(s => s.trim());
      const apellidos = parts[0]?.split(' ') || [];
      const nombre = parts[1]?.split(' ')[0] || '';
      // ticketName format: "Nombre Apellido1 Apellido2"
      // Verificar si el primer apellido y el nombre están en el ticketName
      const primerApellido = apellidos[0] || '';
      return primerApellido.length > 2 && tn.includes(primerApellido) && (nombre.length < 3 || tn.includes(nombre));
    }

    // Filtrar tickets solo de técnicos asignados al contrato
    const tecnicosContrato = ticketsByTecnico.filter((t: any) => {
      return personal.some(p => matchTecnico(t.asignado_a || '', p.nombre));
    });

    // Calcular tickets por nivel usando matching mejorado
    // N3 no tiene tickets asignados directamente pero interviene como colaborador
    // en un % equivalente a su dedicación al contrato sobre los tickets de N2
    function ticketsPorNivel(nivel: number): number {
      const directos = tecnicosContrato.filter((t: any) => {
        const p = personal.find(pp => matchTecnico(t.asignado_a || '', pp.nombre));
        return p && p.nivel === nivel;
      }).reduce((s: number, t: any) => s + Number(t.total), 0);
      
      if (nivel === 3 && directos === 0) {
        // N3 interviene como colaborador en los tickets de N2 según su % de dedicación
        const n3Personal = personal.filter(p => p.nivel === 3 && p.activo);
        const n2Tickets = tecnicosContrato.filter((t: any) => {
          const p = personal.find(pp => matchTecnico(t.asignado_a || '', pp.nombre));
          return p && p.nivel === 2;
        }).reduce((s: number, t: any) => s + Number(t.total), 0);
        // Usar la dedicación del N3 con mayor % como referencia
        const maxDedicacion = Math.max(...n3Personal.map(p => p.dedicacion), 5);
        return Math.round(n2Tickets * (maxDedicacion / 100));
      }
      return directos;
    }

    // Recalcular total solo con técnicos del contrato
    const totalTkContrato = tecnicosContrato.reduce((s: number, t: any) => s + Number(t.total), 0);

    // 6. Generar HTML
    const fechaInforme = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe ${tipo === 'cliente' ? 'de Servicio' : 'Interno'} — ${contrato.titulo}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', sans-serif; font-size: 10px; line-height: 1.6; color: #1f2937; background: white; }
  @page { size: A4 portrait; margin: 0; }
  @media print {
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; page-break-inside: avoid; }
    .page:last-child { page-break-after: auto; }
    .no-print { display: none !important; }
  }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 20mm 18mm 25mm 18mm; position: relative; background: white; }
  .page-header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 14px; border-bottom: 2px solid #E87A2E; margin-bottom: 20px; }
  .page-header img { height: 36px; object-fit: contain; }
  .page-header-right { text-align: right; font-size: 9px; color: #6b7280; }
  .page-footer { position: absolute; bottom: 12mm; left: 18mm; right: 18mm; display: flex; justify-content: space-between; align-items: center; font-size: 8px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px; }
  h1 { font-size: 20px; font-weight: 800; color: #111827; margin-bottom: 4px; }
  h2 { font-size: 13px; font-weight: 700; color: #374151; margin: 18px 0 10px; padding-bottom: 6px; border-bottom: 1px solid #f3f4f6; }
  h3 { font-size: 11px; font-weight: 600; color: #1f2937; margin: 12px 0 6px; }
  .subtitle { font-size: 11px; color: #6b7280; margin-bottom: 16px; }
  .badge { display: inline-block; font-size: 8px; font-weight: 600; padding: 2px 8px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
  .badge-orange { background: #FFF3E8; color: #E87A2E; }
  .badge-green { background: #F0FDF4; color: #16a34a; }
  .badge-red { background: #FEF2F2; color: #dc2626; }
  .badge-blue { background: #EFF6FF; color: #2563eb; }
  .badge-gray { background: #f3f4f6; color: #6b7280; }
  .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
  .kpi-box { padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
  .kpi-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; margin-bottom: 4px; }
  .kpi-value { font-size: 18px; font-weight: 800; }
  .kpi-sub { font-size: 8px; color: #9ca3af; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 9px; }
  th { background: #f9fafb; padding: 8px 10px; text-align: left; font-weight: 600; font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  td { padding: 7px 10px; border-bottom: 1px solid #f3f4f6; }
  tr:nth-child(even) { background: #fafafa; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 700; }
  .text-green { color: #16a34a; }
  .text-red { color: #dc2626; }
  .text-orange { color: #E87A2E; }
  .text-blue { color: #2563eb; }
  .confidencial { position: absolute; top: 15mm; right: 18mm; font-size: 8px; font-weight: 700; color: #dc2626; letter-spacing: 1px; text-transform: uppercase; opacity: 0.6; }
  .nota-box { background: #FFF7ED; border: 1px solid #FDBA74; border-radius: 8px; padding: 12px 16px; margin: 16px 0; font-size: 9px; color: #9a3412; }
  .nota-box strong { color: #7c2d12; }
  .section-highlight { background: #f0f9ff; border-left: 3px solid #3b82f6; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 12px 0; }
  .bar { height: 8px; border-radius: 4px; display: inline-block; }
  .progress-container { background: #e5e7eb; border-radius: 4px; height: 8px; width: 100%; margin-top: 4px; }
  .progress-fill { height: 8px; border-radius: 4px; }
</style>
</head>
<body>
<div class="no-print" style="text-align:center;padding:12px;background:#f3f4f6;">
  <button onclick="window.print()" style="padding:8px 24px;background:#E87A2E;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;">Imprimir / Guardar PDF</button>
</div>

<!-- PÁGINA 1: DATOS DEL CONTRATO -->
<div class="page">
  ${tipo === 'interno' ? '<div class="confidencial">CONFIDENCIAL — USO INTERNO</div>' : ''}
  <div class="page-header">
    <img src="${baseUrl}/images/logo-io.png" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-weight:700;color:#E87A2E;">INFORME ${tipo === 'cliente' ? 'DE SERVICIO' : 'INTERNO DE CONTRATO'}</div>
      <div>${fechaInforme}</div>
    </div>
  </div>

  <h1>${tipo === 'cliente' ? 'Informe de Servicio' : 'Informe de Contrato'}</h1>
  <p class="subtitle">${contrato.titulo} — Planta ${plantaDisplay}</p>

  <h2>Datos del Contrato</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Importe Mensual</div>
      <div class="kpi-value text-blue">${fmtMoney(mensual)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Vigencia</div>
      <div class="kpi-value" style="color:#374151;font-size:14px;">${fmtDate(contrato.fechaInicio)}</div>
      <div class="kpi-sub">hasta ${fmtDate(contrato.fechaFin)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Horas/Mes Contratadas</div>
      <div class="kpi-value text-orange">${contrato.horasContratadas ? Number(contrato.horasContratadas) + 'h' : '—'}</div>
      <div class="kpi-sub">Nivel ${contrato.nivelContratado || 1}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Estado</div>
      <div class="kpi-value text-green">${contrato.estado}</div>
    </div>
  </div>

  <table>
    <tr><td style="width:30%;font-weight:600;color:#6b7280;">Tipo</td><td>${contrato.tipo}</td><td style="width:30%;font-weight:600;color:#6b7280;">Modalidad</td><td>${contrato.modalidadContrato || '—'}</td></tr>
    <tr><td style="font-weight:600;color:#6b7280;">Fecha Inicio</td><td>${fmtDate(contrato.fechaInicio)}</td><td style="font-weight:600;color:#6b7280;">Fecha Fin</td><td>${fmtDate(contrato.fechaFin)}</td></tr>
    <tr><td style="font-weight:600;color:#6b7280;">Permanencia</td><td>${contrato.permanenciaMeses ? contrato.permanenciaMeses + ' meses' : '—'}</td><td style="font-weight:600;color:#6b7280;">Prórroga</td><td>${contrato.prorrogaAutomatica ? 'Sí (' + (contrato.plazoProrroga || 'automática') + ')' : 'No'}</td></tr>
    ${contrato.clienteFacturacion ? `<tr><td style="font-weight:600;color:#6b7280;">Facturación a</td><td colspan="3">${contrato.clienteFacturacion.nombre}</td></tr>` : ''}
  </table>

  <h2>Equipo Asignado</h2>
  <p style="font-size:9px;color:#6b7280;margin-bottom:10px;">Personal técnico asignado al contrato con sus niveles de especialización y dedicación.</p>
  <table>
    <thead>
      <tr><th>Técnico</th><th class="text-center">Nivel</th><th>Rol</th><th class="text-center">Dedicación</th>${tipo === 'interno' ? '<th class="text-right">Coste Imputado</th>' : ''}<th class="text-center">Estado</th></tr>
    </thead>
    <tbody>
      ${personal.map(p => `
        <tr${!p.activo ? ' style="opacity:0.5;"' : ''}>
          <td class="font-bold">${p.nombre}</td>
          <td class="text-center"><span class="badge ${p.nivel >= 3 ? 'badge-red' : p.nivel >= 2 ? 'badge-orange' : 'badge-green'}">N${p.nivel}</span></td>
          <td>${p.rol}</td>
          <td class="text-center">${p.dedicacion}%</td>
          ${tipo === 'interno' ? `<td class="text-right">${fmtMoney(p.costeMensualImputado)}/mes</td>` : ''}
          <td class="text-center">${p.activo ? '<span class="badge badge-green">Activo</span>' : '<span class="badge badge-gray">Baja ' + fmtDate(p.fechaFin) + '</span>'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  ${tipo === 'interno' ? `
  <h2>Análisis Económico</h2>
  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Ingreso Mensual</div>
      <div class="kpi-value text-blue">${fmtMoney(mensual)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Coste Total</div>
      <div class="kpi-value text-red">${fmtMoney(costeTotal)}</div>
      <div class="kpi-sub">Personal: ${fmtMoney(costePersonal)} | Proveedores: ${fmtMoney(costeProveedores)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Margen</div>
      <div class="kpi-value ${margen >= 0 ? 'text-green' : 'text-red'}">${fmtMoney(margen)}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Margen %</div>
      <div class="kpi-value ${margenPct >= 0 ? 'text-green' : 'text-red'}">${fmtPct(margenPct)}</div>
    </div>
  </div>
  ` : ''}

  <div class="page-footer">
    <span>Internet Operadores S.L. — ${tipo === 'cliente' ? 'Informe de Servicio' : 'Informe Interno'}</span>
    <span>Página 1</span>
  </div>
</div>

<!-- PÁGINA 2: KPIs DE TICKETS -->
<div class="page">
  <div class="page-header">
    <img src="${baseUrl}/images/logo-io.png" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-weight:700;color:#E87A2E;">INDICADORES DE SERVICIO</div>
      <div>Planta ${plantaDisplay} — ${new Date().getFullYear()}</div>
    </div>
  </div>

  <h1>Indicadores de Servicio (KPIs)</h1>
  <p class="subtitle">Análisis de tickets e incidencias gestionadas en la planta de ${plantaDisplay}</p>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Total Tickets</div>
      <div class="kpi-value text-blue">${totalTk.toLocaleString('es-ES')}</div>
      <div class="kpi-sub">Histórico acumulado</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Resueltos</div>
      <div class="kpi-value text-green">${resueltosTk.toLocaleString('es-ES')}</div>
      <div class="kpi-sub">${totalTk > 0 ? fmtPct(resueltosTk / totalTk * 100) : '0%'} del total</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">SLA Cumplido</div>
      <div class="kpi-value ${slaMetPct >= 90 ? 'text-green' : 'text-orange'}">${fmtPct(slaMetPct)}</div>
      <div class="kpi-sub">${slaMet ? Number(slaMet.total).toLocaleString('es-ES') : '0'} tickets en SLA</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Tickets Abiertos</div>
      <div class="kpi-value text-orange">${ticketsByEstatus.filter((t: any) => !['Completed', 'Resolved'].includes(t.estatus)).reduce((s: number, t: any) => s + Number(t.total), 0)}</div>
    </div>
  </div>

  <h2>Resolución por Técnico</h2>
  <table>
    <thead>
      <tr><th>Técnico</th><th class="text-center">Tickets Asignados</th><th class="text-center">Resueltos</th><th class="text-center">% Resolución</th><th>Distribución</th></tr>
    </thead>
    <tbody>
      ${tecnicosContrato.map((t: any) => {
        const tot = Number(t.total);
        const res = Number(t.resueltos);
        const pct = tot > 0 ? (res / tot * 100) : 0;
        const barW = totalTkContrato > 0 ? (tot / totalTkContrato * 100) : 0;
        const nombre = t.asignado_a || 'Sin asignar';
        const p = personal.find(pp => matchTecnico(nombre, pp.nombre));
        const nivelTec = p?.nivel;
        return `<tr>
          <td class="font-bold">${nombre} ${nivelTec ? '<span class="badge badge-' + (nivelTec >= 3 ? 'red' : nivelTec >= 2 ? 'orange' : 'green') + '">N' + nivelTec + '</span>' : ''}</td>
          <td class="text-center font-bold">${tot.toLocaleString('es-ES')}</td>
          <td class="text-center text-green">${res.toLocaleString('es-ES')}</td>
          <td class="text-center font-bold">${fmtPct(pct)}</td>
          <td><div class="progress-container"><div class="progress-fill" style="width:${barW}%;background:#E87A2E;"></div></div><span style="font-size:7px;color:#9ca3af;">${fmtPct(barW)} del total</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>

  <h2>Distribución por Categoría</h2>
  <table>
    <thead><tr><th>Categoría</th><th class="text-center">Tickets</th><th class="text-center">%</th><th>Distribución</th></tr></thead>
    <tbody>
      ${ticketsByCategoria.map((t: any) => {
        const tot = Number(t.total);
        const pct = totalTk > 0 ? (tot / totalTk * 100) : 0;
        return `<tr><td class="font-bold">${t.categoria_tipo || 'Sin categoría'}</td><td class="text-center">${tot}</td><td class="text-center">${fmtPct(pct)}</td><td><div class="progress-container"><div class="progress-fill" style="width:${pct}%;background:#3b82f6;"></div></div></td></tr>`;
      }).join('')}
    </tbody>
  </table>

  <h2>Volumen Mensual por Técnico — ${new Date().getFullYear()}</h2>
  <table>
    <thead><tr><th>Técnico</th>${ticketsByMes.map((t: any) => `<th class="text-center" style="font-size:7px;">${MESES[t.mes_importacion]?.substring(0, 3) || t.mes_importacion}</th>`).join('')}<th class="text-center">Total</th></tr></thead>
    <tbody>
      ${tecnicosContrato.map((tec: any) => {
        const nombre = tec.asignado_a || 'Sin asignar';
        const p = personal.find(pp => matchTecnico(nombre, pp.nombre));
        const nivelTec = p?.nivel;
        const mesesData = ticketsByMes.map((m: any) => {
          const match = ticketsByTecnicoMes.find((tm: any) => tm.asignado_a === tec.asignado_a && tm.mes_importacion === m.mes_importacion);
          return match ? Number(match.total) : 0;
        });
        return `<tr><td class="font-bold" style="font-size:8px;">${nombre.split(' ').slice(0,2).join(' ')} ${nivelTec ? '<span class="badge badge-' + (nivelTec >= 3 ? 'red' : nivelTec >= 2 ? 'orange' : 'green') + '" style="font-size:6px;">N' + nivelTec + '</span>' : ''}</td>${mesesData.map((v: number) => `<td class="text-center" style="font-size:9px;">${v || '-'}</td>`).join('')}<td class="text-center font-bold">${Number(tec.total)}</td></tr>`;
      }).join('')}
      <tr style="border-top:2px solid #e5e7eb;font-weight:700;"><td>TOTAL</td>${ticketsByMes.map((t: any) => `<td class="text-center">${Number(t.total)}</td>`).join('')}<td class="text-center">${totalTkContrato}</td></tr>
    </tbody>
  </table>

  <h2>Volumen Mensual por Categoría — ${new Date().getFullYear()}</h2>
  <table>
    <thead><tr><th>Categoría</th>${ticketsByMes.map((t: any) => `<th class="text-center" style="font-size:7px;">${MESES[t.mes_importacion]?.substring(0, 3) || t.mes_importacion}</th>`).join('')}<th class="text-center">Total</th></tr></thead>
    <tbody>
      ${ticketsByCategoria.map((cat: any) => {
        const mesesData = ticketsByMes.map((m: any) => {
          const match = ticketsByCategoriaMes.find((cm: any) => cm.categoria_tipo === cat.categoria_tipo && cm.mes_importacion === m.mes_importacion);
          return match ? Number(match.total) : 0;
        });
        return `<tr><td class="font-bold" style="font-size:8px;">${cat.categoria_tipo || 'Sin categoría'}</td>${mesesData.map((v: number) => `<td class="text-center" style="font-size:9px;">${v || '-'}</td>`).join('')}<td class="text-center font-bold">${Number(cat.total)}</td></tr>`;
      }).join('')}
    </tbody>
  </table>

  <div class="page-footer">
    <span>Internet Operadores S.L. — Indicadores de Servicio</span>
    <span>Página 2</span>
  </div>
</div>

<!-- PÁGINA 3: BALANCE DE HORAS + JUSTIFICACIÓN NIVELES -->
<div class="page">
  <div class="page-header">
    <img src="${baseUrl}/images/logo-io.png" alt="Internet Operadores" />
    <div class="page-header-right">
      <div style="font-weight:700;color:#E87A2E;">${tipo === 'interno' ? 'BALANCE Y JUSTIFICACIÓN' : 'DETALLE DEL SERVICIO'}</div>
      <div>${fechaInforme}</div>
    </div>
  </div>

  ${balanceHoras ? `
  <h1>Balance de Horas</h1>
  <p class="subtitle">Seguimiento mensual de horas contratadas vs. ejecutadas — ${new Date().getFullYear()}</p>

  <div class="kpi-grid">
    <div class="kpi-box">
      <div class="kpi-label">Horas Contratadas (acum.)</div>
      <div class="kpi-value text-blue">${balanceHoras.contratadas}h</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Saldo Acumulado</div>
      <div class="kpi-value ${balanceHoras.saldo >= 0 ? 'text-green' : 'text-red'}">${balanceHoras.saldo > 0 ? '+' : ''}${balanceHoras.saldo}h</div>
      <div class="kpi-sub">${balanceHoras.saldo >= 0 ? 'A favor de IO' : 'Debemos al cliente'}</div>
    </div>
    <div class="kpi-box">
      <div class="kpi-label">Horas/Mes Contrato</div>
      <div class="kpi-value text-orange">${Number(contrato.horasContratadas)}h</div>
      <div class="kpi-sub">Nivel ${contrato.nivelContratado || 1}</div>
    </div>
    ${balanceHoras.actualizaciones ? `
    <div class="kpi-box">
      <div class="kpi-label">Actualiz. Imputadas</div>
      <div class="kpi-value" style="color:#7c3aed;">${balanceHoras.actualizaciones.equiv}h</div>
      <div class="kpi-sub">${balanceHoras.actualizaciones.horas}h reales × factor ${balanceHoras.actualizaciones.factor}</div>
    </div>
    ` : `
    <div class="kpi-box">
      <div class="kpi-label">Actualiz. Imputadas</div>
      <div class="kpi-value" style="color:#9ca3af;">0h</div>
    </div>
    `}
  </div>

  <table>
    <thead><tr><th>Mes</th><th class="text-center">Contratadas</th><th class="text-center">Ejecutadas (equiv.)</th><th class="text-center">Diferencia</th><th class="text-center">Saldo Acumulado</th></tr></thead>
    <tbody>
      ${balanceHoras.detalleMensual.map((d: any) => `
        <tr>
          <td class="font-bold">${d.mes}</td>
          <td class="text-center">${d.contratadas}h</td>
          <td class="text-center">${d.ejecutadas}h</td>
          <td class="text-center ${d.ejecutadas - d.contratadas >= 0 ? 'text-green' : 'text-red'}">${(d.ejecutadas - d.contratadas) > 0 ? '+' : ''}${(d.ejecutadas - d.contratadas).toFixed(1)}h</td>
          <td class="text-center font-bold ${d.saldo >= 0 ? 'text-green' : 'text-red'}">${d.saldo > 0 ? '+' : ''}${d.saldo}h</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  ` : ''}

  <h2>Justificación de Niveles Técnicos</h2>
  <div class="section-highlight">
    <h3 style="margin-bottom:8px;">¿Por qué se requieren técnicos de diferentes niveles?</h3>
    <p style="font-size:9px;line-height:1.7;color:#1e40af;">
      Aunque el contrato define un nivel base <strong>N1</strong> para las tareas operativas diarias, la realidad operativa de una planta industrial como ${plantaDisplay} requiere la intervención de técnicos de niveles superiores para garantizar la continuidad del servicio y la resolución efectiva de incidencias complejas.
    </p>
  </div>

  <table>
    <thead><tr><th>Nivel</th><th>Perfil</th><th>Funciones</th><th class="text-center">Tickets Gestionados</th></tr></thead>
    <tbody>
      <tr>
        <td><span class="badge badge-green">N1</span></td>
        <td class="font-bold">Técnico Operativo</td>
        <td>Soporte presencial/remoto de primer nivel: resolución de incidencias de usuario, gestión de solicitudes, mantenimiento básico de equipos, documentación.</td>
        <td class="text-center font-bold">${ticketsPorNivel(1)}</td>
      </tr>
      <tr>
        <td><span class="badge badge-orange">N2</span></td>
        <td class="font-bold">Responsable Técnico</td>
        <td>Escalado de incidencias complejas, administración de sistemas, gestión de infraestructura de red, coordinación con proveedores, gobierno del servicio, formación del equipo N1.</td>
        <td class="text-center font-bold">${ticketsPorNivel(2)}</td>
      </tr>
      <tr>
        <td><span class="badge badge-red">N3</span></td>
        <td class="font-bold">Manager / Especialista</td>
        <td>Dirección técnica, toma de decisiones críticas, gestión de proyectos de mejora, interlocución con dirección del cliente, planificación estratégica, resolución de incidencias de máxima complejidad.</td>
        <td class="text-center font-bold">${ticketsPorNivel(3)}<br/><span style="font-size:7px;color:#6b7280;font-weight:400;">Colaborador</span></td>
      </tr>
    </tbody>
  </table>

  <div class="nota-box">
    <strong>Nota importante:</strong> Un técnico de Nivel 1 no dispone de la experiencia, formación ni capacidad de gobierno necesarias para resolver incidencias de infraestructura avanzada, administración de sistemas o coordinación con proveedores. La asignación de técnicos N2 y N3 es imprescindible para mantener los niveles de SLA comprometidos (actualmente <strong>${fmtPct(slaMetPct)}</strong> de cumplimiento) y garantizar la continuidad operativa de la planta.
  </div>

  <h2>Distribución por Prioridad</h2>
  <table>
    <thead><tr><th>Prioridad</th><th class="text-center">Tickets</th><th class="text-center">%</th></tr></thead>
    <tbody>
      ${ticketsByPrioridad.map((t: any) => `
        <tr>
          <td class="font-bold">${prioridadNombres[t.prioridad] || 'P' + t.prioridad}</td>
          <td class="text-center">${Number(t.total).toLocaleString('es-ES')}</td>
          <td class="text-center">${totalTk > 0 ? fmtPct(Number(t.total) / totalTk * 100) : '0%'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="page-footer">
    <span>Internet Operadores S.L. — ${tipo === 'cliente' ? 'Detalle del Servicio' : 'Balance y Justificación'}</span>
    <span>Página 3</span>
  </div>
</div>

</body>
</html>`;

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (error: any) {
    console.error('Error generando informe contrato:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
