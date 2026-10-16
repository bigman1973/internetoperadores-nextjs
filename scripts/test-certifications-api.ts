import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { createRequire } from "node:module";
import { NextRequest, NextResponse } from "next/server";
import * as core from "../lib/certificaciones/core";
import { zipSync, strToU8 } from "fflate";
import * as questionnaireLib from "../lib/certificaciones/questionnaires";
const realRequire = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, any>) {
  for (const value of Object.values(mocks))
    if (Object.hasOwn(value, "default")) value.__esModule = true;
  const code = ts.transpileModule(fs.readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const exports: any = {};
  new Function("require", "exports", code)(
    (name: string) =>
      Object.hasOwn(mocks, name) ? mocks[name] : realRequire(name),
    exports,
  );
  return exports;
}
async function run() {
  let active = true,
    role = "SUPER_ADMIN",
    signed = true;
  const session = {
    user: { id: "1", userType: "admin", role: "SUPER_ADMIN", roles: [] },
  };
  const check = async (_: string, __: unknown, current: any) =>
    current.user.role === "SUPER_ADMIN"
      ? null
      : NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  const auth = load("lib/certificaciones/auth.ts", {
    "next-auth": { getServerSession: async () => (signed ? session : null) },
    "@/lib/auth": { authOptions: {} },
    "@/lib/prisma": {
      default: {
        usuarioAdmin: {
          findUnique: async () => ({ activo: active, rol: role, roles: [] }),
        },
      },
    },
    "@/lib/api-admin-area-read": {
      checkAdminAreaRead: check,
      checkAdminAreaWrite: check,
    },
  });
  const origin = "https://panel.example";
  assert.equal(
    (await auth.authorizeCertification("admin.certificaciones")).response,
    null,
  );
  signed = false;
  assert.equal(
    (await auth.authorizeCertification("admin.certificaciones")).response
      .status,
    401,
  );
  signed = true;
  active = false;
  assert.equal(
    (await auth.authorizeCertification("admin.certificaciones")).response
      .status,
    401,
  );
  active = true;
  role = "VISOR";
  assert.equal(
    (await auth.authorizeCertification("admin.certificaciones")).response
      .status,
    403,
  );
  role = "SUPER_ADMIN";
  assert.equal(
    (
      await auth.authorizeCertification(
        "admin.certificaciones",
        true,
        new Request(origin, { headers: { origin: "https://otro.example" } }),
      )
    ).response.status,
    403,
  );
  assert.equal(
    (
      await auth.authorizeCertification(
        "admin.certificaciones",
        true,
        new Request(origin, { headers: { origin } }),
      )
    ).response,
    null,
  );
  await assert.rejects(() =>
    auth.jsonBody(
      new Request(origin, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "x".repeat(65000),
      }),
      100,
    ),
  );
  let updates = 0,
    audits = 0,
    grant = true,
    conflict = false;
  const program = {
    id: "b3af7730-b36e-4e16-a4ec-5c50a88dc808",
    norma: "ISO27001",
    hitos: [{ estado: "PENDIENTE" }],
    documentos: [],
  };
  const tx: any = {
    programaCertificacion: {
      findUnique: async () => program,
      updateMany: async () => {
        updates++;
        return { count: conflict ? 0 : 1 };
      },
    },
    hitoCertificacion: {
      updateMany: async () => {
        updates++;
        return { count: conflict ? 0 : 1 };
      },
    },
    documentoCertificacion: { findFirst: async () => null },
    auditoriaCertificacion: {
      create: async () => {
        audits++;
      },
    },
  };
  const route = load("app/api/admin/certificaciones/route.ts", {
    "@/lib/prisma": {
      default: { ...tx, $transaction: async (fn: any) => fn(tx) },
    },
    "@/lib/certificaciones/core": core,
    "@/lib/certificaciones/auth": {
      ...auth,
      authorizeCertification: async () => ({
        actorId: 1,
        response: grant
          ? null
          : NextResponse.json({ error: "Sin permiso" }, { status: 403 }),
      }),
    },
  });
  const req = (body: any) =>
    new NextRequest(origin + "/api/admin/certificaciones", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  let r = await route.GET(
    new NextRequest(origin + "/api/admin/certificaciones?norma=ISO27001"),
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal((await r.json()).programas[0].avance.porcentaje, null);
  r = await route.POST(
    req({
      action: "actualizar_programa",
      norma: "ISO27001",
      version: 1,
      estado: "VIGENTE",
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(updates, 0);
  r = await route.POST(
    req({
      action: "actualizar_hito",
      norma: "ISO27001",
      id: program.id,
      version: 1,
      estado: "COMPLETADO",
      evidencia: "No",
    }),
  );
  assert.equal(r.status, 400);
  assert.equal(updates, 0);
  grant = false;
  r = await route.POST(
    req({
      action: "actualizar_programa",
      norma: "ISO27001",
      version: 1,
      estado: "IMPLANTACION",
    }),
  );
  assert.equal(r.status, 403);
  assert.equal(updates, 0);
  grant = true;
  conflict = true;
  r = await route.POST(
    req({
      action: "actualizar_hito",
      norma: "ISO27001",
      id: program.id,
      version: 1,
      estado: "EN_CURSO",
    }),
  );
  assert.equal(r.status, 409);
  assert.equal(audits, 0);
  conflict = false;
  r = await route.POST(
    req({
      action: "actualizar_hito",
      norma: "ISO27001",
      id: program.id,
      version: 1,
      estado: "EN_CURSO",
    }),
  );
  assert.equal(r.status, 200);
  assert.equal(audits, 1);
  let createdAnswers: any[] = [];
  const qtx: any = {
    cuestionarioSeguridad: {
      create: async ({ data }: any) => {
        createdAnswers = data.respuestas;
        return { ...data, id: program.id, version: 1 };
      },
      updateMany: async () => ({ count: 1 }),
      findUniqueOrThrow: async () => ({ id: program.id }),
    },
    auditoriaCertificacion: tx.auditoriaCertificacion,
  };
  const questions = load(
    "app/api/admin/certificaciones/cuestionarios/route.ts",
    {
      "@/lib/prisma": {
        default: { ...qtx, $transaction: async (fn: any) => fn(qtx) },
      },
      "@/lib/certificaciones/questionnaires": questionnaireLib,
      "@/lib/certificaciones/auth": {
        ...auth,
        authorizeCertification: async () => ({
          actorId: 1,
          response: grant ? null : NextResponse.json({}, { status: 403 }),
        }),
      },
    },
  );
  r = await questions.POST(
    req({ action: "crear", empresa: "Cliente sintético" }),
  );
  assert.equal(r.status, 200);
  assert.equal(createdAnswers.length, 23);
  assert(createdAnswers.every((a) => a.respuesta === "PENDIENTE"));
  const qp = {
    action: "actualizar",
    id: program.id,
    version: 1,
    empresa: "Cliente sintético",
    titulo: "Cuestionario",
    contacto: null,
    emailContacto: null,
    fechaLimite: null,
    estado: "VALIDADO",
    respuestas: questionnaireLib.createEmptySecurityAnswers(),
  };
  r = await questions.POST(req(qp));
  assert.equal(r.status, 400);
  r = await questions.POST(req({ ...qp, estado: "BORRADOR" }));
  assert.equal(r.status, 200);
  r = await questions.POST(
    req({
      ...qp,
      estado: "BORRADOR",
      respuestas: qp.respuestas.map((a) => ({ ...a, id: 1 })),
    }),
  );
  assert.equal(r.status, 400);
  r = await questions.POST(
    req({
      ...qp,
      estado: "BORRADOR",
      respuestas: qp.respuestas.map((a) => ({
        ...a,
        evidencia: "Texto de ejemplo\nReferencia y fecha",
      })),
    }),
  );
  assert.equal(r.status, 200);
  r = await questions.POST(
    req({
      ...qp,
      estado: "BORRADOR",
      respuestas: qp.respuestas.map((a) => ({
        ...a,
        evidencia: "文".repeat(4000),
        observacion: "語".repeat(4000),
      })),
    }),
  );
  assert.equal(r.status, 200);
  const docs = load("lib/certificaciones/documents.ts", {
    "@/lib/finanzas/microsoft-graph": {},
    "./core": core,
  });
  assert.equal(
    docs.validateDocument(Buffer.from("%PDF-1.7\nsynthetic"), "test.pdf").mime,
    "application/pdf",
  );
  assert.throws(() =>
    docs.validateDocument(Buffer.from("not a pdf"), "test.pdf"),
  );
  assert.throws(() =>
    docs.validateDocument(Buffer.alloc(9 * 1024 * 1024), "large.pdf"),
  );
  const word = Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8("<w:document/>"),
    }),
  );
  assert.equal(docs.validateDocument(word, "test.docx").extension, "docx");
  const macro = Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8("<Types/>"),
      "word/document.xml": strToU8("<w:document/>"),
      "word/vbaProject.bin": strToU8("bad"),
    }),
  );
  assert.throws(() => docs.validateDocument(macro, "test.docx"));
  console.log(
    "Certificaciones API: sesión activa/rol actual, mismo origen, tamaño, permisos, conflictos, evidencia y archivos correctos. Sin datos reales.",
  );
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
