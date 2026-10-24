-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_zz_easy_counterparty_bulk/migration.sql SHA-256 f3e97df85e2316f4fd47e375db6caefe2574613cb13a50255a52a7a1d00e4d38.
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

-- Lotes de terceros Modo Fácil — release ADITIVO de producción.
-- NO EJECUTAR AUTOMÁTICAMENTE. Sólo staging railway/railway.
-- No contiene DML, backfill, reset, sync, emails ni modificaciones de B4,
-- documentos, movimientos, texto bancario o fichas fiscales existentes.
-- Requiere primero: perfiles de acceso, ledger P1 y corrección UUID P1.

DO $$ BEGIN
  IF to_regclass('public.decisiones_tercero_modo_facil') IS NULL
     OR to_regclass('public.perfiles_acceso_modo_facil') IS NULL THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_BULK_REQUIRES_P1_AND_PROFILE';
  END IF;
END $$;

CREATE TABLE "lotes_tercero_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" INTEGER NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "preview_hash" CHAR(64) NOT NULL,
  "resumen" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lotes_tercero_mf_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lotes_tercero_mf_hash_ck" CHECK ("request_hash" ~ '^[a-f0-9]{64}$' AND "preview_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "lotes_tercero_mf_resumen_ck" CHECK (
    "resumen"->>'schema'='EASY_COUNTERPARTY_BULK_RECEIPT_V1'
    AND jsonb_typeof("resumen"->'aceptados')='number'
    AND ("resumen"->>'aceptados')::integer BETWEEN 1 AND 25
    AND "resumen" ? 'totales'
  )
);

CREATE TABLE "patas_lote_tercero_modo_facil" (
  "lote_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "movimiento_id" TEXT NOT NULL,
  "decision_confirmada_id" UUID NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  CONSTRAINT "patas_lote_tercero_mf_pkey" PRIMARY KEY ("lote_id","ordinal"),
  CONSTRAINT "patas_lote_tercero_mf_ordinal_ck" CHECK ("ordinal" BETWEEN 1 AND 25),
  CONSTRAINT "patas_lote_tercero_mf_fingerprint_ck" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$')
);

CREATE TABLE "reversiones_lote_tercero_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lote_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "resumen" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reversiones_lote_tercero_mf_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reversiones_lote_tercero_mf_hash_ck" CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "reversiones_lote_tercero_mf_resumen_ck" CHECK (
    "resumen"->>'schema'='EASY_COUNTERPARTY_BULK_UNDO_V1'
    AND jsonb_typeof("resumen"->'revertidos')='number'
    AND ("resumen"->>'revertidos')::integer BETWEEN 1 AND 25
  )
);

CREATE TABLE "patas_reversion_lote_tercero_modo_facil" (
  "reversion_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "decision_confirmada_id" UUID NOT NULL,
  "decision_reversion_id" UUID NOT NULL,
  CONSTRAINT "patas_reversion_lote_tercero_mf_pkey" PRIMARY KEY ("reversion_id","ordinal"),
  CONSTRAINT "patas_reversion_lote_tercero_mf_ordinal_ck" CHECK ("ordinal" BETWEEN 1 AND 25),
  CONSTRAINT "patas_reversion_lote_tercero_mf_distintas_ck" CHECK ("decision_confirmada_id" <> "decision_reversion_id")
);

CREATE UNIQUE INDEX "lotes_tercero_mf_actor_idempotencia_uq"
  ON "lotes_tercero_modo_facil" ("actor_id","idempotency_key");
CREATE UNIQUE INDEX "patas_lote_tercero_mf_decision_uq"
  ON "patas_lote_tercero_modo_facil" ("decision_confirmada_id");
CREATE UNIQUE INDEX "patas_lote_tercero_mf_movimiento_uq"
  ON "patas_lote_tercero_modo_facil" ("lote_id","movimiento_id");
CREATE UNIQUE INDEX "reversiones_lote_tercero_mf_lote_uq"
  ON "reversiones_lote_tercero_modo_facil" ("lote_id");
CREATE UNIQUE INDEX "reversiones_lote_tercero_mf_actor_idempotencia_uq"
  ON "reversiones_lote_tercero_modo_facil" ("actor_id","idempotency_key");
CREATE UNIQUE INDEX "patas_reversion_lote_tercero_mf_confirmada_uq"
  ON "patas_reversion_lote_tercero_modo_facil" ("decision_confirmada_id");
