-- P2/C11 — registro controlado de soportes confirming.
--
-- MIGRACIÓN ESTRICTAMENTE ADITIVA Y NO APLICADA por esta tarea.
-- No contiene DML de negocio, no toca B4, movimientos, cuentas, importes,
-- cobros, facturas emitidas ni automatiza confirmaciones. La declaración de una
-- fuente sigue siendo una decisión humana previa, auditada por actor; el worker
-- sólo puede leerla y registrar la versión privada que lifecycle ya archivó.
--
-- Precondiciones de integración: document_version_lifecycle,
-- document_version_snapshots, document_version_artifacts,
-- confirming_reading_attempts y C9 (naturaleza soporte) ya instalados.

CREATE TABLE confirming_reading_support_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_recibida_id TEXT NOT NULL REFERENCES facturas_recibidas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  onedrive_drive_id TEXT NOT NULL CHECK (length(btrim(onedrive_drive_id)) BETWEEN 1 AND 300),
  onedrive_item_id TEXT NOT NULL CHECK (length(btrim(onedrive_item_id)) BETWEEN 1 AND 300),
  tipo_detectado VARCHAR(16) NOT NULL CHECK (tipo_detectado IN ('BBVA_PDF','CAIXA_PDF','CAIXA_XLS','OTRO')),
  pareja_caixa_declarada_id VARCHAR(160) CHECK (pareja_caixa_declarada_id IS NULL OR pareja_caixa_declarada_id ~ '^[A-Za-z0-9_.:-]{1,160}$'),
  declared_by_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  declared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  CONSTRAINT confirming_reading_support_source_pair_shape_ck CHECK (
    (tipo_detectado IN ('CAIXA_PDF','CAIXA_XLS') AND pareja_caixa_declarada_id IS NOT NULL)
    OR (tipo_detectado IN ('BBVA_PDF','OTRO') AND pareja_caixa_declarada_id IS NULL)
  ),
  CONSTRAINT confirming_reading_support_source_item_uk UNIQUE (onedrive_drive_id, onedrive_item_id)
);

-- A declaration never substitutes a source invoice; it must point to an existing
-- C9 classified confirming support with the same stable Drive/item identity and
-- no active B4 documentary link. No amount/name/date heuristic appears here.
CREATE FUNCTION confirming_reading_support_source_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_naturaleza text;
  v_tipo text;
  v_drive text;
  v_item text;
BEGIN
  SELECT naturaleza_documento::text,tipo_soporte_financiero::text,onedrive_drive_id,onedrive_item_id
    INTO v_naturaleza,v_tipo,v_drive,v_item
    FROM facturas_recibidas
   WHERE id=NEW.factura_recibida_id
   FOR KEY SHARE;
  IF NOT FOUND
     OR v_naturaleza<>'SOPORTE_CONFIRMING_CLIENTE'
     OR v_tipo<>'CONFIRMING_CESION_DRAXTON'
     OR v_drive IS DISTINCT FROM NEW.onedrive_drive_id
     OR v_item IS DISTINCT FROM NEW.onedrive_item_id
     OR EXISTS (
       SELECT 1
       FROM documentos_conciliables d
       JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo
       WHERE d.factura_recibida_id=NEW.factura_recibida_id
     ) THEN
    RAISE EXCEPTION 'CONFIRMING_READING_CONTROLLED_SOURCE_INVALID' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER confirming_reading_support_source_guard_tr
  BEFORE INSERT ON confirming_reading_support_sources
  FOR EACH ROW EXECUTE FUNCTION confirming_reading_support_source_guard();

