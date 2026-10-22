/*
 * B6 nóminas: núcleo puro para candidaturas de revisión humana.
 *
 * No importa Prisma, HTTP, Graph, variables de entorno ni B4.  No crea Nómina,
 * DocumentoConciliable, vínculo, evidencia ni estado alguno.  Un grupo existe
 * exclusivamente cuando una persona ha seleccionado explícitamente sus IDs.
 */

export const CENTIMOS_MIN_B4 = -2147483648;
export const CENTIMOS_MAX_B4 = 2147483647;

export type Cents = number & { readonly __nominasProposalCents: unique symbol };
export type PeriodoNomina = Readonly<{ anio: number; mes: number }>;
export type ArchivoNomina = Readonly<{
  archivoId: string;
  downloadHref: string;
  nombre: string;
  tipo: 'NOMINA' | 'LIQUIDACION' | 'RESUMEN_MENSUAL_LEGADO';
}>;

/** Fuente real proyectada por el adaptador; no incluye ni presupone wrapper B4. */
export type CandidataNomina = Readonly<{
  sourceNominaId: string;
  empleadoId: string;
  empleadoNombreCompleto: string;
  periodo: PeriodoNomina;
  netoPercibirCentimos: Cents;
  archivo: ArchivoNomina | null;
  /** Informativo: null no bloquea la candidatura ni provoca una escritura GET. */
  wrapperB4: Readonly<{
    documentoConciliableId: string;
    activo: boolean;
    importeObjetivoCentimos: number | null;
    asignadoCentimos: number | null;
  }> | null;
}>;

export type AfirmacionHumanaNomina = Readonly<{
  netoVerificado: boolean;
  periodoVerificado: boolean;
  evidenciaHumanaDisponible: boolean;
}>;

export type SeleccionNominas = Readonly<{
  importeMovimientoCentimos: number;
  periodo: PeriodoNomina;
  candidatas: readonly CandidataNomina[];
  sourceNominaIds: readonly string[];
  afirmacion: AfirmacionHumanaNomina;
}>;

export type ResultadoSeleccionNominas = Readonly<{
  estado: 'LISTA_PARA_PREPARAR_B4' | 'REVISION_HUMANA_REQUERIDA';
  clase:
    | 'NOMINA_NETA_SELECCIONADA_EXACTA'
    | 'GRUPO_NOMINAS_SELECCIONADO_EXACTO'
    | 'SIN_SELECCION'
    | 'SELECCION_AMBIGUA_O_INVALIDA'
    | 'AFIRMACION_HUMANA_INCOMPLETA'
    | 'ARCHIVO_FALTANTE'
    | 'NETO_O_PERIODO_NO_CIERRA';
  lineas: readonly Readonly<{
    sourceNominaId: string;
    empleadoNombreCompleto: string;
    periodo: PeriodoNomina;
    importeCentimos: Cents;
  }>[];
  totalCentimos: Cents | null;
  diferenciaPendienteCentimos: Cents | null;
  razones: readonly string[];
  requiereConfirmacionHumana: true;
  noEscrituras: true;
}>;

function isText(value: unknown, max = 240): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function esPeriodoNomina(value: unknown): value is PeriodoNomina {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Number.isInteger(record.anio) && (record.anio as number) >= 2024 && (record.anio as number) <= 2100
    && Number.isInteger(record.mes) && (record.mes as number) >= 1 && (record.mes as number) <= 12;
}

export function cents(value: unknown, allowZero = false): Cents | null {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null;
  if (value < CENTIMOS_MIN_B4 || value > CENTIMOS_MAX_B4 || (!allowZero && value === 0)) return null;
  return value as Cents;
}

