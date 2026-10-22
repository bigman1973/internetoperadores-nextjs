import { NextRequest,NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { privateJson, requireB4FinanceAccess } from '@/lib/finanzas/reconciliation-auth';
import { leerCandidatasNomina, NominasPropuestasReadError } from '@/lib/finanzas/nominas-propuestas-db';
import { bibliotecaFinancieraConfigurada } from '@/lib/finanzas/archivo-fuente-controlada';
import { descargarGraphPrivadoAcotado, DescargaPrivadaGraphError } from '@/lib/finanzas/descarga-privada-graph';
export const dynamic = 'force-dynamic';
/** Sólo lectura o descarga autorizada; preparar y confirmar siguen siendo acciones B4 separadas. */
export async function GET(req:NextRequest){
 try{
  const access=await requireB4FinanceAccess('lectura',await getServerSession(authOptions));
  if('response' in access)return access.response;
  const params=req.nextUrl.searchParams;
  if([...params.keys()].some(k=>!['movimientoId','periodo','archivoNominaId'].includes(k))||[...new Set(params.keys())].some(k=>params.getAll(k).length!==1))return privateJson({error:'Parámetros no válidos.'},400);
  const movimientoId=params.get('movimientoId')||'',periodo=params.get('periodo')||'';
  const data=await leerCandidatasNomina(movimientoId,periodo),sourceId=params.get('archivoNominaId');
  if(sourceId){
   const candidate=data.candidatasPeriodoParaGrupo.find(c=>c.sourceNominaId===sourceId);
   const match=candidate?.archivo?.downloadHref.match(/^\/api\/admin\/nominas\/download\/([A-Za-z0-9!_.~-]{4,220})$/);
   if(!match)return privateJson({error:'El archivo no pertenece a una nómina candidata del movimiento.'},404);
   const driveId=bibliotecaFinancieraConfigurada();
   if(!driveId)return privateJson({error:'Biblioteca privada no configurada.'},503);
   const bytes=await descargarGraphPrivadoAcotado(driveId,match[1]);
   const name=(candidate!.archivo!.nombre||'nomina.pdf').replace(/[\r\n"\\/]/g,' ').slice(0,180);
   return new NextResponse(new Uint8Array(bytes),{headers:{'Cache-Control':'private, no-store','Content-Type':'application/pdf','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(name)}`,'X-Content-Type-Options':'nosniff'}});
  }
  const fileDto=(c:typeof data.candidatasPeriodoParaGrupo[number])=>({...c,archivo:c.archivo?{...c.archivo,downloadHref:`/api/admin/finanzas/nominas-propuestas?${new URLSearchParams({movimientoId,periodo,archivoNominaId:c.sourceNominaId})}`}:null});
  return privateJson({...data,candidatasNetoExacto:data.candidatasNetoExacto.map(fileDto),candidatasPeriodoParaGrupo:data.candidatasPeriodoParaGrupo.map(fileDto)});
 }catch(error){
  if(error instanceof NominasPropuestasReadError)return privateJson({error:error.message,codigo:error.code},error.status);
  if(error instanceof DescargaPrivadaGraphError)return privateJson({error:'No se pudo recuperar el archivo privado.',codigo:error.code},error.code==='ARCHIVO_FUERA_DE_LIMITE'?413:502);
  return privateJson({error:'No se pudieron leer las candidatas de nómina.',codigo:'LECTURA_NOMINAS_FALLIDA'},500);
 }
}
export async function POST(){return privateJson({error:'Preparar y confirmar se realizan explícitamente en B4.'},405)}
export async function PUT(){return privateJson({error:'Método no permitido.'},405)}
export async function PATCH(){return privateJson({error:'Método no permitido.'},405)}
export async function DELETE(){return privateJson({error:'Método no permitido.'},405)}
