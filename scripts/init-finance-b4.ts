/**
 * Inicializador conservador de Finanzas B4.
 *
 * Por defecto sólo simula. `--apply` escribe exclusivamente en tablas B4 y
 * únicamente tras `assertFinanceStagingIsolated()`. Nunca actualiza tablas,
 * campos, enlaces, importes, booleanos ni estados legacy.
 *
 * Uso (el actor debe proceder de la sesión autenticada que ordena la ejecución):
 *   tsx scripts/init-finance-b4.ts --dry-run --actor=<UsuarioAdmin.id>
 *   tsx scripts/init-finance-b4.ts --apply   --actor=<UsuarioAdmin.id>
 */
import { createHash } from "node:crypto";

import {
  validarBorradorMovimiento,
  type TipoDocumentoConciliable,
  type UUID,
} from "../lib/finanzas/reconciliation-core";

const B4_INIT_VERSION = "B4_INIT_V1";
const PG_INT_MIN = -2_147_483_648;
const PG_INT_MAX = 2_147_483_647;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ModoInicializacionB4 = "DRY_RUN" | "APPLY";

export interface OpcionesInicializacionB4 {
  modo: ModoInicializacionB4;
  actorId: number;
}

type SourceKind =
  | "FACTURA_RECIBIDA"
  | "FACTURA_EMITIDA"
  | "GASTO"
  | "NOMINA"
  | "REMESA_CONCILIACION"
  | "REMESA_SUBREMESA";

export interface AliasFacturaIspVerificado {
  /** No se escribe factura_isp_id: es sólo evidencia de la instantánea B4. */
  estado: "FK_EXISTENTE_VERIFICADA" | "ID_EXTERNO_DIRECTO_VERIFICADO" | "SIN_PRUEBA_DIRECTA" | "CONFLICTO";
  facturaIspId?: number;
  incidencia?: string;
}

export interface FuenteLegacyB4 {
  tipo: TipoDocumentoConciliable;
  /** Sólo una PK fuente existente es elegible. null nunca crea un envoltorio. */
  targetId: string | null;
  sourceId: string;
  sourceKind: SourceKind;
  /** Objetivo B4 firmado; null significa que no se conoce con exactitud. */
  importeObjetivoCentimos: number | null;
  valida: boolean;
  incidencia?: string;
  aliasFacturaIsp?: AliasFacturaIspVerificado;
}

export interface EnvoltorioB4Existente {
  id: string;
  tipo: TipoDocumentoConciliable;
  /** Se acepta null para detectar corrupción/filas pre-guard; jamás se activa. */
  targetId: string | null;
  importeObjetivoCentimos: number | null;
  activo: boolean;
  netoActivoPrevioCentimos: number;
}

export interface EnvoltorioPlanB4 {
  id: string;
  tipo: TipoDocumentoConciliable;
  targetId: string;
  importeObjetivoCentimos: number | null;
  accion: "CREAR" | "REUTILIZAR";
  activo: boolean;
  netoActivoPrevioCentimos: number;
}

export interface PlanInicializacionB4 {
  estadoInicial: "SIN_DOCUMENTO";
  estadoFinal: "SIN_DOCUMENTO" | "JUSTIFICADO";
  versionInicial: 1;
  envoltorios: readonly EnvoltorioPlanB4[];
  /** Sólo una línea DOCUMENTO cerrada por el importe real del banco. */
  candidato: {
    documentoConciliableId: string;
    importeCentimos: number;
    esParcial: boolean;
  } | null;
  incidencias: readonly string[];
}

export interface EntradaPlanInicializacionB4 {
  movimientoId: string;
  importeBancoCentimos: number | null;
  fuentes: readonly FuenteLegacyB4[];
  envoltoriosExistentes: readonly EnvoltorioB4Existente[];
}

