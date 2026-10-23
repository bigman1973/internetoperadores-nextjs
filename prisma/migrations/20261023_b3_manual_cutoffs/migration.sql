-- B3 cortes manuales de cobertura: estrictamente aditivo.
-- Esta bitácora NO actualiza cuentas_bancarias, movimientos_bancarios, saldos,
-- enlaces B4/B5/B6 ni importa/sincroniza nada. Cada fila es una atestación humana.
CREATE TYPE "MotivoCorteCoberturaB3" AS ENUM ('EXTRACTO_REVISADO_MANUALMENTE');

CREATE TABLE "cortes_cobertura_manual_b3" (
  "id" UUID NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "fecha_corte" DATE NOT NULL,
  "saldo_centimos" BIGINT NOT NULL,
  "motivo" "MotivoCorteCoberturaB3" NOT NULL,
  "nota" TEXT NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "idempotency_key" VARCHAR(160) NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "source_version" CHAR(64) NOT NULL,
  "version" INTEGER NOT NULL,
  "confirmed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cortes_cobertura_manual_b3_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cortes_cobertura_manual_b3_saldo_safe_json_ck"
    CHECK ("saldo_centimos" BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT "cortes_cobertura_manual_b3_nota_ck"
    CHECK (length(btrim("nota")) BETWEEN 8 AND 2000),
  CONSTRAINT "cortes_cobertura_manual_b3_version_ck" CHECK ("version" > 0),
  CONSTRAINT "cortes_cobertura_manual_b3_payload_hash_ck"
    CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "cortes_cobertura_manual_b3_source_version_ck"
    CHECK ("source_version" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "cortes_cobertura_manual_b3_actor_id_idempotency_key_key"
  ON "cortes_cobertura_manual_b3"("actor_id", "idempotency_key");
CREATE UNIQUE INDEX "cortes_cobertura_manual_b3_cuenta_id_version_key"
  ON "cortes_cobertura_manual_b3"("cuenta_id", "version");
CREATE INDEX "cortes_cobertura_manual_b3_cuenta_id_confirmed_at_idx"
  ON "cortes_cobertura_manual_b3"("cuenta_id", "confirmed_at");
ALTER TABLE "cortes_cobertura_manual_b3"
  ADD CONSTRAINT "cortes_cobertura_manual_b3_cuenta_id_fkey"
  FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "cortes_cobertura_manual_b3"
  ADD CONSTRAINT "cortes_cobertura_manual_b3_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- La API toma un advisory lock por cuenta y compara source_version/version. Esta
-- defensa adicional impide insertar una versión salteada por SQL directo.
CREATE OR REPLACE FUNCTION b3_validar_corte_manual() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_version integer;
BEGIN
  IF NEW."fecha_corte" > CURRENT_DATE THEN
    RAISE EXCEPTION 'B3 corte futuro no permitido' USING ERRCODE='22007';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "usuarios_admin" u WHERE u.id=NEW."actor_id" AND u.activo) THEN
    RAISE EXCEPTION 'B3 actor inactivo o inexistente' USING ERRCODE='42501';
  END IF;
  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM "cortes_cobertura_manual_b3" WHERE cuenta_id=NEW."cuenta_id";
  IF NEW.version <> v_version THEN
    RAISE EXCEPTION 'B3 versión de corte no consecutiva' USING ERRCODE='40001';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER b3_validar_corte_manual_insert
  BEFORE INSERT ON "cortes_cobertura_manual_b3"
  FOR EACH ROW EXECUTE FUNCTION b3_validar_corte_manual();

CREATE OR REPLACE FUNCTION b3_corte_manual_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'B3 confirmación de corte inmutable' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER b3_corte_manual_inmutable
  BEFORE UPDATE OR DELETE ON "cortes_cobertura_manual_b3"
  FOR EACH ROW EXECUTE FUNCTION b3_corte_manual_inmutable();
