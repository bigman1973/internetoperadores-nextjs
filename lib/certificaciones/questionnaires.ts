export const QUESTIONNAIRE_TITLE =
  "Cuestionario de requisitos de seguridad de la información";

export const RESPONSE_VALUES = ["PENDIENTE", "SI", "NO", "NA"] as const;
export type QuestionnaireResponseValue = (typeof RESPONSE_VALUES)[number];

export const QUESTIONNAIRE_STATES = [
  "BORRADOR",
  "REVISION",
  "VALIDADO",
] as const;
export type QuestionnaireState = (typeof QUESTIONNAIRE_STATES)[number];

export type SecurityAnswer = {
  id: number;
  respuesta: QuestionnaireResponseValue;
  evidencia: string;
  observacion: string;
};

export type SecurityQuestion = {
  id: number;
  grupo:
    | "Gobierno y personas"
    | "Accesos"
    | "Activos y protección"
    | "Operación y terceros";
  pregunta: string;
  evidenciaSugerida: string;
  nota?: string;
};

/**
 * Plantilla propia y reutilizable. Las referencias del formulario recibido se
 * han neutralizado a "empresa destinataria"; no incluye validación del cliente
 * ni declaraciones de certificación.
 */
export const SECURITY_QUESTIONS: readonly SecurityQuestion[] = [
  {
    id: 1,
    grupo: "Gobierno y personas",
    pregunta:
      "¿Dispone su organización de una política de seguridad de la información aprobada por la Dirección?",
    evidenciaSugerida: "Política de seguridad vigente o extracto aprobado.",
  },
  {
    id: 2,
    grupo: "Gobierno y personas",
    pregunta:
      "¿Existe una persona o función responsable de la seguridad de la información?",
    evidenciaSugerida:
      "Organigrama, nombramiento o descripción de responsabilidades.",
  },
  {
    id: 3,
    grupo: "Gobierno y personas",
    pregunta:
      "¿Realiza su organización una evaluación periódica de riesgos de seguridad de la información?",
    evidenciaSugerida:
      "Matriz de riesgos, informe de riesgos o resumen anonimizado.",
  },
  {
    id: 4,
    grupo: "Gobierno y personas",
    pregunta:
      "¿Existen procedimientos para garantizar la continuidad del negocio?",
    evidenciaSugerida:
      "Plan o procedimiento de continuidad del negocio, análisis de impacto y/o evidencia de prueba o ejercicio reciente.",
  },
  {
    id: 5,
    grupo: "Gobierno y personas",
    pregunta:
      "¿Todo el personal con acceso a información de la empresa destinataria o de sus clientes firma acuerdos de confidencialidad?",
    evidenciaSugerida: "Modelo NDA o cláusula contractual de confidencialidad.",
  },
  {
    id: 6,
    grupo: "Gobierno y personas",
    pregunta:
      "¿El personal recibe formación periódica en seguridad de la información, phishing y protección de datos?",
    evidenciaSugerida: "Registro de formación del último año o plan formativo.",
  },
  {
    id: 7,
    grupo: "Accesos",
    pregunta:
      "¿Existe un proceso para retirar accesos cuando una persona cambia de puesto o deja la organización?",
    evidenciaSugerida:
      "Procedimiento de baja/cambio de usuario o ejemplo anonimizado.",
  },
  {
    id: 8,
    grupo: "Accesos",
    pregunta:
      "¿Todos los usuarios disponen de cuentas individuales y no compartidas?",
    evidenciaSugerida: "Política de gestión de usuarios o captura anonimizada.",
  },
  {
    id: 9,
    grupo: "Accesos",
    pregunta:
      "¿Existe un proceso formal para alta, modificación y baja de usuarios?",
    evidenciaSugerida: "Procedimiento de gestión de accesos.",
  },
  {
    id: 10,
    grupo: "Accesos",
    pregunta:
      "¿Se aplican políticas de contraseña robusta o mecanismos equivalentes?",
    evidenciaSugerida: "Política de contraseñas o configuración anonimizada.",
  },
  {
    id: 11,
    grupo: "Accesos",
    pregunta:
      "¿Se utiliza autenticación multifactor para accesos remotos, usuarios privilegiados y sistemas críticos?",
    evidenciaSugerida: "Evidencia de MFA, política o captura anonimizada.",
  },
  {
    id: 12,
    grupo: "Accesos",
    pregunta:
      "¿El acceso remoto se realiza mediante canales seguros, por ejemplo VPN corporativa?",
    evidenciaSugerida:
      "Procedimiento de acceso remoto o evidencia de configuración.",
  },
  {
    id: 13,
    grupo: "Activos y protección",
    pregunta:
      "¿Existe un inventario actualizado de activos IT relevantes para el servicio prestado?",
    evidenciaSugerida: "Inventario anonimizado de activos o extracto.",
  },
  {
    id: 14,
    grupo: "Activos y protección",
    pregunta:
      "¿Los equipos utilizados para prestar el servicio disponen de antivirus, EDR o protección equivalente gestionada?",
    evidenciaSugerida: "Informe de consola, política o captura anonimizada.",
  },
  {
    id: 15,
    grupo: "Activos y protección",
    pregunta:
      "¿Existe un proceso de parcheado y gestión de vulnerabilidades para sistemas, servidores y aplicaciones?",
    evidenciaSugerida:
      "Procedimiento de parcheado y ejemplo de actualización reciente.",
  },
  {
    id: 16,
    grupo: "Activos y protección",
    pregunta:
      "¿Se realizan análisis de vulnerabilidades de forma periódica sobre sistemas críticos?",
    evidenciaSugerida: "Último informe resumido o planificación de escaneos.",
  },
  {
    id: 17,
    grupo: "Activos y protección",
    pregunta:
      "¿La red dispone de medidas de protección como firewall, segmentación o controles equivalentes?",
    evidenciaSugerida:
      "Diagrama de red anonimizado o descripción de arquitectura.",
  },
  {
    id: 18,
    grupo: "Activos y protección",
    pregunta:
      "¿Los dispositivos portátiles que almacenan información confidencial, incluidos los que sean propiedad de la empresa destinataria, utilizan cifrado de disco?",
    evidenciaSugerida:
      "Política de cifrado o captura anonimizada de configuración.",
    nota: "La propiedad del equipo por la empresa destinataria no marca esta respuesta como N/A automáticamente.",
  },
  {
    id: 19,
    grupo: "Activos y protección",
    pregunta:
      "¿Existe un procedimiento para borrado seguro, devolución o destrucción de información al finalizar el servicio?",
    evidenciaSugerida: "Procedimiento de borrado/destrucción segura.",
  },
  {
    id: 20,
    grupo: "Operación y terceros",
    pregunta:
      "¿Existe un procedimiento para identificar, gestionar y escalar incidentes de seguridad de la información?",
    evidenciaSugerida: "Procedimiento de gestión de incidentes.",
  },
  {
    id: 21,
    grupo: "Operación y terceros",
    pregunta:
      "¿Existe un proceso para notificar a la empresa destinataria incidentes que puedan afectar a su información, servicio o sistemas?",
    evidenciaSugerida:
      "Procedimiento de notificación a clientes o cláusula contractual.",
  },
  {
    id: 22,
    grupo: "Operación y terceros",
    pregunta:
      "¿Se realizan copias de seguridad periódicas y pruebas de restauración de la información crítica?",
    evidenciaSugerida:
      "Política de backup y registro de la última prueba de restauración.",
  },
  {
    id: 23,
    grupo: "Operación y terceros",
    pregunta:
      "¿Los subcontratistas con acceso a información de la empresa destinataria están sujetos a acuerdos de confidencialidad y requisitos de seguridad?",
    evidenciaSugerida:
      "Modelo de cláusula contractual, NDA o procedimiento de homologación.",
  },
] as const;

