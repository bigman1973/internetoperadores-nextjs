import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { assertAutomationEnabled, runRentabilidadDaily } from '@/lib/rentabilidad/automation';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function GET(request:NextRequest) {
  const headers={'Cache-Control':'private, no-store'};
  try { assertAutomationEnabled(); } catch { return NextResponse.json({error:'Rentabilidad no está habilitada en este entorno.'},{status:404,headers}); }
  const expected=process.env.CRON_SECRET,actual=request.headers.get('authorization')||'';
  if(!expected||Buffer.byteLength(actual)!==Buffer.byteLength(`Bearer ${expected}`)||!timingSafeEqual(Buffer.from(actual),Buffer.from(`Bearer ${expected}`)))return NextResponse.json({error:'No autorizado.'},{status:401,headers});
  const actorId=Number(process.env.RENTABILIDAD_SYSTEM_ACTOR_ID);
  if(!Number.isSafeInteger(actorId)||actorId<=0)return NextResponse.json({error:'Falta configurar el superadmin responsable del proceso.'},{status:503,headers});
  try { return NextResponse.json(await runRentabilidadDaily(actorId),{headers}); }
  catch { return NextResponse.json({error:'No se pudo completar el proceso. Revisa el estado en Rentabilidad.'},{status:500,headers}); }
}
