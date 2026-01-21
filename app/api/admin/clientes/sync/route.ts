import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getAllClientes } from '@/lib/ispgestion/service';
import bcrypt from 'bcryptjs';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);

    if (!session || session.user.userType !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 1. Obtener todos los clientes de ISPGestión
    const clientesIsp = await getAllClientes();
    
    if (!clientesIsp || clientesIsp.length === 0) {
      return NextResponse.json({ message: 'No se encontraron clientes en ISPGestión' });
    }

    let creados = 0;
    let actualizados = 0;

    // 2. Procesar cada cliente
    for (const c of clientesIsp) {
      // Mapeamos los campos (ajustar según la respuesta real de la API)
      const email = c.email || c.correo;
      const nombre = c.nombre || `${c.nombre_pila} ${c.apellidos}`;
      const ispgestionId = String(c.id || c.codigo_cliente);

      if (!email) continue;

      // Buscamos si ya existe
      const existing = await prisma.clienteWeb.findUnique({
        where: { email }
      });

      if (existing) {
        await prisma.clienteWeb.update({
          where: { id: existing.id },
          data: {
            nombre,
            ispGestionId: ispgestionId,
          }
        });
        actualizados++;
      } else {
        // Si es nuevo, le asignamos una contraseña temporal (su email o similar)
        // El cliente podrá cambiarla o usar "olvidé mi contraseña"
        const tempPassword = await bcrypt.hash('cliente123', 10);
        await prisma.clienteWeb.create({
          data: {
            email,
            nombre,
            passwordHash: tempPassword,
            ispGestionId: ispgestionId,
            newsletterSuscrito: false,
          }
        });
        creados++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Sincronización completada: ${creados} creados, ${actualizados} actualizados.` 
    });

  } catch (error) {
    console.error('Error en sync clientes:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }, { status: 500 });
  }
}