CREATE UNIQUE INDEX "patas_reversion_lote_tercero_mf_reversion_uq"
  ON "patas_reversion_lote_tercero_modo_facil" ("decision_reversion_id");

ALTER TABLE "lotes_tercero_modo_facil"
  ADD CONSTRAINT "lotes_tercero_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "patas_lote_tercero_modo_facil"
  ADD CONSTRAINT "patas_lote_tercero_mf_lote_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "patas_lote_tercero_mf_movimiento_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "patas_lote_tercero_mf_decision_fkey" FOREIGN KEY ("decision_confirmada_id") REFERENCES "decisiones_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "reversiones_lote_tercero_modo_facil"
  ADD CONSTRAINT "reversiones_lote_tercero_mf_lote_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reversiones_lote_tercero_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "patas_reversion_lote_tercero_modo_facil"
  ADD CONSTRAINT "patas_reversion_lote_tercero_mf_reversion_fkey" FOREIGN KEY ("reversion_id") REFERENCES "reversiones_lote_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "patas_reversion_lote_tercero_mf_confirmada_fkey" FOREIGN KEY ("decision_confirmada_id") REFERENCES "decisiones_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "patas_reversion_lote_tercero_mf_reversion_decision_fkey" FOREIGN KEY ("decision_reversion_id") REFERENCES "decisiones_tercero_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Immutable audit receipts. Reversal is represented by a new row, never an UPDATE.
CREATE FUNCTION easy_counterparty_bulk_no_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es un recibo inmutable', TG_TABLE_NAME USING ERRCODE='55000';
END $$;
CREATE TRIGGER "lotes_tercero_mf_no_mutation_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "lotes_tercero_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_counterparty_bulk_no_mutation();
CREATE TRIGGER "patas_lote_tercero_mf_no_mutation_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "patas_lote_tercero_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_counterparty_bulk_no_mutation();
CREATE TRIGGER "reversiones_lote_tercero_mf_no_mutation_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "reversiones_lote_tercero_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_counterparty_bulk_no_mutation();
CREATE TRIGGER "patas_reversion_lote_tercero_mf_no_mutation_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "patas_reversion_lote_tercero_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_counterparty_bulk_no_mutation();

-- Database production-identity backstop, independent of the web environment. No P1 bulk
-- receipt can be created outside the railway/postgres pair.
CREATE FUNCTION easy_counterparty_bulk_production_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_database()<>'railway' OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'EASY_COUNTERPARTY_BULK_PRODUCTION_ONLY' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER "lotes_tercero_mf_staging_tr" BEFORE INSERT ON "lotes_tercero_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_production_only();
CREATE TRIGGER "patas_lote_tercero_mf_staging_tr" BEFORE INSERT ON "patas_lote_tercero_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_production_only();
CREATE TRIGGER "reversiones_lote_tercero_mf_staging_tr" BEFORE INSERT ON "reversiones_lote_tercero_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_production_only();
CREATE TRIGGER "patas_reversion_lote_tercero_mf_staging_tr" BEFORE INSERT ON "patas_reversion_lote_tercero_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_production_only();

-- Deferrable integrity: a committed acceptance is complete, belongs to one actor,
-- has 1..25 uniquely ordered legs and every P1 receipt was created by that lot.
-- A later complete undo does not invalidate the immutable original receipt; the
-- separate reversal assertion below proves that the undo covers every original leg.
CREATE FUNCTION easy_counterparty_bulk_assert_lote_ct()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE lote uuid; r record; expected_count integer; legs integer; bad integer;
BEGIN
  IF TG_TABLE_NAME='lotes_tercero_modo_facil' THEN lote:=NEW.id;
  ELSIF TG_TABLE_NAME='patas_lote_tercero_modo_facil' THEN lote:=NEW.lote_id;
  ELSIF TG_TABLE_NAME='decisiones_tercero_modo_facil' THEN
    IF NEW.accion<>'CONFIRMADA'::"EstadoDecisionTerceroModoFacil" OR NEW.snapshot->>'bulkId' IS NULL THEN RETURN NULL; END IF;
    lote:=CAST(NEW.snapshot->>'bulkId' AS uuid);
  ELSE RAISE EXCEPTION 'Tabla inesperada de integridad de lote'; END IF;
  SELECT * INTO r FROM "lotes_tercero_modo_facil" WHERE id=lote FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo P1 de lote sin cabecera' USING ERRCODE='23514';
  END IF;
  expected_count:=(r.resumen->>'aceptados')::integer;
  SELECT count(*),count(*) FILTER (WHERE d.movimiento_id<>p.movimiento_id OR d.actor_id<>r.actor_id OR d.accion<>'CONFIRMADA'::"EstadoDecisionTerceroModoFacil" OR d.snapshot->>'bulkId' IS DISTINCT FROM r.id::text)
    INTO legs,bad
    FROM "patas_lote_tercero_modo_facil" p JOIN "decisiones_tercero_modo_facil" d ON d.id=p.decision_confirmada_id
   WHERE p.lote_id=r.id;
  IF legs<>expected_count OR legs<1 OR legs>25 OR bad<>0 THEN
    RAISE EXCEPTION 'Lote P1 incompleto o no corresponde a sus recibos vigentes' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "lote_tercero_mf_integridad_ct" AFTER INSERT ON "lotes_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_assert_lote_ct();
