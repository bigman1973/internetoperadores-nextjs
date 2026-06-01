export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'

// Clasificar contratos por categoría basándose en el nombre de tarifa y título
function clasificarCategoria(contrato: any): string {
  const tarifa = (contrato.tarifa || '').toUpperCase();
  const titulo = (contrato.titulo || '').toUpperCase();
  const concepto = (contrato.concepto_facturacion || '').toUpperCase();
  const texto = `${tarifa} ${titulo} ${concepto}`;

  // Internet / Fibra / 4G
  if (texto.includes('FIBRA') || texto.includes('FTTH') || texto.includes('T-INFINITO') ||
      texto.includes('4G') || texto.includes('WIMAX') || texto.includes('INTERNET') ||
      texto.includes('LIFE ONE') || texto.includes('IO 4G') || texto.includes('IP FIJA') ||
      texto.includes('COMUNITAT')) return 'Internet';

  // Telefonía Móvil
  if (texto.includes('MÓVIL') || texto.includes('MOVIL') || texto.includes('CANARIO') ||
      texto.includes('PERDIU') || texto.includes('VOLIBRI') || texto.includes('CACATUA') ||
      texto.includes('PERIQUITO') || texto.includes('TRENCALOS') || texto.includes('NINFA') ||
      texto.includes('CABLEMÓVIL') || texto.includes('CABLEMOVIL') || texto.includes('TTB') ||
      texto.includes('COMPARTE GB') || (texto.includes('BONO') && texto.includes('MÓVIL'))) return 'Telefonía Móvil';

  // Telefonía Fija
  if (texto.includes('LINEA FIJA') || texto.includes('LÍNEA FIJA') || texto.includes('FIJO') ||
      texto.includes('VOIP') || texto.includes('SIP') || (texto.includes('TARIFA PLANA') && texto.includes('FIJA'))) return 'Telefonía Fija';

  // Centralitas / PBX / Comunicaciones Unificadas
  if (texto.includes('PBX') || texto.includes('CENTRALITA') || texto.includes('WILDIX') ||
      texto.includes('ZOOM') || texto.includes('TEAMS') || texto.includes('COMUNICACIONES UNIFICADAS')) return 'Comunicaciones';

  // Hosting / Dominios
  if (texto.includes('HOSTING') || texto.includes('DOMINIO') || texto.includes('WEB') ||
      texto.includes('CORREO') || texto.includes('EMAIL') || texto.includes('GOOGLE') ||
      texto.includes('WORKSPACE') || texto.includes('BUZON') || texto.includes('BUZÓN')) return 'Hosting y Email';

  // Backup / Cloud / Servidores
  if (texto.includes('BACKUP') || texto.includes('CLOUD') || texto.includes('COPIA') ||
      texto.includes('SERVIDOR') || texto.includes('DATACENTER') || texto.includes('PRESENCIA')) return 'Cloud y Backup';

  // Seguridad / Antivirus
  if (texto.includes('PANDA') || texto.includes('ANTIVIRUS') || texto.includes('SEGURIDAD') ||
      texto.includes('DEFENSE') || texto.includes('ALARMA') || texto.includes('CÁMARA') ||
      texto.includes('CAMARA') || texto.includes('VIDEOVIGILANCIA')) return 'Seguridad';

  // Mantenimiento IT
  if (texto.includes('MANTENIMIENTO') || texto.includes('SOPORTE') || texto.includes('INFORMÁTICO') ||
      texto.includes('INFORMATICO') || texto.includes('SERVICIOS IT')) return 'Mantenimiento IT';

  // Equipos / Hardware
  if (texto.includes('EQUIPO') || texto.includes('HARDWARE') || texto.includes('TERMINAL') ||
      texto.includes('ROUTER') || texto.includes('ALQUILER') || texto.includes('RENTING')) return 'Equipos';

  return 'Otros Servicios';
}

