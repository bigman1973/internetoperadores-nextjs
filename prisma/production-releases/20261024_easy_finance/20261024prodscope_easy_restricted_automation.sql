-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_easy_restricted_automation/migration.sql SHA-256 ff3e03bfa12e8bfa72f226a4661d2e6b73bb7dc7a74d0e8e677a19ff09d684ab.
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

-- Automatización restringida Modo Fácil — release ADITIVO, production-only.
-- NO aplicar automáticamente. NO contiene DML, backfill, UPDATE de legacy ni ALTER
-- de entidades fiscales/documentos/ISP. La aplicación debe usar siempre
-- el guard server-side de producción y transacciones SERIALIZABLE.

CREATE TABLE "politicas_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "politica_key" TEXT NOT NULL,
  "entorno" TEXT NOT NULL,
  "estado" TEXT NOT NULL,
  "datos_desde" DATE NOT NULL,
  "datos_hasta" DATE NOT NULL,
  "autorizada_en" DATE NOT NULL,
  "referencia_autorizacion" VARCHAR(300) NOT NULL,
  "creada_por_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "politicas_auto_modo_facil_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "politica_auto_mf_key_ck" CHECK ("politica_key" = 'MODO_FACIL_AUTO_RESTRINGIDA_PRODUCTION_20261024'),
  CONSTRAINT "politica_auto_mf_entorno_ck" CHECK ("entorno" = 'PRODUCTION'),
  CONSTRAINT "politica_auto_mf_estado_ck" CHECK ("estado" = 'ACTIVA'),
  CONSTRAINT "politica_auto_mf_ventana_ck" CHECK ("datos_desde" = DATE '2026-01-01' AND "datos_hasta" = DATE '2026-10-08'),
  CONSTRAINT "politica_auto_mf_autorizacion_ck" CHECK (length(btrim("referencia_autorizacion")) BETWEEN 12 AND 300)
);

-- Una atestación no existe por activar la política ni por tener IBAN/banco: es una
-- declaración explícita para UNA cuenta seleccionada tras aparecer bloqueada en GET.
CREATE TABLE "atestaciones_cuenta_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "politica_id" UUID NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "titular_declarado" VARCHAR(300) NOT NULL,
  "cif_titular" VARCHAR(32),
  "referencia_evidencia" VARCHAR(500) NOT NULL,
  "confirmacion_titularidad_io" BOOLEAN NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "atestaciones_cuenta_auto_mf_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "atestacion_auto_mf_version_ck" CHECK ("version" = 1),
  CONSTRAINT "atestacion_auto_mf_titular_ck" CHECK (length(btrim("titular_declarado")) BETWEEN 3 AND 300),
  CONSTRAINT "atestacion_auto_mf_evidencia_ck" CHECK (length(btrim("referencia_evidencia")) BETWEEN 12 AND 500),
  CONSTRAINT "atestacion_auto_mf_confirmacion_ck" CHECK ("confirmacion_titularidad_io" = true),
  CONSTRAINT "atestacion_auto_mf_snapshot_ck" CHECK ("snapshot"->>'schema' = 'EASY_AUTO_ACCOUNT_ATTESTATION_V1' AND "snapshot"->>'origen' = 'REGLA')
);

-- Ledger propio de banco cobrador. No FK ni escritura en entidades_fiscales.
CREATE TABLE "terceros_banco_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "politica_id" UUID NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "nombre_normalizado" VARCHAR(300) NOT NULL,
  "referencia_evidencia" VARCHAR(500) NOT NULL,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "actor_id" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "terceros_banco_auto_mf_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tercero_banco_auto_mf_nombre_ck" CHECK (length(btrim("nombre_normalizado")) BETWEEN 1 AND 300),
  CONSTRAINT "tercero_banco_auto_mf_evidencia_ck" CHECK (length(btrim("referencia_evidencia")) BETWEEN 12 AND 500),
  CONSTRAINT "tercero_banco_auto_mf_activo_ck" CHECK ("activo" = true),
  CONSTRAINT "tercero_banco_auto_mf_snapshot_ck" CHECK ("snapshot"->>'schema' = 'EASY_AUTO_BANK_THIRD_PARTY_V1' AND "snapshot"->>'origen' = 'REGLA')
);

