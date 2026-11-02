export const dynamic = "force-dynamic";
import { redirect } from 'next/navigation'
import prisma from '../../../lib/prisma'
import UsuariosAdminClient from '../../../components/admin/UsuariosAdminClient'
import { serializeUsuariosInitiales } from '../../../components/admin/usuariosInitialData'
import { requireArea4Owner } from '@/lib/area4/live-admin'
import MenuPresentationControl from '@/components/admin/MenuPresentationControl'

export default async function UsuariosPage() {
  const auth = await requireArea4Owner(prisma)
  if (!auth.ok) redirect('/admin')

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

  return <>
    <MenuPresentationControl />
    <UsuariosAdminClient initialUsuarios={serializeUsuariosInitiales(usuarios)} />
  </>
}
