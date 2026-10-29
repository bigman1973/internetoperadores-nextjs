-- P2/C11 — lecturas documentales confirming BBVA y CaixaBank.
--
-- Migración estrictamente aditiva. No contiene DML, no comprueba ni selecciona una
-- base por nombre y no reemplaza las guardas runtime de actor/fence/lifecycle.
-- No toca movimientos, cuentas, B4, facturas emitidas ni estados de cobro.
-- El integrador debe ejecutar las guardas de permisos y de snapshot dentro de su
-- misma transacción P2 antes de insertar; esta tabla sólo deja evidencia privada
-- append-only del intento y de su resultado C11.

CREATE TABLE confirming_reading_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_kind VARCHAR(16) NOT NULL CHECK (attempt_kind IN ('FUENTE','RESULTADO_C11')),
  resolution_key VARCHAR(180) NOT NULL CHECK (length(btrim(resolution_key)) BETWEEN 1 AND 180),
  lifecycle_id UUID NOT NULL REFERENCES document_version_lifecycle(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  snapshot_id UUID NOT NULL REFERENCES document_version_snapshots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  factura_recibida_id TEXT NOT NULL REFERENCES facturas_recibidas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  archivo_controlado_id VARCHAR(220) NOT NULL CHECK (length(btrim(archivo_controlado_id)) BETWEEN 1 AND 220),
  onedrive_drive_id TEXT NOT NULL CHECK (length(btrim(onedrive_drive_id)) BETWEEN 1 AND 300),
  onedrive_item_id TEXT NOT NULL CHECK (length(btrim(onedrive_item_id)) BETWEEN 1 AND 300),
  source_hash CHAR(64) NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  source_role VARCHAR(32) NOT NULL CHECK (source_role IN ('LIQUIDACION_PDF','DETALLE_FACTURAS_XLS','NO_CLASIFICADO','EVIDENCIA_C11')),
  parser_code VARCHAR(64) CHECK (parser_code IS NULL OR parser_code IN ('C11_BBVA_PDF_PAGINA_2_COLUMNAS_FISICAS','C11_CAIXA_PDF','C11_CAIXA_XLS')),
  banco_origen VARCHAR(16) CHECK (banco_origen IS NULL OR banco_origen IN ('BBVA','CAIXABANK')),
  pareja_caixa_declarada_id VARCHAR(160) CHECK (pareja_caixa_declarada_id IS NULL OR pareja_caixa_declarada_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  motivos JSONB NOT NULL CHECK (jsonb_typeof(motivos)='array'),
  resumen JSONB NOT NULL CHECK (
    jsonb_typeof(resumen)='object'
    AND resumen ?& ARRAY['nominalCentimos','facturasDocumentales','interesesCentimos','comisionCentimos','ivaComisionCentimos','netoBancarioCentimos','cuentaDepositariaDeclarada']
    AND jsonb_typeof(resumen->'cuentaDepositariaDeclarada')='boolean'
  ),
  -- Datos privados mínimos de parser necesarios para reconstruir C11. Nunca se
  -- leen por la API/UI: no hay rawText, cliente, ruta, URL ni bytes.
  parsed_private JSONB NOT NULL CHECK (jsonb_typeof(parsed_private)='object'),
  outcome VARCHAR(40) NOT NULL CHECK (outcome IN ('REVISAR','ELEGIBLE_C11','PROPUESTA_CONFIRMACION_HUMANA')),
  liquidacion_id UUID REFERENCES liquidaciones_confirming_documentales(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  movimiento_id TEXT REFERENCES movimientos_bancarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  idempotency_key CHAR(64) NOT NULL UNIQUE CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT confirming_reading_attempt_shape_ck CHECK (
    (attempt_kind='FUENTE'
      AND source_role IN ('LIQUIDACION_PDF','DETALLE_FACTURAS_XLS','NO_CLASIFICADO')
      AND liquidacion_id IS NULL AND movimiento_id IS NULL
      AND outcome IN ('REVISAR','ELEGIBLE_C11'))
    OR
    (attempt_kind='RESULTADO_C11'
      AND source_role='EVIDENCIA_C11' AND parser_code IS NULL
      AND ((outcome='REVISAR' AND liquidacion_id IS NULL AND movimiento_id IS NULL)
        OR (outcome='PROPUESTA_CONFIRMACION_HUMANA' AND liquidacion_id IS NOT NULL AND movimiento_id IS NOT NULL)))
  ),
  CONSTRAINT confirming_reading_attempt_bank_role_ck CHECK (
    (banco_origen='BBVA' AND source_role IN ('LIQUIDACION_PDF','EVIDENCIA_C11') AND pareja_caixa_declarada_id IS NULL)
    OR (banco_origen='CAIXABANK' AND source_role IN ('LIQUIDACION_PDF','DETALLE_FACTURAS_XLS','EVIDENCIA_C11'))
    OR (banco_origen IS NULL AND source_role='NO_CLASIFICADO')
  )
);

CREATE INDEX confirming_reading_attempt_resolution_created_idx
  ON confirming_reading_attempts(resolution_key,created_at DESC);
CREATE INDEX confirming_reading_attempt_snapshot_idx
  ON confirming_reading_attempts(snapshot_id,created_at DESC);
CREATE INDEX confirming_reading_attempt_outcome_created_idx
  ON confirming_reading_attempts(outcome,created_at DESC);
CREATE INDEX confirming_reading_attempt_pair_idx
  ON confirming_reading_attempts(pareja_caixa_declarada_id,created_at DESC)
  WHERE pareja_caixa_declarada_id IS NOT NULL;

-- El snapshot debe ser del mismo lifecycle, mismo hash y estar ya archivado. La
-- guardia no sustituye el fence runtime: sólo impide referencias cruzadas.
CREATE FUNCTION confirming_reading_attempt_snapshot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE snapshot_lifecycle uuid; snapshot_hash char(64); snapshot_artifact text;
BEGIN
  SELECT lifecycle_id,content_sha256,artifact_state::text
    INTO snapshot_lifecycle,snapshot_hash,snapshot_artifact
    FROM document_version_snapshots
    WHERE id=NEW.snapshot_id FOR KEY SHARE;
  IF NOT FOUND OR snapshot_lifecycle<>NEW.lifecycle_id OR snapshot_hash<>NEW.source_hash OR snapshot_artifact<>'CAPTURED' THEN
    RAISE EXCEPTION 'CONFIRMING_READING_ATTEMPT_SNAPSHOT_NOT_CONTROLLED' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM facturas_recibidas fr
    WHERE fr.id=NEW.factura_recibida_id
      AND fr.onedrive_drive_id=NEW.onedrive_drive_id
      AND fr.onedrive_item_id=NEW.onedrive_item_id
  ) THEN
    RAISE EXCEPTION 'CONFIRMING_READING_ATTEMPT_REGISTERED_SOURCE_REQUIRED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER confirming_reading_attempt_snapshot_guard_tr
  BEFORE INSERT ON confirming_reading_attempts
  FOR EACH ROW EXECUTE FUNCTION confirming_reading_attempt_snapshot_guard();

CREATE FUNCTION confirming_reading_attempt_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CONFIRMING_READING_ATTEMPT_APPEND_ONLY' USING ERRCODE='55000';
END $$;
CREATE TRIGGER confirming_reading_attempt_append_only_tr
  BEFORE UPDATE OR DELETE OR TRUNCATE ON confirming_reading_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION confirming_reading_attempt_append_only();