CREATE CONSTRAINT TRIGGER "pata_lote_tercero_mf_integridad_ct" AFTER INSERT ON "patas_lote_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_assert_lote_ct();
CREATE CONSTRAINT TRIGGER "p1_lote_tercero_mf_integridad_ct" AFTER INSERT ON "decisiones_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_assert_lote_ct();

-- A committed undo has exactly all original legs of its own lot. The P1 append-only
-- guard still independently checks the original receipt, movement, origin and live
-- actor. This assertion deliberately permits acceptance and full undo before the
-- same transaction reaches SET CONSTRAINTS ... IMMEDIATE or COMMIT.
CREATE FUNCTION easy_counterparty_bulk_assert_reversion_ct()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE undo_id uuid; r record; originals integer; legs integer; bad integer;
BEGIN
  IF TG_TABLE_NAME='reversiones_lote_tercero_modo_facil' THEN undo_id:=NEW.id;
  ELSIF TG_TABLE_NAME='patas_reversion_lote_tercero_modo_facil' THEN undo_id:=NEW.reversion_id;
  ELSIF TG_TABLE_NAME='decisiones_tercero_modo_facil' THEN
    IF NEW.accion<>'REVERTIDA'::"EstadoDecisionTerceroModoFacil" OR NEW.snapshot->>'bulkUndoId' IS NULL THEN RETURN NULL; END IF;
    undo_id:=CAST(NEW.snapshot->>'bulkUndoId' AS uuid);
  ELSE RAISE EXCEPTION 'Tabla inesperada de integridad de reversión'; END IF;
  SELECT * INTO r FROM "reversiones_lote_tercero_modo_facil" WHERE id=undo_id FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recibo P1 de reversión sin cabecera' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO originals FROM "patas_lote_tercero_modo_facil" WHERE lote_id=r.lote_id;
  SELECT count(*),count(*) FILTER (WHERE original_leg.decision_confirmada_id IS NULL OR confirmed.id<>p.decision_confirmada_id OR confirmed.snapshot->>'bulkId' IS DISTINCT FROM r.lote_id::text OR reverted.revierte_id<>p.decision_confirmada_id OR reverted.actor_id<>r.actor_id OR reverted.accion<>'REVERTIDA'::"EstadoDecisionTerceroModoFacil" OR reverted.snapshot->>'bulkId' IS DISTINCT FROM r.lote_id::text OR reverted.snapshot->>'bulkUndoId' IS DISTINCT FROM r.id::text)
    INTO legs,bad
    FROM "patas_reversion_lote_tercero_modo_facil" p
    LEFT JOIN "patas_lote_tercero_modo_facil" original_leg ON original_leg.lote_id=r.lote_id AND original_leg.decision_confirmada_id=p.decision_confirmada_id
    JOIN "decisiones_tercero_modo_facil" confirmed ON confirmed.id=p.decision_confirmada_id
    JOIN "decisiones_tercero_modo_facil" reverted ON reverted.id=p.decision_reversion_id
   WHERE p.reversion_id=r.id;
  IF originals<1 OR originals>25 OR legs<>originals OR bad<>0 THEN
    RAISE EXCEPTION 'Reversión P1 incompleta o no corresponde exactamente al lote' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER "reversion_lote_tercero_mf_integridad_ct" AFTER INSERT ON "reversiones_lote_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_assert_reversion_ct();
CREATE CONSTRAINT TRIGGER "pata_reversion_lote_tercero_mf_integridad_ct" AFTER INSERT ON "patas_reversion_lote_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_assert_reversion_ct();
CREATE CONSTRAINT TRIGGER "p1_reversion_lote_tercero_mf_integridad_ct" AFTER INSERT ON "decisiones_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_counterparty_bulk_assert_reversion_ct();
