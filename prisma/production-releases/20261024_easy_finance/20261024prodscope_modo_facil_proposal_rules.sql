-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_modo_facil_proposal_rules/migration.sql SHA-256 a487b3acc6af12d4dfb6225b60f8a1875c00e3b186f002a98e901024c58f44ae.
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

-- Modo Fácil — migración ADITIVA de producción, aplicación EXCLUSIVA
-- en railway como postgres. NO ejecutar automáticamente, no contiene DML, reset,
-- backfill ni cambio de modelos/campos legacy/B4 existentes.

CREATE TYPE "ModoReglaModoFacil" AS ENUM ('SOLO_PROPONER');

CREATE TABLE "reglas_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operacion_b4_id" UUID NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "contraparte_normalizada" VARCHAR(300) NOT NULL,
  "signo" INTEGER NOT NULL,
  "tipo_documento" "TipoDocumentoConciliable",
  "motivo_no_requiere" "MotivoNoRequiere",
  "accion" VARCHAR(80) NOT NULL,
  "modo" "ModoReglaModoFacil" NOT NULL DEFAULT 'SOLO_PROPONER',
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "version" INTEGER NOT NULL DEFAULT 1,
  "usos_confirmados" INTEGER NOT NULL DEFAULT 0,
  "vigente_desde" DATE NOT NULL,
  "vigente_hasta" DATE,
  "creada_por_id" INTEGER NOT NULL,
  "desactivada_por_id" INTEGER,
  "desactivada_at" TIMESTAMP(3),
  "source_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reglas_modo_facil_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recibos_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "operacion_b4_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "accion" VARCHAR(32) NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "sugerencia_id" VARCHAR(80),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recibos_modo_facil_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auditorias_reglas_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "regla_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "accion" VARCHAR(32) NOT NULL,
  "operacion_b4_id" UUID,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditorias_reglas_modo_facil_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reglas_modo_facil_operacion_b4_id_key" ON "reglas_modo_facil"("operacion_b4_id");
CREATE INDEX "reglas_modo_facil_activa_cuenta_id_contraparte_normalizada_si_idx"
  ON "reglas_modo_facil"("activa","cuenta_id","contraparte_normalizada","signo","vigente_desde");
CREATE UNIQUE INDEX "recibos_modo_facil_operacion_b4_id_key" ON "recibos_modo_facil"("operacion_b4_id");
CREATE UNIQUE INDEX "recibos_modo_facil_actor_id_idempotency_key_key" ON "recibos_modo_facil"("actor_id","idempotency_key");
CREATE INDEX "auditorias_reglas_modo_facil_regla_id_created_at_idx" ON "auditorias_reglas_modo_facil"("regla_id","created_at");
CREATE INDEX "auditorias_reglas_modo_facil_operacion_b4_id_created_at_idx" ON "auditorias_reglas_modo_facil"("operacion_b4_id","created_at");