CREATE TABLE confirming_reading_support_source_revocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES confirming_reading_support_sources(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  revoked_by_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  motivo VARCHAR(1000) NOT NULL CHECK (length(btrim(motivo)) BETWEEN 1 AND 1000),
  idempotency_key CHAR(64) NOT NULL UNIQUE CHECK (idempotency_key ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  CONSTRAINT confirming_reading_support_revocation_source_uk UNIQUE (source_id)
);

CREATE TABLE confirming_reading_support_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES confirming_reading_support_sources(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  lifecycle_id UUID NOT NULL REFERENCES document_version_lifecycle(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  snapshot_id UUID NOT NULL REFERENCES document_version_snapshots(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version_documento INTEGER NOT NULL CHECK (version_documento >= 1),
  archivo_controlado_id UUID NOT NULL REFERENCES document_version_artifacts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  source_hash CHAR(64) NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  recorded_by_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  CONSTRAINT confirming_reading_support_version_source_snapshot_uk UNIQUE (source_id, snapshot_id),
  CONSTRAINT confirming_reading_support_version_snapshot_uk UNIQUE (snapshot_id)
);

-- The worker has already archived the bytes in its fenced transaction. This guard
-- makes a cross-source/snapshot/archive substitution impossible even if raw SQL
-- is called incorrectly: source item, lifecycle, snapshot hash and private handle
-- must all be the exact same controlled version.
CREATE FUNCTION confirming_reading_support_version_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_drive text;
  v_item text;
  v_snapshot_lifecycle uuid;
  v_snapshot_version integer;
  v_snapshot_hash char(64);
  v_snapshot_artifact text;
  v_snapshot_handle uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM confirming_reading_support_source_revocations r WHERE r.source_id=NEW.source_id) THEN
    RAISE EXCEPTION 'CONFIRMING_READING_CONTROLLED_SOURCE_REVOKED' USING ERRCODE='23514';
  END IF;
  SELECT onedrive_drive_id,onedrive_item_id INTO v_drive,v_item
    FROM confirming_reading_support_sources WHERE id=NEW.source_id FOR KEY SHARE;
  SELECT s.lifecycle_id,s.version_number,s.content_sha256,s.artifact_state::text,s.private_storage_handle
    INTO v_snapshot_lifecycle,v_snapshot_version,v_snapshot_hash,v_snapshot_artifact,v_snapshot_handle
    FROM document_version_snapshots s WHERE s.id=NEW.snapshot_id FOR KEY SHARE;
  IF NOT FOUND
     OR v_snapshot_lifecycle<>NEW.lifecycle_id
     OR v_snapshot_version<>NEW.version_documento
     OR v_snapshot_hash<>NEW.source_hash
     OR v_snapshot_artifact<>'CAPTURED'
     OR v_snapshot_handle<>NEW.archivo_controlado_id
     OR NOT EXISTS (
       SELECT 1 FROM document_version_lifecycle l
       WHERE l.id=NEW.lifecycle_id
         AND l.source='ONEDRIVE'
         AND l.source_item_key=(v_drive || ':' || v_item)
     ) THEN
    RAISE EXCEPTION 'CONFIRMING_READING_CONTROLLED_VERSION_INVALID' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER confirming_reading_support_version_guard_tr
  BEFORE INSERT ON confirming_reading_support_versions
  FOR EACH ROW EXECUTE FUNCTION confirming_reading_support_version_guard();

CREATE INDEX confirming_reading_support_source_factura_idx
  ON confirming_reading_support_sources(factura_recibida_id,declared_at DESC);
CREATE INDEX confirming_reading_support_source_pair_idx
  ON confirming_reading_support_sources(pareja_caixa_declarada_id,declared_at DESC)
  WHERE pareja_caixa_declarada_id IS NOT NULL;
CREATE UNIQUE INDEX confirming_reading_support_source_pair_role_uk
  ON confirming_reading_support_sources(pareja_caixa_declarada_id,tipo_detectado)
  WHERE pareja_caixa_declarada_id IS NOT NULL;
CREATE INDEX confirming_reading_support_version_lifecycle_idx
  ON confirming_reading_support_versions(lifecycle_id,version_documento DESC);

-- All three records are immutable. A correction is a distinct revocation or a
-- fresh human declaration; neither rewrites historical support nor B4.
CREATE FUNCTION confirming_reading_support_registry_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CONFIRMING_READING_SUPPORT_REGISTRY_APPEND_ONLY' USING ERRCODE='55000';
END $$;
CREATE TRIGGER confirming_reading_support_source_append_only_tr
  BEFORE UPDATE OR DELETE ON confirming_reading_support_sources
  FOR EACH ROW EXECUTE FUNCTION confirming_reading_support_registry_append_only();
CREATE TRIGGER confirming_reading_support_version_append_only_tr
  BEFORE UPDATE OR DELETE ON confirming_reading_support_versions
  FOR EACH ROW EXECUTE FUNCTION confirming_reading_support_registry_append_only();
CREATE TRIGGER confirming_reading_support_revocation_append_only_tr
  BEFORE UPDATE OR DELETE ON confirming_reading_support_source_revocations
  FOR EACH ROW EXECUTE FUNCTION confirming_reading_support_registry_append_only();
