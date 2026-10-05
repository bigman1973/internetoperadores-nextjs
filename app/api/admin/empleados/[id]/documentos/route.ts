import { createHash } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { unzipSync } from 'fflate';
import prisma from '@/lib/prisma';
import { authOptions } from '@/lib/auth';
import { extractPayrollPdfText, parseCombinedSettlementReceipt } from '@/lib/nominas-parser';
import { savePrivateDriveDocument } from '@/lib/microsoft-graph';

export const runtime = 'nodejs';
const MONTHS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
type Props = { params: Promise<{ id: string }> };

async function getDirector() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.userType === 'cliente') return null;
  const account = await prisma.usuarioAdmin.findUnique({ where: { email: session.user.email }, select: { email: true, rol: true, activo: true } });
  return account?.activo && account.rol === 'SUPER_ADMIN' ? account : null;
}

function documentText(bytes: Buffer): string {
  const zip = unzipSync(new Uint8Array(bytes), { filter: entry => entry.name === 'word/document.xml' && entry.originalSize < 1000000 });
  const xml = zip['word/document.xml'];
  if (!xml) throw new Error('DOCX sin contenido de texto verificable');
  return Buffer.from(xml).toString('utf8').replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

export async function GET(_request: NextRequest, { params }: Props) {
  if (!await getDirector()) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  const { id } = await params;
  const docs = await prisma.documentoEmpleado.findMany({ where: { empleadoId: id }, orderBy: { createdAt: 'desc' }, select: { id: true, nombre: true, tipo: true, anio: true, mes: true, createdAt: true } });
  return NextResponse.json({ documentos: docs }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest, { params }: Props) {
  const director = await getDirector();
  if (!director) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  const { id } = await params;
  try {
    if (Number(request.headers.get('content-length')) > 8 * 1024 * 1024) return NextResponse.json({ error: 'Archivo demasiado grande' }, { status: 413 });
    const form = await request.formData();
    const file = form.get('archivo');
    const tipo = form.get('tipo');
    const anio = Number(form.get('anio'));
    const mes = Number(form.get('mes'));
    if (!(file instanceof File) || !['LIQUIDACION','CARTA_EXTINCION'].includes(String(tipo)) || !Number.isInteger(anio) || anio < 2024 || anio > 2100 || !Number.isInteger(mes) || mes < 1 || mes > 12 || file.size < 100 || file.size > 7 * 1024 * 1024) {
      return NextResponse.json({ error: 'Tipo, período o archivo no válido' }, { status: 400 });
    }
    const suffix = tipo === 'LIQUIDACION' ? '.pdf' : '.docx';
    if (!file.name.toLowerCase().endsWith(suffix)) return NextResponse.json({ error: 'Formato de documento incorrecto' }, { status: 400 });
    const employee = await prisma.empleado.findUnique({ where: { id }, select: { id: true, nombreCompleto: true, nif: true } });
    if (!employee) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const signature = tipo === 'LIQUIDACION' ? bytes.subarray(0, 4).toString() === '%PDF' : bytes.subarray(0, 2).toString() === 'PK';
    if (!signature) return NextResponse.json({ error: 'El archivo no coincide con su formato' }, { status: 400 });
    const expectedNif = employee.nif.replace(/[^0-9A-Z]/gi, '').toUpperCase();
    if (tipo === 'LIQUIDACION') {
      const receipt = parseCombinedSettlementReceipt(await extractPayrollPdfText(bytes));
      if (!receipt || receipt.nif !== expectedNif || receipt.mes !== mes || receipt.anio !== anio) return NextResponse.json({ error: 'La identidad o el período de la liquidación no coinciden con el empleado' }, { status: 422 });
    } else {
      const text = documentText(bytes).toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (!text.includes(expectedNif)) return NextResponse.json({ error: 'La carta no acredita la identidad del empleado seleccionado' }, { status: 422 });
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const duplicate = await prisma.documentoEmpleado.findUnique({ where: { empleadoId_tipo_sha256: { empleadoId: id, tipo: String(tipo), sha256 } }, select: { id: true } });
    if (duplicate) return NextResponse.json({ ok: true, id: duplicate.id, yaExistia: true });
    const safeName = employee.nombreCompleto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');
    if (!safeName) return NextResponse.json({ error: 'Nombre de empleado no válido' }, { status: 422 });
    const name = tipo === 'LIQUIDACION' ? `LIQUIDACION INTERNET OPERADORES ${MONTHS[mes - 1]} ${anio} (${sha256.slice(0, 12)})_${safeName}.pdf` : `CARTA DESPIDO ${safeName} ${anio}.docx`;
    const folder = `4. Recursos Humanos/3. Nóminas/${anio}/${MONTHS[mes - 1]} ${anio}`;
    const personTokens = safeName.split(' ').filter(token => token.length >= 4);
    const personPattern = `(?:${personTokens.join('|')})`;
    const related = tipo === 'LIQUIDACION' ? new RegExp(`^(LIQUIDACION|LIQUIDACIÓN|FINIQUITO).*${personPattern}`, 'i') : new RegExp(`^(CARTA|COMUNICACION|COMUNICACIÓN).*${personPattern}`, 'i');
    const item = await savePrivateDriveDocument(folder, name, bytes, tipo === 'LIQUIDACION' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', related, tipo === 'LIQUIDACION');
    const record = await prisma.documentoEmpleado.create({ data: { empleadoId: employee.id, driveItemId: item.id, nombre: item.name, tipo: String(tipo), anio, mes, sha256, subidoPor: director.email }, select: { id: true } });
    return NextResponse.json({ ok: true, id: record.id, yaExistia: false }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('permiso para guardar')) return NextResponse.json({ error: 'Microsoft Graph permite leer, pero todavía no guardar archivos en esta carpeta. No se ha creado un vínculo falso.' }, { status: 503 });
    if (message.includes('mismo nombre')) return NextResponse.json({ error: 'Hay un archivo distinto con el mismo nombre: revisión manual antes de reemplazarlo' }, { status: 409 });
    if (message.includes('no coincide con ningún archivo')) return NextResponse.json({ error: 'La carta adjunta no es idéntica a la que ya está en la carpeta del mes de OneDrive. No se ha creado otra copia.' }, { status: 409 });
    if (message.includes('DOCX sin')) return NextResponse.json({ error: message }, { status: 422 });
    console.error('[empleado_documento] Falló la asociación o subida de un documento laboral', error instanceof Error ? error.name : 'Error');
    return NextResponse.json({ error: 'No se pudo verificar o asociar el documento. Revisa OneDrive antes de reintentar.' }, { status: 500 });
  }
}
