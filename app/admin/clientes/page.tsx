export const dynamic = "force-dynamic";

import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ClientesTable from '@/components/admin/ClientesTable'
import SyncClientesButton from '@/components/admin/SyncClientesButton'

interface SearchParams {
  search?: string
  newsletter?: string
  page?: string
}

async function getClientes(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1')
  const pageSize = 20
  const skip = (page - 1) * pageSize

  const where: any = {}
  if (searchParams.search) {
    where.OR = [
      { nombre: { contains: searchParams.search, mode: 'insensitive' } },
      { email: { contains: searchParams.search, mode: 'insensitive' } },
      { ispGestionId: { contains: searchParams.search, mode: 'insensitive' } },
    ]
  }

  if (searchParams.newsletter === 'suscrito') {
    where.newsletterSuscrito = true
  } else if (searchParams.newsletter === 'no_suscrito') {
    where.newsletterSuscrito = false
  }

  const [clientes, total] = await Promise.all([
    prisma.clienteWeb.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
    prisma.clienteWeb.count({ where }),
  ])

  const totalPages = Math.ceil(total / pageSize)
  return { clientes, total, page, totalPages }
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth('admin')
  const resolvedSearchParams = await searchParams
  const { clientes, total, page, totalPages } = await getClientes(resolvedSearchParams)

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona los clientes registrados en la plataforma ({total} clientes)
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
                    placeholder="Nombre, email o ID..."
                    className="block w-full rounded-md border-gray-300 pl-10 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                  />
                </div>
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
              <button type="submit" className="bg-orange-600 text-white px-4 py-2 rounded-md text-sm font-semibold">Aplicar Filtros</button>
              <Link href="/admin/clientes" className="bg-white text-gray-900 px-4 py-2 rounded-md text-sm font-semibold ring-1 ring-gray-300">Limpiar</Link>
            </div>
          </form>
        </div>
      </div>

      <ClientesTable clientes={clientes} />
    </div>
  )
}
