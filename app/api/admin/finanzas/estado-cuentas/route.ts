import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { authOptions } from '@/lib/auth'
import { checkAdminAreaRead } from '@/lib/api-admin-area-read'
import { analizarCadenaSaldo } from '@/lib/finanzas/bank-balance-chain'

const AREA_IMPORTAR = 'admin.finanzas.importar'
const ROLES_LEGACY = ['CONTABILIDAD']

function jsonPrivado(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'cache-control': 'private, no-store' } })
}

function iso(fecha: Date | null | undefined): string | null {
  return fecha instanceof Date && Number.isFinite(fecha.getTime()) ? fecha.toISOString() : null
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user || session.user.userType !== 'admin') return jsonPrivado({ error: 'No autorizado' }, 401)
  const denied = await checkAdminAreaRead(AREA_IMPORTAR, ROLES_LEGACY, session)
  if (denied) {
    return jsonPrivado(
      { error: denied.status === 401 ? 'No autorizado' : 'Sin permiso de lectura' },
      denied.status === 401 ? 401 : 403,
    )
  }

  try {
    const cuentas = await (prisma.cuentaBancaria as any).findMany({
      select: {
        id: true, banco: true, alias: true, activa: true, saldoActual: true, fechaSaldo: true, fechaCorteExtracto: true,
        _count: { select: { movimientos: true } },
      },
      orderBy: { banco: 'asc' },
    })
    const estadoCuentas = await Promise.all(cuentas.map(async (cuenta: any) => {
      const movimientos = await prisma.movimientoBancario.findMany({
        where: { cuentaId: cuenta.id },
        select: { fechaOperacion: true, importe: true, saldo: true },
        orderBy: [{ fechaOperacion: 'asc' }, { createdAt: 'asc' }],
      })
      const primerMovimiento = movimientos[0]?.fechaOperacion ?? null
      const ultimoMovimiento = movimientos.length ? movimientos[movimientos.length - 1].fechaOperacion : null
      // Los registros históricos no tienen secuencia intradía persistida: si hay más de
      // uno el mismo día, el núcleo informa orden ambiguo en vez de fabricar cobertura.
      const continuidad = analizarCadenaSaldo(movimientos, null)
      const corte = cuenta.fechaCorteExtracto ?? null
      return {
        id: cuenta.id,
        banco: cuenta.banco,
        alias: cuenta.alias,
        activa: cuenta.activa,
        saldoActual: cuenta.saldoActual ?? null,
        fechaSaldo: iso(cuenta.fechaSaldo),
        fechaCorteExtracto: iso(corte),
        primerMovimiento: iso(primerMovimiento),
        ultimoMovimiento: iso(ultimoMovimiento),
        totalMovimientos: cuenta._count.movimientos,
        // Compatibilidad de consumidores B3: se conserva también en cobertura.
        continuidadSaldo: continuidad.estado,
        avisosSaldo: continuidad.avisos.map((aviso) => ({ ...aviso, fecha: iso(aviso.fecha) })),
        cobertura: {
          cierre: iso(corte),
          ultimoExtracto: iso(corte),
          ultimoSaldoConocido: continuidad.ultimoSaldoConocido,
          continuidadSaldo: continuidad.estado,
          puedeActualizarSaldo: continuidad.puedeActualizarSaldo,
          avisosSaldo: continuidad.avisos.map((aviso) => ({ ...aviso, fecha: iso(aviso.fecha) })),
          // El corte es la evidencia de extracto, no un cierre manual ni contable.
          fuenteCierre: corte ? 'EXTRACTO_IMPORTADO' : 'SIN_EXTRACTO_CUBIERTO',
        },
      }
    }))

    estadoCuentas.sort((a: any, b: any) => {
      if (a.activa !== b.activa) return a.activa ? -1 : 1
      if (!a.ultimoMovimiento) return -1
      if (!b.ultimoMovimiento) return 1
      return new Date(a.ultimoMovimiento).getTime() - new Date(b.ultimoMovimiento).getTime()
    })

    const importaciones = await prisma.importacionExtracto.findMany({
      orderBy: { createdAt: 'desc' }, take: 20,
      include: { cuenta: { select: { banco: true } } },
    })
    const historial = importaciones.map((item) => ({
      id: item.id,
      archivo: item.nombreArchivo,
      banco: item.cuenta.banco,
      totalMovimientos: item.movImportados,
      duplicados: item.movDuplicados,
      fechaPrimerMov: iso(item.fechaPrimerMov),
      fechaUltimoMov: iso(item.fechaUltimoMov),
      fechaImportacion: iso(item.createdAt),
      // No exponer URL pública de extractos en B3.
      archivoUrl: null,
    }))
    return jsonPrivado({ estadoCuentas, historial })
  } catch {
    return jsonPrivado({ error: 'No se pudo obtener el estado de cuentas' }, 500)
  }
}
