-- Cierre 2026-10-29: cursor Delta de OneDrive y evidencia de borrado.
-- ADITIVA: requiere document_version_lifecycle y document_version_zarchive.
-- No se aplica desde este cambio. No toca B4, movimientos, facturas, OCR,
-- autorizaciones ni datos existentes. Las URLs cursor y la topología son privadas.

CREATE TABLE "finance_graph_delta_cursors" (
  "source_key" VARCHAR(256) NOT NULL,
  "drive_id" VARCHAR(512) NOT NULL,
  "delta_link" TEXT,
  "pending_kind" VARCHAR(16),
  "pending_continuation_link" TEXT,
  "inventory_session_id" UUID,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_graph_delta_cursors_pkey" PRIMARY KEY ("source_key", "drive_id"),
  CONSTRAINT "finance_graph_delta_cursor_source_ck" CHECK (length(btrim("source_key")) BETWEEN 1 AND 256),
  CONSTRAINT "finance_graph_delta_cursor_drive_ck" CHECK (length(btrim("drive_id")) BETWEEN 1 AND 512),
  CONSTRAINT "finance_graph_delta_cursor_pending_ck" CHECK (
    ("pending_kind" IS NULL AND "pending_continuation_link" IS NULL AND "inventory_session_id" IS NULL)
    OR
    ("pending_kind" = 'DELTA' AND "pending_continuation_link" IS NOT NULL AND "inventory_session_id" IS NULL)
    OR
    ("pending_kind" = 'INVENTORY' AND "inventory_session_id" IS NOT NULL)
  )
);

CREATE TABLE "finance_graph_delta_inventory_sessions" (
  "id" UUID NOT NULL,
  "source_key" VARCHAR(256) NOT NULL,
  "drive_id" VARCHAR(512) NOT NULL,
  "reason" VARCHAR(32) NOT NULL,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  CONSTRAINT "finance_graph_delta_inventory_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_graph_delta_inventory_reason_ck" CHECK ("reason" IN ('INITIAL', 'EXPIRED_OR_CONFLICT'))
);
CREATE INDEX "finance_graph_delta_inventory_scope_started_idx"
  ON "finance_graph_delta_inventory_sessions"("source_key", "drive_id", "started_at");

-- Private topology only. It is never selected by UI/API/audit code. A source item
-- remains identified by the actual driveId:itemId pair in document_version_lifecycle.
CREATE TABLE "finance_graph_delta_topology" (
  "source_key" VARCHAR(256) NOT NULL,
  "drive_id" VARCHAR(512) NOT NULL,
  "item_id" VARCHAR(512) NOT NULL,
  "parent_item_id" VARCHAR(512),
  "item_name" VARCHAR(512),
  "is_folder" BOOLEAN NOT NULL DEFAULT FALSE,
  "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE,
  "canonical_path" TEXT,
  "in_registered_scope" BOOLEAN NOT NULL DEFAULT FALSE,
  "needs_location_review" BOOLEAN NOT NULL DEFAULT FALSE,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_graph_delta_topology_pkey" PRIMARY KEY ("source_key", "drive_id", "item_id"),
  CONSTRAINT "finance_graph_delta_topology_item_ck" CHECK (length(btrim("item_id")) BETWEEN 1 AND 512)
);
CREATE INDEX "finance_graph_delta_topology_parent_idx"
  ON "finance_graph_delta_topology"("source_key", "drive_id", "parent_item_id");
CREATE INDEX "finance_graph_delta_topology_scope_idx"
  ON "finance_graph_delta_topology"("source_key", "drive_id", "in_registered_scope")
  WHERE "is_deleted" = FALSE;

-- Receipts and event identities contain only opaque Graph hashes/identifiers in a
-- private store. They are never copied into the financial audit or browser payload.
CREATE TABLE "finance_graph_delta_pages" (
  "source_key" VARCHAR(256) NOT NULL,
  "drive_id" VARCHAR(512) NOT NULL,
  "page_key" CHAR(64) NOT NULL,
  "mode" VARCHAR(16) NOT NULL,
  "inventory_session_id" UUID,
  "committed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_graph_delta_pages_pkey" PRIMARY KEY ("source_key", "drive_id", "page_key"),
  CONSTRAINT "finance_graph_delta_pages_mode_ck" CHECK ("mode" IN ('DELTA', 'INVENTORY'))
);

