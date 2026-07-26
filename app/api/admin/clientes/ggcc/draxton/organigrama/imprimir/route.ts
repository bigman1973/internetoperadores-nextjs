import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

interface Nodo {
  id: string;
  nombre: string;
  rol: string;
  tipoEntidad: string;
  empresa: string | null;
  ubicacion: string;
  esColaborador: boolean;
  especialidad: string | null;
  reportaAId: string | null;
  orden: number;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const nodos = await prisma.organigramaDraxton.findMany({
    where: { activo: true },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  });

  const orgNodos = nodos.filter((n: Nodo) => !n.esColaborador);
  const colaboradores = nodos.filter((n: Nodo) => n.esColaborador);
  const raices = orgNodos.filter((n: Nodo) => !n.reportaAId);

  function getHijos(parentId: string): Nodo[] {
    return orgNodos.filter((n: Nodo) => n.reportaAId === parentId).sort((a: Nodo, b: Nodo) => a.orden - b.orden);
  }

  function getNodoColor(tipo: string): { bg: string; border: string; text: string } {
    switch (tipo) {
      case 'interno': return { bg: '#e0f2fe', border: '#7dd3fc', text: '#0c4a6e' };
      case 'io': return { bg: '#ffedd5', border: '#fdba74', text: '#9a3412' };
      case 'externo': return { bg: '#fef9c3', border: '#fde047', text: '#854d0e' };
      default: return { bg: '#f3f4f6', border: '#d1d5db', text: '#374151' };
    }
  }

  function renderNodo(nodo: Nodo): string {
    const hijos = getHijos(nodo.id);
    const color = getNodoColor(nodo.tipoEntidad);
    const empresaLabel = nodo.empresa && nodo.tipoEntidad !== 'interno' ? `<div class="nodo-empresa">${nodo.empresa}</div>` : '';

    let html = `<li>`;
    html += `<div class="nodo" style="background:${color.bg};border-color:${color.border};color:${color.text}">`;
    html += `<div class="nodo-nombre">${nodo.nombre}</div>`;
    html += `<div class="nodo-rol">${nodo.rol}</div>`;
    html += empresaLabel;
    html += `<div class="nodo-ubicacion">${nodo.ubicacion}</div>`;
    html += `</div>`;

    if (hijos.length > 0) {
      html += `<ul>`;
      for (const hijo of hijos) {
        html += renderNodo(hijo);
      }
      html += `</ul>`;
    }

    html += `</li>`;
    return html;
  }

  // Agrupar colaboradores por empresa
  const colPorEmpresa: Record<string, Nodo[]> = {};
  colaboradores.forEach((c: Nodo) => {
    const emp = c.empresa || 'Sin empresa';
    if (!colPorEmpresa[emp]) colPorEmpresa[emp] = [];
    colPorEmpresa[emp].push(c);
  });

