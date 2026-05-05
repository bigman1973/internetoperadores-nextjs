export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../lib/auth';
import { prisma } from '../../../../lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const data = await request.json();
    const tarifa = await prisma.tarifa.create({
      data: {
        ...data,
        createdById: parseInt(session.user.id),
        updatedById: parseInt(session.user.id),
      },
    });
    return NextResponse.json(tarifa, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const modo = searchParams.get('modo') || 'list'; // list, grouped, stats
    const search = searchParams.get('search') || '';
    const tipoCliente = searchParams.get('tipoCliente') || '';
    const categoria = searchParams.get('categoria') || '';
    const estado = searchParams.get('estado') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');

    // Build where clause
    const where: any = {};
    if (search) {
      where.OR = [
        { nombre: { contains: search, mode: 'insensitive' } },
        { nombreComercial: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (tipoCliente) {
      where.tipoCliente = tipoCliente;
    }
    if (categoria) {
      where.categoria = categoria;
    }
    if (estado === 'activa') {
      where.activa = true;
    } else if (estado === 'inactiva') {
      where.activa = false;
    } else if (estado === 'web-particular') {
      where.publicarWebParticular = true;
    } else if (estado === 'web-empresa') {
      where.publicarWebEmpresa = true;
    } else if (estado === 'web-ambas') {
      where.OR = [
        ...(where.OR || []),
        { publicarWebParticular: true },
        { publicarWebEmpresa: true },
      ];
    }

    if (modo === 'stats') {
      // Return category stats for the sidebar
      const [totalCount, activeCount, categorias] = await Promise.all([
        prisma.tarifa.count({ where }),
        prisma.tarifa.count({ where: { ...where, activa: true } }),
        prisma.$queryRawUnsafe(`
          SELECT 
            COALESCE(categoria, 'SIN CATEGORÍA') as categoria,
            COUNT(*)::int as total,
            COUNT(*) FILTER (WHERE activa = true)::int as activas
          FROM tarifas
          GROUP BY COALESCE(categoria, 'SIN CATEGORÍA')
          ORDER BY total DESC
        `)
      ]);

      return NextResponse.json({
        total: totalCount,
        activas: activeCount,
        categorias
      });
    }

    if (modo === 'grouped') {
      // Return tarifas grouped by category
      const tarifas = await prisma.tarifa.findMany({
        where,
        include: {
          createdBy: { select: { nombre: true } },
          updatedBy: { select: { nombre: true } },
        },
        orderBy: [
          { destacada: 'desc' },
          { orden: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      // Group by category
      const groups: Record<string, any[]> = {};
      for (const t of tarifas) {
        const cat = t.categoria || 'SIN CATEGORÍA';
        if (!groups[cat]) groups[cat] = [];
        groups[cat].push({
          ...t,
          precioSinIva: Number(t.precioSinIva),
          precioConIva: Number(t.precioConIva),
          costeOperador: t.costeOperador ? Number(t.costeOperador) : null,
          precioPeriodo: t.precioPeriodo ? Number(t.precioPeriodo) : null,
          precioPeriodoIva: t.precioPeriodoIva ? Number(t.precioPeriodoIva) : null,
          esMovil: t.esMovil ?? false,
          esFijo: t.esFijo ?? false,
          esInternet: t.esInternet ?? false,
          esTv: t.esTv ?? false,
          esCompuesta: t.esCompuesta ?? false,
        });
      }

      // Sort groups by count desc
      const sortedGroups = Object.entries(groups)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([cat, tarifas]) => ({
          categoria: cat,
          total: tarifas.length,
          activas: tarifas.filter((t: any) => t.activa).length,
          tarifas
        }));

      return NextResponse.json({
        grupos: sortedGroups,
        totalTarifas: tarifas.length
      });
    }

    // modo === 'list' - paginated flat list
    const [tarifas, total] = await Promise.all([
      prisma.tarifa.findMany({
        where,
        include: {
          createdBy: { select: { nombre: true } },
          updatedBy: { select: { nombre: true } },
        },
        orderBy: [
          { destacada: 'desc' },
          { orden: 'asc' },
          { createdAt: 'desc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.tarifa.count({ where }),
    ]);

    const tarifasConverted = tarifas.map(t => ({
      ...t,
      precioSinIva: Number(t.precioSinIva),
      precioConIva: Number(t.precioConIva),
      costeOperador: t.costeOperador ? Number(t.costeOperador) : null,
      precioPeriodo: t.precioPeriodo ? Number(t.precioPeriodo) : null,
      precioPeriodoIva: t.precioPeriodoIva ? Number(t.precioPeriodoIva) : null,
      esMovil: t.esMovil ?? false,
      esFijo: t.esFijo ?? false,
      esInternet: t.esInternet ?? false,
      esTv: t.esTv ?? false,
      esCompuesta: t.esCompuesta ?? false,
    }));

    return NextResponse.json({
      tarifas: tarifasConverted,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error('Error en API tarifas:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
