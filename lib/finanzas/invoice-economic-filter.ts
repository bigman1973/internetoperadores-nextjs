import { Prisma } from '@prisma/client';

/**
 * C9 compatibility fence. Existing confirming rows retain naturaleza=FACTURA_RECIBIDA
 * until a person classifies them, so they stay excluded by the exact B1 location
 * present now or in historial_ubicaciones. New classified rows are independently
 * excluded by naturalezaDocumento. This is not a name/provider/OCR heuristic.
 */
const CARPETA_CONFIRMING_DRAXTON_2026 = '3. Confirming Draxton 2026';
const rutaConfirmingActualOHistorica: Prisma.FacturaRecibidaWhereInput = {
  OR: [
    { carpetaOrigen: { contains: CARPETA_CONFIRMING_DRAXTON_2026, mode: 'insensitive' } },
    { archivoOneDrive: { contains: CARPETA_CONFIRMING_DRAXTON_2026, mode: 'insensitive' } },
    { oneDriveRutaActual: { contains: CARPETA_CONFIRMING_DRAXTON_2026, mode: 'insensitive' } },
    { historialUbicaciones: { some: { OR: [
      { anterior: { path: ['carpetaOrigen'], string_contains: CARPETA_CONFIRMING_DRAXTON_2026 } },
      { anterior: { path: ['archivoOneDrive'], string_contains: CARPETA_CONFIRMING_DRAXTON_2026 } },
      { anterior: { path: ['oneDriveRutaActual'], string_contains: CARPETA_CONFIRMING_DRAXTON_2026 } },
      { actual: { path: ['carpetaOrigen'], string_contains: CARPETA_CONFIRMING_DRAXTON_2026 } },
      { actual: { path: ['archivoOneDrive'], string_contains: CARPETA_CONFIRMING_DRAXTON_2026 } },
      { actual: { path: ['oneDriveRutaActual'], string_contains: CARPETA_CONFIRMING_DRAXTON_2026 } },
    ] } } },
  ],
};

/** Applies to all received-invoice lists, even quality/review screens. */
export const facturaNoConfirmingDraxtonWhere: Prisma.FacturaRecibidaWhereInput = {
  NOT: [rutaConfirmingActualOHistorica],
};

/** B2/C9: only a canonical purchase invoice is an economic, VAT or payable fact. */
export const facturaEconomicaWhere: Prisma.FacturaRecibidaWhereInput = {
  calidad: 'VALIDA',
  copiaDeId: null,
  naturalezaDocumento: 'FACTURA_RECIBIDA',
  NOT: [
    { proveedor: { equals: 'ERROR_OCR', mode: 'insensitive' } },
    { proveedor: { equals: 'DESCONOCIDO', mode: 'insensitive' } },
    rutaConfirmingActualOHistorica,
  ],
};

export function facturaEconomicaSQL(alias = 'fr'): Prisma.Sql {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Alias SQL B2/C9 no permitido');
  const a = Prisma.raw(`"${alias}"`);
  const folder = `%${CARPETA_CONFIRMING_DRAXTON_2026}%`;
  return Prisma.sql`${a}."calidad" = 'VALIDA'
    AND ${a}."copia_de_id" IS NULL
    AND ${a}."naturaleza_documento" = 'FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
    AND UPPER(BTRIM(COALESCE(${a}."proveedor", ''))) NOT IN ('ERROR_OCR', 'DESCONOCIDO')
    AND NOT (
      COALESCE(${a}."carpeta_origen", '') ILIKE ${folder}
      OR COALESCE(${a}."archivo_onedrive", '') ILIKE ${folder}
      OR COALESCE(${a}."onedrive_ruta_actual", '') ILIKE ${folder}
      OR EXISTS (
        SELECT 1 FROM "historial_ubicaciones_facturas_recibidas" c9h
        WHERE c9h."factura_id" = ${a}."id"
          AND (c9h."anterior"::text ILIKE ${folder} OR c9h."actual"::text ILIKE ${folder})
      )
    )`;
}