/** Exacta para texto SQL decimal; no usa Float, Number#toFixed ni BigInt (target ES2017). */
export function centimosExactosDesdeDecimalSql(value: unknown): Cents | null {
  if (typeof value !== 'string') return null;
  const match = /^([+-]?)(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const units = Number(match[2]);
  const fractional = Number((match[3] || '').padEnd(2, '0'));
  if (!Number.isSafeInteger(units) || !Number.isSafeInteger(fractional)) return null;
  const magnitude = units * 100 + fractional;
  if (!Number.isSafeInteger(magnitude)) return null;
  return cents(match[1] === '-' ? -magnitude : magnitude);
}

export function decimalSqlDesdeCentimos(value: number): string | null {
  const parsed = cents(value);
  if (parsed === null) return null;
  const negative = parsed < 0;
  const digits = String(Math.abs(parsed)).padStart(3, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/** Sólo Unicode, diacríticos y espacios; jamás ordena palabras, recorta tokens o usa fuzzy. */
export function normalizarNombreLiteralNomina(value: string): string {
  return value.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFKC')
    .replace(/[\s\u00a0]+/g, ' ')
    .trim()
    .toLocaleUpperCase('es-ES');
}

export function parsePeriodo(value: unknown): PeriodoNomina | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) return null;
  return { anio: Number(match[1]), mes: Number(match[2]) };
}

export function serializarPeriodo(periodo: PeriodoNomina): string {
  return `${String(periodo.anio).padStart(4, '0')}-${String(periodo.mes).padStart(2, '0')}`;
}

/** Mes civil de banco y el mes inmediatamente anterior; sin aproximar fechas. */
export function periodosPermitidosPorFechaBanco(fechaCivil: unknown): readonly PeriodoNomina[] {
  if (typeof fechaCivil !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fechaCivil)) return [];
  const anio = Number(fechaCivil.slice(0, 4));
  const mes = Number(fechaCivil.slice(5, 7));
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) return [];
  const previo = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  return [{ anio, mes }, previo];
}

export function periodoEstaPermitido(periodo: PeriodoNomina, fechaBancoCivil: string): boolean {
  return periodosPermitidosPorFechaBanco(fechaBancoCivil)
    .some((allowed) => allowed.anio === periodo.anio && allowed.mes === periodo.mes);
}

/** Filtro opcional: coincidencia de nombre completo literal normalizado, nunca parcial. */
export function filtrarPorNombreLiteral(candidatas: readonly CandidataNomina[], nombre: string | null): readonly CandidataNomina[] {
  const needle = nombre && nombre.trim() ? normalizarNombreLiteralNomina(nombre) : null;
  if (!needle) return [...candidatas];
  return candidatas.filter((candidate) => normalizarNombreLiteralNomina(candidate.empleadoNombreCompleto) === needle);
}

function sumaFirmada(values: readonly number[]): Cents | null {
  let total = 0;
  for (const value of values) {
    if (cents(value) === null) return null;
    total += value;
    if (!Number.isSafeInteger(total) || total < CENTIMOS_MIN_B4 || total > CENTIMOS_MAX_B4) return null;
  }
  return cents(total);
}

function diff(left: number, right: number): Cents | null {
  return cents(left - right, true);
}

function result(
  estado: ResultadoSeleccionNominas['estado'],
  clase: ResultadoSeleccionNominas['clase'],
  lineas: ResultadoSeleccionNominas['lineas'],
  totalCentimos: Cents | null,
  diferenciaPendienteCentimos: Cents | null,
  razones: readonly string[],
): ResultadoSeleccionNominas {
  return {
    estado, clase, lineas, totalCentimos, diferenciaPendienteCentimos, razones,
    requiereConfirmacionHumana: true, noEscrituras: true,
  };
}

/**
 * Evalúa sólo la lista de IDs marcada por una persona. No hay búsqueda de
 * subconjuntos, ranking por importe ni selección de la primera candidata.
 */
