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
