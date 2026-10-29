-- Cierre 2026-10-29: almacén documental inmutable.
-- ADITIVA: sólo CREATE/ADD. No toca B4, movimientos, políticas automáticas,
-- atestaciones ni datos existentes. Aplicar únicamente el padre tras backup
-- verificado y revisión humana; este agente no ejecuta esta migración.

CREATE TYPE "DocumentVersionLifecycleState" AS ENUM ('ACTIVE', 'TOMBSTONED');
CREATE TYPE "DocumentVersionArtifactState" AS ENUM ('CAPTURED', 'UNAVAILABLE');
CREATE TYPE "DocumentVersionOriginalFormat" AS ENUM ('PDF', 'XLS', 'XLSX', 'OTHER');
CREATE TYPE "DocumentVersionIncidentState" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "DocumentVersionCreditLinkState" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

CREATE TABLE "document_version_lifecycle" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "source" VARCHAR(64) NOT NULL,
  "source_item_key" VARCHAR(4096) NOT NULL,
  "state" "DocumentVersionLifecycleState" NOT NULL DEFAULT 'ACTIVE',
  "current_version" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_lifecycle_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_lifecycle_current_version_ck" CHECK ("current_version" >= 0),
  CONSTRAINT "document_version_lifecycle_source_ck" CHECK (length(btrim("source")) BETWEEN 1 AND 64),
  CONSTRAINT "document_version_lifecycle_source_key_ck" CHECK (length(btrim("source_item_key")) BETWEEN 1 AND 4096)
);
CREATE UNIQUE INDEX "document_version_lifecycle_source_key_uq" ON "document_version_lifecycle"("source", "source_item_key");
CREATE INDEX "document_version_lifecycle_state_updated_idx" ON "document_version_lifecycle"("state", "updated_at");

CREATE TABLE "document_version_snapshots" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lifecycle_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "content_sha256" CHAR(64),
  "byte_length" INTEGER,
  "original_format" "DocumentVersionOriginalFormat",
  "artifact_state" "DocumentVersionArtifactState" NOT NULL,
  "private_storage_handle" UUID,
  "metadata_checksum" CHAR(64) NOT NULL,
  "quick_xor_hash" VARCHAR(1024),
  "c_tag" VARCHAR(1024),
  "e_tag" VARCHAR(1024),
  "graph_version" VARCHAR(1024),
  "original_file_name" VARCHAR(1024),
  "document_number" VARCHAR(512),
  "document_date" DATE,
  "total_cents" INTEGER,
  "invoice_fiscal_identity" VARCHAR(256),
  "party_role" VARCHAR(32),
  "document_class" VARCHAR(64),
  "referenced_original_reference" VARCHAR(512),
  "currency_code" CHAR(3),
  "upstream_version_ref" VARCHAR(1024),
  "number_fingerprint" CHAR(64),
  "amount_fingerprint" CHAR(64),
  "idempotency_key" CHAR(64) NOT NULL,
  "captured_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_snapshot_version_ck" CHECK ("version_number" >= 1),
  CONSTRAINT "document_version_snapshot_byte_length_ck" CHECK ("byte_length" IS NULL OR "byte_length" BETWEEN 0 AND 20971520),
  CONSTRAINT "document_version_snapshot_content_hash_ck" CHECK ("content_sha256" IS NULL OR "content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_snapshot_metadata_hash_ck" CHECK ("metadata_checksum" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_snapshot_number_hash_ck" CHECK ("number_fingerprint" IS NULL OR "number_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_snapshot_amount_hash_ck" CHECK ("amount_fingerprint" IS NULL OR "amount_fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_snapshot_artifact_matrix_ck" CHECK (
    ("artifact_state" = 'CAPTURED' AND "content_sha256" IS NOT NULL AND "byte_length" IS NOT NULL AND "private_storage_handle" IS NOT NULL)
    OR
    ("artifact_state" = 'UNAVAILABLE' AND "private_storage_handle" IS NULL)
  )
);
CREATE UNIQUE INDEX "document_version_snapshot_lifecycle_version_uq" ON "document_version_snapshots"("lifecycle_id", "version_number");
CREATE UNIQUE INDEX "document_version_snapshot_storage_handle_uq" ON "document_version_snapshots"("private_storage_handle") WHERE "private_storage_handle" IS NOT NULL;
CREATE UNIQUE INDEX "document_version_snapshot_idempotency_uq" ON "document_version_snapshots"("idempotency_key");
CREATE INDEX "document_version_snapshot_lifecycle_captured_idx" ON "document_version_snapshots"("lifecycle_id", "captured_at");
CREATE INDEX "document_version_snapshot_content_hash_idx" ON "document_version_snapshots"("content_sha256");