  const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Organigrama IT · Draxton</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, sans-serif;
      background: white;
      color: #1f2937;
      padding: 20px;
    }
    @page {
      size: A4 landscape;
      margin: 10mm;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      .page-break { page-break-before: always; }
    }
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
    .header {
      text-align: center;
      margin-bottom: 30px;
      padding-bottom: 15px;
      border-bottom: 3px solid #E87A2E;
    }
    .header h1 {
      font-size: 24px;
      font-weight: 800;
      color: #111827;
    }
    .header p {
      font-size: 11px;
      color: #6b7280;
      margin-top: 4px;
    }
    .leyenda {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-bottom: 30px;
      font-size: 11px;
    }
    .leyenda-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .leyenda-dot {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      border: 2px solid;
    }

    /* === CSS TREE === */
    .tree {
      display: flex;
      justify-content: center;
      padding-top: 20px;
    }
    .tree ul {
      position: relative;
      padding-top: 30px;
      list-style: none;
      display: flex;
      justify-content: center;
    }
    .tree li {
      position: relative;
      padding: 30px 8px 0 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    /* Línea vertical desde el padre hacia abajo */
    .tree ul::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      width: 2px;
      height: 30px;
      background: #9ca3af;
    }
    /* Línea vertical desde la barra horizontal hacia el hijo */
    .tree li::before {
      content: '';
      position: absolute;
      top: 0;
      left: 50%;
      width: 2px;
      height: 30px;
      background: #9ca3af;
    }
    /* Barra horizontal que conecta hermanos */
    .tree li::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: #9ca3af;
    }
    /* Primer hijo: barra horizontal solo a la derecha */
    .tree li:first-child::after {
      left: 50%;
    }
    /* Último hijo: barra horizontal solo a la izquierda */
    .tree li:last-child::after {
      right: 50%;
    }
    /* Hijo único: sin barra horizontal */
    .tree li:only-child::after {
      display: none;
    }
    /* Raíz: sin líneas superiores */
    .tree > ul > li::before,
    .tree > ul > li::after,
    .tree > ul::before {
      display: none;
    }

    .nodo {
      position: relative;
      border: 2px solid;
      border-radius: 8px;
      padding: 10px 14px;
      min-width: 140px;
      max-width: 180px;
      text-align: center;
      z-index: 1;
    }
    .nodo-nombre {
      font-size: 11px;
      font-weight: 700;
      line-height: 1.3;
    }
    .nodo-rol {
      font-size: 9px;
      margin-top: 2px;
      opacity: 0.85;
      line-height: 1.3;
    }
    .nodo-empresa {
      font-size: 9px;
      font-weight: 600;
      margin-top: 2px;
    }
    .nodo-ubicacion {
      font-size: 8px;
      margin-top: 3px;
      opacity: 0.6;
    }

    /* Colaboradores */
    .colaboradores {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #7c3aed;
    }
    .colaboradores h2 {
      font-size: 16px;
      font-weight: 700;
      color: #7c3aed;
      margin-bottom: 15px;
      text-align: center;
    }
    .col-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
    }
    .col-empresa {
      background: #f5f3ff;
      border: 1px solid #ddd6fe;
      border-radius: 8px;
      padding: 12px;
    }
    .col-empresa h3 {
      font-size: 11px;
      font-weight: 700;
      color: #7c3aed;
      margin-bottom: 8px;
    }
    .col-persona {
      font-size: 10px;
      padding: 3px 0;
      border-bottom: 1px solid #ede9fe;
    }
    .col-persona:last-child { border-bottom: none; }
    .col-persona strong { color: #1f2937; }
    .col-persona span { color: #6b7280; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">⬇ Imprimir / Guardar PDF</button>

  <div class="header">
    <h1>Draxton · Organigrama IT</h1>
    <p>Estructura del equipo IT con empresas externas · ${fecha}</p>
  </div>

  <div class="leyenda">
    <div class="leyenda-item">
      <div class="leyenda-dot" style="background:#e0f2fe;border-color:#7dd3fc;"></div>
      Interno Draxton
    </div>
    <div class="leyenda-item">
      <div class="leyenda-dot" style="background:#ffedd5;border-color:#fdba74;"></div>
      Internet Operadores (IO)
    </div>
    <div class="leyenda-item">
      <div class="leyenda-dot" style="background:#fef9c3;border-color:#fde047;"></div>
      Empresa externa
    </div>
  </div>

  <div class="tree">
    <ul>
      ${raices.map((r: Nodo) => renderNodo(r)).join('')}
    </ul>
  </div>

  ${colaboradores.length > 0 ? `
  <div class="colaboradores page-break">
    <h2>Colaboradores Externos</h2>
    <div class="col-grid">
      ${Object.entries(colPorEmpresa).map(([empresa, cols]) => `
        <div class="col-empresa">
          <h3>${empresa}</h3>
          ${(cols as Nodo[]).map((c: Nodo) => `
            <div class="col-persona">
              <strong>${c.nombre}</strong>
              ${c.especialidad ? `<span> · ${c.especialidad}</span>` : ''}
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>
  </div>
  ` : ''}

</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
