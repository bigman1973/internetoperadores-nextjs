import { Prisma } from '@prisma/client';

/** B2: los originales se conservan; sólo la canónica válida constituye un hecho económico. */
export const facturaEconomicaWhere = {
  calidad: 'VALIDA' as const,
  copiaDeId: null,
  NOT: [
    { proveedor: { equals: 'ERROR_OCR', mode: 'insensitive' as const } },
    { proveedor: { equals: 'DESCONOCIDO', mode: 'insensitive' as const } },
  ],
};

export function facturaEconomicaSQL(alias = 'fr'): Prisma.Sql {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error('Alias SQL B2 no permitido');
  const a = Prisma.raw(`"${alias}"`);
  return Prisma.sql`${a}."calidad" = 'VALIDA' AND ${a}."copia_de_id" IS NULL AND UPPER(BTRIM(COALESCE(${a}."proveedor", ''))) NOT IN ('ERROR_OCR', 'DESCONOCIDO')`;
}
