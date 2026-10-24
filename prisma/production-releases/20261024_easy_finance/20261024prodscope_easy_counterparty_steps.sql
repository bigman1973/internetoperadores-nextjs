-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_easy_counterparty_steps/migration.sql SHA-256 a010920f06d5793605b10ab7d99a1e5f8c07ebf089d422527d138725504a9bf2.
-- Preflight de creación obligatorio, habilitado sólo por el aplicador transaccional.
DO $$
BEGIN
  IF current_setting('io.finance_easy_production_ddl', true) = '1' THEN
    NULL;
  ELSE
    RAISE EXCEPTION 'FINANCE_EASY_PRODUCTION_DDL_GUARD_REQUIRED' USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Paso 1 terceros Modo Fácil — propuesta ADITIVA para revisión.
-- No ejecutar automáticamente. No contiene DML, backfill, reset ni cambios a
-- campos legacy, entidad fiscal, empleado, factura, cuenta o estados B4.
-- Aplicar exclusivamente en railway como railway.

-- La política de reversión delegada consulta el perfil vivo; la migración padre
-- 20261024_easy_access_profiles debe existir antes que este ledger.
DO $$ BEGIN
  IF to_regclass('public.perfiles_acceso_modo_facil') IS NULL THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_REQUIRES_EASY_ACCESS_PROFILES';
  END IF;
END $$;

CREATE TYPE "EstadoDecisionTerceroModoFacil" AS ENUM ('CONFIRMADA','REVERTIDA');
CREATE TYPE "TipoTerceroModoFacil" AS ENUM ('CLIENTE','PROVEEDOR','BANCO','CUENTA_PROPIA','EMPLEADO');
CREATE TYPE "OrigenTerceroModoFacil" AS ENUM (
  'ENTIDAD_FISCAL','EMPLEADO','NOMINA_EMPLEADO','FACTURA_RECIBIDA','FACTURA_EMITIDA',
  'CLIENTE_CONTRATO_ACTUAL','CUENTA_PROPIA_ACTUAL','MANUAL','AUTO_RECIBO'
);

CREATE TABLE "decisiones_tercero_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "movimiento_id" TEXT NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "accion" "EstadoDecisionTerceroModoFacil" NOT NULL,
  "tipo_tercero" "TipoTerceroModoFacil" NOT NULL,
  "origen" "OrigenTerceroModoFacil" NOT NULL,
  "candidato_hash" CHAR(64) NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "revierte_id" UUID,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "decisiones_tercero_modo_facil_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "decisiones_tercero_modo_facil_actor_id_idempotency_key_key"
  ON "decisiones_tercero_modo_facil"("actor_id","idempotency_key");
CREATE UNIQUE INDEX "decisiones_tercero_modo_facil_revierte_id_key"
  ON "decisiones_tercero_modo_facil"("revierte_id") WHERE "revierte_id" IS NOT NULL;
CREATE INDEX "decisiones_tercero_modo_facil_movimiento_created_at_idx"
  ON "decisiones_tercero_modo_facil"("movimiento_id","created_at");

