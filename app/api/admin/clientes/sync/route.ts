export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { getAllClientes } from '../../../../lib/ispgestion/service';
import { prisma } from '../../../../lib/prisma';
import bcrypt from 'bcryptjs';

export async function POST() {
  try {
    console.log('Iniciando sincronización masiva de clientes...');
    const clientesIsp = await getAllClientes();
    
    if (!clientesIsp || !Array.isArray(clientesIsp)) {
      return NextResponse.json({ error: 'No se recibieron clientes de ISPGestión' }, { status: 400 });
    }

    let creados = 0;
    let actualizados = 0;
    const defaultPassword = await bcrypt.hash('cliente123', 10);

    for (const c of clientesIsp) {
      const email = c.email || `${c.id}@internetoperadores.com`;
      
      await prisma.clienteWeb.upsert({
        where: { email: email },
        update: {
          nombre: c.nombre || c.razon_social || 'Cliente sin nombre',
          ispGestionId: String(c.id),
        },
        create: {
          email: email,
          nombre: c.nombre || c.razon_social || 'Cliente sin nombre',
          passwordHash: defaultPassword,
          ispGestionId: String(c.id),
        }
      });
      
      creados++;
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sincronización completada: ${creados} clientes procesados.` 
    });
  } catch (error: any) {
    console.error('Error en sincronización:', error);
    return NextResponse.json({ 
      error: 'Error en la sincronización', 
      details: error.message 
    }, { status: 500 });
  }
}
