import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import CertificationsWorkspace from "@/components/certificaciones/CertificationsWorkspace";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkAdminAreaRead } from "@/lib/api-admin-area-read";
import { registrarArea } from "@/lib/permisos";

export const dynamic = "force-dynamic";

const NORMS = {
  "iso-27001": {
    norma: "ISO27001" as const,
    area: "admin.certificaciones.iso_27001",
  },
  tisax: {
    norma: "TISAX" as const,
    area: "admin.certificaciones.tisax",
  },
};

/** Protected server shell for an individual certification programme. */
export default async function CertificacionNormaPage({
  params,
}: {
  params: Promise<{ norma: string }>;
}) {
  const { norma: slug } = await params;
  const selected = NORMS[slug as keyof typeof NORMS];
  if (!selected) notFound();

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
  const currentSession = {
    ...session,
    user: { ...session.user, role: activeUser.rol, roles: activeUser.roles },
  };
  const denied = await checkAdminAreaRead(selected.area, [], currentSession);
  if (denied) redirect("/admin");

  return <CertificationsWorkspace norma={selected.norma} />;
}
