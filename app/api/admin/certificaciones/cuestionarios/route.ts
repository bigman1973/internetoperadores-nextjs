import { Prisma } from "@prisma/client";
import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import {
  authorizeCertification,
  jsonBody,
  noStoreJson,
} from "@/lib/certificaciones/auth";
import {
  completedAnswers,
  createEmptySecurityAnswers,
  isValidIsoDate,
  QUESTIONNAIRE_STATES,
  QUESTIONNAIRE_TITLE,
  RESPONSE_VALUES,
  SECURITY_QUESTIONS,
  type QuestionnaireState,
  type SecurityAnswer,
  validationErrorsForQuestionnaire,
} from "@/lib/certificaciones/questionnaires";

export const dynamic = "force-dynamic";

const AREA = "admin.certificaciones.cuestionarios";
const MAX_BODY_BYTES = 1280 * 1024; // Covers 23 × 2 × 4000 characters, including JSON escaping.
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

class InputError extends Error {}
class ConflictError extends Error {}

type UpdateInput = {
  id: string;
  version: number;
  empresa: string;
  titulo: string;
  contacto: string | null;
  emailContacto: string | null;
  fechaLimite: Date | null;
  estado: QuestionnaireState;
  respuestas: SecurityAnswer[];
};

function own(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function object(
  value: unknown,
  message = "Datos no válidos.",
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new InputError(message);
  return value as Record<string, unknown>;
}

function text(
  value: unknown,
  label: string,
  max: number,
  options: { required?: boolean } = {},
): string | null {
  const required = options.required !== false;
  if (value === null || value === undefined) {
    if (required) throw new InputError(`${label} es obligatorio.`);
    return null;
  }
  if (typeof value !== "string") throw new InputError(`${label} no es válido.`);
  const normalized = value.trim();
  if (
    (required && !normalized) ||
    normalized.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(normalized)
  )
    throw new InputError(`${label} no es válido.`);
  return normalized || null;
}

function nullableDate(value: unknown, required: boolean): Date | null {
  if (value === undefined) {
    if (required)
      throw new InputError("La fecha límite es obligatoria en esta operación.");
    return null;
  }
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !isValidIsoDate(value))
    throw new InputError("La fecha límite no es válida.");
  return new Date(`${value}T00:00:00.000Z`);
}

function nullableEmail(value: unknown, required: boolean): string | null {
  const candidate = text(value, "El email de contacto", 320, { required });
  if (candidate && !EMAIL.test(candidate))
    throw new InputError("El email de contacto no es válido.");
  return candidate;
}

function answers(value: unknown): SecurityAnswer[] {
  if (!Array.isArray(value) || value.length !== SECURITY_QUESTIONS.length)
    throw new InputError(
      "Deben enviarse exactamente las 23 respuestas del cuestionario.",
    );
  const ids = new Set<number>();
  const parsed = value.map((raw) => {
    const answer = object(raw, "Respuesta no válida.");
    if (
      !Number.isInteger(answer.id) ||
      !SECURITY_QUESTIONS.some((question) => question.id === answer.id)
    )
      throw new InputError("Identificador de pregunta no válido.");
    if (ids.has(answer.id as number))
      throw new InputError("No se pueden repetir preguntas.");
    ids.add(answer.id as number);
    if (
      typeof answer.respuesta !== "string" ||
      !RESPONSE_VALUES.includes(answer.respuesta as SecurityAnswer["respuesta"])
    )
      throw new InputError("Respuesta no válida.");
    const evidencia =
      text(answer.evidencia, "La evidencia", 4000, { required: false }) || "";
    const observacion =
      text(answer.observacion, "La observación", 4000, { required: false }) ||
      "";
    return {
      id: answer.id as number,
      respuesta: answer.respuesta as SecurityAnswer["respuesta"],
      evidencia,
      observacion,
    };
  });
  if (ids.size !== SECURITY_QUESTIONS.length)
    throw new InputError("Faltan preguntas en el cuestionario.");
  return parsed.sort((a, b) => a.id - b.id);
}

function parseCreate(value: Record<string, unknown>) {
  if (value.action !== "crear") throw new InputError("Acción no válida.");
  const empresa = text(value.empresa, "La empresa", 160)!;
  const titulo = own(value, "titulo")
    ? text(value.titulo, "El título", 200, { required: false }) ||
      QUESTIONNAIRE_TITLE
    : QUESTIONNAIRE_TITLE;
  return {
    empresa,
    titulo,
    contacto: own(value, "contacto")
      ? text(value.contacto, "El contacto", 160, { required: false })
      : null,
    emailContacto: own(value, "emailContacto")
      ? nullableEmail(value.emailContacto, false)
      : null,
    fechaLimite: own(value, "fechaLimite")
      ? nullableDate(value.fechaLimite, false)
      : null,
  };
}

