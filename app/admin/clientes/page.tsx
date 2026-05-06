export const dynamic = "force-dynamic";

import { requireAuth } from '../../../lib/middleware/auth'
import prisma from '../../../lib/prisma'
import Link from 'next/link'
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import ClientesTable from '../../../components/admin/ClientesTable'
import SyncClientesButton from '../../../components/admin/SyncClientesButton'
import { Prisma } from '@prisma/client'

interface SearchParams {
  search?: string
  newsletter?: string
  estado?: string
  tipo?: string
  municipio?: string
  page?: string
  facturacion?: string
}

async function getClientes(searchParams: SearchParams) {
  const page = parseInt(searchParams.page || '1')
  const pageSize = 30
  const skip = (page - 1) * pageSize
  const estadoFilter = searchParams.estado || 'activo'
  const facturacionFilter = searchParams.facturacion || ''

  // Si hay filtro de facturación, necesitamos obtener primero los clienteIdIsp que cumplen el criterio
  let clienteIdIspFiltrados: string[] | null = null

  if (facturacionFilter && facturacionFilter !== '') {
    if (facturacionFilter === 'nada') {
      // Clientes SIN contratos activos: obtener todos los clienteId que SÍ tienen contratos
      const clientesConContratos = await prisma.contratoServicio.findMany({
        where: { activo: true },
        select: { clienteId: true },
        distinct: ['clienteId'],
      })
      const idsConContratos = new Set(clientesConContratos.map(c => c.clienteId))
      
      // Obtener todos los clientes y filtrar los que NO tienen contratos
      const todosClientes = await prisma.clienteWeb.findMany({
        where: estadoFilter === 'activo' ? { activo: true } : estadoFilter === 'inactivo' ? { activo: false } : {},
        select: { clienteIdIsp: true },
      })
      clienteIdIspFiltrados = todosClientes
        .filter(c => c.clienteIdIsp && !idsConContratos.has(c.clienteIdIsp))
        .map(c => c.clienteIdIsp!)
    } else if (facturacionFilter === 'mensual') {
      // Clientes con contratos mensuales (periodicidad = 1 y NO anual en concepto)
      const contratosResult = await prisma.contratoServicio.findMany({
        where: { activo: true },
        select: { clienteId: true, tarifa: true, conceptoFacturacion: true, titulo: true },
      })
      const tarifaNombres = [...new Set(contratosResult.map(c => c.tarifa))]
      const tarifas = await prisma.tarifa.findMany({
        where: { nombre: { in: tarifaNombres }, activa: true },
        select: { nombre: true, tipoPeriodicidad: true },
      })
      const tarifaMap = new Map(tarifas.map(t => [t.nombre, t.tipoPeriodicidad || 1]))
      
      const idsSet = new Set<string>()
      for (const c of contratosResult) {
        const periodicidad = tarifaMap.get(c.tarifa)
        const conceptoUpper = (c.conceptoFacturacion || '').toUpperCase()
        const tituloUpper = (c.titulo || '').toUpperCase()
        const esAnual = periodicidad === 12 || conceptoUpper.includes('ANUAL') || conceptoUpper.includes('[YEAR_FACTURACION]') || tituloUpper.includes('ANUAL')
        if (!esAnual) {
          idsSet.add(c.clienteId)
        }
      }
      clienteIdIspFiltrados = [...idsSet]
    } else if (facturacionFilter === 'anual') {
      const contratosResult = await prisma.contratoServicio.findMany({
        where: { activo: true },
        select: { clienteId: true, tarifa: true, conceptoFacturacion: true, titulo: true },
      })
      const tarifaNombres = [...new Set(contratosResult.map(c => c.tarifa))]
      const tarifas = await prisma.tarifa.findMany({
        where: { nombre: { in: tarifaNombres }, activa: true },
        select: { nombre: true, tipoPeriodicidad: true },
      })
      const tarifaMap = new Map(tarifas.map(t => [t.nombre, t.tipoPeriodicidad || 1]))
      
      const idsSet = new Set<string>()
      for (const c of contratosResult) {
        const periodicidad = tarifaMap.get(c.tarifa)
        const conceptoUpper = (c.conceptoFacturacion || '').toUpperCase()
        const tituloUpper = (c.titulo || '').toUpperCase()
        const esAnual = periodicidad === 12 || conceptoUpper.includes('ANUAL') || conceptoUpper.includes('[YEAR_FACTURACION]') || tituloUpper.includes('ANUAL')
        if (esAnual) {
          idsSet.add(c.clienteId)
        }
      }
      clienteIdIspFiltrados = [...idsSet]
    } else if (facturacionFilter === 'puntual') {
      // Clientes con facturas INST en 2026
      const facturasInst = await prisma.factura.findMany({
        where: { serieFactura: 'INST', ejercicio: 2026 },
        select: { idCliente: true },
        distinct: ['idCliente'],
      })
      const ispIds = facturasInst.map(f => f.idCliente)
      // Convertir ispGestionId a clienteIdIsp
      const clientesMap = await prisma.clienteWeb.findMany({
        where: { ispGestionId: { in: ispIds.map(String) } },
        select: { clienteIdIsp: true },
      })
      clienteIdIspFiltrados = clientesMap.filter(c => c.clienteIdIsp).map(c => c.clienteIdIsp!)
    }
  }

  const where: any = {}
  
  if (estadoFilter === 'activo' || estadoFilter === 'activo_con_fact' || estadoFilter === 'activo_sin_fact') {
    where.activo = true
  } else if (estadoFilter === 'inactivo') {
    where.activo = false
  }

  // Filtro de activos con/sin facturación
  if (estadoFilter === 'activo_con_fact' || estadoFilter === 'activo_sin_fact') {
    const clientesConContratos = await prisma.contratoServicio.findMany({
      where: { activo: true },
      select: { clienteId: true },
      distinct: ['clienteId'],
    })
    const idsConContratos = new Set(clientesConContratos.map(c => c.clienteId))

    const todosClientesActivos = await prisma.clienteWeb.findMany({
      where: { activo: true },
      select: { clienteIdIsp: true },
    })

    if (estadoFilter === 'activo_con_fact') {
      const idsConFact = todosClientesActivos
        .filter(c => c.clienteIdIsp && idsConContratos.has(c.clienteIdIsp))
        .map(c => c.clienteIdIsp!)
      if (idsConFact.length === 0) {
        return { clientes: [], total: 0, page: 1, totalPages: 0, totalActivos: 0, totalInactivos: 0 }
      }
      // Combinar con filtro de facturación si existe
      if (where.clienteIdIsp) {
        const existingIds = new Set(where.clienteIdIsp.in as string[])
        where.clienteIdIsp = { in: idsConFact.filter((id: string) => existingIds.has(id)) }
      } else {
        where.clienteIdIsp = { in: idsConFact }
      }
    } else {
      const idsSinFact = todosClientesActivos
        .filter(c => c.clienteIdIsp && !idsConContratos.has(c.clienteIdIsp))
        .map(c => c.clienteIdIsp!)
      // También incluir clientes sin clienteIdIsp
      const idsSinClienteIdIsp = todosClientesActivos
        .filter(c => !c.clienteIdIsp)
        .map(() => '')
      if (idsSinFact.length === 0) {
        // Solo clientes sin clienteIdIsp
        where.clienteIdIsp = null
      } else {
        where.OR = [
          ...(where.OR || []),
        ]
        // Simplificar: usar clienteIdIsp in para los sin facturación
        if (where.clienteIdIsp) {
          const existingIds = new Set(where.clienteIdIsp.in as string[])
          where.clienteIdIsp = { in: idsSinFact.filter((id: string) => existingIds.has(id)) }
        } else {
          where.clienteIdIsp = { in: idsSinFact }
        }
      }
    }
  }

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

  // Aplicar filtro de facturación al where
  if (clienteIdIspFiltrados !== null) {
    if (clienteIdIspFiltrados.length === 0) {
      // No hay clientes que cumplan el filtro
      return { clientes: [], total: 0, page: 1, totalPages: 0, totalActivos: 0, totalInactivos: 0 }
    }
    where.clienteIdIsp = { in: clienteIdIspFiltrados }
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

  // Obtener los clienteIdIsp de los clientes de esta página
  const clienteIds = clientes
    .map(c => c.clienteIdIsp)
    .filter((id): id is string => id !== null && id !== undefined)

  // Obtener contratos activos con precio para calcular importes
  const contratos = clienteIds.length > 0
    ? await prisma.contratoServicio.findMany({
        where: {
          clienteId: { in: clienteIds },
          activo: true,
        },
        select: {
          clienteId: true,
          tarifa: true,
          titulo: true,
          conceptoFacturacion: true,
          precio: true,
          importeRemesar: true,
        },
      })
    : []

  // Obtener las tarifas únicas para saber su periodicidad
  const tarifaNombres = [...new Set(contratos.map(c => c.tarifa))]
  const tarifas = tarifaNombres.length > 0
    ? await prisma.tarifa.findMany({
        where: {
          nombre: { in: tarifaNombres },
          activa: true,
        },
        select: {
          nombre: true,
          tipoPeriodicidad: true,
        },
      })
    : []

  const tarifaPeriodicidadMap = new Map(tarifas.map(t => [t.nombre, t.tipoPeriodicidad || 1]))

  // Obtener facturas puntuales (serie INST) de estos clientes con total
  const ispGestionIds = clientes
    .map(c => parseInt(c.ispGestionId))
    .filter(id => !isNaN(id))

  const facturasPuntuales = ispGestionIds.length > 0
    ? await prisma.factura.findMany({
        where: {
          idCliente: { in: ispGestionIds },
          serieFactura: { in: ['INST'] },
          ejercicio: 2026,
        },
        select: {
          idCliente: true,
          serieFactura: true,
          total: true,
        },
      })
    : []

  // Construir mapa de tipos de facturación con importes
  const tiposFacturacionMap: Record<string, { 
    mensual: boolean; anual: boolean; puntual: boolean;
    importeMensual: number; importeAnual: number; importePuntual: number;
  }> = {}

  const initTipos = () => ({ 
    mensual: false, anual: false, puntual: false,
    importeMensual: 0, importeAnual: 0, importePuntual: 0,
  })

  // Procesar contratos
  for (const contrato of contratos) {
    if (!tiposFacturacionMap[contrato.clienteId]) {
      tiposFacturacionMap[contrato.clienteId] = initTipos()
    }

    const periodicidad = tarifaPeriodicidadMap.get(contrato.tarifa)
    const conceptoUpper = (contrato.conceptoFacturacion || '').toUpperCase()
    const tituloUpper = (contrato.titulo || '').toUpperCase()
    const precio = Number(contrato.precio) || 0

    if (periodicidad === 12 ||
        conceptoUpper.includes('ANUAL') ||
        conceptoUpper.includes('[YEAR_FACTURACION]') ||
        tituloUpper.includes('ANUAL')) {
      tiposFacturacionMap[contrato.clienteId].anual = true
      tiposFacturacionMap[contrato.clienteId].importeAnual += precio
    } else {
      tiposFacturacionMap[contrato.clienteId].mensual = true
      tiposFacturacionMap[contrato.clienteId].importeMensual += precio
    }
  }

  // Procesar facturas puntuales
  const ispToClienteIdMap = new Map(
    clientes
      .filter(c => c.clienteIdIsp)
      .map(c => [parseInt(c.ispGestionId), c.clienteIdIsp!])
  )

  for (const factura of facturasPuntuales) {
    const clienteIdIsp = ispToClienteIdMap.get(factura.idCliente)
    if (clienteIdIsp) {
      if (!tiposFacturacionMap[clienteIdIsp]) {
        tiposFacturacionMap[clienteIdIsp] = initTipos()
      }
      tiposFacturacionMap[clienteIdIsp].puntual = true
      tiposFacturacionMap[clienteIdIsp].importePuntual += Number(factura.total) || 0
    }
  }

  // Enriquecer clientes con tipos de facturación
  const clientesConTipos = clientes.map(c => ({
    ...c,
    tiposFacturacion: c.clienteIdIsp ? (tiposFacturacionMap[c.clienteIdIsp] || null) : null,
  }))

  // Contar activos con facturación (clientes activos que tienen al menos un contrato activo)
  const allContratosActivos = await prisma.contratoServicio.findMany({
    where: { activo: true },
    select: { clienteId: true },
    distinct: ['clienteId'],
  })
  const idsConContratosGlobal = new Set(allContratosActivos.map(c => c.clienteId))
  const allClientesActivos = await prisma.clienteWeb.findMany({
    where: { activo: true },
    select: { clienteIdIsp: true, personaFisica: true },
  })
  const clientesConFactList = allClientesActivos.filter(c => c.clienteIdIsp && idsConContratosGlobal.has(c.clienteIdIsp))
  const activosConFact = clientesConFactList.length
  const activosConFactParticular = clientesConFactList.filter(c => c.personaFisica === true).length
  const activosConFactEmpresa = activosConFact - activosConFactParticular
  const activosSinFact = totalActivos - activosConFact

  const totalPages = Math.ceil(total / pageSize)
  return { clientes: clientesConTipos, total, page, totalPages, totalActivos, totalInactivos, activosConFact, activosSinFact, activosConFactEmpresa, activosConFactParticular }
}

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireAuth('admin')
  const resolvedSearchParams = await searchParams
  const { clientes, total, page, totalPages, totalActivos, totalInactivos, activosConFact, activosSinFact, activosConFactEmpresa, activosConFactParticular } = await getClientes(resolvedSearchParams)
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-lg bg-white shadow border border-gray-200 p-4">
          <p className="text-xs font-medium text-gray-500">Total Clientes</p>
          <p className="text-xl sm:text-2xl font-bold text-gray-900">{totalActivos + totalInactivos}</p>
        </div>
        <div className="rounded-lg bg-white shadow border border-green-200 p-4">
          <p className="text-xs font-medium text-green-600">Activos</p>
          <p className="text-xl sm:text-2xl font-bold text-green-700">{totalActivos}</p>
        </div>
        <div className="rounded-lg bg-white shadow border border-orange-200 p-4">
          <p className="text-xs font-medium text-orange-600">Con Facturación</p>
          <p className="text-xl sm:text-2xl font-bold text-orange-600">{activosConFact}</p>
          <div className="mt-1 flex gap-3 text-xs">
            <span className="text-gray-500"><span className="font-semibold text-orange-700">{activosConFactEmpresa}</span> Empresas</span>
            <span className="text-gray-500"><span className="font-semibold text-orange-700">{activosConFactParticular}</span> Particulares</span>
          </div>
        </div>
        <div className="rounded-lg bg-white shadow border border-yellow-200 p-4">
          <p className="text-xs font-medium text-yellow-600">Sin Facturación</p>
          <p className="text-xl sm:text-2xl font-bold text-yellow-600">{activosSinFact}</p>
        </div>
        <div className="rounded-lg bg-white shadow border border-red-200 p-4">
          <p className="text-xs font-medium text-red-600">Dados de Baja</p>
          <p className="text-xl sm:text-2xl font-bold text-red-700">{totalInactivos}</p>
        </div>
      </div>

      <div className="rounded-lg bg-white shadow border border-gray-200">
        <div className="px-4 py-5 sm:p-6">
          <form method="get" className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                    className="block w-full rounded-md border-gray-300 pl-10 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="estado" className="block text-sm font-medium text-gray-700">Estado</label>
                <select
                  id="estado"
                  name="estado"
                  defaultValue={estadoActual}
                  className="mt-1 block w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="activo">Solo Activos</option>
                  <option value="activo_con_fact">Activos con facturación</option>
                  <option value="activo_sin_fact">Activos sin facturación</option>
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
                  className="mt-1 block w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="">Todos</option>
                  <option value="fisica">Persona Física</option>
                  <option value="juridica">Persona Jurídica</option>
                </select>
              </div>
              <div>
                <label htmlFor="facturacion" className="block text-sm font-medium text-gray-700">Facturación</label>
                <select
                  id="facturacion"
                  name="facturacion"
                  defaultValue={resolvedSearchParams.facturacion}
                  className="mt-1 block w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
                >
                  <option value="">Todos</option>
                  <option value="mensual">Mensual</option>
                  <option value="anual">Anual</option>
                  <option value="puntual">Puntual</option>
                  <option value="nada">Sin contratos</option>
                </select>
              </div>
              <div>
                <label htmlFor="newsletter" className="block text-sm font-medium text-gray-700">Newsletter</label>
                <select
                  id="newsletter"
                  name="newsletter"
                  defaultValue={resolvedSearchParams.newsletter}
                  className="mt-1 block w-full rounded-md border-gray-300 text-gray-900 focus:border-orange-500 focus:ring-orange-500 sm:text-sm"
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