CREATE TABLE "document_version_incidents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lifecycle_id" UUID NOT NULL,
  "previous_version" INTEGER NOT NULL,
  "new_version" INTEGER NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "color" VARCHAR(16) NOT NULL,
  "reasons" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "state" "DocumentVersionIncidentState" NOT NULL DEFAULT 'OPEN',
  "reported_by_id" INTEGER,
  "resolved_by_id" INTEGER,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_incident_versions_ck" CHECK ("previous_version" >= 1 AND "new_version" = "previous_version" + 1),
  CONSTRAINT "document_version_incident_color_ck" CHECK ("color" = 'AMBAR'),
  CONSTRAINT "document_version_incident_resolution_ck" CHECK (("state" = 'OPEN' AND "resolved_by_id" IS NULL AND "resolved_at" IS NULL) OR ("state" = 'RESOLVED' AND "resolved_by_id" IS NOT NULL AND "resolved_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "document_version_incident_change_uq" ON "document_version_incidents"("lifecycle_id", "previous_version", "new_version", "code");
CREATE INDEX "document_version_incident_state_created_idx" ON "document_version_incidents"("state", "created_at");

CREATE TABLE "document_version_tombstones" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lifecycle_id" UUID NOT NULL,
  "evidence_kind" VARCHAR(64) NOT NULL,
  "evidence_hash" CHAR(64) NOT NULL,
  "idempotency_key" CHAR(64) NOT NULL,
  "reported_by_id" INTEGER,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_tombstones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_tombstone_kind_ck" CHECK ("evidence_kind" IN ('GRAPH_DELTA_TOMBSTONE','COMPLETE_INVENTORY_ABSENCE')),
  CONSTRAINT "document_version_tombstone_evidence_hash_ck" CHECK ("evidence_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "document_version_tombstone_idempotency_uq" ON "document_version_tombstones"("idempotency_key");
CREATE UNIQUE INDEX "document_version_tombstone_evidence_uq" ON "document_version_tombstones"("lifecycle_id", "evidence_hash");
CREATE INDEX "document_version_tombstone_lifecycle_created_idx" ON "document_version_tombstones"("lifecycle_id", "created_at");

CREATE TABLE "document_version_credit_links" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "credit_lifecycle_id" UUID NOT NULL,
  "original_lifecycle_id" UUID NOT NULL,
  "exact_reference" VARCHAR(512) NOT NULL,
  "exact_reference_hash" CHAR(64) NOT NULL,
  "state" "DocumentVersionCreditLinkState" NOT NULL DEFAULT 'PROPOSED',
  "idempotency_key" CHAR(64) NOT NULL,
  "proposed_by_id" INTEGER,
  "confirmed_by_id" INTEGER,
  "confirmed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_credit_link_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_credit_link_distinct_ck" CHECK ("credit_lifecycle_id" <> "original_lifecycle_id"),
  CONSTRAINT "document_version_credit_link_reference_hash_ck" CHECK ("exact_reference_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_credit_link_confirmation_ck" CHECK (("state" = 'PROPOSED' AND "confirmed_by_id" IS NULL AND "confirmed_at" IS NULL) OR ("state" IN ('CONFIRMED','REJECTED') AND "confirmed_by_id" IS NOT NULL AND "confirmed_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "document_version_credit_link_idempotency_uq" ON "document_version_credit_links"("idempotency_key");
CREATE UNIQUE INDEX "document_version_credit_link_reference_uq" ON "document_version_credit_links"("credit_lifecycle_id", "original_lifecycle_id", "exact_reference_hash");
CREATE INDEX "document_version_credit_link_state_created_idx" ON "document_version_credit_links"("state", "created_at");

CREATE TABLE "document_version_hash_duplicates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "left_snapshot_id" UUID NOT NULL,
  "right_snapshot_id" UUID NOT NULL,
  "content_sha256" CHAR(64) NOT NULL,
  "idempotency_key" CHAR(64) NOT NULL,
  "reported_by_id" INTEGER,
  "resolved_by_id" INTEGER,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_hash_duplicates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_hash_duplicate_distinct_ck" CHECK ("left_snapshot_id" <> "right_snapshot_id"),
  CONSTRAINT "document_version_hash_duplicate_content_hash_ck" CHECK ("content_sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "document_version_hash_duplicate_resolution_ck" CHECK (("resolved_by_id" IS NULL AND "resolved_at" IS NULL) OR ("resolved_by_id" IS NOT NULL AND "resolved_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "document_version_hash_duplicate_idempotency_uq" ON "document_version_hash_duplicates"("idempotency_key");
CREATE UNIQUE INDEX "document_version_hash_duplicate_pair_uq" ON "document_version_hash_duplicates"("left_snapshot_id", "right_snapshot_id");
CREATE INDEX "document_version_hash_duplicate_content_created_idx" ON "document_version_hash_duplicates"("content_sha256", "created_at");

ALTER TABLE "document_version_snapshots" ADD CONSTRAINT "document_version_snapshot_lifecycle_fkey" FOREIGN KEY ("lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_incidents" ADD CONSTRAINT "document_version_incident_lifecycle_fkey" FOREIGN KEY ("lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_incidents" ADD CONSTRAINT "document_version_incident_reported_by_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_incidents" ADD CONSTRAINT "document_version_incident_resolved_by_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_tombstones" ADD CONSTRAINT "document_version_tombstone_lifecycle_fkey" FOREIGN KEY ("lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_tombstones" ADD CONSTRAINT "document_version_tombstone_reported_by_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_credit_links" ADD CONSTRAINT "document_version_credit_link_credit_fkey" FOREIGN KEY ("credit_lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_credit_links" ADD CONSTRAINT "document_version_credit_link_original_fkey" FOREIGN KEY ("original_lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_credit_links" ADD CONSTRAINT "document_version_credit_link_proposed_by_fkey" FOREIGN KEY ("proposed_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_credit_links" ADD CONSTRAINT "document_version_credit_link_confirmed_by_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_hash_duplicates" ADD CONSTRAINT "document_version_duplicate_left_fkey" FOREIGN KEY ("left_snapshot_id") REFERENCES "document_version_snapshots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_hash_duplicates" ADD CONSTRAINT "document_version_duplicate_right_fkey" FOREIGN KEY ("right_snapshot_id") REFERENCES "document_version_snapshots"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_hash_duplicates" ADD CONSTRAINT "document_version_duplicate_reported_by_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_hash_duplicates" ADD CONSTRAINT "document_version_duplicate_resolved_by_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Todas las evidencias de este bloque son append-only. Cualquier resolución se
-- guarda mediante un nuevo registro humano en su dominio, no modificando historia.
CREATE FUNCTION document_version_lifecycle_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'DOCUMENT_VERSION_LIFECYCLE_APPEND_ONLY' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER document_version_snapshots_append_only_tr BEFORE UPDATE OR DELETE ON "document_version_snapshots" FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
CREATE TRIGGER document_version_tombstones_append_only_tr BEFORE UPDATE OR DELETE ON "document_version_tombstones" FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
CREATE TRIGGER document_version_credit_links_append_only_tr BEFORE UPDATE OR DELETE ON "document_version_credit_links" FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
CREATE TRIGGER document_version_hash_duplicates_append_only_tr BEFORE UPDATE OR DELETE ON "document_version_hash_duplicates" FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
