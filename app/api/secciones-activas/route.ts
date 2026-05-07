export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import prisma from '../../../lib/prisma';

// Mapping de slug a datos de presentación
const seccionesInfo: Record<string, { nombre: string; descripcion: string }> = {
  'comunicaciones-unificadas': { nombre: 'Comunicaciones Unificadas', descripcion: 'VoIP, Zoom, Wildix, Videoconferencia' },
  'conectividad-avanzada': { nombre: 'Conectividad Avanzada', descripcion: 'FTTH, dedicada, backup 4G/5G' },
  'moviles': { nombre: 'Telefonía Móvil', descripcion: 'Tarifas empresa y flotas' },
  'infraestructura-red': { nombre: 'Infraestructura de Red', descripcion: 'WiFi y redes - Ruckus' },
  'mantenimiento-it': { nombre: 'Mantenimiento IT', descripcion: 'Soporte remoto y presencial' },
  'ciberseguridad': { nombre: 'Ciberseguridad', descripcion: 'Panda, Firewalls, EDR' },
  'backup': { nombre: 'Backup Empresarial', descripcion: 'ExaGrid, copias en la nube' },
  'cloud-hosting': { nombre: 'Cloud y Hosting', descripcion: 'Servidores, hosting, email' },
  'desarrollo-web': { nombre: 'Desarrollo Web', descripcion: 'Webs, e-commerce, apps' },
  'exagrid': { nombre: 'ExaGrid Backup', descripcion: 'Backup empresarial' },
};

export async function GET() {
  try {
    // Obtener secciones que tienen al menos una tarifa activa y publicada
    // Usa la nueva tabla tarifa_secciones_web (many-to-many) con fallback al campo legacy
    const seccionesFromTable = await prisma.tarifaSeccionWeb.findMany({
      where: {
        tarifa: {
          activa: true,
          publicarWebEmpresa: true,
        },
      },
      select: { seccion: true },
      distinct: ['seccion'],
    });

    // También consultar el campo legacy por si hay tarifas que aún no se migraron
    const seccionesLegacy = await prisma.tarifa.findMany({
      where: {
        activa: true,
        publicarWebEmpresa: true,
        seccionWebEmpresa: { not: null },
      },
      select: { seccionWebEmpresa: true },
      distinct: ['seccionWebEmpresa'],
    });

    // Combinar ambas fuentes (sin duplicados)
    const allSlugs = new Set<string>();
    seccionesFromTable.forEach(s => allSlugs.add(s.seccion));
    seccionesLegacy.forEach(s => { if (s.seccionWebEmpresa) allSlugs.add(s.seccionWebEmpresa); });

    const secciones = Array.from(allSlugs)
      .map(slug => ({
        slug,
        href: `/productos/${slug}`,
        nombre: seccionesInfo[slug]?.nombre || slug,
        descripcion: seccionesInfo[slug]?.descripcion || '',
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({ secciones });
  } catch (error) {
    console.error('Error fetching secciones activas:', error);
    return NextResponse.json({ secciones: [] });
  }
}
