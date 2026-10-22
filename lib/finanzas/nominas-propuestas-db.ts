/*
 * Adaptador B6 de nóminas para candidatura humana.
 *
 * Sólo SELECT. No inicializa B4, no crea Nómina/DocumentoConciliable y no llama
 * a Graph. La creación idempotente de un wrapper queda en la acción B4
 * `documento`, iniciada por el botón humano «Preparar» de la UI.
 */
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import {
  centimosExactosDesdeDecimalSql,
  parsePeriodo,
  periodoEstaPermitido,
  periodosPermitidosPorFechaBanco,
  type ArchivoNomina,
  type CandidataNomina,
  type Cents,
  type PeriodoNomina,
} from '@/lib/finanzas/nominas-propuestas-core';

const LIMITE = 101; // 100 + centinela; una lectura incompleta nunca se disimula.
const ID_MOVIMIENTO = /^[A-Za-z0-9_-]{1,160}$/;
const ID_DRIVE = /^[A-Za-z0-9!_.~-]{4,220}$/;

export class NominasPropuestasReadError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
function fail(status: number, code: string, message: string): never { throw new NominasPropuestasReadError(status, code, message); }

type MovimientoFila = Readonly<{ id: string; fecha: string; importeDecimal: string }>;
type NominaFila = Readonly<{
  sourceNominaId: string;
  empleadoId: string;
  empleadoNombreCompleto: string;
  anio: number;
  mes: number;
  netoDecimal: string;
  archivoUrl: string | null;
  archivoNombre: string | null;
  documentoId: string | null;
  documentoDriveItemId: string | null;
  documentoNombre: string | null;
  documentoTipo: string | null;
  wrapperId: string | null;
  wrapperActivo: boolean | null;
  wrapperObjetivoCentimos: number | null;
  wrapperAsignadoCentimos: number | string | null;
}>;

export type NominaCandidataDTO = Readonly<{
  sourceNominaId: string;
  empleadoId: string;
  empleadoNombreCompleto: string;
  periodo: string;
  anio: number;
  mes: number;
  netoPercibirCentimos: number;
  archivo: Readonly<{ archivoId: string; downloadHref: string; nombre: string; tipo: string }> | null;
  wrapperB4: Readonly<{
    documentoConciliableId: string;
    activo: boolean;
    importeObjetivoCentimos: number | null;
    asignadoCentimos: number | null;
  }> | null;
}>;

export type LecturaCandidatasNominaDTO = Readonly<{
  movimiento: Readonly<{ id: string; fechaBanco: string; importeCentimos: number; periodosPermitidos: readonly string[] }>;
  periodoElegido: string;
  candidatasNetoExacto: readonly NominaCandidataDTO[];
  candidatasPeriodoParaGrupo: readonly NominaCandidataDTO[];
  advertencias: readonly string[];
  noEscrituras: true;
  requiereConfirmacionHumana: true;
}>;

/** Sólo acepta la ruta legacy emitida por nominas-sync; ni host, query ni hash. */
export function driveItemDesdeArchivoUrlNominaControlada(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 300) return null;
  const match = /^\/api\/admin\/nominas\/download\/([A-Za-z0-9!_.~-]{4,220})$/.exec(value);
  return match?.[1] ?? null;
}

function nombreSeguro(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const safe = value.replace(/[\r\n\\/]/g, ' ').trim();
  return safe.length > 0 && safe.length <= 180 ? safe : fallback;
}

