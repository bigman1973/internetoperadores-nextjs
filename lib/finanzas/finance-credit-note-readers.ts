/**
 * Adaptadores de lectura para el núcleo de rectificativas.
 *
 * No contienen SQL/Prisma: cada lector de origen mantiene su propia definición de
 * canonicidad. Este módulo sólo combina sus resultados ya canónicos para evitar
 * que emitidas y recibidas reimplementen identidad, versiones o B4.
 */
import {
  calculateCreditNoteSettlements,
  type CanonicalCreditNoteDocument,
  type CreditNoteB4PaymentEvidence,
  type CreditNoteCalculationResult,
  type CreditNoteDocumentKind,
  type CreditNoteVersionLink,
} from './finance-credit-note-core'

export interface CanonicalCreditNoteSourceReader {
  readonly kind: CreditNoteDocumentKind
  /** Sólo originales que ya superaron el lector canónico del origen. */
  readCanonicalOriginals(): readonly CanonicalCreditNoteDocument[]
  /** Sólo rectificativas que ya superaron el mismo lector canónico del origen. */
  readCanonicalCreditNotes(): readonly CanonicalCreditNoteDocument[]
}

/** La implementación pertenece al bloque de versiones y expone sólo filas vigentes. */
export interface CurrentCreditNoteVersionReader {
  readCurrentCreditNoteLinks(): readonly CreditNoteVersionLink[]
}

/** La implementación reutiliza la evidencia B4 actual; no crea ni confirma operaciones. */
export interface CurrentCreditNoteB4Reader {
  readCurrentCreditNoteB4Payments(): readonly CreditNoteB4PaymentEvidence[]
}

export interface CreditNoteReaderBundle {
  issued: CanonicalCreditNoteSourceReader
  received: CanonicalCreditNoteSourceReader
  versions: CurrentCreditNoteVersionReader
  b4: CurrentCreditNoteB4Reader
}

function documentsForReader(reader: CanonicalCreditNoteSourceReader, kind: CreditNoteDocumentKind): {
  originals: CanonicalCreditNoteDocument[]
  creditNotes: CanonicalCreditNoteDocument[]
} {
  const constrainKind = (documents: readonly CanonicalCreditNoteDocument[]) => documents.map((document) => document.kind === kind
    ? document
    : { ...document, canonicalCurrent: false })
  return {
    originals: constrainKind(reader.readCanonicalOriginals()),
    creditNotes: constrainKind(reader.readCanonicalCreditNotes()),
  }
}

/**
 * Sólo orquesta lectores; la aritmética y todas las decisiones de revisión siguen
 * concentradas en `calculateCreditNoteSettlements`.
 */
export function calculateCreditNotesFromCanonicalReaders(bundle: CreditNoteReaderBundle): CreditNoteCalculationResult {
  const issued = documentsForReader(bundle.issued, 'EMITIDA')
  const received = documentsForReader(bundle.received, 'RECIBIDA')
  return calculateCreditNoteSettlements({
    originals: [
      ...issued.originals,
      ...received.originals,
    ],
    creditNotes: [
      ...issued.creditNotes,
      ...received.creditNotes,
    ],
    versionLinks: bundle.versions.readCurrentCreditNoteLinks(),
    b4Payments: bundle.b4.readCurrentCreditNoteB4Payments(),
  })
}

/**
 * Guard reusable for adapters that want to preflight a source reader without
 * accessing a database. It returns no data for a kind mismatch.
 */
export function canonicalReaderHasOnlyKind(reader: CanonicalCreditNoteSourceReader): boolean {
  const expected = reader.kind
  return [...reader.readCanonicalOriginals(), ...reader.readCanonicalCreditNotes()].every((document) => document.kind === expected)
}
