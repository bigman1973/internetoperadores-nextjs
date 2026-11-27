import { NextResponse } from 'next/server';
import { assertIspReadRequest } from '@/lib/ispgestion/service';
export const dynamic = 'force-dynamic';

// El perímetro/ACL existente sigue vigente. Este handler no acepta ninguna mutación ISP.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['endpoint', 'method', 'data', 'params'].includes(key))) {
      return NextResponse.json({ error: 'Petición ISP no admitida.', code: 'ISP_REMOTE_READ_ONLY' }, { status: 409 });
    }
    const { endpoint, method = 'GET', data = null, params = null } = body;
    assertIspReadRequest(endpoint, method, data, params);
    const apiUrl = (process.env.ISPGESTION_API_URL || 'https://internetoperadores.ispgestion.com/api').replace(/\/$/, '');
    const apiUser = process.env.ISPGESTION_API_USER || 'VOLA';
    const apiPassword = process.env.ISPGESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
    const url = new URL(`${apiUrl}/${endpoint}`);
    for (const [key, value] of Object.entries(params || {})) url.searchParams.set(key, String(value));
    const response = await fetch(url.toString(), {
      method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${apiUser}:${apiPassword}`).toString('base64')}` },
    });
    if (!response.ok) return NextResponse.json({ error: 'No se pudo leer ISP.', code: 'ISP_REMOTE_READ_FAILED' }, { status: 502 });
    const result = await response.json();
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error: any) {
    if (error?.code === 'ISP_REMOTE_READ_ONLY') return NextResponse.json({ error: 'La conexión ISP sólo permite lecturas revisadas.', code: error.code }, { status: 409 });
    return NextResponse.json({ error: 'No se pudo leer ISP.', code: 'ISP_REMOTE_READ_FAILED' }, { status: 502 });
  }
}
export async function GET() {
  return NextResponse.json({ status: 'ok', readOnly: true, message: 'Proxy ISP de sólo lectura.' });
}