CREATE TABLE "finance_graph_delta_events" (
  "source_key" VARCHAR(256) NOT NULL,
  "drive_id" VARCHAR(512) NOT NULL,
  "event_key" CHAR(64) NOT NULL,
  "page_key" CHAR(64) NOT NULL,
  "item_id" VARCHAR(512) NOT NULL,
  "kind" VARCHAR(16) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "committed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "finance_graph_delta_events_pkey" PRIMARY KEY ("source_key", "drive_id", "event_key"),
  CONSTRAINT "finance_graph_delta_event_kind_ck" CHECK ("kind" IN ('UPSERT', 'TOMBSTONE')),
  CONSTRAINT "finance_graph_delta_event_sequence_ck" CHECK ("sequence" >= 0)
);
CREATE INDEX "finance_graph_delta_events_page_idx"
  ON "finance_graph_delta_events"("source_key", "drive_id", "page_key", "sequence");

-- document_version_incidents cannot model a deletion because its version check
-- requires new_version = previous_version + 1. Deletion evidence is therefore
-- append-only in a dedicated table and never reactivates or changes B4.
CREATE TABLE "document_version_deletion_incidents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lifecycle_id" UUID NOT NULL,
  "tombstone_idempotency_key" CHAR(64) NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "color" VARCHAR(16) NOT NULL,
  "message" VARCHAR(256) NOT NULL,
  "preserved_snapshot_version" INTEGER NOT NULL,
  "reported_by_id" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_deletion_incidents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_deletion_incident_code_ck" CHECK ("code" = 'AMBAR_DOCUMENTO_BORRADO'),
  CONSTRAINT "document_version_deletion_incident_color_ck" CHECK ("color" = 'AMBAR'),
  CONSTRAINT "document_version_deletion_incident_version_ck" CHECK ("preserved_snapshot_version" >= 1)
);
CREATE UNIQUE INDEX "document_version_deletion_incident_tombstone_uq"
  ON "document_version_deletion_incidents"("lifecycle_id", "tombstone_idempotency_key");
CREATE INDEX "document_version_deletion_incident_created_idx"
  ON "document_version_deletion_incidents"("created_at");

CREATE TABLE "document_version_deletion_audit" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lifecycle_id" UUID NOT NULL,
  "tombstone_idempotency_key" CHAR(64) NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_deletion_audit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_deletion_audit_action_ck" CHECK ("action" = 'DOCUMENT_TOMBSTONED')
);
CREATE UNIQUE INDEX "document_version_deletion_audit_once_uq"
  ON "document_version_deletion_audit"("lifecycle_id", "tombstone_idempotency_key", "action");

ALTER TABLE "document_version_deletion_incidents"
  ADD CONSTRAINT "document_version_deletion_incident_lifecycle_fkey"
  FOREIGN KEY ("lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_deletion_incidents"
  ADD CONSTRAINT "document_version_deletion_incident_reported_by_fkey"
  FOREIGN KEY ("reported_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_deletion_audit"
  ADD CONSTRAINT "document_version_deletion_audit_lifecycle_fkey"
  FOREIGN KEY ("lifecycle_id") REFERENCES "document_version_lifecycle"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_deletion_audit"
  ADD CONSTRAINT "document_version_deletion_audit_actor_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reuse the append-only guard introduced by 20261029_document_version_lifecycle.
CREATE TRIGGER document_version_deletion_incidents_append_only_tr
  BEFORE UPDATE OR DELETE ON "document_version_deletion_incidents"
  FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
CREATE TRIGGER document_version_deletion_audit_append_only_tr
  BEFORE UPDATE OR DELETE ON "document_version_deletion_audit"
  FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
