-- ISP sync only. Nullable metadata; existing jobs remain readable.
ALTER TABLE "finance_sync_jobs_p2" ADD COLUMN "last_error_detail" JSONB;
ALTER TABLE "finance_sync_items_p2" ADD COLUMN "last_error_detail" JSONB;
ALTER TABLE "finance_sync_items_p2" ADD COLUMN "applied_source_hash" VARCHAR(64);
ALTER TABLE "finance_sync_items_p2" ADD CONSTRAINT "area3_isp_applied_source_hash_ck"
  CHECK (applied_source_hash IS NULL OR (applied_source_hash ~ '^[0-9a-f]{64}$'
    AND confirmed_at IS NOT NULL AND outcome IS NOT NULL AND outcome IN ('NUEVA','ACTUALIZADA','SIN_CAMBIOS')));
CREATE INDEX "area3_isp_source_last_result_idx"
  ON "finance_sync_items_p2" (source_key, created_at DESC, sequence DESC);