function parseUpdate(value: Record<string, unknown>): UpdateInput {
  if (value.action !== "actualizar") throw new InputError("Acción no válida.");
  if (typeof value.id !== "string" || !UUID.test(value.id))
    throw new InputError("Identificador no válido.");
  if (
    !Number.isSafeInteger(value.version) ||
    (value.version as number) < 1 ||
    (value.version as number) > 2147483646
  )
    throw new InputError("Versión no válida.");
  if (
    typeof value.estado !== "string" ||
    !QUESTIONNAIRE_STATES.includes(value.estado as QuestionnaireState)
  )
    throw new InputError("Estado no válido.");
  const parsedAnswers = answers(value.respuestas);
  const estado = value.estado as QuestionnaireState;
  const validation = validationErrorsForQuestionnaire(estado, parsedAnswers);
  if (validation.length) throw new InputError(validation[0]);
  return {
    id: value.id,
    version: value.version as number,
    empresa: text(value.empresa, "La empresa", 160)!,
    titulo: text(value.titulo, "El título", 200)!,
    contacto: text(value.contacto, "El contacto", 160, { required: false }),
    emailContacto: nullableEmail(value.emailContacto, false),
    fechaLimite: nullableDate(value.fechaLimite, false),
    estado,
    respuestas: parsedAnswers,
  };
}

function toListItem(row: {
  id: string;
  empresa: string;
  estado: string;
  fechaLimite: Date | null;
  version: number;
  respuestas: unknown;
}) {
  const responseList = Array.isArray(row.respuestas)
    ? (row.respuestas as SecurityAnswer[])
    : [];
  return {
    id: row.id,
    empresa: row.empresa,
    estado: row.estado,
    fechaLimite: row.fechaLimite,
    version: row.version,
    respuestasCompletadas: completedAnswers(responseList),
  };
}

async function readJson(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  try {
    return await jsonBody(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TYPE")
      throw new InputError("Se requiere contenido JSON.");
    if (error instanceof Error && error.message === "BODY_SIZE")
      throw new InputError("La solicitud es demasiado grande.");
    throw new InputError("JSON no válido.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authorizeCertification(AREA, false, request);
    if (auth.response) return auth.response;
    const writeAccess = await authorizeCertification(
      AREA,
      true,
      undefined,
      false,
    );
    const canWrite = !writeAccess.response;
    const id = request.nextUrl.searchParams.get("id");
    if (id !== null) {
      if (!UUID.test(id))
        return noStoreJson({ error: "Identificador no válido." }, 400);
      const cuestionario = await prisma.cuestionarioSeguridad.findUnique({
        where: { id },
      });
      if (!cuestionario)
        return noStoreJson({ error: "Cuestionario no encontrado." }, 404);
      return noStoreJson({ cuestionario, canWrite });
    }
    const rows = await prisma.cuestionarioSeguridad.findMany({
      take: 50,
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        empresa: true,
        estado: true,
        fechaLimite: true,
        version: true,
        respuestas: true,
      },
    });
    return noStoreJson({ cuestionarios: rows.map(toListItem), canWrite });
  } catch {
    return noStoreJson(
      { error: "No se pudieron cargar los cuestionarios." },
      500,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeCertification(AREA, true, request);
    if (auth.response) return auth.response;
    const body = await readJson(request);
    if (body.action === "crear") {
      const input = parseCreate(body);
      const cuestionario = await prisma.$transaction(async (tx) => {
        const created = await tx.cuestionarioSeguridad.create({
          data: {
            ...input,
            estado: "BORRADOR",
            respuestas:
              createEmptySecurityAnswers() as unknown as Prisma.InputJsonValue,
          },
        });
        await tx.auditoriaCertificacion.create({
          data: {
            recurso: "CUESTIONARIO",
            recursoId: created.id,
            norma: null,
            actorId: auth.actorId,
            accion: "CREAR",
            detalle: { version: created.version, estado: created.estado },
          },
        });
        return created;
      });
      return noStoreJson({ ok: true, cuestionario });
    }
    if (body.action === "actualizar") {
      const input = parseUpdate(body);
      const cuestionario = await prisma.$transaction(async (tx) => {
        const updated = await tx.cuestionarioSeguridad.updateMany({
          where: { id: input.id, version: input.version },
          data: {
            empresa: input.empresa,
            titulo: input.titulo,
            contacto: input.contacto,
            emailContacto: input.emailContacto,
            fechaLimite: input.fechaLimite,
            estado: input.estado,
            respuestas: input.respuestas as unknown as Prisma.InputJsonValue,
            version: { increment: 1 },
          },
        });
        if (updated.count !== 1)
          throw new ConflictError(
            "El cuestionario ha cambiado o no existe. Recarga antes de guardar.",
          );
        await tx.auditoriaCertificacion.create({
          data: {
            recurso: "CUESTIONARIO",
            recursoId: input.id,
            norma: null,
            actorId: auth.actorId,
            accion: "ACTUALIZAR",
            detalle: { version: input.version + 1, estado: input.estado },
          },
        });
        return tx.cuestionarioSeguridad.findUniqueOrThrow({
          where: { id: input.id },
        });
      });
      return noStoreJson({ ok: true, cuestionario });
    }
    throw new InputError("Acción no válida.");
  } catch (error) {
    if (error instanceof InputError)
      return noStoreJson({ error: error.message }, 400);
    if (error instanceof ConflictError)
      return noStoreJson({ error: error.message }, 409);
    return noStoreJson({ error: "No se pudo guardar el cuestionario." }, 500);
  }
}