function centsEnterosLeidos(value: number | string | null): number | null {
  if (value === null) return null;
  const text = String(value);
  if (!/^-?\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number >= -2147483648 && number <= 2147483647 ? number : null;
}

function archivoDesdeFila(row: NominaFila): ArchivoNomina | null {
  if (row.documentoId && row.documentoDriveItemId && ID_DRIVE.test(row.documentoDriveItemId)
    && row.documentoTipo === 'NOMINA') {
    return {
      archivoId: `NOMINA_DOCUMENTO:${row.documentoId}`,
      downloadHref: `/api/admin/nominas/download/${encodeURIComponent(row.documentoDriveItemId)}`,
      nombre: nombreSeguro(row.documentoNombre, 'nomina.pdf'),
      tipo: row.documentoTipo,
    };
  }
  const legacyItem = driveItemDesdeArchivoUrlNominaControlada(row.archivoUrl);
  if (!legacyItem) return null;
  return {
    archivoId: `NOMINA_ARCHIVO_URL_RELATIVA:${row.sourceNominaId}`,
    downloadHref: `/api/admin/nominas/download/${encodeURIComponent(legacyItem)}`,
    nombre: nombreSeguro(row.archivoNombre, 'nomina.pdf'),
    tipo: 'RESUMEN_MENSUAL_LEGADO',
  };
}

function candidataDesdeFila(row: NominaFila): CandidataNomina | null {
  const neto = centimosExactosDesdeDecimalSql(row.netoDecimal);
  if (neto === null || neto <= 0 || !Number.isInteger(row.anio) || !Number.isInteger(row.mes)
    || row.anio < 2024 || row.anio > 2100 || row.mes < 1 || row.mes > 12
    || !row.sourceNominaId || !row.empleadoId || !row.empleadoNombreCompleto.trim()) return null;
  return {
    sourceNominaId: row.sourceNominaId,
    empleadoId: row.empleadoId,
    empleadoNombreCompleto: nombreSeguro(row.empleadoNombreCompleto, 'Empleado sin nombre'),
    periodo: { anio: row.anio, mes: row.mes },
    netoPercibirCentimos: neto,
    archivo: archivoDesdeFila(row),
    wrapperB4: row.wrapperId === null ? null : {
      documentoConciliableId: row.wrapperId,
      activo: row.wrapperActivo === true,
      importeObjetivoCentimos: row.wrapperObjetivoCentimos,
      asignadoCentimos: centsEnterosLeidos(row.wrapperAsignadoCentimos),
    },
  };
}

function dto(candidate: CandidataNomina): NominaCandidataDTO {
  return {
    sourceNominaId: candidate.sourceNominaId,
    empleadoId: candidate.empleadoId,
    empleadoNombreCompleto: candidate.empleadoNombreCompleto,
    periodo: `${candidate.periodo.anio}-${String(candidate.periodo.mes).padStart(2, '0')}`,
    anio: candidate.periodo.anio,
    mes: candidate.periodo.mes,
    netoPercibirCentimos: candidate.netoPercibirCentimos,
    archivo: candidate.archivo,
    wrapperB4: candidate.wrapperB4,
  };
}

async function leerMovimiento(movimientoId: string): Promise<MovimientoFila> {
  if (!ID_MOVIMIENTO.test(movimientoId)) fail(400, 'MOVIMIENTO_INVALIDO', 'movimientoId no es válido.');
  const rows = await prisma.$queryRaw<MovimientoFila[]>(Prisma.sql`
    SELECT id, fecha_operacion::date::text AS fecha, importe::text AS "importeDecimal"
    FROM movimientos_bancarios WHERE id = ${movimientoId} LIMIT 2
  `);
  if (rows.length !== 1) fail(404, 'MOVIMIENTO_NO_ENCONTRADO', 'El movimiento bancario no existe.');
  return rows[0];
}

/**
 * Una lectura por período, no por parecido de nombre. Incluye el universo de
 * grupo para que la persona enumere IDs; `candidatasNetoExacto` es el prefiltro
 * individual exacto. Ambos límites son visibles y cierran con error si exceden.
 */
async function leerNominasPeriodo(periodo: PeriodoNomina): Promise<NominaFila[]> {
  const rows = await prisma.$queryRaw<NominaFila[]>(Prisma.sql`
    SELECT n.id AS "sourceNominaId", n.empleado_id AS "empleadoId", e.nombre_completo AS "empleadoNombreCompleto",
      n.anio, n.mes, n.neto_percibir::text AS "netoDecimal", n.archivo_url AS "archivoUrl", n.archivo_nombre AS "archivoNombre",
      nd.id AS "documentoId", nd.drive_item_id AS "documentoDriveItemId", nd.nombre AS "documentoNombre", nd.tipo AS "documentoTipo",
      d.id AS "wrapperId", d.activo AS "wrapperActivo", d.importe_objetivo_centimos AS "wrapperObjetivoCentimos",
      COALESCE(SUM(v.importe_centimos) FILTER (WHERE v.activo), 0) AS "wrapperAsignadoCentimos"
    FROM nominas n
    JOIN empleados e ON e.id = n.empleado_id
    LEFT JOIN LATERAL (
      SELECT id, drive_item_id, nombre, tipo
      FROM nomina_documentos
      WHERE nomina_id = n.id AND tipo = 'NOMINA'
      ORDER BY CASE tipo WHEN 'NOMINA' THEN 0 ELSE 1 END, id ASC
      LIMIT 1
    ) nd ON true
    LEFT JOIN documentos_conciliables d ON d.nomina_id = n.id AND d.tipo = 'NOMINA'::"TipoDocumentoConciliable"
    LEFT JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id = d.id
    WHERE n.anio = ${periodo.anio} AND n.mes = ${periodo.mes}
    GROUP BY n.id, e.id, nd.id, nd.drive_item_id, nd.nombre, nd.tipo, d.id
    ORDER BY e.nombre_completo ASC, n.id ASC
    LIMIT ${LIMITE}
  `);
  if (rows.length === LIMITE) fail(409, 'CANDIDATAS_PERIODO_TRUNCADAS', 'Hay más de 100 nóminas en el período; refine/revise antes de seleccionar.');
  return rows;
}

export async function leerCandidatasNomina(movimientoId: string, periodoElegidoTexto: string): Promise<LecturaCandidatasNominaDTO> {
  const periodoElegido = parsePeriodo(periodoElegidoTexto);
  if (!periodoElegido) fail(400, 'PERIODO_INVALIDO', 'periodo debe usar AAAA-MM.');
  const movimiento = await leerMovimiento(movimientoId);
  const importe = centimosExactosDesdeDecimalSql(movimiento.importeDecimal);
  if (importe === null || importe >= 0) fail(422, 'MOVIMIENTO_NO_ES_CARGO', 'Sólo un cargo bancario negativo y exacto puede revisarse como nómina.');
  if (!periodoEstaPermitido(periodoElegido, movimiento.fecha)) {
    fail(400, 'PERIODO_FUERA_DE_PREFILTRO', 'El período debe ser el mes bancario o el mes inmediatamente anterior.');
  }

  const sourceRows = await leerNominasPeriodo(periodoElegido);
  const candidatas = sourceRows.map(candidataDesdeFila).filter((row): row is CandidataNomina => row !== null);
  const targetNeto = -importe;
  const exactas = candidatas.filter((candidate) => candidate.netoPercibirCentimos === targetNeto);
  const invalidas = sourceRows.length - candidatas.length;
  return {
    movimiento: {
      id: movimiento.id,
      fechaBanco: movimiento.fecha,
      importeCentimos: importe,
      periodosPermitidos: periodosPermitidosPorFechaBanco(movimiento.fecha).map((period) => `${period.anio}-${String(period.mes).padStart(2, '0')}`),
    },
    periodoElegido: periodoElegidoTexto,
    candidatasNetoExacto: exactas.map(dto),
    candidatasPeriodoParaGrupo: candidatas.map(dto),
    advertencias: [
      ...(exactas.length === 0 ? ['NO_HAY_NOMINA_CON_NETO_INDIVIDUAL_EXACTO_EN_EL_PERIODO_ELEGIDO'] : []),
      ...(exactas.length > 1 ? ['VARIAS_NOMINAS_CON_NETO_EXACTO: LA_PERSONA_DEBE_ELEGIR_EXPLICITAMENTE'] : []),
      ...(invalidas > 0 ? ['ALGUNAS_FILAS_DE_NOMINA_TIENEN_DATOS_NO_EXACTOS_Y_NO_SE_MUESTRAN_COMO_CANDIDATAS'] : []),
      ...candidatas.filter((candidate) => candidate.archivo === null).map((candidate) => `SIN_ARCHIVO_DESCARGABLE:${candidate.sourceNominaId}`),
    ],
    noEscrituras: true,
    requiereConfirmacionHumana: true,
  };
}
