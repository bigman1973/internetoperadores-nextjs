import { exigirAdminAsistente } from '@/lib/asistente/admin-auth'
import { jsonPrivado } from '@/lib/asistente/http'
import { obtenerMetricasAnalitica, rangoAnalitica } from '@/lib/asistente/analitica'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const acceso = await exigirAdminAsistente('admin.asistente.analitica', 'lectura')
  if ('response' in acceso) return acceso.response
  const url = new URL(req.url)
  try {
    const rango = rangoAnalitica(url.searchParams.get('desde'), url.searchParams.get('hasta'))
    return jsonPrivado(await obtenerMetricasAnalitica(rango))
  } catch (error) {
    const mensaje = error instanceof Error && error.message === 'RANGO_NO_VALIDO' ? 'El periodo debe estar entre 1 y 90 días' : 'Fechas no válidas'
    return jsonPrivado({ error: mensaje }, 400)
  }
}
