import assert from "node:assert/strict";
import {
  createEmptySecurityAnswers,
  isValidIsoDate,
  PROVIDER_PROFILE,
  SECURITY_QUESTIONS,
  validationErrorsForQuestionnaire,
} from "../lib/certificaciones/questionnaires";

const ids = SECURITY_QUESTIONS.map((question) => question.id);
assert.equal(
  SECURITY_QUESTIONS.length,
  23,
  "la plantilla debe tener exactamente 23 preguntas",
);
assert.equal(new Set(ids).size, 23, "los IDs de pregunta deben ser únicos");
assert.deepEqual(
  ids,
  Array.from({ length: 23 }, (_, index) => index + 1),
);

const blank = createEmptySecurityAnswers();
assert.equal(blank.length, 23);
assert.ok(blank.every((answer) => answer.respuesta === "PENDIENTE"));
assert.ok(blank.every((answer) => !answer.evidencia && !answer.observacion));
assert.notEqual(
  blank,
  createEmptySecurityAnswers(),
  "cada ficha debe recibir respuestas nuevas",
);

const questionEleven = blank.find((answer) => answer.id === 11)!;
assert.equal(
  questionEleven.respuesta,
  "PENDIENTE",
  "MFA no puede suponerse como Sí",
);
assert.equal(
  SECURITY_QUESTIONS.some((question) =>
    /certificad[oa]|aceptad[oa]/i.test(question.pregunta),
  ),
  false,
  "las preguntas no deben afirmar certificaciones ni aceptación",
);
assert.match(
  PROVIDER_PROFILE.aclaracion,
  /no declara controles, certificaciones, equipos gestionados ni aceptación/i,
);

const draft = blank.map((answer) =>
  answer.id === 1
    ? {
        ...answer,
        respuesta: "SI" as const,
        evidencia: "Política aprobada por dirección",
      }
    : answer,
);
assert.deepEqual(
  validationErrorsForQuestionnaire("BORRADOR", draft),
  [],
  "un borrador conserva respuestas parciales y pendientes",
);
assert.ok(
  validationErrorsForQuestionnaire("VALIDADO", draft).some((error) =>
    /pendiente/i.test(error),
  ),
  "un validado no puede conservar pendientes",
);

const allYes = createEmptySecurityAnswers().map((answer) => ({
  ...answer,
  respuesta: "SI" as const,
  evidencia: "Evidencia documental suficiente",
}));
assert.deepEqual(validationErrorsForQuestionnaire("VALIDADO", allYes), []);
assert.ok(
  validationErrorsForQuestionnaire(
    "VALIDADO",
    allYes.map((answer) =>
      answer.id === 3 ? { ...answer, evidencia: "corta" } : answer,
    ),
  ).some((error) => /pregunta 3/i.test(error)),
  "un Sí necesita evidencia verificable, sin inferirla",
);

const laptop = allYes.map((answer) =>
  answer.id === 18
    ? {
        ...answer,
        respuesta: "PENDIENTE" as const,
        evidencia: "",
        observacion: "Equipo propiedad de la empresa destinataria",
      }
    : answer,
);
assert.equal(laptop.find((answer) => answer.id === 18)?.respuesta, "PENDIENTE");
assert.match(
  SECURITY_QUESTIONS.find((question) => question.id === 18)?.nota || "",
  /no marca esta respuesta como N\/A automáticamente/i,
);

assert.equal(isValidIsoDate("2026-02-28"), true);
assert.equal(isValidIsoDate("2024-02-29"), true);
assert.equal(isValidIsoDate("2025-02-29"), false);
assert.equal(isValidIsoDate("2026-02-30"), false);
assert.equal(isValidIsoDate("2026/02/28"), false);

console.log(
  "Cuestionarios de seguridad: plantilla, neutralidad, borradores, portátil y fechas verificados.",
);
