import { Prisma } from '@prisma/client'

type ReadClient = { $queryRaw<T = unknown>(query: Prisma.Sql): Promise<T> }
export type OwnershipDeclaration = Readonly<{ accountId: string; state: 'DECLARADA' | 'REVOCADA' }>

/** Informative declaration reader only. Never consumed by reconciliation or automation. */
export async function readOwnershipDeclarationsTx(tx: ReadClient): Promise<OwnershipDeclaration[]> {
  const schema = await tx.$queryRaw<Array<{ found: string | null }>>(Prisma.sql`
    SELECT to_regclass('public.declaraciones_titularidad_modo_facil')::text AS found LIMIT 1
  `)
  if (!schema[0]?.found) return []
  const rows = await tx.$queryRaw<Array<{ cuenta_id: string; estado: string }>>(Prisma.sql`
    SELECT DISTINCT ON (d.cuenta_id) d.cuenta_id,d.estado
    FROM declaraciones_titularidad_modo_facil d
    JOIN cuentas_bancarias c ON c.id=d.cuenta_id AND c.activa=true
    WHERE d.fecha_declaracion<=CURRENT_DATE
    ORDER BY d.cuenta_id,d.version DESC LIMIT 500
  `)
  if (rows.length === 500) throw new Error('OWNERSHIP_READ_TRUNCATED')
  return rows.flatMap(row => row.estado === 'DECLARADA' || row.estado === 'REVOCADA'
    ? [{ accountId: row.cuenta_id, state: row.estado }] : [])
}

/** A later human revocation overrides either source, without editing history. */
export function mergeDeclaredAccountIds(previous: readonly string[], declarations: readonly OwnershipDeclaration[]): string[] {
  const ids = new Set(previous)
  for (const declaration of declarations) {
    if (declaration.state === 'DECLARADA') ids.add(declaration.accountId)
    else ids.delete(declaration.accountId)
  }
  return [...ids].sort()
}