/** El modo seguro es la simulación; incluso ésta exige un actor explícito y real. */
export function parsearOpcionesInicializacionB4(argv: readonly string[]): OpcionesInicializacionB4 {
  let modo: ModoInicializacionB4 = "DRY_RUN";
  let actorRaw: string | undefined;
  let applyVisto = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      if (applyVisto) throw new Error("B4_INIT_CLI_INVALID");
      continue;
    }
    if (arg === "--apply") {
      if (applyVisto) throw new Error("B4_INIT_CLI_INVALID");
      applyVisto = true;
      modo = "APPLY";
      continue;
    }
    if (arg.startsWith("--actor=")) {
      if (actorRaw !== undefined) throw new Error("B4_INIT_CLI_INVALID");
      actorRaw = arg.slice("--actor=".length);
      continue;
    }
    throw new Error("B4_INIT_CLI_INVALID");
  }

  if (!actorRaw || !/^[1-9]\d*$/.test(actorRaw)) throw new Error("B4_INIT_ACTOR_REQUIRED");
  const actorId = Number(actorRaw);
  if (!Number.isSafeInteger(actorId)) throw new Error("B4_INIT_ACTOR_REQUIRED");
  return { modo, actorId };
}

/** JSON canónico para hashes B4 estables; nunca contiene fecha de ejecución. */
export function serializarEstable(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(serializarEstable).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${serializarEstable(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function sha256Estable(value: unknown): string {
  return createHash("sha256").update(serializarEstable(value), "utf8").digest("hex");
}

/** UUID determinista v5-like, idóneo para reintentos de la misma identidad B4. */
export function uuidEstableB4(identity: string): string {
  const bytes = Buffer.from(createHash("sha256").update(`internet-operadores:${identity}`, "utf8").digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Convierte el Float/Decimal legacy sin redondear, sin abs() y sin tratar null
 * como cero. La serialización debe tener como máximo dos decimales exactos.
 */
export function centimosLegacyExactos(value: unknown): number | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    // Parse the shortest decimal source representation, never binary multiplication.
    text = value.toString();
  } else if (typeof value === "string") {
    text = value.trim();
  } else if (value && typeof (value as { toString?: unknown }).toString === "function") {
    text = String(value).trim();
  } else {
    return null;
  }
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(text)) return null;

  const negative = text.startsWith("-");
  const [whole, decimal = ""] = (negative ? text.slice(1) : text).split(".");
  try {
    const cents = BigInt(whole) * BigInt(100) + BigInt((decimal + "00").slice(0, 2));
    const signed = negative ? -cents : cents;
    if (signed < BigInt(PG_INT_MIN) || signed > BigInt(PG_INT_MAX)) return null;
    return Number(signed);
  } catch {
    return null;
  }
}

function keyDocumento(tipo: TipoDocumentoConciliable, targetId: string): string {
  return `${tipo}:${targetId}`;
}

function mismaClaveDocumento(a: EnvoltorioB4Existente): string | null {
  return a.targetId === null ? null : keyDocumento(a.tipo, a.targetId);
}

function objetivoPermitido(tipo: TipoDocumentoConciliable, importe: number | null): number | null {
  if (importe === null || !Number.isSafeInteger(importe) || importe === 0) return null;
  // La semántica se conserva firmada. Para factura recibida/nómina/ticket el
  // origen positivo de coste se transforma explícitamente a obligación negativa;
  // no se usa abs(), por lo que un origen con signo inesperado queda desconocido.
  if (tipo === "REMESA") return importe > 0 ? importe : null;
  if (tipo === "NOMINA" || tipo === "TICKET") return importe < 0 ? importe : null;
  return importe;
}

function esFuenteUnicaLegacy(fuentes: readonly FuenteLegacyB4[]): boolean {
  // Un array antiguo de sub-remesas no trae importe por línea: ni se reparte ni
  // se pretende. También se bloquea cualquier pluralidad de destinos directos.
  return fuentes.length === 1 && fuentes[0].sourceKind !== "REMESA_SUBREMESA";
}

/**
 * Planificador puro. No conoce Prisma, entorno, hora, UUID aleatorio ni tablas.
 * Sólo proyecta un vínculo cuando un único enlace legacy real puede cerrarse
 * exactamente usando el importe actual del banco y la capacidad documental.
 */
export function planificarInicializacionB4(input: EntradaPlanInicializacionB4): PlanInicializacionB4 {
  const incidencias = new Set<string>();
  const existentesPorClave = new Map<string, EnvoltorioB4Existente[]>();
  for (const existente of input.envoltoriosExistentes) {
    const clave = mismaClaveDocumento(existente);
    if (!clave) {
      incidencias.add("ENVOLTORIO_EXISTENTE_SIN_OBJETIVO_REAL");
      continue;
    }
    existentesPorClave.set(clave, [...(existentesPorClave.get(clave) ?? []), existente]);
  }

  const planesPorClave = new Map<string, EnvoltorioPlanB4>();
  const fuentesValidas: FuenteLegacyB4[] = [];
  for (const fuente of input.fuentes) {
    if (!fuente.valida || !fuente.targetId) {
      incidencias.add(fuente.incidencia ?? "REFERENCIA_LEGACY_SIN_DESTINO_REAL");
      continue;
    }
    const clave = keyDocumento(fuente.tipo, fuente.targetId);
    const existentes = existentesPorClave.get(clave) ?? [];
    if (existentes.length > 1) {
      incidencias.add("ENVOLTORIOS_B4_DUPLICADOS_PARA_DESTINO");
      continue;
    }
    const existente = existentes[0];
    if (existente && existente.importeObjetivoCentimos !== fuente.importeObjetivoCentimos) {
      incidencias.add("EVIDENCIA_DOCUMENTAL_CAMBIADA");
      continue;
    }
    if (existente && (!existente.activo || existente.targetId === null)) {
      incidencias.add("ENVOLTORIO_EXISTENTE_NO_ACTIVABLE");
      continue;
    }
    if (!planesPorClave.has(clave)) {
      planesPorClave.set(clave, existente
        ? {
            id: existente.id,
            tipo: existente.tipo,
            targetId: existente.targetId as string,
            importeObjetivoCentimos: existente.importeObjetivoCentimos,
            accion: "REUTILIZAR",
            activo: existente.activo,
            netoActivoPrevioCentimos: existente.netoActivoPrevioCentimos,
          }
        : {
            id: uuidEstableB4(`${B4_INIT_VERSION}:documento:${clave}`),
            tipo: fuente.tipo,
            targetId: fuente.targetId,
            importeObjetivoCentimos: fuente.importeObjetivoCentimos,
            accion: "CREAR",
            activo: true,
            netoActivoPrevioCentimos: 0,
          });
    }
    fuentesValidas.push(fuente);
  }

  let candidato: PlanInicializacionB4["candidato"] = null;
  if (input.importeBancoCentimos === null) {
    incidencias.add("IMPORTE_BANCARIO_NO_CONVERTIBLE_A_CENTIMOS");
  } else if (input.importeBancoCentimos === 0) {
    // B4 nunca justifica 0: tampoco infiere NO_REQUIERE.
    incidencias.add("IMPORTE_BANCARIO_CERO_SIN_INFERENCIA");
  } else if (!esFuenteUnicaLegacy(input.fuentes) || fuentesValidas.length !== 1) {
    incidencias.add(input.fuentes.length > 1 ? "MULTIPLES_DESTINOS_LEGACY_SIN_IMPORTE_POR_LINEA" : "SIN_ENLACE_LEGACY_DIRECTO_VALIDO");
  } else {
    const fuente = fuentesValidas[0];
    const plan = planesPorClave.get(keyDocumento(fuente.tipo, fuente.targetId as string));
    if (!plan || !plan.activo || plan.importeObjetivoCentimos === null) {
      incidencias.add("CAPACIDAD_DOCUMENTAL_DESCONOCIDA_O_INACTIVA");
    } else if (!UUID_RE.test(plan.id)) {
      incidencias.add("ENVOLTORIO_B4_ID_INVALIDO");
    } else {
      const validacion = validarBorradorMovimiento(
        {
          movimientoId: input.movimientoId,
          importeMovimientoCentimos: input.importeBancoCentimos,
          estado: "JUSTIFICADO",
          lineas: [{ tipo: "DOCUMENTO", documentoConciliableId: plan.id as UUID, importeCentimos: input.importeBancoCentimos }],
        },
        [{
          documentoConciliableId: plan.id as UUID,
          tipoDocumento: plan.tipo,
          importeObjetivoCentimos: plan.importeObjetivoCentimos as never,
          netoActivoPrevioCentimos: plan.netoActivoPrevioCentimos,
        }],
      );
      if ("errors" in validacion) {
        incidencias.add(`ENLACE_LEGACY_NO_APLICABLE_${validacion.errors[0]?.codigo ?? "VALIDACION"}`);
      } else {
        candidato = {
          documentoConciliableId: plan.id,
          importeCentimos: input.importeBancoCentimos,
          esParcial: input.importeBancoCentimos !== plan.importeObjetivoCentimos,
        };
      }
    }
  }

  return {
    estadoInicial: "SIN_DOCUMENTO",
    estadoFinal: candidato ? "JUSTIFICADO" : "SIN_DOCUMENTO",
    versionInicial: 1,
    envoltorios: [...planesPorClave.values()].sort((a, b) => keyDocumento(a.tipo, a.targetId).localeCompare(keyDocumento(b.tipo, b.targetId))),
    candidato,
    incidencias: [...incidencias].sort(),
  };
}

interface SqlClient {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

interface RawMovimiento {
  id: string;
  importe: unknown;
}

export interface RawFuenteB4 {
  source_kind: SourceKind;
  tipo: TipoDocumentoConciliable;
  target_id: string | null;
  source_id: string;
  target_exists: boolean;
  calidad?: string | null;
  copia_de_id?: string | null;
  conflicto_identidad?: boolean | null;
  duplicado_externo?: boolean | null;
  importe_fuente: unknown;
  factura_isp_id?: number | null;
  id_externo?: string | null;
  alias_proof?: "FK" | "ID_EXTERNO" | null;
  movimiento_id?: string;
  ticket_elegible?: boolean;
}

interface RawEnvoltorio {
  id: string;
  tipo: TipoDocumentoConciliable;
  target_id: string | null;
  importe_objetivo_centimos: number | null;
  activo: boolean;
  neto_activo_previo_centimos: unknown;
}

function enteroSeguro(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

/** Construye una fuente sólo desde FKs legacy reales y el importe fuente mínimo. */
export function fuenteDesdeRaw(raw: RawFuenteB4): FuenteLegacyB4 {
  if (!raw.target_exists || !raw.target_id) {
    return {
      tipo: raw.tipo, targetId: raw.target_id, sourceId: raw.source_id, sourceKind: raw.source_kind,
      importeObjetivoCentimos: null, valida: false, incidencia: "REFERENCIA_LEGACY_APUNTA_A_DESTINO_AUSENTE",
    };
  }
  if (raw.source_kind === "FACTURA_RECIBIDA" && (
    raw.calidad !== "VALIDA" || raw.copia_de_id !== null || raw.conflicto_identidad === true || raw.duplicado_externo === true
  )) {
    return {
      tipo: raw.tipo, targetId: raw.target_id, sourceId: raw.source_id, sourceKind: raw.source_kind,
      importeObjetivoCentimos: null, valida: false, incidencia: "FACTURA_RECIBIDA_NO_CANONICA_O_CONFLICTO_B2",
    };
  }

  if (raw.source_kind === "GASTO" && raw.ticket_elegible !== true) return { tipo: raw.tipo, targetId: raw.target_id, sourceId: raw.source_id, sourceKind: raw.source_kind, importeObjetivoCentimos: null, valida: false, incidencia: "TICKET_NO_APROBADO_O_FUERA_TARJETA_EMPRESA" };
  const fuenteCentimos = centimosLegacyExactos(raw.importe_fuente);
  let firmado: number | null = fuenteCentimos;
  if (raw.tipo === "FACTURA_RECIBIDA" || raw.tipo === "NOMINA" || raw.tipo === "TICKET") {
    firmado = fuenteCentimos === null ? null : -fuenteCentimos;
  }
  const importeObjetivoCentimos = objetivoPermitido(raw.tipo, firmado);
  const aliasFacturaIsp = raw.source_kind === "FACTURA_EMITIDA"
    ? raw.alias_proof === "FK" && raw.factura_isp_id !== null && raw.factura_isp_id !== undefined
      ? { estado: "FK_EXISTENTE_VERIFICADA" as const, facturaIspId: raw.factura_isp_id }
      : raw.alias_proof === "ID_EXTERNO" && raw.id_externo && /^\d+$/.test(raw.id_externo) && raw.factura_isp_id !== null && raw.factura_isp_id !== undefined
        ? { estado: "ID_EXTERNO_DIRECTO_VERIFICADO" as const, facturaIspId: raw.factura_isp_id }
        : { estado: "SIN_PRUEBA_DIRECTA" as const, incidencia: "MIRROR_FACTURA_ISP_SIN_PRUEBA_DIRECTA" }
    : undefined;

  return {
    tipo: raw.tipo, targetId: raw.target_id, sourceId: raw.source_id, sourceKind: raw.source_kind,
    importeObjetivoCentimos,
    valida: true,
    ...(importeObjetivoCentimos === null ? { incidencia: "IMPORTE_DOCUMENTAL_NO_CONVERTIBLE_O_SIGNO_INCOMPATIBLE" } : {}),
    ...(aliasFacturaIsp ? { aliasFacturaIsp } : {}),
  };
}

export interface ResumenInicializacionB4 {
  modo: ModoInicializacionB4;
  movimientos: number;
  conEnlaceJustificado: number;
  sinDocumento: number;
  parciales: number;
  incidencias: Record<string, number>;
  omitidosExistentes: number;
  aplicados: number;
}

/** Carga por lotes: la simulación y la aplicación usan el mismo orden y capacidad. */
async function ejecutarInicializacion(tx: any, actorId: number, apply: boolean): Promise<ResumenInicializacionB4> {
  if (apply) {
    await tx.$queryRawUnsafe('SELECT id FROM movimientos_bancarios ORDER BY id FOR UPDATE');
    await tx.$queryRawUnsafe('SELECT id FROM documentos_conciliables ORDER BY id FOR UPDATE');
  } else await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const [movimientos, fuentesRaw, docs, states, nets] = await Promise.all([
    tx.$queryRawUnsafe('SELECT id,importe::text AS importe FROM movimientos_bancarios ORDER BY id') as Promise<RawMovimiento[]>,
    tx.$queryRawUnsafe(`
      SELECT m.id AS movimiento_id, 'FACTURA_RECIBIDA'::text AS source_kind, 'FACTURA_RECIBIDA'::text AS tipo,
        m.factura_id AS target_id, ('m:'||m.id||':factura') AS source_id,
        (fr.id IS NOT NULL) AS target_exists, fr.calidad::text AS calidad, fr.copia_de_id,
        fr.conflicto_identidad, fr.duplicado_externo, fr.total AS importe_fuente,
        NULL::int AS factura_isp_id, NULL::text AS id_externo, NULL::text AS alias_proof,
        NULL::boolean AS ticket_elegible
      FROM movimientos_bancarios m LEFT JOIN facturas_recibidas fr ON fr.id=m.factura_id
      WHERE m.factura_id IS NOT NULL
      UNION ALL
      SELECT m.id,'FACTURA_EMITIDA','FACTURA_EMITIDA',m.factura_emitida_id,('m:'||m.id||':emitida'),
        (fe.id IS NOT NULL),NULL::text,NULL::text,NULL::boolean,NULL::boolean,fe.total,
        f.id,fe.id_externo,CASE WHEN f.id IS NOT NULL AND f.total=fe.total THEN 'FK' ELSE NULL END,NULL::boolean
      FROM movimientos_bancarios m LEFT JOIN facturas_emitidas fe ON fe.id=m.factura_emitida_id
      LEFT JOIN facturas f ON f.id=fe.factura_isp_id WHERE m.factura_emitida_id IS NOT NULL
      UNION ALL
      SELECT m.id,'GASTO','TICKET',m.gasto_id,('m:'||m.id||':gasto'),(g.id IS NOT NULL),
        NULL::text,NULL::text,NULL::boolean,NULL::boolean,g.importe,NULL::int,NULL::text,NULL::text,
        (g.estado::text IN ('APROBADO','CONTABILIZADO') AND g.metodo_pago::text='TARJETA_EMPRESA')
      FROM movimientos_bancarios m LEFT JOIN gastos g ON g.id=m.gasto_id WHERE m.gasto_id IS NOT NULL
      UNION ALL
      SELECT m.id,'NOMINA','NOMINA',m.nomina_id,('m:'||m.id||':nomina'),(n.id IS NOT NULL),
        NULL::text,NULL::text,NULL::boolean,NULL::boolean,n.neto_percibir,NULL::int,NULL::text,NULL::text,NULL::boolean
      FROM movimientos_bancarios m LEFT JOIN nominas n ON n.id=m.nomina_id WHERE m.nomina_id IS NOT NULL
      UNION ALL
      SELECT cr.movimiento_bancario_id,'REMESA_CONCILIACION','REMESA',r.id::text,('cr:'||cr.id),
        (r.id IS NOT NULL),NULL::text,NULL::text,NULL::boolean,NULL::boolean,r.total_importe,NULL::int,NULL::text,NULL::text,NULL::boolean
      FROM conciliaciones_remesas cr LEFT JOIN remesas r ON r.id=cr.remesa_id WHERE cr.movimiento_bancario_id IS NOT NULL
      UNION ALL
      SELECT sr.movimiento_bancario_id,'REMESA_SUBREMESA','REMESA',r.id::text,('sr:'||sr.id),
        (r.id IS NOT NULL),NULL::text,NULL::text,NULL::boolean,NULL::boolean,r.total_importe,NULL::int,NULL::text,NULL::text,NULL::boolean
      FROM sub_remesas_banco sr JOIN conciliaciones_remesas cr ON cr.id=sr.conciliacion_id
      LEFT JOIN remesas r ON r.id=cr.remesa_id WHERE sr.movimiento_bancario_id IS NOT NULL
    `) as Promise<RawFuenteB4[]>,
    tx.documentoConciliable.findMany(),
    tx.estadoJustificacionMovimientoB4.findMany({ select: { movimientoId: true } }),
    tx.$queryRawUnsafe(`SELECT documento_conciliable_id AS id, SUM(importe_centimos) AS neto
      FROM vinculos_movimiento_documento WHERE activo AND documento_conciliable_id IS NOT NULL GROUP BY documento_conciliable_id`) as Promise<Array<{id:string;neto:bigint}>>,
  ]);
  const porMovimiento = new Map<string, FuenteLegacyB4[]>();
  for (const raw of fuentesRaw) {
    if (!raw.movimiento_id) continue;
    porMovimiento.set(raw.movimiento_id, [...(porMovimiento.get(raw.movimiento_id) || []), fuenteDesdeRaw(raw)]);
  }
  const netMap = new Map(nets.map(row => [row.id, Number(row.neto)]));
  const existentes = new Map<string, EnvoltorioB4Existente>();
  for (const doc of docs) {
    const targetId = doc.facturaRecibidaId ?? doc.facturaEmitidaId ?? doc.remesaId ?? doc.nominaId ?? doc.gastoId;
    if (targetId === null || targetId === undefined) continue;
    existentes.set(keyDocumento(doc.tipo, String(targetId)), { id: doc.id, tipo: doc.tipo, targetId: String(targetId),
      importeObjetivoCentimos: doc.importeObjetivoCentimos, activo: doc.activo, netoActivoPrevioCentimos: netMap.get(doc.id) || 0 });
  }
  const stateIds = new Set(states.map((row: any) => row.movimientoId));
  const newDocs: any[] = [], newStates: any[] = [], operations: any[] = [], lines: any[] = [], events: any[] = [];
  const resumen: ResumenInicializacionB4 = { modo: apply ? 'APPLY' : 'DRY_RUN', movimientos: movimientos.length,
    conEnlaceJustificado: 0, sinDocumento: 0, parciales: 0, incidencias: {}, omitidosExistentes: 0, aplicados: 0 };
  for (const movimiento of movimientos) {
    if (stateIds.has(movimiento.id)) { resumen.omitidosExistentes++; continue; }
    const fuentes = porMovimiento.get(movimiento.id) || [];
    const plan = planificarInicializacionB4({ movimientoId: movimiento.id, importeBancoCentimos: centimosLegacyExactos(movimiento.importe),
      fuentes, envoltoriosExistentes: fuentes.flatMap(f => f.targetId && existentes.has(keyDocumento(f.tipo, f.targetId))
        ? [existentes.get(keyDocumento(f.tipo, f.targetId))!] : []) });
    for (const doc of plan.envoltorios) {
      if (doc.accion === 'CREAR' && !existentes.has(keyDocumento(doc.tipo, doc.targetId))) {
        const pointer = doc.tipo === 'FACTURA_RECIBIDA' ? { facturaRecibidaId: doc.targetId }
          : doc.tipo === 'FACTURA_EMITIDA' ? { facturaEmitidaId: doc.targetId }
          : doc.tipo === 'NOMINA' ? { nominaId: doc.targetId }
          : doc.tipo === 'TICKET' ? { gastoId: doc.targetId } : { remesaId: Number(doc.targetId) };
        newDocs.push({ id: doc.id, tipo: doc.tipo, importeObjetivoCentimos: doc.importeObjetivoCentimos, ...pointer });
        existentes.set(keyDocumento(doc.tipo, doc.targetId), { ...doc });
      }
    }
    if (plan.candidato) {
      resumen.conEnlaceJustificado++;
      if (plan.candidato.esParcial) resumen.parciales++;
      const doc = plan.envoltorios.find(d => d.id === plan.candidato!.documentoConciliableId)!;
      const virtual = existentes.get(keyDocumento(doc.tipo, doc.targetId))!;
      virtual.netoActivoPrevioCentimos += plan.candidato.importeCentimos;
    } else resumen.sinDocumento++;
    for (const incidencia of plan.incidencias) resumen.incidencias[incidencia] = (resumen.incidencias[incidencia] || 0) + 1;
    const version = plan.candidato ? 2 : 1;
    const snapshot = { version: B4_INIT_VERSION, movimientoId: movimiento.id,
      importeBancoCentimos: centimosLegacyExactos(movimiento.importe), fuentes,
      candidato: plan.candidato, incidencias: plan.incidencias };
    const operacionId = uuidEstableB4(`${B4_INIT_VERSION}:operacion:${actorId}:${movimiento.id}`);
    newStates.push({ movimientoId: movimiento.id, estado: plan.estadoFinal, version, actualizadoPorId: actorId });
    operations.push({ id: operacionId, movimientoId: movimiento.id, estado: 'APLICADA',
      idempotencyKey: `${B4_INIT_VERSION}:${movimiento.id}`, payloadHash: sha256Estable(snapshot),
      versionEsperada: 1, versionResultante: version, solicitadaPorId: actorId, aprobadaPorId: actorId,
      snapshotSolicitud: snapshot, snapshotEstadoPrevio: { estado: 'SIN_DOCUMENTO', motivoNoRequiere: null, version: 1 },
      snapshotResultado: { estado: plan.estadoFinal, motivoNoRequiere: null, version }, aplicadaAt: new Date(), aprobadaAt: new Date() });
    if (plan.candidato) lines.push({ id: uuidEstableB4(`${B4_INIT_VERSION}:linea:${movimiento.id}`), movimientoId: movimiento.id,
      documentoConciliableId: plan.candidato.documentoConciliableId, tipoLinea: 'DOCUMENTO',
      importeCentimos: plan.candidato.importeCentimos, operacionCreacionId: operacionId });
    events.push({ id: uuidEstableB4(`${B4_INIT_VERSION}:evento:${actorId}:${movimiento.id}`), operacionId,
      movimientoId: movimiento.id, accion: 'INICIALIZACION', actorId, detalle: snapshot });
  }
  if (apply) {
    for (const [model, rows] of [[tx.documentoConciliable,newDocs], [tx.estadoJustificacionMovimientoB4,newStates],
      [tx.operacionJustificacionB4,operations], [tx.vinculoMovimientoDocumento,lines], [tx.eventoJustificacionB4,events]] as const) {
      for (let offset=0; offset<rows.length; offset+=100) await model.createMany({ data: rows.slice(offset,offset+100) });
    }
    await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
    resumen.aplicados = newStates.length;
  }
  return resumen;
}

async function main(): Promise<void> {
  const opciones = parsearOpcionesInicializacionB4(process.argv.slice(2));
  const [{ prisma }, { assertFinanceStagingIsolated }] = await Promise.all([import('../lib/prisma'),import('../lib/finanzas/staging-safety')]);
  try {
    await assertFinanceStagingIsolated();
    const actor = await prisma.usuarioAdmin.findUnique({ where: { id: opciones.actorId }, select: { activo: true, rol: true } });
    if (!actor?.activo || !['SUPER_ADMIN','GERENTE','CONTABILIDAD'].includes(actor.rol)) throw new Error('B4_INIT_ACTOR_NOT_AUTHORIZED');
    const resumen = await prisma.$transaction(tx => ejecutarInicializacion(tx, opciones.actorId, opciones.modo === 'APPLY'),
      { isolationLevel: 'Serializable', maxWait: 10000, timeout: 180000 });
    console.log(JSON.stringify(resumen));
  } finally { await prisma.$disconnect(); }
}
if (process.argv[1]?.endsWith('init-finance-b4.ts')) {
  main().catch(error => { console.error(error?.code || (error instanceof Error ? error.message : 'B4_INIT_FAILED')); process.exitCode=1; });
}