export const QUESTION_GROUPS = [
  "Gobierno y personas",
  "Accesos",
  "Activos y protección",
  "Operación y terceros",
] as const;

/** Datos identificativos confirmados; no son prueba de controles ni certificación. */
export const PROVIDER_PROFILE = {
  proveedor: "Internet Operadores",
  aprobadorInterno: "David Pérez · Dirección General (aprobador interno)",
  contactoTecnico:
    "Esteve Busquets · contacto técnico: esteve.busquets@internetoperadores.com",
  referenciaIso:
    "ISO 27001: implantación en curso con Level4; sin certificación vigente.",
  referenciaTisax:
    "TISAX: POR DEFINIR; no hay evaluación actual confirmada ni controles iniciados o probados declarados en esta ficha.",
  aclaracion:
    "Las respuestas deben aportarse expresamente; esta ficha no declara controles, certificaciones, equipos gestionados ni aceptación por la empresa destinataria.",
} as const;

export function createEmptySecurityAnswers(): SecurityAnswer[] {
  return SECURITY_QUESTIONS.map(({ id }) => ({
    id,
    respuesta: "PENDIENTE",
    evidencia: "",
    observacion: "",
  }));
}

export function completedAnswers(answers: readonly SecurityAnswer[]): number {
  return answers.filter((answer) => answer.respuesta !== "PENDIENTE").length;
}

export function validationErrorsForQuestionnaire(
  estado: QuestionnaireState,
  answers: readonly SecurityAnswer[],
): string[] {
  if (estado !== "VALIDADO") return [];
  const errors: string[] = [];
  for (const answer of answers) {
    const evidencia = answer.evidencia.trim();
    const observacion = answer.observacion.trim();
    if (answer.respuesta === "PENDIENTE")
      errors.push(`La pregunta ${answer.id} sigue pendiente.`);
    if (answer.respuesta === "SI" && evidencia.length < 15)
      errors.push(
        `La pregunta ${answer.id} marcada como Sí requiere evidencia de al menos 15 caracteres.`,
      );
    if (
      (answer.respuesta === "NO" || answer.respuesta === "NA") &&
      evidencia.length < 15 &&
      observacion.length < 15
    )
      errors.push(
        `La pregunta ${answer.id} marcada como ${answer.respuesta} requiere observación o evidencia de al menos 15 caracteres.`,
      );
  }
  return errors;
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
