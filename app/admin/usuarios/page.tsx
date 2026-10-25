export const dynamic = "force-dynamic";
import { requireAdminAreaRead } from '@/lib/admin-area-auth'
import prisma from '../../../lib/prisma'
import UsuariosAdminClient from '../../../components/admin/UsuariosAdminClient'
import { serializeUsuariosInitiales } from '../../../components/admin/usuariosInitialData'

export default async function UsuariosPage() {
  await requireAdminAreaRead('admin.usuarios')

  const usuarios = await prisma.usuarioAdmin.findMany({
    select: {
      id: true,
      email: true,
      nombre: true,
      rol: true,
      roles: true,
      activo: true,
      ultimoAcceso: true,
      createdAt: true,
      perfilAsignado: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return <UsuariosAdminClient initialUsuarios={serializeUsuariosInitiales(usuarios)} />
}
