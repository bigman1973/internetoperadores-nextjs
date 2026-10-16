export const NORMAS = ["ISO27001", "TISAX"] as const;
export type Norma = (typeof NORMAS)[number];
export const AREAS = {
  ISO27001: "admin.certificaciones.iso_27001",
  TISAX: "admin.certificaciones.tisax",
} as const;
export const ESTADOS = [
  "POR_DEFINIR",
  "IMPLANTACION",
  "PREPARACION_AUDITORIA",
  "AUDITORIA",
  "VIGENTE",
] as const;
export const ESTADOS_HITO = [
  "PENDIENTE",
  "EN_CURSO",
  "COMPLETADO",
  "NO_APLICA",
] as const;
export const TIPOS_DOCUMENTO = [
  "BORRADOR",
  "POLITICA",
  "PROCEDIMIENTO",
  "EVIDENCIA",
  "CERTIFICADO",
  "RESULTADO_TISAX",
] as const;
export class ValidationError extends Error {}
export class ConflictError extends Error {}
export function norma(value: unknown): Norma {
  if (!NORMAS.includes(value as Norma))
    throw new ValidationError("Norma no válida");
  return value as Norma;
}
export function text(
  value: unknown,
  name: string,
  max = 2000,
  required = false,
): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw new ValidationError(`${name}: campo requerido`);
    return null;
  }
  if (
    typeof value !== "string" ||
    value.length > max ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
  )
    throw new ValidationError(`${name}: valor no válido`);
  const clean = value.trim();
  if (required && !clean) throw new ValidationError(`${name}: campo requerido`);
  return clean || null;
}
export function date(value: unknown, name: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new ValidationError(`${name}: fecha no válida`);
  const d = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(d.getTime()) ||
    d.toISOString().slice(0, 10) !== value ||
    d.getUTCFullYear() < 2000 ||
    d.getUTCFullYear() > 2100
  )
    throw new ValidationError(`${name}: fecha no válida`);
  return d;
}
export function version(value: unknown): number {
  if (
    !Number.isSafeInteger(value) ||
    Number(value) < 1 ||
    Number(value) > 2147483646
  )
    throw new ValidationError("Versión requerida");
  return Number(value);
}
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
      value,
    )
  )
    throw new ValidationError("Identificador no válido");
  return value;
}
export function progress(hitos: { estado: string }[]) {
  const count = (estado: string) =>
    hitos.filter((h) => h.estado === estado).length;
  const noAplican = count("NO_APLICA"),
    completados = count("COMPLETADO"),
    aplicables = hitos.length - noAplican;
  // Do not mistake unreviewed tasks for measured zero implementation.
  const revisados = hitos.some((h) =>
    ["COMPLETADO", "NO_APLICA"].includes(h.estado),
  );
  return {
    porcentaje:
      revisados && aplicables > 0
        ? Math.round((completados * 100) / aplicables)
        : null,
    completados,
    aplicables,
    pendientes: count("PENDIENTE"),
    enCurso: count("EN_CURSO"),
    noAplican,
  };
}
export function hitoInput(b: Record<string, unknown>) {
  if (!ESTADOS_HITO.includes(b.estado as any))
    throw new ValidationError("Estado de hito no válido");
  const evidencia = text(b.evidencia, "Evidencia", 4000);
  if (
    ["COMPLETADO", "NO_APLICA"].includes(String(b.estado)) &&
    (!evidencia || evidencia.length < 15)
  )
    throw new ValidationError(
      b.estado === "NO_APLICA"
        ? "Indica una justificación de no aplicabilidad (mínimo 15 caracteres)"
        : "Indica la evidencia y fecha que permiten verificar el hito (mínimo 15 caracteres)",
    );
  return {
    estado: String(b.estado),
    responsable: text(b.responsable, "Responsable", 160),
    fechaObjetivo: date(b.fechaObjetivo, "Fecha objetivo"),
    evidencia,
    notas: text(b.notas, "Notas", 4000),
  };
}
export function programaInput(b: Record<string, unknown>) {
  if (!ESTADOS.includes(b.estado as any))
    throw new ValidationError("Estado no válido");
  const result = {
    estado: String(b.estado),
    consultora: text(b.consultora, "Consultora", 160),
    responsable: text(b.responsable, "Responsable técnico", 160),
    aprobador: text(b.aprobador, "Dirección", 160),
    alcance: text(b.alcance, "Alcance", 3000),
    notas: text(b.notas, "Notas", 4000),
    entidad: text(b.entidad, "Entidad evaluadora", 240),
    referencia: text(b.referencia, "Referencia", 240),
    fechaEmision: date(b.fechaEmision, "Fecha de emisión"),
    fechaCaducidad: date(b.fechaCaducidad, "Vigencia"),
    documentoAcreditacionId: b.documentoAcreditacionId
      ? uuid(b.documentoAcreditacionId)
      : null,
  };
  if (
    result.fechaEmision &&
    result.fechaCaducidad &&
    result.fechaEmision >= result.fechaCaducidad
  )
    throw new ValidationError("La vigencia debe ser posterior a la emisión");
  if (result.estado === "VIGENTE") {
    if (
      !result.entidad ||
      !result.referencia ||
      !result.alcance ||
      !result.fechaEmision ||
      !result.fechaCaducidad ||
      !result.documentoAcreditacionId
    )
      throw new ValidationError(
        "Para registrar vigencia hacen falta entidad, referencia, alcance, fechas y documento acreditativo",
      );
    if (
      result.fechaEmision > new Date() ||
      result.fechaCaducidad <
        new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z")
    )
      throw new ValidationError("Las fechas no acreditan una vigencia actual");
  }
  return result;
}
const ISO = [
  [
    "ALCANCE",
    "Definir alcance y responsabilidades",
    "Validar con Level4 el perímetro y la distribución de responsabilidades entre Internet Operadores y el cliente.",
  ],
  [
    "RIESGOS",
    "Inventario y evaluación de riesgos",
    "Completar y revisar los activos, riesgos y su tratamiento con evidencias reales.",
  ],
  [
    "DOCUMENTACION",
    "Políticas y procedimientos aprobados",
    "Revisar y aprobar seguridad, vulnerabilidades, incidentes y continuidad; los borradores no acreditan implantación.",
  ],
  [
    "CONTROLES",
    "Implantar y comprobar controles",
    "Verificar medidas aplicables y su cobertura; la propiedad de los equipos del cliente no hace el control automáticamente NA.",
  ],
  [
    "FORMACION",
    "Confidencialidad y formación",
    "Conservar cobertura de acuerdos y registros reales de formación del equipo.",
  ],
  [
    "AUDITORIA_INTERNA",
    "Auditoría interna y revisión por Dirección",
    "Registrar resultados, revisión y acciones correctivas sin inventar fechas.",
  ],
  [
    "CERTIFICACION",
    "Auditoría externa y certificado",
    "Solo completar con resultados reales y certificado emitido para el alcance correspondiente.",
  ],
  [
    "DRAXTON",
    "Preparar la respuesta documental a Draxton",
    "Cuestionario y evidencias para la petición del cliente. Fecha de entrega 21/10/2026; no es la fecha de certificación.",
  ],
] as const;
const TISAX = [
  [
    "ALCANCE",
    "Confirmar necesidad y alcance TISAX",
    "Hoja de ruta propuesta. Validar ubicaciones, objetivos y requisitos del cliente; no hay evaluación confirmada.",
  ],
  [
    "ISA",
    "Autoevaluación VDA ISA aplicable",
    "Usar la versión y el alcance que correspondan, sin presentar este plan como evaluación oficial.",
  ],
  [
    "BRECHAS",
    "Cerrar brechas y reunir evidencias",
    "Coordinar medidas con el SGSI; las respuestas a clientes no equivalen a un resultado TISAX.",
  ],
  [
    "REGISTRO",
    "Registro y proveedor de evaluación",
    "Registrar y contratar solo cuando Dirección lo decida; no se realizan trámites desde este módulo.",
  ],
  [
    "EVALUACION",
    "Evaluación y acciones correctivas",
    "Registrar fechas y resultados reales del proveedor autorizado.",
  ],
  [
    "RESULTADOS",
    "Resultados, labels y compartición",
    "Conservar el resultado del alcance evaluado y gestionar la compartición autorizada con el cliente.",
  ],
] as const;
export function initialProgram(n: Norma) {
  return {
    norma: n,
    estado: n === "ISO27001" ? "IMPLANTACION" : "POR_DEFINIR",
    consultora: n === "ISO27001" ? "Level4" : null,
    responsable: "Esteve Busquets",
    aprobador: "David Pérez",
    alcance:
      "Alcance pendiente de validar. Los equipos informáticos usados en el servicio a Draxton son proporcionados por el cliente; gestión de cuentas y controles pendiente de confirmar.",
    notas:
      n === "ISO27001"
        ? "Dirección confirma el 16/10/2026 implantación en curso con Level4, sin certificación vigente. Fase, porcentaje real y fecha de auditoría pendientes de validar."
        : "Sin TISAX vigente confirmado por Dirección el 16/10/2026. No se ha confirmado inscripción ni evaluación. Esta hoja de ruta es una propuesta interna.",
    hitos: {
      create: (n === "ISO27001" ? ISO : TISAX).map(
        ([clave, titulo, descripcion], i) => ({
          clave,
          titulo,
          descripcion,
          orden: i + 1,
          responsable:
            clave === "AUDITORIA_INTERNA" || clave === "REGISTRO"
              ? "David Pérez"
              : "Esteve Busquets",
          estado:
            n === "ISO27001" && clave === "DOCUMENTACION"
              ? "EN_CURSO"
              : "PENDIENTE",
          fechaObjetivo:
            clave === "DRAXTON" ? new Date("2026-10-21T00:00:00Z") : null,
        }),
      ),
    },
  };
}
