-- Cierre 2026-10-29: bytes originales privados para versiones documentales.
-- ADITIVA. Requiere que 20261029_document_version_lifecycle ya se haya aplicado.
-- No toca B4, movimientos, facturas, cobros, Graph, OCR, correo ni datos existentes.
-- Este agente no ejecuta la migración: el padre la ensayará localmente en staging.

CREATE TABLE "document_version_artifacts" (
  "id" UUID NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "byte_length" INTEGER NOT NULL,
  "format" "DocumentVersionOriginalFormat" NOT NULL,
  "content_bytes" BYTEA NOT NULL,
  "created_by_id" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_artifacts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_artifact_sha256_ck" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_artifact_length_ck" CHECK (
    "byte_length" BETWEEN 1 AND 20971520
    AND octet_length("content_bytes") = "byte_length"
    AND octet_length("content_bytes") <= 20971520
  ),
  CONSTRAINT "document_version_artifact_format_ck" CHECK ("format" IN ('PDF', 'XLS', 'XLSX')),
  CONSTRAINT "document_version_artifact_signature_ck" CHECK (
    ("format" = 'PDF' AND substring("content_bytes" FROM 1 FOR 5) = decode('255044462d', 'hex'))
    OR ("format" = 'XLS' AND substring("content_bytes" FROM 1 FOR 8) = decode('d0cf11e0a1b11ae1', 'hex'))
    OR ("format" = 'XLSX' AND substring("content_bytes" FROM 1 FOR 4) = decode('504b0304', 'hex'))
  )
);
CREATE INDEX "document_version_artifact_sha256_created_idx" ON "document_version_artifacts"("sha256", "created_at");
CREATE INDEX "document_version_artifact_created_by_created_idx" ON "document_version_artifacts"("created_by_id", "created_at");

ALTER TABLE "document_version_artifacts"
  ADD CONSTRAINT "document_version_artifact_created_by_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- El handle ya es único por snapshot; cada versión conserva su propio artefacto.
-- No hay unicidad de hash: duplicados se observan en el bloque documental y no se
-- fusionan, eliminan ni alteran antes de revisión humana.
ALTER TABLE "document_version_snapshots"
  ADD CONSTRAINT "document_version_snapshot_private_storage_handle_fkey"
  FOREIGN KEY ("private_storage_handle") REFERENCES "document_version_artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reutiliza la función append-only creada por la migración lifecycle anterior.
CREATE TRIGGER document_version_artifacts_append_only_tr
  BEFORE UPDATE OR DELETE ON "document_version_artifacts"
  FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
