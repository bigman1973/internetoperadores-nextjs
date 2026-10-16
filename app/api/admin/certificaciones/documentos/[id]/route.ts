import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  authorizeCertification,
  noStoreJson,
} from "@/lib/certificaciones/auth";
import {
  AREAS,
  NORMAS,
  Norma,
  uuid,
  ValidationError,
} from "@/lib/certificaciones/core";
import { downloadCertificationDocument } from "@/lib/certificaciones/documents";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let canRead = false;
    for (const n of NORMAS) {
      const access = await authorizeCertification(AREAS[n]);
      if (access.response?.status === 401) return access.response;
      if (!access.response) {
        canRead = true;
        break;
      }
    }
    if (!canRead) return noStoreJson({ error: "Sin permiso de lectura" }, 403);
    const id = uuid((await params).id);
    const doc = await prisma.documentoCertificacion.findUnique({
      where: { id },
      include: { programa: { select: { norma: true } } },
    });
    if (!doc) return noStoreJson({ error: "Documento no encontrado" }, 404);
    const access = await authorizeCertification(
      AREAS[doc.programa.norma as Norma],
    );
    if (access.response) return access.response;
    const bytes = await downloadCertificationDocument(
      doc.driveId,
      doc.itemId,
      doc.sha256,
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombreArchivo)}`,
        "Content-Length": String(bytes.length),
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return noStoreJson(
      {
        error:
          e instanceof ValidationError
            ? e.message
            : "No se pudo recuperar el documento privado",
      },
      e instanceof ValidationError ? 400 : 502,
    );
  }
}
