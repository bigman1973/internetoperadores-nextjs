-- Release productivo dedicado 20261024 «Actuar como»: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: prisma/migrations/20261024_impersonation_ledger/migration.sql SHA-256 146cccfa21b608c37b89f653b8bace71e8e3b7138003fa4e43bb67d9dcae1e08.
-- Preflight de creación obligatorio, habilitado sólo por el aplicador transaccional.
DO $$
BEGIN
  IF current_setting('io.impersonation_production_ddl', true) = '1' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'IMPERSONATION_PRODUCTION_DDL_GUARD_REQUIRED' USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Actuar como — release ADITIVO de producción. NO EJECUTAR AUTOMÁTICAMENTE.
-- Exclusiva de railway/postgres. No contiene DML,
-- backfill, reset, usuarios de prueba, credenciales, cambios de fuentes ni de
-- tablas/políticas legacy financieras. Sesiones, fines y eventos son recibos
-- append-only; una salida/revocación/caducidad inserta un fin, no actualiza.

DO $$
BEGIN
  IF current_database() <> 'railway' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'IMPERSONATION_PRODUCTION_ONLY';
  END IF;
END $$;

CREATE TABLE impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  source_session_hash CHAR(64) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  reason VARCHAR(500),
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT impersonation_sessions_actor_target_ck CHECK (actor_id > 0 AND target_id > 0 AND actor_id <> target_id),
  CONSTRAINT impersonation_sessions_actor_fk FOREIGN KEY (actor_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_sessions_target_fk FOREIGN KEY (target_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_sessions_source_hash_ck CHECK (source_session_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT impersonation_sessions_idempotency_ck CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT impersonation_sessions_reason_ck CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT impersonation_sessions_absolute_expiry_ck CHECK (expires_at > started_at AND expires_at <= started_at + INTERVAL '60 minutes')
);

CREATE TABLE impersonation_session_ends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE,
  end_reason VARCHAR(16) NOT NULL,
  ended_by_id INTEGER,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT impersonation_session_ends_reason_ck CHECK (end_reason IN ('EXITED','EXPIRED','REVOKED','SIGN_OUT','LOGIN')),
  CONSTRAINT impersonation_session_ends_actor_ck CHECK (ended_by_id IS NULL OR ended_by_id > 0),
  CONSTRAINT impersonation_session_ends_session_fk FOREIGN KEY (session_id) REFERENCES impersonation_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_session_ends_ended_by_fk FOREIGN KEY (ended_by_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT
);

CREATE TABLE impersonation_event_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  actor_id INTEGER,
  target_id INTEGER,
  kind VARCHAR(80) NOT NULL,
  outcome VARCHAR(16) NOT NULL,
  method VARCHAR(12),
  path VARCHAR(300),
  ip VARCHAR(64),
  reason VARCHAR(500),
  model VARCHAR(120),
  operation VARCHAR(80),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT impersonation_event_kind_ck CHECK (kind IN ('START','START_REPLAY','EXIT','EXPIRED','REVOKED','SIGN_OUT','LOGIN','REQUEST','BUSINESS_MUTATION')),
  CONSTRAINT impersonation_event_outcome_ck CHECK (outcome IN ('ATTEMPT','SUCCESS','DENIED','FAILED')),
  CONSTRAINT impersonation_event_method_ck CHECK (method IS NULL OR method ~ '^[A-Z]{3,10}$'),
  CONSTRAINT impersonation_event_path_ck CHECK (path IS NULL OR (path LIKE '/%' AND position('?' in path) = 0)),
  CONSTRAINT impersonation_event_ip_ck CHECK (ip IS NULL OR ip ~ '^[0-9A-Fa-f:.]{1,64}$'),
  CONSTRAINT impersonation_event_reason_ck CHECK (reason IS NULL OR length(btrim(reason)) BETWEEN 1 AND 500),
  CONSTRAINT impersonation_event_detail_ck CHECK (jsonb_typeof(detail) = 'object' AND octet_length(detail::text) <= 4096),
  CONSTRAINT impersonation_event_business_success_ck CHECK ((kind <> 'BUSINESS_MUTATION') OR (session_id IS NOT NULL AND outcome = 'SUCCESS' AND model IS NOT NULL AND operation IS NOT NULL)),
  CONSTRAINT impersonation_event_session_fk FOREIGN KEY (session_id) REFERENCES impersonation_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_event_actor_fk FOREIGN KEY (actor_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_event_target_fk FOREIGN KEY (target_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT
);

-- Explicit-exit recovery receipt. A unique actor/key pair is intentionally
-- global to a real actor so the same client key can never restore a different
-- session. The canonical payload excludes the key itself and is SHA-256.
CREATE TABLE impersonation_control_command_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command VARCHAR(16) NOT NULL,
  session_id UUID NOT NULL,
  actor_id INTEGER NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  payload_hash CHAR(64) NOT NULL,
  redirect_to VARCHAR(300) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT impersonation_control_receipts_command_ck CHECK (command = 'EXIT'),
  CONSTRAINT impersonation_control_receipts_key_ck CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  CONSTRAINT impersonation_control_receipts_payload_hash_ck CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT impersonation_control_receipts_redirect_ck CHECK (redirect_to = '/admin'),
  CONSTRAINT impersonation_control_receipts_session_fk FOREIGN KEY (session_id) REFERENCES impersonation_sessions(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_control_receipts_actor_fk FOREIGN KEY (actor_id) REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  CONSTRAINT impersonation_control_receipts_actor_key_uq UNIQUE (actor_id,idempotency_key)
);

CREATE UNIQUE INDEX impersonation_sessions_source_idempotency_uq
  ON impersonation_sessions(source_session_hash,idempotency_key);
CREATE INDEX impersonation_sessions_active_source_idx
  ON impersonation_sessions(source_session_hash,expires_at DESC);
CREATE INDEX impersonation_sessions_actor_started_idx ON impersonation_sessions(actor_id,started_at DESC);
CREATE INDEX impersonation_sessions_target_started_idx ON impersonation_sessions(target_id,started_at DESC);
CREATE INDEX impersonation_session_ends_session_idx ON impersonation_session_ends(session_id);
CREATE INDEX impersonation_event_log_created_idx ON impersonation_event_log(created_at DESC,id DESC);
CREATE INDEX impersonation_event_log_session_created_idx ON impersonation_event_log(session_id,created_at DESC);
CREATE INDEX impersonation_event_log_actor_created_idx ON impersonation_event_log(actor_id,created_at DESC);
CREATE INDEX impersonation_control_receipts_session_idx ON impersonation_control_command_receipts(session_id,created_at DESC);

-- All references are ON DELETE RESTRICT. Immutable evidence therefore blocks
-- deletion rather than being cascaded or silently orphaned.
CREATE OR REPLACE FUNCTION impersonation_production_append_only_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source_active boolean;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION '% is immutable impersonation ledger', TG_TABLE_NAME USING ERRCODE='55000';
  END IF;
  IF current_database() <> 'railway' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'IMPERSONATION_PRODUCTION_ONLY' USING ERRCODE='42501';
  END IF;

  IF TG_TABLE_NAME = 'impersonation_sessions' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('impersonation:' || NEW.source_session_hash, 0));
    IF NOT EXISTS (
      SELECT 1 FROM usuarios_admin u WHERE u.id=NEW.actor_id AND u.activo=true AND u.rol::text='SUPER_ADMIN'
    ) THEN
      RAISE EXCEPTION 'IMPERSONATION_ACTOR_INVALID' USING ERRCODE='42501';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM usuarios_admin u
       WHERE u.id=NEW.target_id AND u.activo=true AND u.rol::text <> 'SUPER_ADMIN'
         AND NOT ('SUPER_ADMIN'=ANY(COALESCE(u.roles,ARRAY[]::text[])))
    ) THEN
      RAISE EXCEPTION 'IMPERSONATION_TARGET_INVALID' USING ERRCODE='42501';
    END IF;
    SELECT EXISTS(
      SELECT 1 FROM impersonation_sessions s
       WHERE s.source_session_hash=NEW.source_session_hash AND s.expires_at>CURRENT_TIMESTAMP
         AND NOT EXISTS(SELECT 1 FROM impersonation_session_ends e WHERE e.session_id=s.id)
    ) INTO source_active;
    IF source_active THEN
      RAISE EXCEPTION 'IMPERSONATION_SOURCE_ALREADY_ACTIVE' USING ERRCODE='23505';
    END IF;
  ELSIF TG_TABLE_NAME = 'impersonation_session_ends' THEN
    IF NOT EXISTS (SELECT 1 FROM impersonation_sessions s WHERE s.id=NEW.session_id) THEN
      RAISE EXCEPTION 'IMPERSONATION_END_WITHOUT_SESSION' USING ERRCODE='23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'impersonation_event_log' AND NEW.session_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM impersonation_sessions s WHERE s.id=NEW.session_id) THEN
      RAISE EXCEPTION 'IMPERSONATION_EVENT_WITHOUT_SESSION' USING ERRCODE='23503';
    END IF;
  ELSIF TG_TABLE_NAME = 'impersonation_control_command_receipts' THEN
    IF NEW.command <> 'EXIT' OR NOT EXISTS (
      SELECT 1
        FROM impersonation_sessions s
        JOIN impersonation_session_ends e ON e.session_id=s.id
       WHERE s.id=NEW.session_id
         AND s.actor_id=NEW.actor_id
         AND e.end_reason='EXITED'
    ) THEN
      RAISE EXCEPTION 'IMPERSONATION_EXIT_RECEIPT_INVALID' USING ERRCODE='23503';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER impersonation_sessions_append_only_tr
  BEFORE INSERT OR UPDATE OR DELETE ON impersonation_sessions
  FOR EACH ROW EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_sessions_no_truncate_tr
  BEFORE TRUNCATE ON impersonation_sessions
  FOR EACH STATEMENT EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_session_ends_append_only_tr
  BEFORE INSERT OR UPDATE OR DELETE ON impersonation_session_ends
  FOR EACH ROW EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_session_ends_no_truncate_tr
  BEFORE TRUNCATE ON impersonation_session_ends
  FOR EACH STATEMENT EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_event_log_append_only_tr
  BEFORE INSERT OR UPDATE OR DELETE ON impersonation_event_log
  FOR EACH ROW EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_event_log_no_truncate_tr
  BEFORE TRUNCATE ON impersonation_event_log
  FOR EACH STATEMENT EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_control_receipts_append_only_tr
  BEFORE INSERT OR UPDATE OR DELETE ON impersonation_control_command_receipts
  FOR EACH ROW EXECUTE FUNCTION impersonation_production_append_only_guard();
CREATE TRIGGER impersonation_control_receipts_no_truncate_tr
  BEFORE TRUNCATE ON impersonation_control_command_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION impersonation_production_append_only_guard();
