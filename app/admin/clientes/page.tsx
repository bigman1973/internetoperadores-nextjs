export const dynamic = "force-dynamic";

import { requireAuth } from '../../../lib/middleware/auth'
import prisma from '../../../lib/prisma'
import Link from 'next/link'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ClientesTable from '../../../components/admin/ClientesTable'
import SyncClientesButton from '../../../components/admin/SyncClientesButton'

interface SearchParams {
  search?: string
  newsletter?: string
  estado?: string
  tipo?: string
  municipio?: string
  page?: string
}

async function getClientes(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1')
  const pageSize = 30
  const skip = (page - 1) * pageSize

  // Por defecto filtrar solo activos
  const estadoFilter = searchParams.estado || 'activo'

  const where: any = {}
  
  // Filtro de estado (por defecto: activos)
  if (estadoFilter === 'activo') {
    where.activo = true
  } else if (estadoFilter === 'inactivo') {
    where.activo = false
  }
  // 'todos' no añade filtro

  if (searchParams.search) {
    where.OR = [
      { nombre: { contains: searchParams.search, mode: 'insensitive' } },
      { email: { contains: searchParams.search, mode: 'insensitive' } },
      { ispGestionId: { contains: searchParams.search, mode: 'insensitive' } },
      { nif: { contains: searchParams.search, mode: 'insensitive' } },
      { cif: { contains: searchParams.search, mode: 'insensitive' } },
      { telefono: { contains: searchParams.search, mode: 'insensitive' } },
      { movil: { contains: searchParams.search, mode: 'insensitive' } },
      { municipio: { contains: searchParams.search, mode: 'insensitive' } },
      { nombreComercial: { contains: searchParams.search, mode: 'insensitive' } },
    ]
  }

  if (searchParams.newsletter === 'suscrito') {
    where.newsletterSuscrito = true
  } else if (searchParams.newsletter === 'no_suscrito') {
    where.newsletterSuscrito = false
  }

  if (searchParams.tipo === 'fisica') {
    where.personaFisica = true
  } else if (searchParams.tipo === 'juridica') {
    where.personaFisica = false
  }

  if (searchParams.municipio) {
    where.municipio = { contains: searchParams.municipio, mode: 'insensitive' }
  }

  const [clientes, total, totalActivos, totalInactivos] = await Promise.all([
    prisma.clienteWeb.findMany({
      where,
      orderBy: { nombre: 'asc' },
      skip,
      take: pageSize,
    }),
    prisma.clienteWeb.count({ where }),
    prisma.clienteWeb.count({ where: { activo: true } }),
    prisma.clienteWeb.count({ where: { activo: false } }),
  ])

  const totalPages = Math.ceil(total / pageSize)
  return { clientes, total, page, totalPages, totalActivos, totalInactivos }
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth('admin')
  const resolvedSearchParams = await searchParams
  const { clientes, total, page, totalPages, totalActivos, totalInactivos } = await getClientes(resolvedSearchParams)
  const estadoActual = resolvedSearchParams.estado || 'activo'

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona los clientes registrados en la plataforma
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-x-3">
          <SyncClientesButton />
          <Link
            href="/admin/clientes/nuevo"
            className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
          >
            <PlusIcon className="h-5 w-5" />
            Nuevo Cliente
          </Link>
        </div>
      </div>

      {/* Tarjetas de estadísticas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg bg-white shadow border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-500">Total Clientes</p>
          <p className="text-2xl font-bold text-gray-900">{totalActivos + totalInactivos}</p>
        </div>
        <div className="rounded-lg bg-white shadow border border-green-200 p-4">
          <p className="text-sm font-medium text-green-600">Activos</p>
          <p className="text-2xl font-bold text-green-700">{totalActivos}</p>
        </div>
        <div className="rounded-lg bg-white shadow border border-red-200 p-4">
          <p className="text-sm font-medium text-red-600">Dados de Baja</p>
          <p className="text-2xl font-bold text-red-700">{totalInactivos}</p>
        </div>
      </div>

      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <form method="get" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                    placeholder="Nombre, email, NIF, CIF, teléfono, municipio..."
                    className="block w-full rounded-md border-gray-300 pl-10 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="estado" className="block text-sm font-medium text-gray-700">Estado</label>
                <select
                  id="estado"
                  name="estado"
                  defaultValue={estadoActual}
                  className="mt-1 block w-full rounded-md border-gray-300 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="activo">Solo Activos</option>
                  <option value="inactivo">Solo Dados de Baja</option>
                  <option value="todos">Todos</option>
                </select>
              </div>
              <div>
                <label htmlFor="tipo" className="block text-sm font-medium text-gray-700">Tipo</label>
                <select
                  id="tipo"
                  name="tipo"
                  defaultValue={resolvedSearchParams.tipo}
                  className="mt-1 block w-full rounded-md border-gray-300 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="">Todos</option>
                  <option value="fisica">Persona Física</option>
                  <option value="juridica">Persona Jurídica</option>
                </select>
              </div>
              <div>
                <label htmlFor="newsletter" className="block text-sm font-medium text-gray-700">Newsletter</label>
                <select
                  id="newsletter"
                  name="newsletter"
                  defaultValue={resolvedSearchParams.newsletter}
                  className="mt-1 block w-full rounded-md border-gray-300 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="">Todos</option>
                  <option value="suscrito">Suscritos</option>
                  <option value="no_suscrito">No suscritos</option>
                </select>
              </div>
            </div>
            <div className="flex gap-x-3">
              <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-orange-500">Aplicar Filtros</button>
              <Link href="/admin/clientes" className="bg-white text-gray-900 px-4 py-2 rounded-md text-sm font-semibold ring-1 ring-gray-300 hover:bg-gray-50">Limpiar</Link>
            </div>
          </form>
        </div>
      </div>

      <ClientesTable clientes={clientes} />

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg bg-white shadow border border-gray-200 px-4 py-3">
          <p className="text-sm text-gray-700">
            Mostrando <span className="font-medium">{(page - 1) * 30 + 1}</span> a{' '}
            <span className="font-medium">{Math.min(page * 30, total)}</span> de{' '}
            <span className="font-medium">{total}</span> clientes
          </p>
          <div className="flex gap-x-2">
            {page > 1 && (
              <Link
                href={`/admin/clientes?${new URLSearchParams({ ...resolvedSearchParams, page: (page - 1).toString() }).toString()}`}
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
              >
                Anterior
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/admin/clientes?${new URLSearchParams({ ...resolvedSearchParams, page: (page + 1).toString() }).toString()}`}
                className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-gray-300 hover:bg-gray-50"
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