ALTER TABLE "reglas_modo_facil"
  ADD CONSTRAINT "reglas_modo_facil_operacion_b4_id_fkey"
    FOREIGN KEY ("operacion_b4_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reglas_modo_facil_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reglas_modo_facil_creada_por_id_fkey"
    FOREIGN KEY ("creada_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reglas_modo_facil_desactivada_por_id_fkey"
    FOREIGN KEY ("desactivada_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "recibos_modo_facil"
  ADD CONSTRAINT "recibos_modo_facil_operacion_b4_id_fkey"
    FOREIGN KEY ("operacion_b4_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "recibos_modo_facil_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "auditorias_reglas_modo_facil"
  ADD CONSTRAINT "auditorias_reglas_modo_facil_regla_id_fkey"
    FOREIGN KEY ("regla_id") REFERENCES "reglas_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "auditorias_reglas_modo_facil_actor_id_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "auditorias_reglas_modo_facil_operacion_b4_id_fkey"
    FOREIGN KEY ("operacion_b4_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- A rule never contains a future document/source ID. It is only a scoped cue
-- from one live B4 operation; action and matrix are closed and SOLO_PROPONER.
ALTER TABLE "reglas_modo_facil"
  ADD CONSTRAINT "regla_modo_facil_mode_ck" CHECK ("modo" = 'SOLO_PROPONER'::"ModoReglaModoFacil"),
  ADD CONSTRAINT "regla_modo_facil_signo_ck" CHECK ("signo" IN (-1,1)),
  ADD CONSTRAINT "regla_modo_facil_contraparte_ck" CHECK (length(btrim("contraparte_normalizada")) BETWEEN 1 AND 300),
  ADD CONSTRAINT "regla_modo_facil_version_ck" CHECK ("version" >= 1),
  ADD CONSTRAINT "regla_modo_facil_usos_ck" CHECK ("usos_confirmados" >= 0),
  ADD CONSTRAINT "regla_modo_facil_hash_ck" CHECK ("source_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "regla_modo_facil_vigencia_ck" CHECK ("vigente_hasta" IS NULL OR ("vigente_hasta" >= "vigente_desde") IS TRUE),
  ADD CONSTRAINT "regla_modo_facil_accion_matriz_ck" CHECK (COALESCE(
    (("tipo_documento" IN ('FACTURA_RECIBIDA'::"TipoDocumentoConciliable",'FACTURA_EMITIDA'::"TipoDocumentoConciliable",'TICKET'::"TipoDocumentoConciliable")) IS TRUE
      AND "motivo_no_requiere" IS NULL
      AND ("accion" = ('DOCUMENTO:' || "tipo_documento"::text)) IS TRUE)
    OR
    ("tipo_documento" IS NULL AND "motivo_no_requiere" IS NOT NULL
      AND ("accion" = 'NO_REQUIERE:' || "motivo_no_requiere"::text) IS TRUE)
  ,false)),
  ADD CONSTRAINT "regla_modo_facil_desactivacion_ck" CHECK (COALESCE(
    ("activa" AND "desactivada_por_id" IS NULL AND "desactivada_at" IS NULL)
    OR
    (NOT "activa" AND "desactivada_por_id" IS NOT NULL AND "desactivada_at" IS NOT NULL)
  ,false));

ALTER TABLE "recibos_modo_facil"
  ADD CONSTRAINT "recibo_modo_facil_accion_ck" CHECK ("accion" IN ('confirmar_factura','no_requiere')),
  ADD CONSTRAINT "recibo_modo_facil_hash_ck" CHECK ("request_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "recibo_modo_facil_sugerencia_ck" CHECK (COALESCE(
    ("accion" = 'confirmar_factura' AND "sugerencia_id" ~ '^mf1_[0-9a-f]{64}$')
    OR ("accion" = 'no_requiere' AND "sugerencia_id" IS NULL)
  ,false));

ALTER TABLE "auditorias_reglas_modo_facil"
  ADD CONSTRAINT "auditoria_regla_modo_facil_accion_ck" CHECK ("accion" IN ('CREADA','DESACTIVADA','USO_CONFIRMADO')),
  ADD CONSTRAINT "auditoria_regla_modo_facil_schema_ck" CHECK ("snapshot" ? 'schema' AND "snapshot"->>'schema' = 'MODO_FACIL_REGLA_AUDIT_V1');

-- A receipt can only adopt the B4 confirmation produced by the same actor and
-- UUID. This prevents a direct/legacy B4 operation from later becoming Modo
-- Fácil merely by inserting a receipt. The row remains append-only afterwards.
CREATE FUNCTION modo_facil_assert_recibo_origen()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op record;
BEGIN
  SELECT o.estado,o.revertida_at,o.solicitada_por_id,o.idempotency_key,o.snapshot_solicitud
    INTO op
    FROM operaciones_justificacion_b4 o
   WHERE o.id=NEW.operacion_b4_id
   FOR KEY SHARE;
  IF NOT FOUND OR op.estado <> 'APLICADA'::"EstadoOperacionB4"
     OR op.revertida_at IS NOT NULL OR op.solicitada_por_id <> NEW.actor_id
     OR op.idempotency_key <> NEW.idempotency_key::text
     OR op.snapshot_solicitud->>'action' IS DISTINCT FROM 'confirmar'
     OR (NEW.accion='confirmar_factura' AND (
       op.snapshot_solicitud->'borrador'->>'estado' IS DISTINCT FROM 'JUSTIFICADO'
       OR NEW.sugerencia_id IS NULL))
     OR (NEW.accion='no_requiere' AND (
       op.snapshot_solicitud->'borrador'->>'estado' IS DISTINCT FROM 'NO_REQUIERE'
       OR NEW.sugerencia_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Recibo Modo Fácil exige confirmación B4 propia coherente con acción y clave' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "recibo_modo_facil_origen_tr"
BEFORE INSERT ON "recibos_modo_facil"
FOR EACH ROW EXECUTE FUNCTION modo_facil_assert_recibo_origen();

-- Backstop: the learned operation must remain an actual Modo Fácil receipt and
-- an applied, non-reverted B4 decision when a rule is inserted. A later B4
-- reversal invalidates a rule dynamically: all reads/usages join this same
-- condition, so no rule can propose from a reverted learning operation.
CREATE FUNCTION modo_facil_assert_regla_origen()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op record;
BEGIN
  SELECT o.estado,o.revertida_at,o.movimiento_id,o.solicitada_por_id,r.actor_id
    INTO op
    FROM operaciones_justificacion_b4 o
    JOIN recibos_modo_facil r ON r.operacion_b4_id=o.id
   WHERE o.id=NEW.operacion_b4_id
   FOR KEY SHARE OF o,r;
  IF NOT FOUND OR op.estado <> 'APLICADA'::"EstadoOperacionB4" OR op.revertida_at IS NOT NULL
     OR op.solicitada_por_id <> NEW.creada_por_id OR op.actor_id <> NEW.creada_por_id THEN
    RAISE EXCEPTION 'Modo Fácil exige operación B4 propia aplicada, no revertida y recibo Modo Fácil' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "regla_modo_facil_origen_tr"
BEFORE INSERT ON "reglas_modo_facil"
FOR EACH ROW EXECUTE FUNCTION modo_facil_assert_regla_origen();

-- A user can only deactivate; there is no reactivation/edit/pattern update.
CREATE FUNCTION modo_facil_guard_regla_update()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.activa IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Una regla Modo Fácil desactivada no puede reactivarse ni editarse' USING ERRCODE='23514';
  END IF;
  IF NEW.activa IS DISTINCT FROM false OR NEW.version <> OLD.version + 1
     OR NEW.operacion_b4_id IS DISTINCT FROM OLD.operacion_b4_id
     OR NEW.cuenta_id IS DISTINCT FROM OLD.cuenta_id
     OR NEW.contraparte_normalizada IS DISTINCT FROM OLD.contraparte_normalizada
     OR NEW.signo IS DISTINCT FROM OLD.signo
     OR NEW.tipo_documento IS DISTINCT FROM OLD.tipo_documento
     OR NEW.motivo_no_requiere IS DISTINCT FROM OLD.motivo_no_requiere
     OR NEW.accion IS DISTINCT FROM OLD.accion
     OR NEW.modo IS DISTINCT FROM OLD.modo
     OR NEW.usos_confirmados IS DISTINCT FROM OLD.usos_confirmados
     OR NEW.vigente_desde IS DISTINCT FROM OLD.vigente_desde
     OR NEW.vigente_hasta IS DISTINCT FROM OLD.vigente_hasta
     OR NEW.creada_por_id IS DISTINCT FROM OLD.creada_por_id
     OR NEW.source_hash IS DISTINCT FROM OLD.source_hash
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Modo Fácil sólo permite desactivar una regla con versión unitaria' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "regla_modo_facil_update_estrecho_tr"
BEFORE UPDATE ON "reglas_modo_facil"
FOR EACH ROW EXECUTE FUNCTION modo_facil_guard_regla_update();

-- A learned rule remains auditable forever. It can only transition once from
-- active to inactive; deletion/truncation would orphan or erase its audit log.
CREATE FUNCTION modo_facil_rechazar_borrado_regla()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las reglas Modo Fácil se conservan; sólo se permite desactivar' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER "regla_modo_facil_no_delete_tr" BEFORE DELETE ON "reglas_modo_facil" FOR EACH ROW EXECUTE FUNCTION modo_facil_rechazar_borrado_regla();
CREATE TRIGGER "regla_modo_facil_no_truncate_tr" BEFORE TRUNCATE ON "reglas_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION modo_facil_rechazar_borrado_regla();

-- Append-only receipts/audits are immutable. Rule usage is reported as an audit
-- event; it deliberately does not mutate the learned rule or auto-confirm.
CREATE FUNCTION modo_facil_rechazar_mutacion_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es append-only Modo Fácil', TG_TABLE_NAME USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER "recibo_modo_facil_no_update_delete_tr" BEFORE UPDATE OR DELETE ON "recibos_modo_facil" FOR EACH ROW EXECUTE FUNCTION modo_facil_rechazar_mutacion_append_only();
CREATE TRIGGER "recibo_modo_facil_no_truncate_tr" BEFORE TRUNCATE ON "recibos_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION modo_facil_rechazar_mutacion_append_only();
CREATE TRIGGER "auditoria_regla_modo_facil_no_update_delete_tr" BEFORE UPDATE OR DELETE ON "auditorias_reglas_modo_facil" FOR EACH ROW EXECUTE FUNCTION modo_facil_rechazar_mutacion_append_only();
CREATE TRIGGER "auditoria_regla_modo_facil_no_truncate_tr" BEFORE TRUNCATE ON "auditorias_reglas_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION modo_facil_rechazar_mutacion_append_only();