// Limpiar templates de ISPGestión en el concepto de facturación
function limpiarConcepto(concepto: string | null): string | null {
  if (!concepto) return null;
  return concepto
    .replace(/\[mes_facturacion_texto\]/gi, '')
    .replace(/\[year_facturacion\]/gi, '')
    .replace(/\[trimestre_texto\]/gi, '')
    .replace(/\[linea\]/gi, '')
    .replace(/\[numero\]/gi, '')
    .replace(/\[fecha_inicio\]/gi, '')
    .replace(/\[fecha_fin\]/gi, '')
    .replace(/\s+de\s*$/i, '')
    .replace(/\s+DE\s*$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// Detectar periodicidad del concepto de facturación
function detectarPeriodicidad(concepto: string | null): string {
  if (!concepto) return '/mes';
  const upper = concepto.toUpperCase();
  if (upper.includes('TRIANUAL') || upper.includes('3 AÑO') || upper.includes('THREE YEAR')) return '/3 años';
  if (upper.includes('BIANUAL') || upper.includes('2 AÑO') || upper.includes('TWO YEAR')) return '/2 años';
  if (upper.includes('ANUAL') || upper.includes('CUOTA ANUAL')) return '/año';
  if (upper.includes('TRIMESTRAL')) return '/trim.';
  if (upper.includes('SEMESTRAL')) return '/sem.';
  return '/mes';
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session || session.user.userType !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const clienteEmail = session.user.email
    const cliente = await prisma.clienteWeb.findFirst({
      where: { email: clienteEmail, activo: true }
    })

    if (!cliente) {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }

    // Obtener contratos usando el ID largo (cliente_id_isp)
    const matchId = cliente.clienteIdIsp || cliente.ispGestionId
    const contratos: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM contratos_servicio WHERE cliente_id = $1 ORDER BY activo DESC, fecha_inicio DESC`,
      matchId
    )

    // Separar activos e inactivos
    const activos = contratos.filter((c: any) => c.activo)
    const inactivos = contratos.filter((c: any) => !c.activo)

    // Calcular facturación mensual total
    const facturacionMensual = activos.reduce((sum: number, c: any) => sum + Number(c.precio || 0), 0)

    // Agrupar por categoría (clasificación inteligente)
    const porCategoria: Record<string, { count: number; total: number }> = {}
    activos.forEach((c: any) => {
      const cat = clasificarCategoria(c)
      if (!porCategoria[cat]) porCategoria[cat] = { count: 0, total: 0 }
      porCategoria[cat].count++
      porCategoria[cat].total += Number(c.precio || 0)
    })

    return NextResponse.json({
      contratos: contratos.map((c: any) => ({
        id: c.id,
        titulo: c.titulo,
        tarifa: c.tarifa,
        precio: Number(c.precio || 0),
        importeRemesar: Number(c.importe_remesar || 0),
        fechaInicio: c.fecha_inicio ? new Date(c.fecha_inicio).toISOString().split('T')[0] : null,
        fechaBaja: c.fecha_baja ? new Date(c.fecha_baja).toISOString().split('T')[0] : null,
        causaBaja: c.causa_baja,
        permanencia: c.permanencia,
        fechaPermanencia: c.fecha_permanencia ? new Date(c.fecha_permanencia).toISOString().split('T')[0] : null,
        categoria: clasificarCategoria(c),
        telefonosContrato: c.telefonos_contrato,
        observaciones: c.observaciones,
        activo: c.activo,
        conceptoFacturacion: limpiarConcepto(c.concepto_facturacion),
        periodicidad: detectarPeriodicidad(c.concepto_facturacion),
      })),
      stats: {
        totalActivos: activos.length,
        totalInactivos: inactivos.length,
        facturacionMensual: Math.round(facturacionMensual * 100) / 100,
      },
      porCategoria: Object.entries(porCategoria).map(([cat, data]) => ({
        categoria: cat,
        count: data.count,
        total: Math.round(data.total * 100) / 100,
      })).sort((a, b) => b.count - a.count),
    })
  } catch (error: any) {
    console.error('Error obteniendo servicios del cliente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
