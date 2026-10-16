import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import CertificationsWorkspace from "@/components/certificaciones/CertificationsWorkspace";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkAdminAreaRead } from "@/lib/api-admin-area-read";
import { registrarArea } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Server-side access gate. The summary is visible when the parent or either programme is readable. */
export default async function CertificacionesPage() {
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

  const currentSession = {
    ...session,
    user: { ...session.user, role: activeUser.rol, roles: activeUser.roles },
  };
  await Promise.all([
    registrarArea("admin.certificaciones", "Certificaciones"),
    registrarArea(
      "admin.certificaciones.iso_27001",
      "Certificaciones > ISO 27001",
      "admin.certificaciones",
    ),
    registrarArea(
      "admin.certificaciones.tisax",
      "Certificaciones > TISAX",
      "admin.certificaciones",
    ),
  ]);

  const [parentDenied, isoDenied, tisaxDenied] = await Promise.all([
    checkAdminAreaRead("admin.certificaciones", [], currentSession),
    checkAdminAreaRead("admin.certificaciones.iso_27001", [], currentSession),
    checkAdminAreaRead("admin.certificaciones.tisax", [], currentSession),
  ]);
  // A programme-specific read permission is sufficient for the common landing page.
  if (parentDenied && isoDenied && tisaxDenied) {
    const questions = await checkAdminAreaRead(
      "admin.certificaciones.cuestionarios",
      [],
      currentSession,
    );
    if (!questions) redirect("/admin/certificaciones/cuestionarios");
    redirect("/admin");
  }

  return <CertificationsWorkspace />;
}
