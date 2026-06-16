import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Categorías de servicios (misma lógica que contratos)
const CATEGORIAS_SERVICIO: Record<string, string[]> = {
  'Móvil': ['CANARIO', 'CACATUA', 'PERIQUITO', 'PERDIU', 'VOLIBRI', 'NINFA', 'TRENCALOS', 'TRENCALÒS', 'TTB', 'SÓLO MÓVIL', 'SOLO MOVIL', 'LÍNEA MÓVIL', 'LINEA MOVIL'],
  'Fibra': ['FIBRA', 'ADAMO', 'T-FIBRA', 'CM- FIBRA', 'AN-FIBRA', 'FTTH'],
  '4G / Inalámbrico': ['4G', 'T-INFINITO', 'IO 4G', 'STARLINK'],
  'Convergente': ['CONVERGENTE', 'LIFE ONE', 'LIFE ORIGINAL'],
  'Línea Fija': ['LINEA FIJA', 'LÍNEA FIJA', 'LINEA DE FAX'],
  'IP Fija': ['IP FIJA', 'POOL IP'],
  'Centralita / PBX': ['PBX', 'WILDIX', 'CENTRALITA'],
  'Hosting / Cloud': ['DOMINIO', 'HOSTING', 'GOOGLE', 'BUZON', 'BUZÓN', 'SERVIDOR', 'BACKUP', 'CLOUD'],
  'WiFi / Hotspot': ['HOTSPOT', 'WIFI', 'WIFI4EU'],
  'Mantenimiento IT': ['MANTENIMIENTO'],
  'VPN': ['VPN', 'MACROLAN'],
  'TV': ['TV', 'PLATAFORMA'],
  'Terminales': ['TERMINAL', 'DECT'],
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json()
  const { estado, tipo, municipio, tieneFacturacion, tarifas, categorias } = body
  // tarifas: string[] — tarifas individuales seleccionadas
  // categorias: string[] — categorías seleccionadas (se expanden a keywords)

  // Construir filtro para ClienteWeb
  const where: Prisma.ClienteWebWhereInput = {}

  // Estado: activo / baja / todos
  if (estado === 'activo') {
    where.activo = true
  } else if (estado === 'baja') {
    where.activo = false
  }

  // Tipo: empresa / particular / todos
  if (tipo === 'empresa') {
    where.personaFisica = false
  } else if (tipo === 'particular') {
    where.personaFisica = true
  }

  // Municipio
  if (municipio && municipio !== '') {
    where.municipio = { contains: municipio, mode: 'insensitive' }
  }

  // Solo con email válido
  where.email = { not: '', contains: '@' }

  // Filtrar por contratos/facturación/tarifas/categorías
  const tieneFiltroTarifas = (tarifas && tarifas.length > 0) || (categorias && categorias.length > 0)
  
  if (tieneFacturacion === 'con' || tieneFiltroTarifas) {
    where.clienteIdIsp = {
      in: await getClienteIdsConContratos(true, tarifas || [], categorias || []),
    }
  } else if (tieneFacturacion === 'sin') {
    const idsConContrato = await getClienteIdsConContratos(true, [], [])
    where.clienteIdIsp = { notIn: idsConContrato }
  }

  // Contar
  const total = await prisma.clienteWeb.count({ where })

  // Obtener muestra de 10 para preview
  const muestra = await prisma.clienteWeb.findMany({
    where,
    select: { id: true, nombre: true, email: true, municipio: true, personaFisica: true, activo: true },
    take: 10,
    orderBy: { nombre: 'asc' },
  })

  return NextResponse.json({ total, muestra })
}

async function getClienteIdsConContratos(activo: boolean, tarifas: string[], categorias: string[]): Promise<string[]> {
  const contratoWhere: Prisma.ContratoServicioWhereInput = { activo }
  
  // Construir condiciones OR para tarifas individuales y categorías
  const orConditions: Prisma.ContratoServicioWhereInput[] = []

  // Tarifas individuales seleccionadas (match exacto por contains)
  if (tarifas && tarifas.length > 0) {
    for (const tarifa of tarifas) {
      orConditions.push({ tarifa: { equals: tarifa, mode: 'insensitive' } })
    }
  }

  // Categorías seleccionadas (se expanden a keywords con LIKE)
  if (categorias && categorias.length > 0) {
    for (const cat of categorias) {
      const keywords = CATEGORIAS_SERVICIO[cat]
      if (keywords) {
        for (const kw of keywords) {
          orConditions.push({ tarifa: { contains: kw, mode: 'insensitive' } })
        }
      }
    }
  }

  if (orConditions.length > 0) {
    contratoWhere.OR = orConditions
  }

  const contratos = await prisma.contratoServicio.findMany({
    where: contratoWhere,
    select: { clienteId: true },
    distinct: ['clienteId'],
  })

  return contratos.map(c => c.clienteId)
}

// GET para obtener las opciones de filtro
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Obtener municipios únicos de clientes activos
  const municipiosRaw = await prisma.clienteWeb.groupBy({
    by: ['municipio'],
    where: { activo: true, municipio: { not: null } },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
    take: 50,
  })

  const municipios = municipiosRaw
    .filter(m => m.municipio && m.municipio.trim() !== '')
    .map(m => ({ value: m.municipio!, count: m._count.id }))

  // Obtener tarifas únicas de contratos activos
  const tarifasRaw = await prisma.contratoServicio.groupBy({
    by: ['tarifa'],
    where: { activo: true },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  })

  const tarifas = tarifasRaw
    .filter(t => t.tarifa && t.tarifa.trim() !== '')
    .map(t => ({ value: t.tarifa!, count: t._count.id }))

  // Agrupar tarifas por categoría para el frontend
  const tarifasPorCategoria: Record<string, { value: string; count: number }[]> = {}
  for (const cat of Object.keys(CATEGORIAS_SERVICIO)) {
    tarifasPorCategoria[cat] = []
  }
  tarifasPorCategoria['Otros'] = []

  for (const t of tarifas) {
    let asignada = false
    for (const [cat, keywords] of Object.entries(CATEGORIAS_SERVICIO)) {
      if (keywords.some(kw => t.value.toUpperCase().includes(kw.toUpperCase()))) {
        tarifasPorCategoria[cat].push(t)
        asignada = true
        break
      }
    }
    if (!asignada) {
      tarifasPorCategoria['Otros'].push(t)
    }
  }

  // Contar contratos por categoría
  const categoriasConConteo = Object.entries(tarifasPorCategoria)
    .filter(([, items]) => items.length > 0)
    .map(([cat, items]) => ({
      nombre: cat,
      totalContratos: items.reduce((sum, t) => sum + t.count, 0),
      tarifas: items,
    }))

  // Stats generales
  const totalClientes = await prisma.clienteWeb.count()
  const totalActivos = await prisma.clienteWeb.count({ where: { activo: true } })
  const totalEmpresas = await prisma.clienteWeb.count({ where: { activo: true, personaFisica: false } })
  const totalParticulares = await prisma.clienteWeb.count({ where: { activo: true, personaFisica: true } })
  const totalConFacturacion = await getClienteIdsConContratos(true, [], [])

  return NextResponse.json({
    municipios,
    tarifas,
    categoriasServicio: categoriasConConteo,
    stats: {
      totalClientes,
      totalActivos,
      totalEmpresas,
      totalParticulares,
      totalConFacturacion: totalConFacturacion.length,
    },
  })
}
