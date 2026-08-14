const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.usuarioAdmin.findFirst({ where: { email: 'alejandro.martinez@internetoperadores.com' } });
  if (user) {
    const permisos = await prisma.permisoUsuario.count({ where: { usuarioId: user.id } });
    console.log('Alejandro id:', user.id, '| permisos:', permisos, '| perfilAsignado:', user.perfilAsignado);
    
    if (permisos > 0 && !user.perfilAsignado) {
      const perfil = await prisma.perfilPermisos.findFirst({ where: { nombre: { contains: 'Draxton' } } });
      if (perfil) {
        await prisma.usuarioAdmin.update({ where: { id: user.id }, data: { perfilAsignado: perfil.nombre } });
        console.log('Asignado perfil:', perfil.nombre);
      } else {
        console.log('No se encontro perfil Draxton');
        const perfiles = await prisma.perfilPermisos.findMany({ select: { nombre: true } });
        console.log('Perfiles disponibles:', perfiles.map(p => p.nombre));
      }
    } else if (user.perfilAsignado) {
      console.log('Ya tiene perfil asignado:', user.perfilAsignado);
    } else {
      console.log('No tiene permisos granulares asignados');
    }
  } else {
    console.log('Usuario no encontrado');
  }
}

main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
