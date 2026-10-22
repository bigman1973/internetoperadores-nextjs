-- CreateEnum
CREATE TYPE "FinanceSyncSourceP2" AS ENUM ('ONEDRIVE', 'ISP');

-- CreateEnum
CREATE TYPE "FinanceSyncTriggerP2" AS ENUM ('MANUAL', 'DAILY_UTC', 'LEGACY_BRIDGE');

-- CreateEnum
CREATE TYPE "FinanceSyncJobStatusP2" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FinanceSyncJobPhaseP2" AS ENUM ('INVENTORY', 'PROCESSING', 'FINALIZING');

-- CreateEnum
CREATE TYPE "FinanceSyncItemTypeP2" AS ENUM ('ONEDRIVE_FACTURA', 'ONEDRIVE_CONFIRMING_SOPORTE', 'ISP_FACTURA');

-- CreateEnum
CREATE TYPE "FinanceSyncItemStatusP2" AS ENUM ('QUEUED', 'PROCESSING', 'RETRY', 'COMPLETED', 'CANCELLED', 'FINAL_ERROR');

-- CreateEnum
CREATE TYPE "FinanceSyncOutcomeP2" AS ENUM ('NUEVA', 'ACTUALIZADA', 'SIN_CAMBIOS', 'REVISAR', 'ERROR');

-- CreateEnum
CREATE TYPE "FinanceSyncRequestKindP2" AS ENUM ('MANUAL', 'DAILY_UTC');

-- CreateEnum
CREATE TYPE "FinanceSyncReceiptResultP2" AS ENUM ('CREATED', 'REPLAY', 'COALESCED', 'ACTIVE_REJECTED', 'COLLISION');