-- Una ejecución es el recibo durable de idempotencia de lote. Se inserta antes de
-- elegir/aplicar las patas y se recupera antes de cualquier nueva previsualización.
-- Así un timeout tras commit sólo puede reproducir el mismo resultado; nunca abre
-- una segunda selección cambiante con la misma clave externa.
CREATE TABLE "ejecuciones_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "politica_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "review_hash" CHAR(64) NOT NULL,
  "resumen" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ejecucion_auto_mf_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ejecucion_auto_mf_hash_ck" CHECK ("request_hash" ~ '^[0-9a-f]{64}$' AND "review_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ejecucion_auto_mf_resumen_ck" CHECK ("resumen" ?& ARRAY['examinados','excluidos','seleccionados'])
);
-- Recibo durable de una operación automática (pareja o comisión) y sus patas B4.
CREATE TABLE "recibos_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ejecucion_id" UUID NOT NULL,
  "politica_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "clase" VARCHAR(32) NOT NULL,
  "origen" VARCHAR(16) NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "tercero_banco_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "recibos_auto_modo_facil_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "recibo_auto_mf_clase_ck" CHECK ("clase" IN ('TRASPASO_PROPIO','COMISION_BANCARIA')),
  CONSTRAINT "recibo_auto_mf_origen_ck" CHECK ("origen" = 'REGLA'),
  CONSTRAINT "recibo_auto_mf_hash_ck" CHECK ("request_hash" ~ '^[0-9a-f]{64}$' AND "fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "recibo_auto_mf_tercero_matriz_ck" CHECK (
    ("clase" = 'TRASPASO_PROPIO' AND "tercero_banco_id" IS NULL)
    OR ("clase" = 'COMISION_BANCARIA' AND "tercero_banco_id" IS NOT NULL)
  )
);

CREATE TABLE "patas_recibo_auto_modo_facil" (
  "recibo_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "movimiento_id" TEXT NOT NULL,
  "operacion_b4_id" UUID NOT NULL,
  "motivo_no_requiere" "MotivoNoRequiere" NOT NULL,
  CONSTRAINT "patas_recibo_auto_modo_facil_pkey" PRIMARY KEY ("recibo_id","ordinal"),
  CONSTRAINT "pata_recibo_auto_mf_ordinal_ck" CHECK ("ordinal" IN (1,2)),
  CONSTRAINT "pata_recibo_auto_mf_motivo_ck" CHECK ("motivo_no_requiere" IN ('TRASPASO_INTERNO_SIN_DOCUMENTO'::"MotivoNoRequiere",'COMISION_BANCARIA'::"MotivoNoRequiere"))
);

-- Reversión visible y append-only. Todas las patas se revierten en la misma
-- transacción que inserta estos registros; nunca se borra el recibo original.
CREATE TABLE "reversiones_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recibo_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" CHAR(64) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "reversiones_auto_modo_facil_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reversion_auto_mf_hash_ck" CHECK ("request_hash" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "patas_reversion_auto_modo_facil" (
  "reversion_id" UUID NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "operacion_b4_original_id" UUID NOT NULL,
  "operacion_b4_reversion_id" UUID NOT NULL,
  CONSTRAINT "patas_reversion_auto_modo_facil_pkey" PRIMARY KEY ("reversion_id","ordinal"),
  CONSTRAINT "pata_reversion_auto_mf_ordinal_ck" CHECK ("ordinal" IN (1,2)),
  CONSTRAINT "pata_reversion_auto_mf_distinta_ck" CHECK ("operacion_b4_original_id" <> "operacion_b4_reversion_id")
);

-- Sólo historial de fallos de ejecución; no es un permiso ni cambia candidatos.
CREATE TABLE "fallos_auto_modo_facil" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "politica_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "clase" VARCHAR(32) NOT NULL,
  "codigo" VARCHAR(80) NOT NULL,
  "mensaje" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "fallos_auto_modo_facil_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fallo_auto_mf_clase_ck" CHECK ("clase" IN ('TRASPASO_PROPIO','COMISION_BANCARIA')),
  CONSTRAINT "fallo_auto_mf_hash_ck" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "fallo_auto_mf_texto_ck" CHECK (length(btrim("codigo")) BETWEEN 1 AND 80 AND length(btrim("mensaje")) BETWEEN 1 AND 500)
);

CREATE UNIQUE INDEX "politica_auto_mf_activa_por_dia_uq"
  ON "politicas_auto_modo_facil" ("politica_key","entorno","autorizada_en");