ALTER TABLE "decisiones_tercero_modo_facil"
  ADD CONSTRAINT "decisiones_tercero_modo_facil_movimiento_id_fkey"
    FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "decisiones_tercero_modo_facil_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "decisiones_tercero_modo_facil_revierte_id_fkey"
    FOREIGN KEY ("revierte_id") REFERENCES "decisiones_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "decisiones_tercero_modo_facil_hashes_ck"
    CHECK ("candidato_hash" ~ '^[a-f0-9]{64}$' AND "request_hash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "decisiones_tercero_modo_facil_snapshot_ck"
    CHECK ("snapshot" ? 'schema' AND "snapshot"->>'schema' = 'EASY_COUNTERPARTY_RECEIPT_V1'),
  ADD CONSTRAINT "decisiones_tercero_modo_facil_reversion_matriz_ck"
    CHECK (("accion"='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" AND "revierte_id" IS NULL)
      OR ("accion"='REVERTIDA'::"EstadoDecisionTerceroModoFacil" AND "revierte_id" IS NOT NULL));

-- The table is an immutable receipt ledger. A reversal is a new row and never
-- mutates legacy identity columns, entities, B4 state, documents or source text.
CREATE FUNCTION easy_counterparty_guard_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_APPEND_ONLY' USING ERRCODE='55000';
  END IF;
  IF current_database() <> 'railway' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_PRODUCTION_ONLY' USING ERRCODE='55000';
  END IF;
  IF NEW.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" THEN
    IF NEW.origen='MANUAL'::"OrigenTerceroModoFacil" THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_MANUAL_ORIGIN_RESERVED' USING ERRCODE='23514';
    END IF;
    -- AUTO_RECIBO is not a browser action: only the automatic receipt adapter may
    -- use it, and it must carry its own opaque automatic-receipt reference.
    IF NEW.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
       AND (NOT (NEW.snapshot ? 'autoReceiptId') OR (NEW.snapshot->>'autoReceiptId') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_AUTO_RECEIPT_REQUIRED' USING ERRCODE='23514';
    END IF;
  ELSE
    SELECT * INTO original FROM "decisiones_tercero_modo_facil" d WHERE d.id=NEW.revierte_id FOR KEY SHARE;
    IF NOT FOUND OR original.accion <> 'CONFIRMADA'::"EstadoDecisionTerceroModoFacil"
       OR original.movimiento_id <> NEW.movimiento_id
       OR original.tipo_tercero <> NEW.tipo_tercero OR original.origen <> NEW.origen
       OR original.candidato_hash <> NEW.candidato_hash THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_REVERSAL_ORIGIN_INVALID' USING ERRCODE='23514';
    END IF;
    -- The original confirmer and the revoker are distinct auditable actors. A
    -- restricted Modo Fácil user can reverse only their own receipt. A different
    -- actor is accepted only when the live database rows identify an active
    -- SUPER_ADMIN/GERENTE whose latest production profile is not MODO_FACIL_ONLY.
    -- No browser role or request field is trusted here.
    IF original.actor_id <> NEW.actor_id AND NOT EXISTS (
      SELECT 1 FROM usuarios_admin u
      WHERE u.id=NEW.actor_id AND u.activo=true AND u.rol::text IN ('SUPER_ADMIN','GERENTE')
        AND COALESCE((SELECT p.perfil FROM perfiles_acceso_modo_facil p WHERE p.usuario_id=u.id ORDER BY p.version DESC LIMIT 1),'RESTABLECIDO') <> 'MODO_FACIL_ONLY'
    ) THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_DELEGATED_REVERSAL_NOT_ALLOWED' USING ERRCODE='42501';
    END IF;
    IF NEW.snapshot->>'revertedOriginalActorId' IS DISTINCT FROM original.actor_id::text
       OR NEW.snapshot->>'revertedByActorId' IS DISTINCT FROM NEW.actor_id::text THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_REVERSAL_AUDIT_INVALID' USING ERRCODE='23514';
    END IF;
    IF EXISTS (SELECT 1 FROM "decisiones_tercero_modo_facil" r WHERE r.revierte_id=NEW.revierte_id) THEN
      RAISE EXCEPTION 'EASY_COUNTERPARTY_ALREADY_REVERSED' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('easy-counterparty:'||NEW.movimiento_id,0));
  RETURN NEW;
END $$;
CREATE TRIGGER "decisiones_tercero_modo_facil_append_only_tr"
  BEFORE INSERT OR UPDATE OR DELETE ON "decisiones_tercero_modo_facil"
  FOR EACH ROW EXECUTE FUNCTION easy_counterparty_guard_append_only();
CREATE TRIGGER "decisiones_tercero_modo_facil_no_truncate_tr"
  BEFORE TRUNCATE ON "decisiones_tercero_modo_facil"
  FOR EACH STATEMENT EXECUTE FUNCTION easy_counterparty_guard_append_only();
