import Link from 'next/link'
import {
  BookOpenIcon, ChatBubbleLeftRightIcon, ChartBarIcon, DocumentTextIcon,
  InboxStackIcon, LightBulbIcon, SparklesIcon, Cog6ToothIcon,
} from '@heroicons/react/24/outline'
import prisma from '@/lib/prisma'
import { exigirPaginaAsistente } from '@/lib/asistente/admin-auth'
import { getAssistantRuntime } from '@/lib/asistente/config'

export const dynamic = 'force-dynamic'

async function obtenerResumen() {
  const desde = new Date()
  desde.setDate(desde.getDate() - 7)
  const [conversaciones7d, mensajesSinFuente, escaladosPendientes, leadsNuevos, publicados, borradores, huecosNuevos, runtime] = await Promise.all([
    prisma.asistenteConversacion.count({ where: { createdAt: { gte: desde } } }),
    prisma.asistenteMensaje.count({ where: { sinFuente: true } }),
    prisma.asistenteEscalado.count({ where: { estado: 'PENDIENTE' } }),
    prisma.asistenteLead.count({ where: { estado: 'NUEVO' } }),
    prisma.asistenteDocumento.count({ where: { estado: 'PUBLICADO' } }),
    prisma.asistenteDocumento.count({ where: { estado: 'BORRADOR' } }),
    prisma.asistenteHueco.count({ where: { estado: 'NUEVO' } }),
    getAssistantRuntime(),
  ])
  return { conversaciones7d, mensajesSinFuente, escaladosPendientes, leadsNuevos, publicados, borradores, huecosNuevos, runtime }
}

const accesos = [
  { href: '/admin/asistente/chat', titulo: 'Chat interno', texto: 'Consulta la base de conocimiento con citas.', icono: ChatBubbleLeftRightIcon },
  { href: '/admin/asistente/conocimiento', titulo: 'Conocimiento', texto: 'Gestiona documentos, FAQ y páginas públicas.', icono: BookOpenIcon },
  { href: '/admin/asistente/conversaciones', titulo: 'Conversaciones', texto: 'Revisa mensajes anonimizados y valoraciones.', icono: ChartBarIcon },
  { href: '/admin/asistente/leads', titulo: 'Leads y escalados', texto: 'Prioriza solicitudes con consentimiento.', icono: InboxStackIcon },
  { href: '/admin/asistente/aprendizaje', titulo: 'Aprendizaje', texto: 'Convierte huecos en mejoras revisables.', icono: LightBulbIcon },
  { href: '/admin/asistente/informes', titulo: 'Informes y propuestas', texto: 'Consulta los resúmenes operativos.', icono: DocumentTextIcon },
  { href: '/admin/asistente/configuracion', titulo: 'Configuración', texto: 'Ajusta modo, tono y horario.', icono: Cog6ToothIcon },
]

function etiquetaModo(modo: string) {
  return modo === 'local' ? 'Local' : modo === 'extractivo' ? 'Extractivo' : 'Desactivado'
}

export default async function ResumenAsistentePage() {
  await exigirPaginaAsistente('admin.asistente')
  const resumen = await obtenerResumen()
  const tarjetas = [
    { etiqueta: 'Conversaciones (7 días)', valor: resumen.conversaciones7d, href: '/admin/asistente/conversaciones' },
    { etiqueta: 'Mensajes sin fuente', valor: resumen.mensajesSinFuente, href: '/admin/asistente/conversaciones?sinFuente=si' },
    { etiqueta: 'Escalados pendientes', valor: resumen.escaladosPendientes, href: '/admin/asistente/leads#escalados' },
    { etiqueta: 'Leads nuevos', valor: resumen.leadsNuevos, href: '/admin/asistente/leads' },
    { etiqueta: 'Documentos publicados', valor: resumen.publicados, href: '/admin/asistente/conocimiento?estado=PUBLICADO' },
    { etiqueta: 'Documentos en borrador', valor: resumen.borradores, href: '/admin/asistente/conocimiento?estado=BORRADOR' },
    { etiqueta: 'Huecos nuevos', valor: resumen.huecosNuevos, href: '/admin/asistente/aprendizaje' },
  ]

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-7 w-7 text-orange-600" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-gray-900">Asistente IA</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">Resumen operativo y acceso a las herramientas del asistente privado.</p>
        </div>
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 sm:mt-0">
          <p className="text-xs font-medium uppercase tracking-wide text-orange-800">Modo efectivo</p>
          <p className="mt-1 text-lg font-bold text-orange-700">{etiquetaModo(resumen.runtime.modo)}</p>
        </div>
      </div>

      <div className="grid min-h-[108px] grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {tarjetas.map((tarjeta) => (
          <Link key={tarjeta.etiqueta} href={tarjeta.href} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2">
            <p className="text-xs font-medium text-gray-500">{tarjeta.etiqueta}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{tarjeta.valor}</p>
          </Link>
        ))}
      </div>

      <section aria-labelledby="avisos-asistente" className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <h2 id="avisos-asistente" className="text-sm font-semibold text-amber-900">Avisos de activación</h2>
        <ul className="mt-2 space-y-1 text-sm text-amber-900">
          <li>Widget público: {resumen.runtime.publicEnabled ? 'activo' : 'desactivado'}</li>
          <li>Espacio Cliente: {resumen.runtime.clientEnabled ? 'activo' : 'desactivado'}</li>
        </ul>
      </section>

      <section aria-labelledby="herramientas-asistente">
        <h2 id="herramientas-asistente" className="text-lg font-semibold text-gray-900">Herramientas</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {accesos.map((acceso) => {
            const Icono = acceso.icono
            return (
              <Link key={acceso.href} href={acceso.href} className="flex min-h-[116px] gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-orange-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2">
                <Icono className="h-6 w-6 shrink-0 text-orange-600" aria-hidden="true" />
                <span>
                  <span className="block font-semibold text-gray-900">{acceso.titulo}</span>
                  <span className="mt-1 block text-sm text-gray-600">{acceso.texto}</span>
                </span>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