CREATE UNIQUE INDEX "atestacion_auto_mf_policy_cuenta_uq"
  ON "atestaciones_cuenta_auto_modo_facil" ("politica_id","cuenta_id");
CREATE UNIQUE INDEX "tercero_banco_auto_mf_policy_cuenta_nombre_uq"
  ON "terceros_banco_auto_modo_facil" ("politica_id","cuenta_id","nombre_normalizado");
CREATE UNIQUE INDEX "ejecucion_auto_mf_actor_idempotencia_uq"
  ON "ejecuciones_auto_modo_facil" ("actor_id","idempotency_key");
CREATE UNIQUE INDEX "recibo_auto_mf_actor_idempotencia_uq"
  ON "recibos_auto_modo_facil" ("actor_id","idempotency_key");
CREATE UNIQUE INDEX "recibo_auto_mf_fingerprint_uq"
  ON "recibos_auto_modo_facil" ("politica_id","fingerprint");
CREATE UNIQUE INDEX "pata_recibo_auto_mf_movimiento_uq"
  ON "patas_recibo_auto_modo_facil" ("movimiento_id");
CREATE UNIQUE INDEX "pata_recibo_auto_mf_operacion_uq"
  ON "patas_recibo_auto_modo_facil" ("operacion_b4_id");
CREATE UNIQUE INDEX "reversion_auto_mf_recibo_uq"
  ON "reversiones_auto_modo_facil" ("recibo_id");
CREATE UNIQUE INDEX "reversion_auto_mf_actor_idempotencia_uq"
  ON "reversiones_auto_modo_facil" ("actor_id","idempotency_key");
CREATE UNIQUE INDEX "pata_reversion_auto_mf_original_uq"
  ON "patas_reversion_auto_modo_facil" ("operacion_b4_original_id");
CREATE UNIQUE INDEX "pata_reversion_auto_mf_reversion_uq"
  ON "patas_reversion_auto_modo_facil" ("operacion_b4_reversion_id");
CREATE INDEX "fallo_auto_mf_policy_created_idx" ON "fallos_auto_modo_facil" ("politica_id","created_at" DESC);

