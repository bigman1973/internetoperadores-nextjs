export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

// Mapeo de slugs de sección a nombres legibles
const SECCIONES_EMPRESA_LABELS: Record<string, string> = {
  'comunicaciones-unificadas': 'Comunicaciones Unificadas',
  'conectividad-avanzada': 'Conectividad Avanzada',
  'moviles': 'Soluciones Móviles',
  'infraestructura-de-red': 'Infraestructura de Red',
  'mantenimiento-it': 'Mantenimiento IT',
  'migracion-web': 'Migración Web',
  'exagrid': 'ExaGrid',
};

const SECCIONES_PARTICULAR_LABELS: Record<string, string> = {
  'internet': 'Internet',
  'movil': 'Móvil',
  'packs': 'Packs',
  'mas-vendido': 'Más Vendido',
};

// GET /api/tarifas - Obtener tarifas públicas (solo activas)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tipoCliente = searchParams.get('tipoCliente');
    const seccion = searchParams.get('seccion');
    const busqueda = searchParams.get('busqueda');
    const destacadas = searchParams.get('destacadas');

    const tarifaSelect = {
      id: true,
      tipoCliente: true,
      categoria: true,
      nombre: true,
      nombreComercial: true,
      descripcionCorta: true,
      descripcionLarga: true,
      velocidad: true,
      precioSinIva: true,
      precioConIva: true,
      cuotaAlta: true,
      permanencia: true,
      garantia: true,
      destacada: true,
      subcategoria: true,
      seccionWebEmpresa: true,
    };

    let tarifas: any[] = [];
    let secciones: { slug: string; label: string; count: number }[] = [];

    if (tipoCliente === 'EMPRESA') {
      // Para empresas: usar seccionWebEmpresa + tabla many-to-many
      const where: any = {
        activa: true,
        publicarWebEmpresa: true,
      };

      if (seccion && seccion !== 'TODAS') {
        where.OR = [
          { seccionWebEmpresa: seccion },
          { seccionesWeb: { some: { seccion: seccion } } },
        ];
      }

      if (busqueda) {
        where.AND = [{
          OR: [
            { nombre: { contains: busqueda, mode: 'insensitive' } },
            { nombreComercial: { contains: busqueda, mode: 'insensitive' } },
            { descripcionCorta: { contains: busqueda, mode: 'insensitive' } },
            { velocidad: { contains: busqueda, mode: 'insensitive' } },
          ]
        }];
      }

      if (destacadas === 'true') {
        where.destacada = true;
      }

      tarifas = await prisma.tarifa.findMany({
        where,
        select: tarifaSelect,
        orderBy: [{ destacada: 'desc' }, { orden: 'asc' }, { precioConIva: 'asc' }],
      });

      // Obtener secciones disponibles con conteo
      const allEmpresaTarifas = await prisma.tarifa.findMany({
        where: { activa: true, publicarWebEmpresa: true },
        select: { id: true, seccionWebEmpresa: true, seccionesWeb: { select: { seccion: true } } },
      });

      const seccionCounts: Record<string, number> = {};
      for (const t of allEmpresaTarifas) {
        const secs = new Set<string>();
        if (t.seccionWebEmpresa) secs.add(t.seccionWebEmpresa);
        for (const s of t.seccionesWeb) secs.add(s.seccion);
        for (const s of secs) {
          seccionCounts[s] = (seccionCounts[s] || 0) + 1;
        }
      }

      secciones = Object.entries(seccionCounts)
        .map(([slug, count]) => ({
          slug,
          label: SECCIONES_EMPRESA_LABELS[slug] || slug,
          count,
        }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count);

    } else if (tipoCliente === 'PARTICULAR') {
      // Para particulares: usar tabla many-to-many tarifa_secciones_web_particular
      const where: any = {
        activa: true,
        publicarWebParticular: true,
      };

      if (seccion && seccion !== 'TODAS') {
        where.seccionesWebParticular = { some: { seccion: seccion } };
      }

      if (busqueda) {
        where.AND = [{
          OR: [
            { nombre: { contains: busqueda, mode: 'insensitive' } },
            { nombreComercial: { contains: busqueda, mode: 'insensitive' } },
            { descripcionCorta: { contains: busqueda, mode: 'insensitive' } },
            { velocidad: { contains: busqueda, mode: 'insensitive' } },
          ]
        }];
      }

      if (destacadas === 'true') {
        where.destacada = true;
      }

      tarifas = await prisma.tarifa.findMany({
        where,
        select: tarifaSelect,
        orderBy: [{ destacada: 'desc' }, { orden: 'asc' }, { precioConIva: 'asc' }],
      });

      // Obtener secciones disponibles con conteo
      const seccionRows = await prisma.tarifaSeccionWebParticular.findMany({
        where: {
          tarifa: { activa: true, publicarWebParticular: true },
        },
        select: { seccion: true },
      });

      const seccionCounts: Record<string, number> = {};
      for (const row of seccionRows) {
        seccionCounts[row.seccion] = (seccionCounts[row.seccion] || 0) + 1;
      }

      secciones = Object.entries(seccionCounts)
        .map(([slug, count]) => ({
          slug,
          label: SECCIONES_PARTICULAR_LABELS[slug] || slug,
          count,
        }))
        .filter(s => s.count > 0)
        .sort((a, b) => b.count - a.count);

    } else {
      // Sin filtro de tipo - devolver todas las activas
      tarifas = await prisma.tarifa.findMany({
        where: { activa: true },
        select: tarifaSelect,
        orderBy: [{ destacada: 'desc' }, { orden: 'asc' }, { precioConIva: 'asc' }],
      });
    }

    return NextResponse.json({ tarifas, secciones });

  } catch (error) {
    console.error('Error obteniendo tarifas:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
