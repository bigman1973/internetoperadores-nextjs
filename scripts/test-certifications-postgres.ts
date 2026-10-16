import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { initialProgram } from "../lib/certificaciones/core";
const prisma = new PrismaClient();
class RollbackOnly extends Error {}
async function run() {
  if (process.env.CERTIFICATIONS_ROLLBACK_TEST !== "1")
    throw new Error("Prueba de rollback explícita requerida");
  let completed = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        const p =
          (await tx.programaCertificacion.findUnique({
            where: { norma: "ISO27001" },
            select: { id: true },
          })) ||
          (await tx.programaCertificacion.create({
            data: initialProgram("ISO27001"),
            select: { id: true },
          }));
        const h = await tx.hitoCertificacion.create({
          data: {
            programaId: p.id,
            clave: `SYNTHETIC-${randomUUID()}`,
            titulo: "Hito sintético de rollback",
            descripcion: "No se conserva",
            orden: 999,
          },
        });
        const one = await tx.hitoCertificacion.updateMany({
          where: { id: h.id, version: 1 },
          data: { estado: "EN_CURSO", version: { increment: 1 } },
        });
        assert.equal(one.count, 1);
        const stale = await tx.hitoCertificacion.updateMany({
          where: { id: h.id, version: 1 },
          data: { estado: "PENDIENTE", version: { increment: 1 } },
        });
        assert.equal(stale.count, 0);
        await tx.$executeRawUnsafe("SAVEPOINT invalid_evidence");
        let blocked = false;
        try {
          await tx.hitoCertificacion.update({
            where: { id: h.id },
            data: { estado: "COMPLETADO", evidencia: "" },
          });
        } catch {
          blocked = true;
          await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT invalid_evidence");
        }
        assert(blocked, "La base de datos debe bloquear hitos sin evidencia");
        await tx.auditoriaCertificacion.create({
          data: {
            recurso: "HITO",
            recursoId: h.id,
            norma: "ISO27001",
            actorId: 1,
            accion: "TEST_ROLLBACK",
            detalle: { synthetic: true },
          },
        });
        completed = true;
        throw new RollbackOnly("ROLLBACK_REQUIRED");
      },
      { timeout: 20000 },
    );
  } catch (e) {
    if (!(e instanceof RollbackOnly)) throw e;
  }
  assert(completed);
  assert.equal(
    await prisma.hitoCertificacion.count({
      where: { clave: { startsWith: "SYNTHETIC-" } },
    }),
    0,
  );
  assert.equal(
    await prisma.auditoriaCertificacion.count({
      where: { accion: "TEST_ROLLBACK" },
    }),
    0,
  );
  console.log(
    "PostgreSQL: versiones y guardas verificadas; rollback completo, sin hitos o auditorías sintéticos persistidos.",
  );
}
run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Prueba fallida");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
