-- Area 3 — huellas SHA-256 de bytes de documentos recibidos ya existentes.
--
-- ADITIVA: no contiene DML ni modifica facturas_recibidas, B4, estados, importes,
-- archivos, snapshots o artifacts. Esta tabla es independiente de
-- document_version_snapshots/document_version_hash_duplicates: los snapshots de
-- metadatos UNAVAILABLE permanecen inmutables y fuera de este proceso.
--
-- Aplicar sólo tras backup y revisión humana en io_staging_finanzas. Esta
-- migración no descarga Graph ni contiene URL, bytes, nombres, números de
-- factura, eTags/cTags, OCR o importes.

CREATE TABLE "area3_received_document_hashes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "factura_recibida_id" TEXT NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "byte_length" INTEGER NOT NULL,
  "source_kind" VARCHAR(48) NOT NULL,
  "source_observation" VARCHAR(128) NOT NULL,
  "source_item_id" VARCHAR(220) NOT NULL,
  "source_drive_id" VARCHAR(220),
  "source_updated_at" TIMESTAMPTZ,
  "source_read_at" TIMESTAMPTZ NOT NULL,
  "source_version_fingerprint" CHAR(64) NOT NULL,
  "idempotency_key" CHAR(64) NOT NULL,
  "observed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area3_received_document_hashes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area3_received_document_hashes_content_sha256_ck"
    CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "area3_received_document_hashes_byte_length_ck"
    CHECK ("byte_length" BETWEEN 1 AND 20971520),
  CONSTRAINT "area3_received_document_hashes_source_kind_ck"
    CHECK ("source_kind" IN ('LOCAL_VERIFIED_MANIFEST', 'PREVIEW_EXISTING_FILE_MANIFEST')),
  CONSTRAINT "area3_received_document_hashes_source_observation_ck"
    CHECK (length(btrim("source_observation")) BETWEEN 1 AND 128),
  CONSTRAINT "area3_received_document_hashes_source_item_ck"
    CHECK (length(btrim("source_item_id")) BETWEEN 1 AND 220),
  CONSTRAINT "area3_received_document_hashes_source_drive_ck"
    CHECK ("source_drive_id" IS NULL OR length(btrim("source_drive_id")) BETWEEN 1 AND 220),
  CONSTRAINT "area3_received_document_hashes_source_version_ck"
    CHECK ("source_version_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "area3_received_document_hashes_idempotency_ck"
    CHECK ("idempotency_key" ~ '^[0-9a-f]{64}$')
);

ALTER TABLE "area3_received_document_hashes"
  ADD CONSTRAINT "area3_received_document_hashes_factura_recibida_fkey"
  FOREIGN KEY ("factura_recibida_id") REFERENCES "facturas_recibidas"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A replay of the same byte/source observation is append-idempotent; a later
-- verified source version remains a distinct observation and is never updated.
CREATE UNIQUE INDEX "area3_received_document_hashes_idempotency_uq"
  ON "area3_received_document_hashes"("idempotency_key");
CREATE UNIQUE INDEX "area3_received_document_hashes_factura_hash_source_uq"
  ON "area3_received_document_hashes"("factura_recibida_id", "content_sha256", "source_kind", "source_version_fingerprint");
CREATE INDEX "area3_received_document_hashes_hash_observed_idx"
  ON "area3_received_document_hashes"("content_sha256", "observed_at", "id");
CREATE INDEX "area3_received_document_hashes_factura_observed_idx"
  ON "area3_received_document_hashes"("factura_recibida_id", "observed_at", "id");

CREATE FUNCTION area3_received_document_hashes_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AREA3_RECEIVED_DOCUMENT_HASHES_APPEND_ONLY' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER area3_received_document_hashes_append_only_row_tr
  BEFORE UPDATE OR DELETE ON "area3_received_document_hashes"
  FOR EACH ROW EXECUTE FUNCTION area3_received_document_hashes_append_only();
CREATE TRIGGER area3_received_document_hashes_append_only_truncate_tr
  BEFORE TRUNCATE ON "area3_received_document_hashes"
  FOR EACH STATEMENT EXECUTE FUNCTION area3_received_document_hashes_append_only();
