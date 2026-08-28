import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { activePositionWhere, formatOrganizationDate, parseOrganizationDate } from '@/lib/organigrama';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function getLogoDataUri() {
  try {
    const buffer = await readFile(path.join(process.cwd(), 'public/images/logo-internetoperadores.png'));
    return `data:image/png;base64,${buffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function renderTree(position: any, all: any[], depth = 0): string {
  const children = all.filter(item => item.superiorId === position.empleadoId);
  return `<div class="branch depth-${depth}">
    <article class="person">
      <div class="person-top"><strong>${escapeHtml(position.empleado.nombreCompleto)}</strong><span>${escapeHtml(position.empresaGrupo)}</span></div>
      <div class="role">${escapeHtml(position.cargo)}</div>
      <div class="meta">${escapeHtml(position.departamento)} · ${escapeHtml(position.categoriaNomina || position.empleado.categoria || 'Sin categoría')}</div>
      ${position.empleado.email ? `<div class="email">${escapeHtml(position.empleado.email)}</div>` : ''}
      ${position.dependenciaFuncional ? `<div class="functional">Dependencia funcional: ${escapeHtml(position.dependenciaFuncional.nombreCompleto)}</div>` : ''}
    </article>
    ${children.length ? `<div class="children">${children.map(child => renderTree(child, all, depth + 1)).join('')}</div>` : ''}
  </div>`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    if (!['SUPER_ADMIN', 'GERENTE', 'RRHH'].includes(session.user.role || '')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const type = searchParams.get('tipo') === 'directorio' ? 'directorio' : 'organigrama';
    const dateText = searchParams.get('fecha') || new Date().toISOString().slice(0, 10);
    const date = parseOrganizationDate(dateText, 'La fecha de consulta');
    const company = searchParams.get('empresa') || 'todos';
    const department = searchParams.get('departamento') || 'todos';

    const positions = await prisma.puestoOrganizativo.findMany({
      where: {
        ...activePositionWhere(date),
        mostrarEnOrganigrama: type === 'organigrama' ? true : undefined,
        ...(company !== 'todos' ? { empresaGrupo: company } : {}),
        ...(department !== 'todos' ? { departamento: department } : {}),
      },
      include: {
        empleado: { select: { nombreCompleto: true, email: true, categoria: true } },
        superior: { select: { nombreCompleto: true } },
        dependenciaFuncional: { select: { nombreCompleto: true } },
      },
      orderBy: [{ ordenOrganigrama: 'asc' }, { empleado: { nombreCompleto: 'asc' } }],
    });

    const logo = await getLogoDataUri();
    const roots = positions.filter(position => !position.superiorId || !positions.some(candidate => candidate.empleadoId === position.superiorId));
    const title = type === 'organigrama' ? 'Organigrama corporativo' : 'Directorio organizativo';
    const subtitle = `${company === 'todos' ? 'Grupo empresarial' : company}${department === 'todos' ? '' : ` · ${department}`} · Estructura vigente a ${formatOrganizationDate(date)}`;

    const body = type === 'organigrama'
      ? `<section class="org">${roots.map(root => renderTree(root, positions)).join('')}</section>`
      : `<table><thead><tr><th>Empleado</th><th>Empresa</th><th>Departamento</th><th>Cargo</th><th>Categoría profesional</th><th>Superior inmediato</th><th>Dependencia funcional</th></tr></thead><tbody>${positions.map(position => `<tr><td><strong>${escapeHtml(position.empleado.nombreCompleto)}</strong><br><small>${escapeHtml(position.empleado.email || 'Sin correo')}</small></td><td>${escapeHtml(position.empresaGrupo)}</td><td>${escapeHtml(position.departamento)}</td><td>${escapeHtml(position.cargo)}</td><td>${escapeHtml(position.categoriaNomina || position.empleado.categoria || 'Sin categoría')}<br><small>${position.categoriaOrigen === 'nomina' ? `Nómina ${String(position.categoriaNominaMes).padStart(2, '0')}/${position.categoriaNominaAnio}` : 'Ficha del empleado'}</small></td><td>${escapeHtml(position.superior?.nombreCompleto || 'Raíz')}</td><td>${escapeHtml(position.dependenciaFuncional?.nombreCompleto || '—')}</td></tr>`).join('')}</tbody></table>`;

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title}</title><style>
      @page { size: ${type === 'organigrama' ? 'A3 landscape' : 'A4 landscape'}; margin: 12mm; }
      * { box-sizing: border-box; } body { margin: 0; font-family: Arial, sans-serif; color: #172033; background: white; font-size: 10px; }
      header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #ea580c; padding-bottom:9px; margin-bottom:14px; }
      .logo { width:128px; height:42px; object-fit:contain; object-position:left top; }
      h1 { margin: 0; font-size: 24px; } .subtitle { margin-top:5px; color:#667085; font-size:11px; }
      .conf { text-align:right; color:#b45309; font-size:9px; font-weight:bold; letter-spacing:1.2px; } .conf small { display:block; color:#667085; font-weight:normal; letter-spacing:0; margin-top:4px; }
      .note { border:1px solid #fed7aa; background:#fff7ed; color:#9a3412; padding:7px 9px; margin-bottom:12px; font-size:9px; }
      .org { display:flex; gap:14px; align-items:flex-start; justify-content:center; } .branch { min-width:190px; flex:1; position:relative; } .person { border:1px solid #d9dee8; border-top:4px solid #ea580c; border-radius:8px; padding:10px; background:white; break-inside:avoid; }
      .person-top { display:flex; gap:8px; justify-content:space-between; align-items:flex-start; } .person-top strong { font-size:11px; } .person-top span { border-radius:12px; background:#f5f3ff; color:#6d28d9; padding:3px 6px; font-size:7px; font-weight:bold; white-space:nowrap; }
      .role { color:#ea580c; font-weight:bold; margin-top:5px; font-size:10px; } .meta,.email,.functional { color:#667085; margin-top:4px; font-size:8px; } .functional { color:#4f46e5; }
      .children { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); gap:10px; margin-top:12px; padding-top:12px; border-top:1px solid #d9dee8; }
      table { width:100%; border-collapse:collapse; table-layout:fixed; } th { text-align:left; background:#f2f4f7; color:#475467; padding:7px; font-size:8px; text-transform:uppercase; } td { border-bottom:1px solid #e4e7ec; padding:7px; vertical-align:top; font-size:8.5px; overflow-wrap:anywhere; } td small { color:#667085; }
      footer { margin-top:14px; border-top:1px solid #d9dee8; padding-top:6px; display:flex; justify-content:space-between; color:#667085; font-size:7px; }
      @media screen { body { max-width:${type === 'organigrama' ? '1500px' : '1100px'}; margin:24px auto; padding:20px; box-shadow:0 10px 40px #0001; } }
      @media print { .no-print { display:none; } }
    </style></head><body>
      <header><div>${logo ? `<img class="logo" src="${logo}" alt="Internet Operadores">` : '<strong>Internet Operadores</strong>'}<h1>${title}</h1><div class="subtitle">${escapeHtml(subtitle)}</div></div><div class="conf">CONFIDENCIAL<small>Documento interno</small></div></header>
      <div class="note">La categoría profesional procede de la nómina cuando ha podido extraerse. El cargo, departamento y dependencias reflejan la estructura organizativa interna registrada.</div>
      ${body}
      <footer><span>Internet Operadores S.L. · Organización y Personal</span><span>Generado por David Pérez · david.perez@internetoperadores.com · ${formatOrganizationDate(new Date())}</span></footer>
      <script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script>
    </body></html>`;

    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error: any) {
    console.error('Error al generar informe de organigrama:', error);
    return NextResponse.json({ error: error.message || 'No se pudo generar el informe' }, { status: 500 });
  }
}
