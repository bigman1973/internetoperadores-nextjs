import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('clienteId');
    const activo = searchParams.get('activo');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const search = searchParams.get('search');

    const where: any = {};
    
    if (clienteId) {
      where.cliente_id = clienteId;
    }
    
    if (activo !== null && activo !== undefined && activo !== '') {
      where.activo = activo === 'true';
    }

    if (search) {
      where.OR = [
        { titulo: { contains: search, mode: 'insensitive' } },
        { tarifa: { contains: search, mode: 'insensitive' } },
        { cliente_id: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Usar raw query ya que el modelo no está en Prisma 7
    const offset = (page - 1) * limit;
    
    let query = `SELECT * FROM contratos_servicio WHERE 1=1`;
    let countQuery = `SELECT COUNT(*) as count FROM contratos_servicio WHERE 1=1`;
    const params: any[] = [];
    let paramIndex = 1;

    if (clienteId) {
      query += ` AND cliente_id = $${paramIndex}`;
      countQuery += ` AND cliente_id = $${paramIndex}`;
      params.push(clienteId);
      paramIndex++;
    }

    if (activo !== null && activo !== undefined && activo !== '') {
      query += ` AND activo = $${paramIndex}`;
      countQuery += ` AND activo = $${paramIndex}`;
      params.push(activo === 'true');
      paramIndex++;
    }

    if (search) {
      query += ` AND (titulo ILIKE $${paramIndex} OR tarifa ILIKE $${paramIndex} OR cliente_id ILIKE $${paramIndex})`;
      countQuery += ` AND (titulo ILIKE $${paramIndex} OR tarifa ILIKE $${paramIndex} OR cliente_id ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY activo DESC, fecha_inicio DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const [contratos, countResult]: any = await Promise.all([
      prisma.$queryRawUnsafe(query, ...params),
      prisma.$queryRawUnsafe(countQuery, ...params.slice(0, paramIndex - 1))
    ]);

    const total = Number(countResult[0]?.count || 0);

    return NextResponse.json({
      contratos,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: any) {
    console.error('Error obteniendo contratos:', error);
    return NextResponse.json({ 
      error: error.message || 'Error obteniendo contratos' 
    }, { status: 500 });
  }
}
