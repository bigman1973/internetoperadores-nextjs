import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import SecurityQuestionnaires from "@/components/certificaciones/SecurityQuestionnaires";
import { authOptions } from "@/lib/auth";
import { checkAdminAreaRead } from "@/lib/api-admin-area-read";
import { registrarArea } from "@/lib/permisos";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** La protección server-side evita que el cliente otorgue acceso por sí mismo. */
export default async function SecurityQuestionnairesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== "admin")
    redirect("/admin/login");

  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) redirect("/admin/login");
  const activeUser = await prisma.usuarioAdmin.findUnique({
    where: { id: userId },
    select: { activo: true, rol: true, roles: true },
  });
  if (!activeUser?.activo) redirect("/admin/login");

  // Registrar no concede permisos ni asigna usuarios; solo hace visible el área.
  await registrarArea("admin.certificaciones", "Certificaciones", "admin");
  await registrarArea(
    "admin.certificaciones.cuestionarios",
    "Certificaciones > Cuestionarios de seguridad",
    "admin.certificaciones",
  );
  const currentSession = {
    ...session,
    user: { ...session.user, role: activeUser.rol, roles: activeUser.roles },
  };
  const denied = await checkAdminAreaRead(
    "admin.certificaciones.cuestionarios",
    [],
    currentSession,
  );
  if (denied) redirect("/admin");

  return <SecurityQuestionnaires />;
}
