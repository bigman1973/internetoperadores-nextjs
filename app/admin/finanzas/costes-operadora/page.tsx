import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import OperatorCosts from "@/components/finanzas/OperatorCosts";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { checkAdminAreaRead } from "@/lib/api-admin-area-read";
import { registrarArea } from "@/lib/permisos";

export const dynamic = "force-dynamic";

/** Protected server shell: client-side mode never grants access by itself. */
export default async function CostesOperadoraPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.userType !== "admin")
    redirect("/admin/login");
  const userId = Number(session.user.id);
  if (!Number.isInteger(userId) || userId <= 0) redirect("/admin/login");
  const activeUser = await prisma.usuarioAdmin.findUnique({
    where: { id: userId },
    select: { activo: true },
  });
  if (!activeUser?.activo) redirect("/admin/login");

  // Reuses the established analytics area; it intentionally creates no divergent permission area.
  await registrarArea(
    "admin.finanzas.analitica_costes",
    "Finanzas > Analítica de costes",
    "admin.finanzas",
  );
  const denied = await checkAdminAreaRead(
    "admin.finanzas.analitica_costes",
    ["CONTABILIDAD"],
    session,
  );
  if (denied) redirect("/admin");

  return <OperatorCosts />;
}