ALTER TABLE "politicas_auto_modo_facil"
  ADD CONSTRAINT "politica_auto_mf_actor_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "atestaciones_cuenta_auto_modo_facil"
  ADD CONSTRAINT "atestacion_auto_mf_policy_fkey" FOREIGN KEY ("politica_id") REFERENCES "politicas_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "atestacion_auto_mf_cuenta_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "atestacion_auto_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "terceros_banco_auto_modo_facil"
  ADD CONSTRAINT "tercero_banco_auto_mf_policy_fkey" FOREIGN KEY ("politica_id") REFERENCES "politicas_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "tercero_banco_auto_mf_cuenta_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "tercero_banco_auto_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "ejecuciones_auto_modo_facil"
  ADD CONSTRAINT "ejecucion_auto_mf_policy_fkey" FOREIGN KEY ("politica_id") REFERENCES "politicas_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "ejecucion_auto_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "recibos_auto_modo_facil"
  ADD CONSTRAINT "recibo_auto_mf_ejecucion_fkey" FOREIGN KEY ("ejecucion_id") REFERENCES "ejecuciones_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "recibo_auto_mf_policy_fkey" FOREIGN KEY ("politica_id") REFERENCES "politicas_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "recibo_auto_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "recibo_auto_mf_tercero_fkey" FOREIGN KEY ("tercero_banco_id") REFERENCES "terceros_banco_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "patas_recibo_auto_modo_facil"
  ADD CONSTRAINT "pata_recibo_auto_mf_recibo_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibos_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "pata_recibo_auto_mf_movimiento_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "pata_recibo_auto_mf_operacion_fkey" FOREIGN KEY ("operacion_b4_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "reversiones_auto_modo_facil"
  ADD CONSTRAINT "reversion_auto_mf_recibo_fkey" FOREIGN KEY ("recibo_id") REFERENCES "recibos_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "reversion_auto_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "patas_reversion_auto_modo_facil"
  ADD CONSTRAINT "pata_reversion_auto_mf_reversion_fkey" FOREIGN KEY ("reversion_id") REFERENCES "reversiones_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "pata_reversion_auto_mf_original_fkey" FOREIGN KEY ("operacion_b4_original_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "pata_reversion_auto_mf_resultado_fkey" FOREIGN KEY ("operacion_b4_reversion_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "fallos_auto_modo_facil"
  ADD CONSTRAINT "fallo_auto_mf_policy_fkey" FOREIGN KEY ("politica_id") REFERENCES "politicas_auto_modo_facil"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "fallo_auto_mf_actor_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- All tables are append-only. A later account/third-party correction needs a new,
-- separately reviewed policy; it never rewrites evidence used by an applied receipt.
CREATE FUNCTION easy_auto_rechazar_mutacion_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es append-only', TG_TABLE_NAME USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER "politica_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "politicas_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "atestacion_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "atestaciones_cuenta_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "tercero_banco_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "terceros_banco_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "ejecucion_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "ejecuciones_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "recibo_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "recibos_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "pata_recibo_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "patas_recibo_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "reversion_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "reversiones_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "pata_reversion_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "patas_reversion_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();
CREATE TRIGGER "fallo_auto_mf_no_mutar_tr" BEFORE UPDATE OR DELETE OR TRUNCATE ON "fallos_auto_modo_facil" FOR EACH STATEMENT EXECUTE FUNCTION easy_auto_rechazar_mutacion_append_only();

-- Deferred proof makes it impossible to insert an orphan receipt, adopt a foreign
-- B4 operation, or persist only one transfer leg. It also requires the REGLA
-- origin in the immutable B4 event ledger created in the same transaction.
CREATE FUNCTION easy_auto_assert_recibo_ct()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record;
  v_recibo_id uuid;
  legs integer;
  distinct_movements integer;
  bad integer;
  v_sum bigint;
  origin_events integer;
BEGIN
  IF TG_TABLE_NAME='recibos_auto_modo_facil' THEN
    v_recibo_id:=NEW.id;
  ELSIF TG_TABLE_NAME='patas_recibo_auto_modo_facil' THEN
    v_recibo_id:=NEW.recibo_id;
  ELSIF TG_TABLE_NAME='eventos_justificacion_b4' THEN
    SELECT p.recibo_id INTO v_recibo_id FROM "patas_recibo_auto_modo_facil" p WHERE p.operacion_b4_id=NEW.operacion_id LIMIT 1;
  ELSIF TG_TABLE_NAME='decisiones_tercero_modo_facil' THEN
    IF NEW.origen<>'AUTO_RECIBO'::"OrigenTerceroModoFacil" OR NOT (NEW.snapshot ? 'autoReceiptId') THEN RETURN NULL; END IF;
    v_recibo_id:=CAST(NEW.snapshot->>'autoReceiptId' AS uuid);
  ELSE
    RAISE EXCEPTION 'Tabla inesperada para integridad de recibo automático';
  END IF;
  IF v_recibo_id IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO r FROM "recibos_auto_modo_facil" WHERE id=v_recibo_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  -- The original receipt is immutable evidence. Once a complete append-only
  -- reversal exists, B4/P1 originals are expected to be reverted and are checked
  -- by easy_auto_assert_reversion_ct instead of being revalidated as active.
  IF EXISTS (SELECT 1 FROM "reversiones_auto_modo_facil" rv WHERE rv.recibo_id=r.id) THEN RETURN NULL; END IF;
  SELECT count(*),count(DISTINCT p.movimiento_id),
         count(*) FILTER (WHERE o.movimiento_id<>p.movimiento_id OR o.solicitada_por_id<>r.actor_id OR o.estado<>'APLICADA'::"EstadoOperacionB4" OR o.revertida_at IS NOT NULL OR o.snapshot_solicitud->>'action' IS DISTINCT FROM 'confirmar' OR o.snapshot_solicitud->'borrador'->>'estado' IS DISTINCT FROM 'NO_REQUIERE' OR o.snapshot_solicitud->'borrador'->>'motivoNoRequiere' IS DISTINCT FROM p.motivo_no_requiere::text),
         COALESCE(sum(b4_importe_bancario_centimos(m.importe)),0)
    INTO legs,distinct_movements,bad,v_sum
    FROM "patas_recibo_auto_modo_facil" p
    JOIN "operaciones_justificacion_b4" o ON o.id=p.operacion_b4_id
    JOIN "movimientos_bancarios" m ON m.id=p.movimiento_id
   WHERE p.recibo_id=r.id;
  IF NOT EXISTS (SELECT 1 FROM "ejecuciones_auto_modo_facil" x WHERE x.id=r.ejecucion_id AND x.politica_id=r.politica_id AND x.actor_id=r.actor_id) THEN
    RAISE EXCEPTION 'Recibo automático no corresponde a su ejecución/política/actor' USING ERRCODE='23514';
  END IF;
  IF (r.clase='TRASPASO_PROPIO' AND (legs<>2 OR distinct_movements<>2 OR bad<>0 OR v_sum<>0))
     OR (r.clase='COMISION_BANCARIA' AND (legs<>1 OR distinct_movements<>1 OR bad<>0 OR v_sum>=0)) THEN
    RAISE EXCEPTION 'Recibo automático incompleto o B4 ajeno/incoherente' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO origin_events
    FROM "eventos_justificacion_b4" e JOIN "patas_recibo_auto_modo_facil" p ON p.operacion_b4_id=e.operacion_id
   WHERE p.recibo_id=r.id AND e.detalle->>'schema'='EASY_AUTO_ORIGIN_V1' AND e.detalle->>'origen'='REGLA' AND e.detalle->>'reciboAutoId'=r.id::text;
  IF origin_events<>legs THEN
    RAISE EXCEPTION 'Cada pata automática exige evento B4 REGLA trazable' USING ERRCODE='23514';
  END IF;
  IF r.clase='COMISION_BANCARIA' AND NOT EXISTS (
    SELECT 1 FROM "terceros_banco_auto_modo_facil" t JOIN "patas_recibo_auto_modo_facil" p ON p.recibo_id=r.id JOIN "movimientos_bancarios" m ON m.id=p.movimiento_id
     WHERE t.id=r.tercero_banco_id AND t.politica_id=r.politica_id AND t.cuenta_id=m.cuenta_id AND t.activo
       AND t.snapshot->>'derivadoDeCuentaBanco'='true'
  ) THEN RAISE EXCEPTION 'La comisión exige tercero bancario propio y activo de la cuenta' USING ERRCODE='23514'; END IF;
  IF r.clase='TRASPASO_PROPIO' AND EXISTS (
    SELECT 1 FROM "patas_recibo_auto_modo_facil" p LEFT JOIN "atestaciones_cuenta_auto_modo_facil" a ON a.politica_id=r.politica_id AND a.cuenta_id=(SELECT cuenta_id FROM movimientos_bancarios WHERE id=p.movimiento_id)
     WHERE p.recibo_id=r.id AND a.id IS NULL
  ) THEN RAISE EXCEPTION 'La pata automática no tiene titularidad propia explícitamente atestada' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM "patas_recibo_auto_modo_facil" p
    WHERE p.recibo_id=r.id AND NOT EXISTS (
      SELECT 1 FROM "decisiones_tercero_modo_facil" d
      WHERE d.movimiento_id=p.movimiento_id AND d.actor_id=r.actor_id
        AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" AND d.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
        AND d.snapshot->>'autoReceiptId'=r.id::text
        AND ((r.clase='TRASPASO_PROPIO' AND d.tipo_tercero='CUENTA_PROPIA'::"TipoTerceroModoFacil")
          OR (r.clase='COMISION_BANCARIA' AND d.tipo_tercero='BANCO'::"TipoTerceroModoFacil"))
        AND NOT EXISTS (SELECT 1 FROM "decisiones_tercero_modo_facil" undo_d WHERE undo_d.revierte_id=d.id)
    )
  ) THEN RAISE EXCEPTION 'Cada pata automática exige P1 AUTO_RECIBO trazable' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "recibo_auto_mf_integridad_ct" AFTER INSERT ON "recibos_auto_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_recibo_ct();
CREATE CONSTRAINT TRIGGER "pata_recibo_auto_mf_integridad_ct" AFTER INSERT ON "patas_recibo_auto_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_recibo_ct();
CREATE CONSTRAINT TRIGGER "evento_b4_auto_mf_integridad_ct" AFTER INSERT ON "eventos_justificacion_b4" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_recibo_ct();
CREATE CONSTRAINT TRIGGER "p1_auto_mf_integridad_ct" AFTER INSERT ON "decisiones_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_recibo_ct();

CREATE FUNCTION easy_auto_assert_reversion_ct()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r record; v_reversion_id uuid; legs integer; bad integer;
BEGIN
  IF TG_TABLE_NAME='reversiones_auto_modo_facil' THEN
    v_reversion_id:=NEW.id;
  ELSIF TG_TABLE_NAME='patas_reversion_auto_modo_facil' THEN
    v_reversion_id:=NEW.reversion_id;
  ELSIF TG_TABLE_NAME='decisiones_tercero_modo_facil' THEN
    IF NEW.accion<>'REVERTIDA'::"EstadoDecisionTerceroModoFacil" OR NEW.origen<>'AUTO_RECIBO'::"OrigenTerceroModoFacil" OR NOT (NEW.snapshot ? 'autoReceiptId') THEN RETURN NULL; END IF;
    SELECT id INTO v_reversion_id FROM "reversiones_auto_modo_facil" WHERE recibo_id=CAST(NEW.snapshot->>'autoReceiptId' AS uuid) LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Tabla inesperada para integridad de reversión automática';
  END IF;
  SELECT * INTO r FROM "reversiones_auto_modo_facil" WHERE id=v_reversion_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT count(*),count(*) FILTER (WHERE rev.revierte_operacion_id IS DISTINCT FROM p.operacion_b4_original_id OR rev.solicitada_por_id<>r.actor_id OR rev.estado<>'APLICADA'::"EstadoOperacionB4")
    INTO legs,bad
    FROM "patas_reversion_auto_modo_facil" p JOIN "operaciones_justificacion_b4" rev ON rev.id=p.operacion_b4_reversion_id
   WHERE p.reversion_id=r.id;
  IF legs<>(SELECT count(*) FROM "patas_recibo_auto_modo_facil" WHERE recibo_id=r.recibo_id) OR bad<>0 THEN
    RAISE EXCEPTION 'Reversión automática incompleta o no corresponde exactamente a todas las patas B4' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "patas_recibo_auto_modo_facil" p
    WHERE p.recibo_id=r.recibo_id AND NOT EXISTS (
      SELECT 1 FROM "decisiones_tercero_modo_facil" d
      JOIN "decisiones_tercero_modo_facil" undo_d ON undo_d.revierte_id=d.id AND undo_d.accion='REVERTIDA'::"EstadoDecisionTerceroModoFacil"
      WHERE d.movimiento_id=p.movimiento_id AND d.actor_id=r.actor_id
        AND d.accion='CONFIRMADA'::"EstadoDecisionTerceroModoFacil" AND d.origen='AUTO_RECIBO'::"OrigenTerceroModoFacil"
        AND d.snapshot->>'autoReceiptId'=r.recibo_id::text
    )
  ) THEN RAISE EXCEPTION 'La reversión automática exige revertir también todas las decisiones P1 AUTO_RECIBO' USING ERRCODE='23514'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "reversion_auto_mf_integridad_ct" AFTER INSERT ON "reversiones_auto_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_reversion_ct();
