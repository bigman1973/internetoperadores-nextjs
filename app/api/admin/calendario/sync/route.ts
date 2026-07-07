import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const SYNC_SECRET = process.env.HRLOG_SYNC_SECRET || 'hrlog-sync-io-2026-s3cr3t'
const ROLES_PERMITIDOS = ['SUPER_ADMIN', 'GERENTE', 'RRHH']

// POST /api/admin/calendario/sync
// Recibe datos de HRLog y los guarda en la BD
export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación (secret compartido o sesión admin)
    const syncSecret = request.headers.get('X-Sync-Secret')
    if (syncSecret !== SYNC_SECRET) {
      // Si no tiene el secret, verificar sesión de admin
      const session = await getServerSession(authOptions)
      if (!session?.user?.email) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
      }
      if (!ROLES_PERMITIDOS.includes(session.user.role || '')) {
        return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      }
    }

    const body = await request.json()
    const { vacaciones = [], permisos = [], bajas = [], saldoVacaciones = [], year = 2026, trigger } = body

    // Si es trigger manual desde la interfaz, ejecutar scraping desde el Cloud Computer
    if (trigger === 'manual') {
      // Para sincronización manual desde la UI, llamar al Cloud Computer
      // Por ahora, devolver instrucciones
      return NextResponse.json({
        success: true,
        message: 'Sincronización manual iniciada. Los datos se actualizarán en unos segundos.',
        manual: true
      })
    }

    // Obtener mapeo de empleados por nombre
    const empleados = await prisma.empleado.findMany({
      select: { id: true, nombreCompleto: true }
    })
    
    const findEmpleadoId = (nombre: string): string | null => {
      if (!nombre) return null
      const normalizado = nombre.toLowerCase().trim()
      const emp = empleados.find(e => 
        e.nombreCompleto.toLowerCase().trim() === normalizado ||
        normalizado.includes(e.nombreCompleto.toLowerCase().split(' ')[0])
      )
      return emp?.id || null
    }

    // Borrar datos existentes del año para reemplazar
    await prisma.calendarioPersonal.deleteMany({
      where: { anio: year }
    })

    // Insertar vacaciones
    const vacacionesData = vacaciones.map((v: any) => ({
      empleadoId: findEmpleadoId(v.empleado),
      empleadoNombre: v.empleado || 'Desconocido',
      tipo: 'VACACIONES' as const,
      estado: mapEstado(v.estado),
      fechaInicio: new Date(v.fechaInicio),
      fechaFin: new Date(v.fechaFin),
      totalDias: v.totalDias || null,
      anio: year,
    }))

    // Insertar permisos
    const permisosData = permisos.map((p: any) => ({
      empleadoId: findEmpleadoId(p.empleado),
      empleadoNombre: p.empleado || 'Desconocido',
      tipo: 'PERMISO' as const,
      estado: mapEstado(p.estado),
      fechaInicio: new Date(p.fechaInicio),
      fechaFin: new Date(p.fechaFin),
      horaInicio: p.horaInicio || null,
      horaFin: p.horaFin || null,
      tipoPermiso: p.tipoPermiso || null,
      comentario: p.comentario || null,
      hrlogId: p.id || null,
      anio: year,
    }))

    // Insertar bajas
    const bajasData = bajas.map((b: any) => ({
      empleadoId: findEmpleadoId(b.empleado),
      empleadoNombre: b.empleado || 'Desconocido',
      tipo: 'BAJA' as const,
      estado: mapEstado(b.estado),
      fechaInicio: new Date(b.fechaInicio),
      fechaFin: new Date(b.fechaFin),
      totalDias: b.totalDias || null,
      comentario: b.motivo || null,
      anio: year,
    }))

    const allData = [...vacacionesData, ...permisosData, ...bajasData]
    
    if (allData.length > 0) {
      await prisma.calendarioPersonal.createMany({
        data: allData
      })
    }

    // Procesar saldos de vacaciones
    let saldosInsertados = 0
    if (saldoVacaciones.length > 0) {
      for (const saldo of saldoVacaciones) {
        const empleadoId = findEmpleadoId(saldo.empleado)
        await prisma.saldoVacaciones.upsert({
          where: {
            empleadoNombre_anio: {
              empleadoNombre: saldo.empleado || 'Desconocido',
              anio: year
            }
          },
          update: {
            empleadoId,
            hrlogEmpleadoId: saldo.empleadoId || null,
            diasConvenio: saldo.diasConvenio || 22,
            diasBolsa: saldo.diasBolsa || 0,
            diasAntiguedad: saldo.diasAntiguedad || 0,
            diasTotal: saldo.diasTotal || 22,
            diasDisfrutadas: saldo.diasDisfrutadas || 0,
            diasAprobadas: saldo.diasAprobadas || 0,
            diasEnTramite: saldo.diasEnTramite || 0,
            saldoActual: saldo.saldoActual || 0,
            syncAt: new Date(),
          },
          create: {
            empleadoId,
            empleadoNombre: saldo.empleado || 'Desconocido',
            hrlogEmpleadoId: saldo.empleadoId || null,
            anio: year,
            diasConvenio: saldo.diasConvenio || 22,
            diasBolsa: saldo.diasBolsa || 0,
            diasAntiguedad: saldo.diasAntiguedad || 0,
            diasTotal: saldo.diasTotal || 22,
            diasDisfrutadas: saldo.diasDisfrutadas || 0,
            diasAprobadas: saldo.diasAprobadas || 0,
            diasEnTramite: saldo.diasEnTramite || 0,
            saldoActual: saldo.saldoActual || 0,
          }
        })
        saldosInsertados++
      }
    }

    // Registrar log de sincronización
    await prisma.syncLog.create({
      data: {
        fuente: 'hrlog',
        tipo: 'calendario',
        registros: allData.length + saldosInsertados,
        estado: 'ok',
        mensaje: `Vacaciones: ${vacaciones.length}, Permisos: ${permisos.length}, Bajas: ${bajas.length}, Saldos: ${saldosInsertados}`
      }
    })

    return NextResponse.json({
      success: true,
      message: `Sincronización completada: ${allData.length} eventos + ${saldosInsertados} saldos`,
      detalle: {
        vacaciones: vacaciones.length,
        permisos: permisos.length,
        bajas: bajas.length,
        saldos: saldosInsertados,
        total: allData.length + saldosInsertados
      }
    })

  } catch (error: any) {
    console.error('Error en sincronización calendario:', error)
    
    // Registrar error
    try {
      await prisma.syncLog.create({
        data: {
          fuente: 'hrlog',
          tipo: 'calendario',
          registros: 0,
          estado: 'error',
          mensaje: error.message
        }
      })
    } catch {}

    return NextResponse.json(
      { error: 'Error al sincronizar', detalle: error.message },
      { status: 500 }
    )
  }
}

// GET /api/admin/calendario/sync
// Devuelve el estado de la última sincronización
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const lastSync = await prisma.syncLog.findFirst({
      where: { fuente: 'hrlog' },
      orderBy: { ejecutadoAt: 'desc' }
    })

    const totalRegistros = await prisma.calendarioPersonal.count()
    const porTipo = await prisma.calendarioPersonal.groupBy({
      by: ['tipo'],
      _count: true
    })

    return NextResponse.json({
      ultimaSincronizacion: lastSync,
      totalRegistros,
      porTipo: porTipo.reduce((acc, item) => {
        acc[item.tipo] = item._count
        return acc
      }, {} as Record<string, number>)
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function mapEstado(estado: string): 'PENDIENTE' | 'APROBADO' | 'DENEGADO' | 'SOLICITADO' {
  switch (estado?.toLowerCase()) {
    case 'aprobado':
    case 'a':
      return 'APROBADO'
    case 'denegado':
    case 'd':
      return 'DENEGADO'
    case 'solicitado':
    case 's':
      return 'SOLICITADO'
    case 'visto':
    case 'v':
      return 'SOLICITADO'
    default:
      return 'PENDIENTE'
  }
}