export function evaluarSeleccionNominas(input: SeleccionNominas): ResultadoSeleccionNominas {
  const bank = cents(input?.importeMovimientoCentimos);
  if (bank === null || bank >= 0 || !esPeriodoNomina(input?.periodo) || !Array.isArray(input?.candidatas) || !Array.isArray(input?.sourceNominaIds)) {
    return result('REVISION_HUMANA_REQUERIDA', 'SELECCION_AMBIGUA_O_INVALIDA', [], null, null, ['ENTRADA_DE_SELECCION_NO_ES_VALIDABLE']);
  }
  if (input.sourceNominaIds.length === 0) {
    return result('REVISION_HUMANA_REQUERIDA', 'SIN_SELECCION', [], null, null, ['SELECCIONE_UNA_O_VARIAS_NOMINAS_REALES']);
  }
  if (input.sourceNominaIds.length > 50 || new Set(input.sourceNominaIds).size !== input.sourceNominaIds.length || input.sourceNominaIds.some((id) => !isText(id, 160))) {
    return result('REVISION_HUMANA_REQUERIDA', 'SELECCION_AMBIGUA_O_INVALIDA', [], null, null, ['IDS_DE_NOMINA_DUPLICADOS_O_NO_VALIDOS']);
  }
  if (!input.afirmacion || input.afirmacion.netoVerificado !== true || input.afirmacion.periodoVerificado !== true || input.afirmacion.evidenciaHumanaDisponible !== true) {
    return result('REVISION_HUMANA_REQUERIDA', 'AFIRMACION_HUMANA_INCOMPLETA', [], null, null, ['CONFIRME_NETO_PERIODO_Y_EVIDENCIA_HUMANA_ANTES_DE_PREPARAR']);
  }

  const byId = new Map(input.candidatas.map((candidate) => [candidate.sourceNominaId, candidate] as const));
  const selected: CandidataNomina[] = [];
  for (const id of input.sourceNominaIds) {
    const candidate = byId.get(id);
    if (!candidate || candidate.periodo.anio !== input.periodo.anio || candidate.periodo.mes !== input.periodo.mes) {
      return result('REVISION_HUMANA_REQUERIDA', 'SELECCION_AMBIGUA_O_INVALIDA', [], null, null, ['LA_SELECCION_DEBE_PROCEDER_DE_LA_LISTA_Y_DEL_PERIODO_ELEGIDO']);
    }
    if (candidate.archivo === null) {
      return result('REVISION_HUMANA_REQUERIDA', 'ARCHIVO_FALTANTE', [], null, null, ['LA_NOMINA_SELECCIONADA_NO_TIENE_ARCHIVO_DESCARGABLE_CONTROLADO']);
    }
    selected.push(candidate);
  }

  const lineas = selected.map((candidate) => ({
    sourceNominaId: candidate.sourceNominaId,
    empleadoNombreCompleto: candidate.empleadoNombreCompleto,
    periodo: candidate.periodo,
    importeCentimos: (-candidate.netoPercibirCentimos) as Cents,
  }));
  const total = sumaFirmada(lineas.map((line) => line.importeCentimos));
  if (total === null || total !== bank) {
    return result(
      'REVISION_HUMANA_REQUERIDA',
      'NETO_O_PERIODO_NO_CIERRA',
      lineas,
      total,
      total === null ? null : diff(bank, total),
      ['LA_SUMA_FIRMADA_DE_LOS_NETOS_SELECCIONADOS_NO_CIERRA_AL_CENTIMO', 'NO_SE_BUSCA_OTRO_SUBCONJUNTO_NI_SE_APLICA_TOLERANCIA'],
    );
  }
  return result(
    'LISTA_PARA_PREPARAR_B4',
    selected.length === 1 ? 'NOMINA_NETA_SELECCIONADA_EXACTA' : 'GRUPO_NOMINAS_SELECCIONADO_EXACTO',
    lineas,
    total,
    null,
    [
      'SELECCION_HUMANA_EXPLICITA_DE_IDS_DE_NOMINA',
      selected.length === 1 ? 'NETO_PERCIBIR_EXACTO_DE_UNA_NOMINA_REAL' : 'GRUPO_EXCLUSIVAMENTE_SELECCIONADO_POR_LA_PERSONA',
      'PERIODO_ELEGIDO_ENTRE_MES_BANCO_Y_MES_PREVIO',
      'ARCHIVO_PRIVADO_CONTROLADO_DISPONIBLE',
      'B4_REQUIERE_PREPARACION_Y_CONFIRMACION_HUMANA_INDEPENDIENTES',
    ],
  );
}
