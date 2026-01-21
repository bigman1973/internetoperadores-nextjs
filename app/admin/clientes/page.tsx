import { requireAuth } from '@/lib/middleware/auth'
import prisma from '@/lib/prisma'
import Link from 'next/link'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ClientesTable from '@/components/admin/ClientesTable'

interface SearchParams {
  search?: string
  newsletter?: string
  page?: string
}

async function getClientes(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1')
  const pageSize = 20
  const skip = (page - 1) * pageSize

  // Construir filtros
  const where: any = {}

  if (searchParams.search) {
    where.OR = [
      {
        nombre: {
          contains: searchParams.search,
        },
      },
      {
        email: {
          contains: searchParams.search,
        },
      },
      {
        ispGestionId: {
          contains: searchParams.search,
        },
      },
    ]
  }

  if (searchParams.newsletter === 'suscrito') {
    where.newsletterSuscrito = true
  } else if (searchParams.newsletter === 'no_suscrito') {
    where.newsletterSuscrito = false
  }

  // Obtener clientes y total
  const [clientes, total] = await Promise.all([
    prisma.clienteWeb.findMany({
      where,
      orderBy: [
        { createdAt: 'desc' },
      ],
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
  const session = await requireAuth('admin')
  const resolvedSearchParams = await searchParams
  const { clientes, total, page, totalPages } = await getClientes(resolvedSearchParams)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestiona los clientes registrados en la plataforma ({total} clientes)
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/admin/clientes/nuevo"
            className="inline-flex items-center gap-x-2 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
          >
            <PlusIcon className="h-5 w-5" />
            Nuevo Cliente
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <form method="get" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Search */}
              <div>
                <label htmlFor="search" className="block text-sm font-medium text-gray-700">
                  Buscar
                </label>
                <div className="relative mt-1">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    name="search"
                    id="search"
                    defaultValue={resolvedSearchParams.search}
                    placeholder="Nombre, email o ID ISPGestión..."
                    className="block w-full rounded-md border-gray-300 pl-10 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                  />
                </div>
              </div>

              {/* Newsletter */}
              <div>
                <label htmlFor="newsletter" className="block text-sm font-medium text-gray-700">
                  Newsletter
                </label>
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
              <button
                type="submit"
                className="inline-flex items-center rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
              >
                Aplicar Filtros
              </button>
              <Link
                href="/admin/clientes"
                className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                Limpiar
              </Link>
            </div>
          </form>
        </div>
      </div>

      {/* Table */}
      <ClientesTable clientes={clientes} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 sm:px-6 rounded-lg shadow">
          <div className="flex flex-1 justify-between sm:hidden">
            <Link
              href={`/admin/clientes?page=${page - 1}`}
              className={`relative inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                page === 1
                  ? 'pointer-events-none text-gray-400'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Anterior
            </Link>
            <Link
              href={`/admin/clientes?page=${page + 1}`}
              className={`relative ml-3 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${
                page === totalPages
                  ? 'pointer-events-none text-gray-400'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              Siguiente
            </Link>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Mostrando <span className="font-medium">{(page - 1) * 20 + 1}</span> a{' '}
                <span className="font-medium">{Math.min(page * 20, total)}</span> de{' '}
                <span className="font-medium">{total}</span> resultados
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                  <Link
                    key={p}
                    href={`/admin/clientes?page=${p}`}
                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${
                      p === page
                        ? 'z-10 bg-orange-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600'
                        : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {p}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
