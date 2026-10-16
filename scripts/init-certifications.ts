import "dotenv/config";
import { PrismaClient, Prisma } from "@prisma/client";
import { initialProgram, NORMAS } from "../lib/certificaciones/core";
import {
  createEmptySecurityAnswers,
  QUESTIONNAIRE_TITLE,
} from "../lib/certificaciones/questionnaires";
const prisma = new PrismaClient();
async function run() {
  if (process.env.INIT_CERTIFICATIONS !== "1")
    throw new Error("Inicialización explícita requerida");
  const actorId = Number(process.env.CERTIFICATION_ACTOR_ID);
  const actor =
    Number.isSafeInteger(actorId) && actorId > 0
      ? await prisma.usuarioAdmin.findUnique({
          where: { id: actorId },
          select: { activo: true, rol: true },
        })
      : null;
  if (!actor?.activo || !["SUPER_ADMIN", "GERENTE"].includes(actor.rol))
    throw new Error("Dirección activa requerida");
  await prisma.$transaction(async (tx) => {
    // Serialize initialization without changing existing programmes, answers or permissions.
    await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(20261016, 27001)) l`;
    for (const n of NORMAS) {
      if (
        await tx.programaCertificacion.findUnique({
          where: { norma: n },
          select: { id: true },
        })
      )
        continue;
      const p = await tx.programaCertificacion.create({
        data: initialProgram(n),
      });
      await tx.auditoriaCertificacion.create({
        data: {
          recurso: "PROGRAMA",
          recursoId: p.id,
          norma: n,
          actorId,
          accion: "INICIALIZAR",
          detalle: {
            estado: p.estado,
            origen:
              "Datos confirmados por Dirección 16/10/2026. Hitos propuestos, sin certificación ni controles completados.",
          },
        },
      });
    }
    if (
      !(await tx.cuestionarioSeguridad.findFirst({
        where: { empresa: "Draxton", titulo: QUESTIONNAIRE_TITLE },
        select: { id: true },
      }))
    ) {
      const q = await tx.cuestionarioSeguridad.create({
        data: {
          empresa: "Draxton",
          titulo: QUESTIONNAIRE_TITLE,
          fechaLimite: new Date("2026-10-21T00:00:00Z"),
          estado: "BORRADOR",
          respuestas:
            createEmptySecurityAnswers() as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.auditoriaCertificacion.create({
        data: {
          recurso: "CUESTIONARIO",
          recursoId: q.id,
          actorId,
          accion: "INICIALIZAR",
          detalle: {
            estado: "BORRADOR",
            respuestas: "23 PENDIENTES",
            origen: "Formulario y plazo proporcionados por Dirección",
          },
        },
      });
    }
  });
  const areas = [
    ["admin.certificaciones", "Certificaciones", "admin", 1050],
    [
      "admin.certificaciones.iso_27001",
      "Certificaciones > ISO 27001",
      "admin.certificaciones",
      1051,
    ],
    [
      "admin.certificaciones.tisax",
      "Certificaciones > TISAX",
      "admin.certificaciones",
      1052,
    ],
    [
      "admin.certificaciones.cuestionarios",
      "Certificaciones > Cuestionarios de seguridad",
      "admin.certificaciones",
      1053,
    ],
  ] as const;
  for (const [codigo, nombre, padre, orden] of areas)
    await prisma.permisoArea.upsert({
      where: { codigo },
      update: { nombre, padre },
      create: { codigo, nombre, padre, orden, activo: true },
    });
  console.log(
    "Inicialización completada: seguimiento ISO/TISAX y Draxton sin respuestas. Sin certificaciones, controles completados ni permisos concedidos.",
  );
}
run()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "Inicialización fallida",
    );
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
