import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const lead = await prisma.leadSolucion.findUnique({
      where: { id },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });
    }

    return NextResponse.json(lead);
  } catch (error: any) {
    console.error('Error al obtener lead:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const { estado, prioridad, notas } = body;

    const updateData: any = {};
    if (estado) updateData.estado = estado;
    if (prioridad) updateData.prioridad = prioridad;
    if (notas !== undefined) updateData.notas = notas;

    const lead = await prisma.leadSolucion.update({
      where: { id },
      data: updateData,
    });

    // Sincronizar con HubSpot si es un lead de mantenimiento IT y tiene deal creado
    if (estado && lead.tipo === 'MANTENIMIENTO_IT') {
      const datos = lead.datos as any;
      if (datos?.hubspotDealId) {
        try {
          const baseUrl = process.env.NEXTAUTH_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
          await fetch(`${baseUrl}/api/admin/leads-mantenimiento/${id}/hubspot-deal`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cookie': request.headers.get('cookie') || '',
            },
          });
        } catch (hubspotError) {
          console.error('[HUBSPOT-SYNC] Error al sincronizar:', hubspotError);
          // No bloquear el guardado si falla HubSpot
        }
      }
    }

    return NextResponse.json(lead);
  } catch (error: any) {
    console.error('Error al actualizar lead:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id } = await params;
    await prisma.leadSolucion.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar lead:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