-- CreateTable
CREATE TABLE "finance_sync_jobs_p2" (
    "id" UUID NOT NULL,
    "source" "FinanceSyncSourceP2" NOT NULL,
    "trigger" "FinanceSyncTriggerP2" NOT NULL,
    "status" "FinanceSyncJobStatusP2" NOT NULL DEFAULT 'QUEUED',
    "phase" "FinanceSyncJobPhaseP2" NOT NULL DEFAULT 'INVENTORY',
    "scope" JSONB NOT NULL DEFAULT '{}',
    "checkpoint" JSONB NOT NULL DEFAULT '{}',
    "inventory_complete_at" TIMESTAMP(3),
    "total" INTEGER,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "nuevas" INTEGER NOT NULL DEFAULT 0,
    "actualizadas" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "cancelled" INTEGER NOT NULL DEFAULT 0,
    "requested_by_id" INTEGER,
    "cancel_requested_at" TIMESTAMP(3),
    "cancel_requested_by_id" INTEGER,
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "recoveries" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(128),
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_sync_jobs_p2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_sync_items_p2" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "source_key" VARCHAR(512) NOT NULL,
    "type" "FinanceSyncItemTypeP2" NOT NULL,
    "source_data" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "FinanceSyncItemStatusP2" NOT NULL DEFAULT 'QUEUED',
    "outcome" "FinanceSyncOutcomeP2",
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retry_at" TIMESTAMP(3),
    "lease_token" TEXT,
    "lease_until" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "last_error" VARCHAR(128),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "finance_sync_items_p2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_sync_requests_p2" (
    "id" UUID NOT NULL,
    "source" "FinanceSyncSourceP2" NOT NULL,
    "kind" "FinanceSyncRequestKindP2" NOT NULL,
    "idempotency_key" VARCHAR(200) NOT NULL,
    "request_hash" VARCHAR(64) NOT NULL,
    "actor_id" INTEGER,
    "scope" JSONB NOT NULL DEFAULT '{}',
    "result" "FinanceSyncReceiptResultP2" NOT NULL,
    "job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_sync_requests_p2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_sync_daily_receipts_p2" (
    "id" UUID NOT NULL,
    "date_utc" VARCHAR(10) NOT NULL,
    "source" "FinanceSyncSourceP2" NOT NULL,
    "result" "FinanceSyncReceiptResultP2" NOT NULL,
    "job_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_sync_daily_receipts_p2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "finance_sync_jobs_p2_source_status_created_at_idx" ON "finance_sync_jobs_p2"("source", "status", "created_at");

-- CreateIndex
CREATE INDEX "finance_sync_jobs_p2_status_created_at_idx" ON "finance_sync_jobs_p2"("status", "created_at");

-- CreateIndex
CREATE INDEX "finance_sync_items_p2_job_id_status_retry_at_sequence_idx" ON "finance_sync_items_p2"("job_id", "status", "retry_at", "sequence");

-- CreateIndex
CREATE INDEX "finance_sync_items_p2_lease_until_idx" ON "finance_sync_items_p2"("lease_until");

-- CreateIndex
CREATE UNIQUE INDEX "finance_sync_items_p2_job_id_source_key_key" ON "finance_sync_items_p2"("job_id", "source_key");

-- CreateIndex
CREATE UNIQUE INDEX "finance_sync_items_p2_job_id_sequence_key" ON "finance_sync_items_p2"("job_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "finance_sync_requests_p2_idempotency_key_key" ON "finance_sync_requests_p2"("idempotency_key");

-- CreateIndex
CREATE INDEX "finance_sync_requests_p2_source_created_at_idx" ON "finance_sync_requests_p2"("source", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "finance_sync_daily_receipts_p2_date_utc_source_key" ON "finance_sync_daily_receipts_p2"("date_utc", "source");

-- AddForeignKey
ALTER TABLE "finance_sync_jobs_p2" ADD CONSTRAINT "finance_sync_jobs_p2_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "finance_sync_jobs_p2" ADD CONSTRAINT "finance_sync_jobs_p2_cancel_requested_by_id_fkey" FOREIGN KEY ("cancel_requested_by_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "finance_sync_items_p2" ADD CONSTRAINT "finance_sync_items_p2_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "finance_sync_jobs_p2"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "finance_sync_requests_p2" ADD CONSTRAINT "finance_sync_requests_p2_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "finance_sync_jobs_p2"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "finance_sync_daily_receipts_p2" ADD CONSTRAINT "finance_sync_daily_receipts_p2_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "finance_sync_jobs_p2"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- P2 additive migration companion. Generated table DDL must match schema.prisma.fragment.
-- No existing table/column/FK is altered, other than adding the documented inverse
-- Prisma relations (which do not create columns on UsuarioAdmin).

-- One active job per source, INCLUDING QUEUED. This prevents daily accumulation.
CREATE UNIQUE INDEX finance_sync_jobs_p2_one_active_source_uq
  ON finance_sync_jobs_p2 (source)
  WHERE status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED');

-- Ordered, fenced work acquisition; confirmed items can never be recovered.
CREATE INDEX finance_sync_items_p2_claimable_uq
  ON finance_sync_items_p2 (job_id, status, retry_at, sequence)
  WHERE confirmed_at IS NULL
    AND status IN ('QUEUED', 'RETRY');

CREATE INDEX finance_sync_items_p2_expired_processing_idx
  ON finance_sync_items_p2 (job_id, lease_until, sequence)
  WHERE confirmed_at IS NULL AND status = 'PROCESSING';

-- The production repository MUST claim in one transaction using this shape:
-- SELECT id FROM finance_sync_jobs_p2
-- WHERE (status='QUEUED' OR status='CANCEL_REQUESTED'
--        OR (status='RUNNING' AND lease_until < $1))
-- ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
--
-- Then fence with `lease_token` in all UPDATE predicates. Item claim also uses:
-- SELECT id FROM finance_sync_items_p2
-- WHERE job_id=$1 AND confirmed_at IS NULL
--   AND status IN ('QUEUED','RETRY') AND (retry_at IS NULL OR retry_at <= $2)
-- ORDER BY sequence FOR UPDATE SKIP LOCKED LIMIT 1;
--
-- Apply transaction must lock job + item and predicate both valid leases, token,
-- `cancel_requested_at IS NULL`, and `now() < deadline` BEFORE domain DML, then
-- update domain state and item outcome/confirmed_at atomically.

ALTER TABLE finance_sync_jobs_p2 ADD CONSTRAINT p2_nonnegative_counts CHECK (processed>=0 AND nuevas>=0 AND actualizadas>=0 AND errores>=0 AND unchanged>=0 AND cancelled>=0 AND recoveries>=0 AND (total IS NULL OR (total>=0 AND processed<=total)));
ALTER TABLE finance_sync_items_p2 ADD CONSTRAINT p2_nonnegative_attempts CHECK (attempts>=0 AND sequence>=0);
CREATE FUNCTION finance_sync_p2_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'P2_AUDIT_APPEND_ONLY'; END $$;
CREATE TRIGGER p2_request_append_only BEFORE UPDATE OR DELETE ON finance_sync_requests_p2 FOR EACH ROW EXECUTE FUNCTION finance_sync_p2_append_only();
CREATE TRIGGER p2_daily_append_only BEFORE UPDATE OR DELETE ON finance_sync_daily_receipts_p2 FOR EACH ROW EXECUTE FUNCTION finance_sync_p2_append_only();

-- Optional PostgreSQL guard functions invoked by the future Prisma/Postgres adapter.
-- They are append-only and contain no domain financial DML.

CREATE OR REPLACE FUNCTION finance_sync_p2_assert_apply_guard(
  p_job_id uuid,
  p_item_id uuid,
  p_token text,
  p_deadline timestamptz
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE j record; i record;
BEGIN
  SELECT * INTO j FROM finance_sync_jobs_p2 WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND OR j.status <> 'RUNNING' OR j.lease_token IS DISTINCT FROM p_token
     OR j.lease_until IS NULL OR j.lease_until <= clock_timestamp() OR j.cancel_requested_at IS NOT NULL
     OR clock_timestamp() >= p_deadline THEN
    RAISE EXCEPTION 'FINANCE_SYNC_P2_JOB_FENCE' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO i FROM finance_sync_items_p2 WHERE id=p_item_id AND job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR i.confirmed_at IS NOT NULL OR i.status <> 'PROCESSING'
     OR i.lease_token IS DISTINCT FROM p_token OR i.lease_until IS NULL OR i.lease_until <= clock_timestamp() THEN
    RAISE EXCEPTION 'FINANCE_SYNC_P2_ITEM_FENCE' USING ERRCODE='P0001';
  END IF;
END $$;

-- State repair after a dead lease: bounded and never for a confirmed item.
-- The caller binds the finite max attempt threshold and locks job first.
CREATE OR REPLACE FUNCTION finance_sync_p2_recover_expired_items(
  p_job_id uuid,
  p_now timestamptz,
  p_max_attempts int
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE finance_sync_items_p2
  SET status = CASE WHEN attempts >= p_max_attempts THEN 'FINAL_ERROR'::"FinanceSyncItemStatusP2"
                    ELSE 'RETRY'::"FinanceSyncItemStatusP2" END,
      outcome = CASE WHEN attempts >= p_max_attempts THEN 'ERROR'::"FinanceSyncOutcomeP2" ELSE outcome END,
      confirmed_at = CASE WHEN attempts >= p_max_attempts THEN p_now ELSE confirmed_at END,
      processed_at = CASE WHEN attempts >= p_max_attempts THEN p_now ELSE processed_at END,
      last_error = CASE WHEN attempts >= p_max_attempts THEN 'LEASE_RECOVERY_EXHAUSTED' ELSE last_error END,
      lease_token = NULL, lease_until = NULL,
      retry_at = CASE WHEN attempts >= p_max_attempts THEN NULL ELSE p_now END
  WHERE job_id=p_job_id AND confirmed_at IS NULL AND status='PROCESSING' AND lease_until < p_now;
END $$;
