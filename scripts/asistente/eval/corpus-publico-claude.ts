import { indexarFuente } from '@/lib/asistente/ingesta'
import { extraerCorpusPublicoLocal } from '@/lib/asistente/web-corpus'
import { fuenteAptaParaPublico } from '@/lib/asistente/public-policy'

/** Usa exactamente los capítulos editoriales del manifiesto productivo, no un corpus simplificado. */
export async function cargarCorpusPublicoClaude(): Promise<{ faq: number; paginasPublicas: number; fuentesInternas: number; tarifasDinamicas: number }> {
  const fuentes = (await extraerCorpusPublicoLocal()).filter(fuenteAptaParaPublico)
  for (const fuente of fuentes) await indexarFuente(fuente, undefined, { espacio: 'PUBLICO', estado: 'PUBLICADO' })
  return {
    faq: fuentes.filter(fuente => fuente.tipo === 'FAQ').length,
    paginasPublicas: fuentes.filter(fuente => fuente.tipo !== 'FAQ').length,
    fuentesInternas: 0,
    tarifasDinamicas: 0,
  }
}
