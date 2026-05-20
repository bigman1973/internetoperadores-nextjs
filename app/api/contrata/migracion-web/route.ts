import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const {
      nombreEmpresa,
      contacto,
      email,
      telefono,
      urlWebActual,
      sector,
      sectorOtro,
      numPaginas,
      tieneBlog,
      tieneTienda,
      tieneFormularios,
      tieneAreaPrivada,
      frustracionActual,
      objetivos,
      respuestasSector,
      softwareActual,
      tieneApi,
      datosIntegracion,
      proveedorActual,
      presupuesto,
      fechaLimite,
      comoNosConocio,
    } = body;

    // Validaciones básicas
    if (!nombreEmpresa || !contacto || !email) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: nombre empresa, contacto y email' },
        { status: 400 }
      );
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'El email no es válido' },
        { status: 400 }
      );
    }

    // Determinar si necesita integración
    const necesitaIntegracion = Array.isArray(objetivos) && objetivos.includes('integrar_software');

    // Crear el lead en la BD
    const lead = await prisma.leadMigracionWeb.create({
      data: {
        nombreEmpresa,
        contacto,
        email,
        telefono: telefono || null,
        urlWebActual: urlWebActual || null,
        sector: sector || null,
        sectorOtro: sectorOtro || null,
        numPaginas: numPaginas || null,
        tieneBlog: tieneBlog || false,
        tieneTienda: tieneTienda || false,
        tieneFormularios: tieneFormularios || false,
        tieneAreaPrivada: tieneAreaPrivada || false,
        frustracionActual: frustracionActual || null,
        objetivos: objetivos || [],
        respuestasSector: respuestasSector || {},
        necesitaIntegracion,
        softwareActual: necesitaIntegracion ? (softwareActual || null) : null,
        tieneApi: necesitaIntegracion ? (tieneApi || null) : null,
        datosIntegracion: necesitaIntegracion ? (datosIntegracion || null) : null,
        proveedorActual: necesitaIntegracion ? (proveedorActual || null) : null,
        presupuesto: presupuesto || null,
        fechaLimite: fechaLimite || null,
        comoNosConocio: comoNosConocio || null,
        estado: 'NUEVO',
        prioridad: calcularPrioridad(presupuesto, sector),
      },
    });

    return NextResponse.json({ success: true, id: lead.id }, { status: 201 });
  } catch (error: any) {
    console.error('Error al crear lead:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

function calcularPrioridad(presupuesto?: string, sector?: string): 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE' {
  if (presupuesto === 'Más de 12.000 €') return 'ALTA';
  if (presupuesto === '6.000 - 12.000 €') return 'ALTA';
  if (presupuesto === '3.000 - 6.000 €') return 'MEDIA';
  if (presupuesto === 'Menos de 3.000 €') return 'BAJA';
  return 'MEDIA';
}
