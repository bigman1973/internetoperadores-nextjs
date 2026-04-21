export const dynamic = "force-dynamic";

import { requireAuth } from '../../../lib/middleware/auth'
import { prisma } from '../../../lib/prisma'
import Link from 'next/link'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ContratosTable from '../../../components/admin/ContratosTable'
import SyncContratosButton from '../../../components/admin/SyncContratosButton'

interface SearchParams {
  search?: string
  estado?: string
  page?: string
}

async function getContratos(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1')
  const pageSize = 30
  const offset = (page - 1) * pageSize

  let whereClause = 'WHERE 1=1'
  const params: any[] = []
  let paramIndex = 1

  if (searchParams.search) {
    whereClause += ` AND (titulo ILIKE $${paramIndex} OR tarifa ILIKE $${paramIndex} OR cliente_id ILIKE $${paramIndex} OR telefonos_contrato ILIKE $${paramIndex})`
    params.push(`%${searchParams.search}%`)
    paramIndex++
  }

  if (searchParams.estado === 'activo') {
    whereClause += ` AND activo = true`
  } else if (searchParams.estado === 'baja') {
    whereClause += ` AND activo = false`
  }

  const [contratos, countResult, statsResult]: any = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT * FROM contratos_servicio ${whereClause} ORDER BY activo DESC, fecha_inicio DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      ...params, pageSize, offset
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int as count FROM contratos_servicio ${whereClause}`,
      ...params
    ),
    prisma.$queryRawUnsafe(
      `SELECT 
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE activo = true)::int as activos,
        COUNT(*) FILTER (WHERE activo = false)::int as bajas,
        COALESCE(SUM(precio) FILTER (WHERE activo = true), 0) as facturacion_mensual
      FROM contratos_servicio`
    )
  ])

  const total = countResult[0]?.count || 0
  const stats = statsResult[0] || { total: 0, activos: 0, bajas: 0, facturacion_mensual: 0 }
  const totalPages = Math.ceil(total / pageSize)

  return { contratos, total, page, totalPages, stats }
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth('admin')
  const resolvedSearchParams = await searchParams
  const { contratos, total, page, totalPages, stats } = await getContratos(resolvedSearchParams)

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contratos / Servicios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Servicios contratados sincronizados desde ISP Gestión ({total} contratos)
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-x-3">
          <SyncContratosButton />
        </div>
      </div>

      {/* Estadísticas */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-4">
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-5">
          <dt className="text-sm font-medium text-gray-500">Total Contratos</dt>
          <dd className="mt-1 text-3xl font-semibold text-gray-900">{stats.total}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-5">
          <dt className="text-sm font-medium text-gray-500">Activos</dt>
          <dd className="mt-1 text-3xl font-semibold text-green-600">{stats.activos}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-5">
          <dt className="text-sm font-medium text-gray-500">Dados de Baja</dt>
          <dd className="mt-1 text-3xl font-semibold text-red-600">{stats.bajas}</dd>
        </div>
        <div className="rounded-lg bg-white shadow border border-gray-200 px-4 py-5">
          <dt className="text-sm font-medium text-gray-500">Facturación Mensual (sin IVA)</dt>
          <dd className="mt-1 text-3xl font-semibold text-orange-600">
            {Number(stats.facturacion_mensual).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€
          </dd>
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <form method="get" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label htmlFor="search" className="block text-sm font-medium text-gray-700">Buscar</label>
                <div className="relative mt-1">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="search"
                    id="search"
                    defaultValue={resolvedSearchParams.search}
                    placeholder="Título, tarifa, cliente ID o teléfono..."
                    className="block w-full rounded-md border-gray-300 pl-10 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="estado" className="block text-sm font-medium text-gray-700">Estado</label>
                <select
                  id="estado"
                  name="estado"
                  defaultValue={resolvedSearchParams.estado}
                  className="mt-1 block w-full rounded-md border-gray-300 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="">Todos</option>
                  <option value="activo">Activos</option>
                  <option value="baja">Dados de Baja</option>
                </select>
              </div>
            </div>
            <div className="flex gap-x-3">
              <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-semibold">Aplicar Filtros</button>
              <Link href="/admin/contratos" className="bg-white text-gray-900 px-4 py-2 rounded-md text-sm font-semibold ring-1 ring-gray-300">Limpiar</Link>
            </div>
          </form>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-lg bg-white shadow border border-gray-200 overflow-hidden">
        <ContratosTable contratos={contratos} />
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">
            Página {page} de {totalPages} ({total} contratos)
          </p>
          <div className="flex gap-x-2">
            {page > 1 && (
              <Link
                href={`/admin/contratos?page=${page - 1}${resolvedSearchParams.search ? `&search=${resolvedSearchParams.search}` : ''}${resolvedSearchParams.estado ? `&estado=${resolvedSearchParams.estado}` : ''}`}
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/contratos?page=${page + 1}${resolvedSearchParams.search ? `&search=${resolvedSearchParams.search}` : ''}${resolvedSearchParams.estado ? `&estado=${resolvedSearchParams.estado}` : ''}`}
                className="rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
              >
                Siguiente
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