CREATE CONSTRAINT TRIGGER "pata_reversion_auto_mf_integridad_ct" AFTER INSERT ON "patas_reversion_auto_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_reversion_ct();
CREATE CONSTRAINT TRIGGER "p1_auto_mf_reversion_ct" AFTER INSERT ON "decisiones_tercero_modo_facil" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_reversion_ct();

-- Production identity is a database backstop. It cannot be replaced by a web env flag.
CREATE FUNCTION easy_auto_assert_production_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_database()<>'railway' OR current_user<>'postgres' THEN
    RAISE EXCEPTION 'EASY_AUTO_PRODUCTION_ONLY' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "politica_auto_mf_production_tr" BEFORE INSERT ON "politicas_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "atestacion_auto_mf_production_tr" BEFORE INSERT ON "atestaciones_cuenta_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "tercero_banco_auto_mf_production_tr" BEFORE INSERT ON "terceros_banco_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "ejecucion_auto_mf_production_tr" BEFORE INSERT ON "ejecuciones_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "recibo_auto_mf_production_tr" BEFORE INSERT ON "recibos_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "pata_recibo_auto_mf_production_tr" BEFORE INSERT ON "patas_recibo_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "reversion_auto_mf_production_tr" BEFORE INSERT ON "reversiones_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "pata_reversion_auto_mf_production_tr" BEFORE INSERT ON "patas_reversion_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
CREATE TRIGGER "fallo_auto_mf_production_tr" BEFORE INSERT ON "fallos_auto_modo_facil" FOR EACH ROW EXECUTE FUNCTION easy_auto_assert_production_insert();
