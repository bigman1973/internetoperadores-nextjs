import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { cents } from './core';

export interface LineaPaquete {
  id: string; empleadoId: string; empleadoNombre: string; empleadoNif: string; tipo: 'TICKET' | 'KILOMETRAJE'; fecha: string;
  concepto: string; categoria: string | null; proyecto: string | null; cliente: string | null; comercio: string | null;
  importe: number; tipoIva: number | null; baseImponible: number | null; importeIva: number | null; km: number | null; eurKm: number | null;
  revisorEmail: string | null; revisadoAt: string | null;
}
export interface TicketAdjunto { gastoId: string; mime: string; datos: Buffer }
export interface ResumenTrabajador { empleadoId: string; nombre: string; nif: string; lineas: number; tickets: number; kmTotal: number; importeKm: number; total: number }

const MESES = ['', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const nombrePeriodo = (p: string) => { const [y, m] = p.split('-').map(Number); return `${MESES[m]} de ${y}`; };
const suma = (xs: number[]) => xs.reduce((s, x) => s + cents(x), 0) / 100;
const eurEs = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fechaEs = (iso: string) => iso.split('-').reverse().join('/');

export function resumenPorTrabajador(lineas: LineaPaquete[]): ResumenTrabajador[] {
  const m = new Map<string, LineaPaquete[]>();
  for (const l of lineas) m.set(l.empleadoId, [...(m.get(l.empleadoId) || []), l]);
  return [...m.values()].map(ls => ({
    empleadoId: ls[0].empleadoId, nombre: ls[0].empleadoNombre, nif: ls[0].empleadoNif, lineas: ls.length,
    tickets: suma(ls.filter(l => l.tipo === 'TICKET').map(l => l.importe)),
    kmTotal: ls.filter(l => l.tipo === 'KILOMETRAJE').reduce((s, l) => s + (l.km || 0), 0),
    importeKm: suma(ls.filter(l => l.tipo === 'KILOMETRAJE').map(l => l.importe)),
    total: suma(ls.map(l => l.importe)),
  })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** Excel para la gestoría: hoja Resumen (una fila por trabajador) y Detalle (una fila por gasto aprobado). */
export function libroExcel(periodo: string, lineas: LineaPaquete[], empleadoId?: string): Buffer {
  const ls = empleadoId ? lineas.filter(l => l.empleadoId === empleadoId) : lineas;
  const res = resumenPorTrabajador(ls);
  const wb = XLSX.utils.book_new();
  const resumen = [
    [`Gastos aprobados a abonar en nómina · ${nombrePeriodo(periodo)}`], [],
    ['Trabajador', 'NIF', 'Nº gastos', 'Tickets (€)', 'Km', 'Kilometraje (€)', 'Total a abonar (€)'],
    ...res.map(r => [r.nombre, r.nif, r.lineas, r.tickets, r.kmTotal, r.importeKm, r.total]),
    ['TOTAL', '', res.reduce((s, r) => s + r.lineas, 0), suma(res.map(r => r.tickets)), res.reduce((s, r) => s + r.kmTotal, 0), suma(res.map(r => r.importeKm)), suma(res.map(r => r.total))],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(resumen);
  ws1['!cols'] = [{ wch: 34 }, { wch: 13 }, { wch: 10 }, { wch: 13 }, { wch: 9 }, { wch: 16 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws1, 'Resumen');
  const detalle = [
    ['Trabajador', 'NIF', 'Fecha', 'Tipo', 'Categoría', 'Concepto', 'Comercio', 'Cliente / proyecto', 'Km', '€/km', 'Base (€)', 'IVA (%)', 'Cuota IVA (€)', 'Importe (€)', 'Aprobado por', 'Aprobado el', 'Ref.'],
    ...ls.sort((a, b) => a.empleadoNombre.localeCompare(b.empleadoNombre, 'es') || a.fecha.localeCompare(b.fecha)).map(l => [
      l.empleadoNombre, l.empleadoNif, fechaEs(l.fecha), l.tipo === 'TICKET' ? 'Ticket' : 'Kilometraje', l.categoria || '', l.concepto, l.comercio || '',
      [l.cliente, l.proyecto].filter(Boolean).join(' / '), l.km ?? '', l.eurKm ?? '', l.baseImponible ?? '', l.tipoIva ?? '', l.importeIva ?? '', l.importe,
      l.revisorEmail || '', l.revisadoAt ? String(l.revisadoAt).slice(0, 10).split('-').reverse().join('/') : '', l.id.slice(0, 8),
    ]),
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(detalle);
  ws2['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 11 }, { wch: 11 }, { wch: 15 }, { wch: 40 }, { wch: 24 }, { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'Detalle');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

/** Borrador del correo a la gestoría. Solo texto: nunca se envía desde el panel. */
export function borradorGestoria(periodo: string, filas: { nombre: string; total: number }[], destinatario: string | null) {
  const total = filas.reduce((s, f) => s + Math.round(f.total * 100), 0) / 100;
  return {
    destinatario: destinatario || '',
    asunto: `Gastos a abonar en nómina · ${nombrePeriodo(periodo)} · Internet Operadores`,
    cuerpo: [
      'Hola,', '',
      `Os enviamos los gastos de empleados aprobados correspondientes a ${nombrePeriodo(periodo)} para incluirlos en las nóminas de ese mes.`, '',
      ...filas.map(f => `- ${f.nombre}: ${eurEs(f.total)}`), '', `Total: ${eurEs(total)} (${filas.length} ${filas.length === 1 ? 'trabajador' : 'trabajadores'}).`, '',
      'Adjuntamos un Excel con el resumen y el detalle, y un PDF por trabajador con sus tickets.', '',
      'Gracias y un saludo,', 'Internet Operadores',
    ].join('\n'),
  };
}


/* ---------------------------------- PDF ---------------------------------- */
// Helvetica estándar solo codifica WinAnsi: se sustituye lo que no cabe.
const seguro = (s: string) => s.replace(/[^\u0020-\u007e\u00a1-\u00ff€]/g, '?');
const eur = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const A4: [number, number] = [595.28, 841.89];

function recortar(font: PDFFont, texto: string, size: number, ancho: number) {
  let t = seguro(texto);
  if (font.widthOfTextAtSize(t, size) <= ancho) return t;
  while (t.length > 1 && font.widthOfTextAtSize(t + '...', size) > ancho) t = t.slice(0, -1);
  return t + '...';
}

async function paginaImagen(doc: PDFDocument, font: PDFFont, bold: PDFFont, cabecera: string, datos: Buffer, mime: string) {
  const page = doc.addPage(A4);
  page.drawText(recortar(bold, cabecera, 10, 500), { x: 40, y: 805, size: 10, font: bold, color: rgb(0.1, 0.1, 0.1) });
  try {
    const sharp = (await import('sharp')).default;
    const jpg = mime === 'image/jpeg' ? datos : await sharp(datos).rotate().jpeg({ quality: 85 }).toBuffer();
    const img = await doc.embedJpg(jpg);
    const k = Math.min(515 / img.width, 740 / img.height, 1.5);
    page.drawImage(img, { x: 40, y: 790 - img.height * k, width: img.width * k, height: img.height * k });
  } catch {
    page.drawText('No se pudo incrustar la imagen (formato no compatible). Original disponible en el panel.', { x: 40, y: 770, size: 10, font });
  }
}

/** PDF por trabajador: portada con el listado y, detrás, cada ticket (foto o PDF original) con su referencia. */
export async function pdfTrabajador(periodo: string, lineas: LineaPaquete[], tickets: Map<string, TicketAdjunto>): Promise<Buffer> {
  const ls = lineas.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = doc.addPage(A4);
  let y = 800;
  const t = (txt: string, x: number, size = 9, f = font) => page.drawText(seguro(txt), { x, y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  t(`Gastos a abonar en nómina · ${nombrePeriodo(periodo)}`, 40, 14, bold); y -= 20;
  t(`${ls[0].empleadoNombre}   NIF ${ls[0].empleadoNif}`, 40, 11); y -= 14;
  t(`Gastos aprobados por ${[...new Set(ls.map(l => l.revisorEmail).filter(Boolean))].join(', ')}`, 40, 8); y -= 22;
  const cols = [40, 92, 150, 360, 410, 470];
  ['Fecha', 'Tipo', 'Concepto', 'Km', 'IVA', 'Importe'].forEach((h, i) => t(h, cols[i], 8, bold));
  y -= 12;
  for (const l of ls) {
    if (y < 70) { page = doc.addPage(A4); y = 800; }
    t(fechaEs(l.fecha), cols[0]); t(l.tipo === 'TICKET' ? 'Ticket' : 'Km', cols[1]);
    t(recortar(font, `${l.concepto}${l.comercio ? ' · ' + l.comercio : ''}`, 9, 205), cols[2]);
    t(l.km ? String(l.km).replace('.', ',') : '', cols[3]); t(l.importeIva !== null ? eur(l.importeIva) : '', cols[4]); t(eur(l.importe), cols[5], 9, bold);
    y -= 13;
  }
  y -= 8;
  t('TOTAL A ABONAR', 360, 10, bold); t(eur(suma(ls.map(l => l.importe))), 470, 10, bold);
  for (const l of ls) {
    const adj = tickets.get(l.id);
    const cab = `Ref. ${l.id.slice(0, 8)} · ${fechaEs(l.fecha)} · ${eur(l.importe)} · ${l.concepto}`;
    if (!adj) continue;
    if (adj.mime === 'application/pdf') {
      try {
        const src = await PDFDocument.load(adj.datos, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p, i) => {
          doc.addPage(p);
          if (i === 0) p.drawText(seguro(cab).slice(0, 110), { x: 20, y: p.getHeight() - 14, size: 8, font: bold, color: rgb(0.7, 0, 0) });
        });
      } catch {
        const p = doc.addPage(A4); p.drawText(seguro(cab).slice(0, 100), { x: 40, y: 805, size: 10, font: bold });
        p.drawText('No se pudo incrustar este PDF (protegido o dañado). Original disponible en el panel.', { x: 40, y: 770, size: 10, font });
      }
    } else await paginaImagen(doc, font, bold, cab, adj.datos, adj.mime);
  }
  // Los KILOMETRAJE no llevan ticket: la portada ya contiene km y €/km.
  const km = ls.filter(l => l.tipo === 'KILOMETRAJE');
  if (km.length) {
    page = doc.addPage(A4); y = 800;
    t('Detalle de kilometraje', 40, 12, bold); y -= 20;
    for (const l of km) { t(recortar(font, `${fechaEs(l.fecha)} · ${l.concepto} · ${l.km} km × ${String(l.eurKm).replace('.', ',')} €/km = ${eur(l.importe)}`, 9, 515), 40); y -= 13; }
  }
  return Buffer.from(await doc.save());
}
