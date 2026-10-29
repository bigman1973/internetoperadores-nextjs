-- Cierre 2026-10-29: decisiones humanas append-only para enlaces rectificativos.
-- ADITIVA. No modifica document_version_credit_links, facturas, B4, nominales ni
-- estados bancarios. El estado efectivo se proyecta desde este ledger; aplicar
-- únicamente tras revisión humana y backup verificado. Esta tarea no la ejecuta.

CREATE TYPE "DocumentVersionCreditLinkDecisionAction" AS ENUM ('CONFIRM', 'REJECT', 'UNDO');
CREATE TYPE "DocumentVersionCreditLinkEffectiveState" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED');

CREATE TABLE "document_version_credit_link_decisions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  -- Orden global asignado por PostgreSQL: no depende de created_at ni de UUID.
  "decision_sequence" BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL,
  "credit_link_id" UUID NOT NULL,
  "action" "DocumentVersionCreditLinkDecisionAction" NOT NULL,
  "effective_state" "DocumentVersionCreditLinkEffectiveState" NOT NULL,
  "reason" VARCHAR(500),
  "actor_real_id" INTEGER NOT NULL,
  "actor_effective_id" INTEGER NOT NULL,
  "idempotency_key" CHAR(64) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "document_version_credit_link_decisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_version_credit_link_decision_action_state_ck" CHECK (
    ("action" = 'CONFIRM' AND "effective_state" = 'CONFIRMED')
    OR ("action" = 'REJECT' AND "effective_state" = 'REJECTED')
    OR ("action" = 'UNDO' AND "effective_state" = 'PROPOSED')
  ),
  CONSTRAINT "document_version_credit_link_decision_reason_ck" CHECK (
    ("action" = 'CONFIRM' AND "reason" IS NULL)
    OR ("action" IN ('REJECT','UNDO') AND length(btrim("reason")) BETWEEN 3 AND 500)
  ),
  CONSTRAINT "document_version_credit_link_decision_idempotency_ck" CHECK ("idempotency_key" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "document_version_credit_link_decision_payload_hash_ck" CHECK ("payload_hash" ~ '^[a-f0-9]{64}$')
);
CREATE UNIQUE INDEX "document_version_credit_link_decisions_sequence_uq"
  ON "document_version_credit_link_decisions"("decision_sequence");
CREATE UNIQUE INDEX "document_version_credit_link_decisions_actor_idempotency_uq"
  ON "document_version_credit_link_decisions"("actor_real_id", "idempotency_key");
CREATE INDEX "document_version_credit_link_decisions_link_sequence_idx"
  ON "document_version_credit_link_decisions"("credit_link_id", "decision_sequence" DESC);
CREATE INDEX "document_version_credit_link_decisions_effective_created_idx"
  ON "document_version_credit_link_decisions"("effective_state", "created_at" DESC);
ALTER TABLE "document_version_credit_link_decisions"
  ADD CONSTRAINT "document_version_credit_link_decision_link_fkey"
  FOREIGN KEY ("credit_link_id") REFERENCES "document_version_credit_links"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_credit_link_decisions"
  ADD CONSTRAINT "document_version_credit_link_decision_actor_real_fkey"
  FOREIGN KEY ("actor_real_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "document_version_credit_link_decisions"
  ADD CONSTRAINT "document_version_credit_link_decision_actor_effective_fkey"
  FOREIGN KEY ("actor_effective_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Reuse the lifecycle append-only guard created by 20261029_document_version_lifecycle.
CREATE TRIGGER "document_version_credit_link_decisions_append_only_tr"
  BEFORE UPDATE OR DELETE ON "document_version_credit_link_decisions"
  FOR EACH ROW EXECUTE FUNCTION document_version_lifecycle_append_only();
