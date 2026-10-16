import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  authorizeCertification,
  noStoreJson,
} from "@/lib/certificaciones/auth";
import {
  AREAS,
  NORMAS,
  norma,
  text,
  TIPOS_DOCUMENTO,
  ValidationError,
} from "@/lib/certificaciones/core";
import {
  MAX_DOCUMENT,
  validateDocument,
  uploadCertificationDocument,
  downloadCertificationDocument,
} from "@/lib/certificaciones/documents";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: NextRequest) {
  try {
    // Authorize before reading a large multipart body. Scope is checked again after parsing.
    let actorId = 0;
    for (const n of NORMAS) {
      const access = await authorizeCertification(AREAS[n], true, request);
      if (!access.response) {
        actorId = access.actorId;
        break;
      }
      if (access.response.status === 401) return access.response;
    }
    if (!actorId)
      return noStoreJson(
        { error: "Sin permiso de escritura o origen no autorizado" },
        403,
      );
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("multipart/form-data")
    )
      return noStoreJson({ error: "Formato de subida no válido" }, 415);
    if (Number(request.headers.get("content-length")) > MAX_DOCUMENT + 32768)
      return noStoreJson({ error: "El archivo supera 4 MB" }, 413);
    // Bound the stream even when Content-Length is absent or dishonest.
    if (!request.body) return noStoreJson({ error: "Archivo requerido" }, 400);
    const reader = request.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > MAX_DOCUMENT + 32768) {
          await reader.cancel();
          return noStoreJson({ error: "Subida demasiado grande" }, 413);
        }
        chunks.push(r.value);
      }
    } finally {
      reader.releaseLock();
    }
    const form = await new Response(Buffer.concat(chunks, size), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const n = norma(form.get("norma"));
    const auth = await authorizeCertification(AREAS[n], true, request);
    if (auth.response) return auth.response;
    const titulo = text(form.get("titulo"), "Título", 240, true)!;
    const tipo = String(form.get("tipo") || "BORRADOR");
    if (
      !TIPOS_DOCUMENTO.includes(tipo as any) ||
      (n === "TISAX" && tipo === "CERTIFICADO") ||
      (n === "ISO27001" && tipo === "RESULTADO_TISAX")
    )
      throw new ValidationError("Tipo de documento no válido para esta norma");
    const file = form.get("file");
    if (
      !file ||
      typeof file === "string" ||
      !file.size ||
      file.size > MAX_DOCUMENT
    )
      throw new ValidationError("Archivo PDF o DOCX requerido, máximo 4 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    const { mime } = validateDocument(bytes, file.name);
    const filename = file.name
      .replace(/[\r\n\x00-\x1f/\\]/g, "_")
      .slice(0, 200);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const p = await prisma.programaCertificacion.findUnique({
      where: { norma: n },
      select: { id: true },
    });
    if (!p) return noStoreJson({ error: "Programa no encontrado" }, 404);
    const existing = await prisma.documentoCertificacion.findUnique({
      where: {
        programaId_sha256_tipo: { programaId: p.id, sha256: hash, tipo },
      },
      select: { id: true, driveId: true, itemId: true, sha256: true },
    });
    if (existing) {
      try {
        await downloadCertificationDocument(
          existing.driveId,
          existing.itemId,
          existing.sha256,
        );
        return noStoreJson({ ok: true, id: existing.id, reutilizado: true });
      } catch (error) {
        // Never bypass a permission or transport failure. Only restore an exact original
        // whose supplied bytes match the persisted SHA-256; leave the older item intact.
        if (
          !(error instanceof Error) ||
          error.message !==
            "El documento original ha cambiado; revisión necesaria"
        )
          throw error;
      }
      const immutable = await uploadCertificationDocument(n, bytes, filename);
      await prisma.$transaction(async (tx) => {
        const changed = await tx.documentoCertificacion.updateMany({
          where: {
            id: existing.id,
            sha256: hash,
            driveId: existing.driveId,
            itemId: existing.itemId,
          },
          data: { driveId: immutable.drive, itemId: immutable.item },
        });
        if (changed.count !== 1)
          throw new Error("Puntero documental actualizado por otra sesión");
        await tx.auditoriaCertificacion.create({
          data: {
            recurso: "DOCUMENTO",
            recursoId: existing.id,
            norma: n,
            actorId: auth.actorId,
            accion: "CONSERVAR_ORIGINAL",
            detalle: {
              sha256: hash,
              itemAnteriorConservado: existing.itemId,
              copiaBinariaInmutable: true,
            },
          },
        });
      });
      return noStoreJson({
        ok: true,
        id: existing.id,
        originalVerificado: true,
      });
    }
    const stored = await uploadCertificationDocument(n, bytes, filename);
    await downloadCertificationDocument(stored.drive, stored.item, stored.hash);
    const doc = await prisma.$transaction(async (tx) => {
      const concurrent = await tx.documentoCertificacion.findUnique({
        where: {
          programaId_sha256_tipo: { programaId: p.id, sha256: hash, tipo },
        },
      });
      if (concurrent) return concurrent;
      const result = await tx.documentoCertificacion.create({
        data: {
          programaId: p.id,
          titulo,
          tipo,
          nombreArchivo: filename,
          mime,
          driveId: stored.drive,
          itemId: stored.item,
          sha256: hash,
          bytes: bytes.length,
          creadoPor: auth.actorId,
        },
      });
      await tx.auditoriaCertificacion.create({
        data: {
          recurso: "DOCUMENTO",
          recursoId: result.id,
          norma: n,
          actorId: auth.actorId,
          accion: "SUBIR",
          detalle: { tipo, sha256: hash, bytes: bytes.length },
        },
      });
      return result;
    });
    return noStoreJson({ ok: true, id: doc.id });
  } catch (e) {
    if (e instanceof ValidationError)
      return noStoreJson({ error: e.message }, 400);
    if ((e as any)?.code === "P2002" || (e as any)?.code === "P2034")
      return noStoreJson(
        {
          error:
            "La subida ha cambiado en otra sesión. Recarga y vuelve a intentarlo; no se han completado hitos.",
        },
        409,
      );
    return noStoreJson(
      {
        error:
          "No se pudo guardar el documento privado. No se han completado hitos ni registrado una certificación.",
      },
      502,
    );
  }
}
