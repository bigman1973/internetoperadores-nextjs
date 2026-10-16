import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  authorizeCertification,
  noStoreJson,
} from "@/lib/certificaciones/auth";
import { downloadCertificationDocument } from "@/lib/certificaciones/documents";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET() {
  try {
    const access = await authorizeCertification(
      "admin.certificaciones.cuestionarios",
    );
    if (access.response) return access.response;
    // Fixed reference only: this permission does not grant arbitrary access to ISO documents.
    const doc = await prisma.documentoCertificacion.findFirst({
      where: {
        titulo: "Formulario original de Draxton — PG-06.2_A10 ed.3",
        programa: { norma: "ISO27001" },
      },
      orderBy: { createdAt: "asc" },
      select: {
        driveId: true,
        itemId: true,
        sha256: true,
        mime: true,
        nombreArchivo: true,
      },
    });
    if (!doc)
      return noStoreJson(
        { error: "El formulario original aún no se ha archivado" },
        404,
      );
    const bytes = await downloadCertificationDocument(
      doc.driveId,
      doc.itemId,
      doc.sha256,
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": doc.mime,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(doc.nombreArchivo)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = ["El documento original ha cambiado; revisión necesaria", "Referencia privada no válida", "No se pudo recuperar el documento privado", "Documento demasiado grande"];
    return noStoreJson({ error: known.includes(message) ? message : "No se pudo recuperar el original protegido" }, 502);
  }
}
