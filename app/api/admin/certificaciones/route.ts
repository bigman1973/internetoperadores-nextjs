import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  authorizeCertification,
  jsonBody,
  noStoreJson,
} from "@/lib/certificaciones/auth";
import {
  AREAS,
  NORMAS,
  norma,
  version,
  uuid,
  progress,
  programaInput,
  hitoInput,
  ValidationError,
  ConflictError,
} from "@/lib/certificaciones/core";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const include = {
  hitos: { orderBy: { orden: "asc" as const }, take: 100 },
  documentos: {
    select: {
      id: true,
      titulo: true,
      tipo: true,
      nombreArchivo: true,
      mime: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" as const },
    take: 100,
  },
};
export async function GET(request: NextRequest) {
  try {
    const requested = request.nextUrl.searchParams.get("norma");
    const allowed = [];
    for (const n of requested ? [norma(requested)] : NORMAS) {
      const access = await authorizeCertification(AREAS[n]);
      if (access.response) {
        if (requested || access.response.status === 401) return access.response;
        continue;
      }
      const write = await authorizeCertification(
        AREAS[n],
        true,
        undefined,
        false,
      );
      const programa = await prisma.programaCertificacion.findUnique({
        where: { norma: n },
        include,
      });
      if (programa)
        allowed.push({
          ...programa,
          avance: progress(programa.hitos),
          canWrite: !write.response,
        });
    }
    if (!allowed.length)
      return noStoreJson(
        { error: "Sin acceso a programas de certificación" },
        403,
      );
    return noStoreJson({
      programas: allowed,
      ...(requested ? { canWrite: allowed[0].canWrite } : {}),
    });
  } catch (e) {
    return noStoreJson(
      {
        error:
          e instanceof ValidationError
            ? e.message
            : "No se pudo consultar el seguimiento",
      },
      e instanceof ValidationError ? 400 : 500,
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    // Reject anonymous calls before processing user-controlled bodies.
    const base = await authorizeCertification("admin.certificaciones");
    if (base.response?.status === 401) return base.response;
    const b = await jsonBody(request);
    const n = norma(b.norma);
    const auth = await authorizeCertification(AREAS[n], true, request);
    if (auth.response) return auth.response;
    const v = version(b.version);
    if (b.action === "actualizar_programa") {
      const data = programaInput(b);
      await prisma.$transaction(async (tx) => {
        const p = await tx.programaCertificacion.findUnique({
          where: { norma: n },
          select: { id: true },
        });
        if (!p) throw new ValidationError("Programa no encontrado");
        if (data.estado === "VIGENTE") {
          const doc = await tx.documentoCertificacion.findFirst({
            where: {
              id: data.documentoAcreditacionId!,
              programaId: p.id,
              tipo: n === "ISO27001" ? "CERTIFICADO" : "RESULTADO_TISAX",
            },
            select: { id: true },
          });
          if (!doc)
            throw new ValidationError(
              "El documento no acredita esta norma o pertenece a otro programa",
            );
        }
        const changed = await tx.programaCertificacion.updateMany({
          where: { id: p.id, version: v },
          data: { ...data, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictError(
            "El seguimiento ha cambiado. Recarga antes de guardar.",
          );
        await tx.auditoriaCertificacion.create({
          data: {
            recurso: "PROGRAMA",
            recursoId: p.id,
            norma: n,
            actorId: auth.actorId,
            accion: "ACTUALIZAR",
            detalle: {
              versionAnterior: v,
              versionNueva: v + 1,
              estado: data.estado,
            },
          },
        });
      });
    } else if (b.action === "actualizar_hito") {
      const id = uuid(b.id),
        data = hitoInput(b);
      await prisma.$transaction(async (tx) => {
        const changed = await tx.hitoCertificacion.updateMany({
          where: { id, version: v, programa: { norma: n } },
          data: { ...data, version: { increment: 1 } },
        });
        if (changed.count !== 1)
          throw new ConflictError(
            "El hito ha cambiado o no pertenece a este programa. Recarga antes de guardar.",
          );
        await tx.auditoriaCertificacion.create({
          data: {
            recurso: "HITO",
            recursoId: id,
            norma: n,
            actorId: auth.actorId,
            accion: "ACTUALIZAR",
            detalle: {
              versionAnterior: v,
              versionNueva: v + 1,
              estado: data.estado,
            },
          },
        });
      });
    } else return noStoreJson({ error: "Acción no válida" }, 400);
    return noStoreJson({ ok: true });
  } catch (e) {
    if (e instanceof ValidationError)
      return noStoreJson({ error: e.message }, 400);
    if (e instanceof ConflictError || (e as any)?.code === "P2034")
      return noStoreJson(
        {
          error:
            e instanceof ConflictError
              ? e.message
              : "Conflicto de actualización. Recarga y vuelve a intentarlo.",
        },
        409,
      );
    if (e instanceof Error && e.message.startsWith("BODY_"))
      return noStoreJson(
        { error: "Cuerpo JSON no válido o demasiado grande" },
        e.message === "BODY_SIZE" ? 413 : e.message === "BODY_TYPE" ? 415 : 400,
      );
    return noStoreJson({ error: "No se pudo guardar el seguimiento" }, 500);
  }
}
