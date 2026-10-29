-- Cierre 2026-10-29: despacho durable de cambios Graph Delta hacia P2.
-- ADITIVA; no se aplica desde este cambio. Requiere 20261022_p2_durable_finance_sync
-- y 20261029_graph_delta_lifecycle. No toca B4, movimientos, facturas, OCR,
-- permisos, cursores existentes ni archivos privados.

-- La topología privada conserva sólo metadata Graph necesaria para volver a formar
-- el ítem P2 ya existente. No hay URLs, tokens, bytes ni OCR en estas columnas.
ALTER TABLE "finance_graph_delta_topology"
  ADD COLUMN "file_size" BIGINT,
  ADD COLUMN "e_tag" VARCHAR(1024),
  ADD COLUMN "c_tag" VARCHAR(1024),
  ADD COLUMN "quick_xor_hash" VARCHAR(1024),
  ADD COLUMN "mime_type" VARCHAR(256),
  ADD COLUMN "last_modified_at" VARCHAR(128);

ALTER TABLE "finance_graph_delta_topology"
  ADD CONSTRAINT "finance_graph_delta_topology_file_size_ck"
  CHECK ("file_size" IS NULL OR "file_size" >= 0);

-- Un evento Delta se asigna al job P2 en la misma transacción que sus ítems y
-- checkpoint. acknowledged_at sólo se escribe al confirmar el ítem en la misma
-- transacción de apply. Si el job termina cancelado/fallido antes, otro job puede
-- reasignar el evento no reconocido; nunca se borra el recibo/evento Delta.
CREATE TABLE "finance_graph_delta_dispatches" (
  "source_key" VARCHAR(256) NOT NULL,
  "drive_id" VARCHAR(512) NOT NULL,
  "event_key" CHAR(64) NOT NULL,
  "job_id" UUID NOT NULL,
  "item_source_key" VARCHAR(512),
  "dispatched_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledged_at" TIMESTAMPTZ,
  CONSTRAINT "finance_graph_delta_dispatches_pkey"
    PRIMARY KEY ("source_key", "drive_id", "event_key"),
  CONSTRAINT "finance_graph_delta_dispatches_item_key_ck"
    CHECK ("item_source_key" IS NULL OR length(btrim("item_source_key")) BETWEEN 1 AND 512)
);

CREATE INDEX "finance_graph_delta_dispatches_job_item_idx"
  ON "finance_graph_delta_dispatches"("job_id", "item_source_key")
  WHERE "acknowledged_at" IS NULL;

CREATE INDEX "finance_graph_delta_dispatches_pending_idx"
  ON "finance_graph_delta_dispatches"("source_key", "drive_id", "acknowledged_at");

ALTER TABLE "finance_graph_delta_dispatches"
  ADD CONSTRAINT "finance_graph_delta_dispatches_job_fkey"
  FOREIGN KEY ("job_id") REFERENCES "finance_sync_jobs_p2"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
