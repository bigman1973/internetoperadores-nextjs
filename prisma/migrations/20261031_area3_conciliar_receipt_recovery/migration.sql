-- Area 3 only. Local additive DDL for exact Conciliar receipt recovery.
-- Do not apply from an application process and do not run against staging/production
-- without the parent-owned backup, SQL rehearsal and deployment review.

CREATE TABLE "area3_conciliar_recovery_intents" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_effective_id" integer NOT NULL REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "actor_real_id" integer NOT NULL REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "acting_session_id" uuid NULL REFERENCES "impersonation_sessions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "idempotency_key" uuid NOT NULL,
  "action" text NOT NULL CHECK ("action" IN ('CONFIRMAR','DESHACER')),
  "canonical_command" jsonb NOT NULL CHECK (jsonb_typeof("canonical_command")='object'),
  "command_hash" text NOT NULL CHECK ("command_hash" ~ '^[a-f0-9]{64}$'),
  "body_hash" text NOT NULL CHECK ("body_hash" ~ '^[a-f0-9]{64}$'),
  "request_hash" text NOT NULL CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
  "selection_count" integer NOT NULL CHECK ("selection_count" >= 1 AND "selection_count" <= 100),
  "selection_hash" text NOT NULL CHECK ("selection_hash" ~ '^[a-f0-9]{64}$'),
  -- For DESHACER it records the caller-declared original confirmation before
  -- business validation. It intentionally has no FK while PENDING, because an
  -- absent target is a business failure that must not turn PENDING into a lie.
  "target_confirmation_operation_id" uuid NULL,
  "resolution" text NOT NULL DEFAULT 'PENDING' CHECK ("resolution" IN ('PENDING','COMMITTED')),
  "receipt_operation_id" uuid NULL REFERENCES "operaciones_conciliar"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "leg_count" integer NULL CHECK ("leg_count" >= 0 AND "leg_count" <= 100),
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "committed_at" timestamptz NULL,
  CONSTRAINT "area3_conciliar_recovery_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area3_conciliar_recovery_actor_key_uk" UNIQUE ("actor_effective_id","idempotency_key"),
  CONSTRAINT "area3_conciliar_recovery_state_ck" CHECK (
    ("resolution"='PENDING' AND "receipt_operation_id" IS NULL AND "leg_count" IS NULL AND "committed_at" IS NULL)
    OR
    ("resolution"='COMMITTED' AND "receipt_operation_id" IS NOT NULL AND "leg_count" IS NOT NULL AND "committed_at" IS NOT NULL
      AND (("action"='CONFIRMAR' AND "target_confirmation_operation_id" IS NULL)
        OR ("action"='DESHACER' AND "target_confirmation_operation_id" IS NOT NULL)))
  )
);

CREATE INDEX "area3_conciliar_recovery_receipt_idx"
  ON "area3_conciliar_recovery_intents" ("receipt_operation_id")
  WHERE "receipt_operation_id" IS NOT NULL;
CREATE INDEX "area3_conciliar_recovery_pending_idx"
  ON "area3_conciliar_recovery_intents" ("created_at")
  WHERE "resolution"='PENDING';

-- The protocol is append-only except for exactly one PENDING→COMMITTED
-- publication. This migration deliberately has no NOT_COMMITTED state: an
-- ambiguous rollback is represented honestly as PENDING, never as absence.
CREATE FUNCTION area3_conciliar_recovery_intent_transition_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'AREA3_CONCILIAR_RECOVERY_INTENT_APPEND_ONLY' USING ERRCODE='55000';
  END IF;
  IF OLD.actor_effective_id IS DISTINCT FROM NEW.actor_effective_id
     OR OLD.actor_real_id IS DISTINCT FROM NEW.actor_real_id
     OR OLD.acting_session_id IS DISTINCT FROM NEW.acting_session_id
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key
     OR OLD.action IS DISTINCT FROM NEW.action
     OR OLD.canonical_command IS DISTINCT FROM NEW.canonical_command
     OR OLD.command_hash IS DISTINCT FROM NEW.command_hash
     OR OLD.body_hash IS DISTINCT FROM NEW.body_hash
     OR OLD.request_hash IS DISTINCT FROM NEW.request_hash
     OR OLD.selection_count IS DISTINCT FROM NEW.selection_count
     OR OLD.selection_hash IS DISTINCT FROM NEW.selection_hash
     OR OLD.target_confirmation_operation_id IS DISTINCT FROM NEW.target_confirmation_operation_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'AREA3_CONCILIAR_RECOVERY_INTENT_IMMUTABLE' USING ERRCODE='55000';
  END IF;
  IF OLD.resolution <> 'PENDING' OR NEW.resolution <> 'COMMITTED' THEN
    RAISE EXCEPTION 'AREA3_CONCILIAR_RECOVERY_INTENT_TRANSITION_INVALID' USING ERRCODE='55000';
  END IF;
  IF NEW.receipt_operation_id IS NULL OR NEW.leg_count IS NULL OR NEW.committed_at IS NULL
     OR (NEW.action='CONFIRMAR' AND NEW.target_confirmation_operation_id IS NOT NULL)
     OR (NEW.action='DESHACER' AND NEW.target_confirmation_operation_id IS NULL) THEN
    RAISE EXCEPTION 'AREA3_CONCILIAR_RECOVERY_INTENT_COMMIT_INVALID' USING ERRCODE='23514';
  END IF;
  IF NEW.action='DESHACER' AND NOT EXISTS (
    SELECT 1 FROM "operaciones_conciliar" original
    WHERE original.id=NEW.target_confirmation_operation_id
      AND original.actor_id=NEW.actor_effective_id
      AND original.accion='CONFIRMAR'::"AccionOperacionConciliar"
  ) THEN
    RAISE EXCEPTION 'AREA3_CONCILIAR_RECOVERY_INTENT_TARGET_INVALID' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "area3_conciliar_recovery_intent_transition_tr"
BEFORE UPDATE OR DELETE ON "area3_conciliar_recovery_intents"
FOR EACH ROW EXECUTE FUNCTION area3_conciliar_recovery_intent_transition_guard();

CREATE FUNCTION area3_conciliar_recovery_intent_no_truncate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'AREA3_CONCILIAR_RECOVERY_INTENT_APPEND_ONLY' USING ERRCODE='55000';
END
$$;

CREATE TRIGGER "area3_conciliar_recovery_intent_no_truncate_tr"
BEFORE TRUNCATE ON "area3_conciliar_recovery_intents"
FOR EACH STATEMENT EXECUTE FUNCTION area3_conciliar_recovery_intent_no_truncate();
