-- Rentabilidad IO: additive analytic namespace; never changes accounting source rows.
-- Apply only after review against isolated staging. No automatic execution.
DO $$ BEGIN
  IF current_database() <> 'io_staging_finanzas' OR current_user <> 'io_staging_finanzas' THEN
    RAISE EXCEPTION 'RENTABILIDAD_STAGING_REQUIRED' USING ERRCODE = '55000';
  END IF;
END $$;

CREATE TABLE rentabilidad_versiones (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('contract','product','tariffRule','costRule','externalCost','cost','reference','exception','decision')),
  stable_key TEXT NOT NULL CHECK (length(stable_key) BETWEEN 1 AND 240),
  version INTEGER NOT NULL CHECK (version > 0),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contrato_servicio_id INTEGER REFERENCES contratos_servicio(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  cliente_web_id INTEGER REFERENCES clientes_web(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contrato_draxton_id TEXT REFERENCES contratos_draxton(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  contrato_proveedor_draxton_id TEXT REFERENCES contratos_proveedor_draxton(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  personal_contrato_draxton_id TEXT REFERENCES personal_contratos_draxton(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(kind,stable_key,version)
);
CREATE INDEX rentabilidad_versiones_kind_key_idx ON rentabilidad_versiones(kind,stable_key,version DESC);
CREATE INDEX rentabilidad_versiones_contrato_idx ON rentabilidad_versiones(contrato_servicio_id);
CREATE INDEX rentabilidad_versiones_ggcc_idx ON rentabilidad_versiones(contrato_draxton_id);

CREATE TABLE rentabilidad_lineas (
  id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE CHECK (dedupe_key ~ '^[a-f0-9]{64}$'),
  codigo_contrato_isp TEXT NOT NULL CHECK(length(codigo_contrato_isp) BETWEEN 1 AND 240),
  fecha_fuente DATE NOT NULL,
  mes_servicio TEXT NOT NULL CHECK (mes_servicio ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  importe_base_centimos BIGINT NOT NULL,
  importe_base_decimal TEXT NOT NULL CHECK(importe_base_decimal ~ '^-?[0-9]+(\.[0-9]{1,40})?$'),
  source_hash TEXT NOT NULL CHECK (source_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  factura_isp_id INTEGER REFERENCES facturas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX rentabilidad_lineas_contrato_mes_idx ON rentabilidad_lineas(codigo_contrato_isp,mes_servicio);

CREATE TABLE rentabilidad_ejecuciones (
  id TEXT PRIMARY KEY,
  process TEXT NOT NULL CHECK(length(process) BETWEEN 1 AND 240),
  source_hash TEXT NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX rentabilidad_ejecuciones_fecha_idx ON rentabilidad_ejecuciones(created_at DESC);

CREATE TABLE rentabilidad_snapshots (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL CHECK(month ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  kind TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  source_hash TEXT NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK(jsonb_typeof(payload)='object'),
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(month,kind,version)
);

CREATE FUNCTION rentabilidad_append_only_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE previous_version INTEGER;
BEGIN
  IF current_database() <> 'io_staging_finanzas' OR current_user <> 'io_staging_finanzas' THEN
    RAISE EXCEPTION 'RENTABILIDAD_STAGING_REQUIRED' USING ERRCODE='55000';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'RENTABILIDAD_APPEND_ONLY' USING ERRCODE='55000';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM usuarios_admin WHERE id=NEW.actor_id AND activo=true AND rol::text='SUPER_ADMIN') THEN
    RAISE EXCEPTION 'RENTABILIDAD_SUPERADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rentabilidad:writer:v1',0));
  IF TG_TABLE_NAME='rentabilidad_versiones' THEN
    SELECT COALESCE(MAX(version),0) INTO previous_version FROM rentabilidad_versiones WHERE kind=NEW.kind AND stable_key=NEW.stable_key;
    IF NEW.version <> previous_version+1 THEN RAISE EXCEPTION 'RENTABILIDAD_VERSION_CONFLICT' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='rentabilidad_snapshots' THEN
    SELECT COALESCE(MAX(version),0) INTO previous_version FROM rentabilidad_snapshots WHERE month=NEW.month AND kind=NEW.kind;
    IF NEW.version <> previous_version+1 THEN RAISE EXCEPTION 'RENTABILIDAD_VERSION_CONFLICT' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER rentabilidad_versiones_append_only BEFORE INSERT OR UPDATE OR DELETE ON rentabilidad_versiones FOR EACH ROW EXECUTE FUNCTION rentabilidad_append_only_guard();
CREATE TRIGGER rentabilidad_lineas_append_only BEFORE INSERT OR UPDATE OR DELETE ON rentabilidad_lineas FOR EACH ROW EXECUTE FUNCTION rentabilidad_append_only_guard();
CREATE TRIGGER rentabilidad_ejecuciones_append_only BEFORE INSERT OR UPDATE OR DELETE ON rentabilidad_ejecuciones FOR EACH ROW EXECUTE FUNCTION rentabilidad_append_only_guard();
CREATE TRIGGER rentabilidad_snapshots_append_only BEFORE INSERT OR UPDATE OR DELETE ON rentabilidad_snapshots FOR EACH ROW EXECUTE FUNCTION rentabilidad_append_only_guard();

CREATE FUNCTION rentabilidad_no_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'RENTABILIDAD_APPEND_ONLY' USING ERRCODE='55000'; END $$;
CREATE TRIGGER rentabilidad_versiones_no_truncate BEFORE TRUNCATE ON rentabilidad_versiones EXECUTE FUNCTION rentabilidad_no_truncate();
CREATE TRIGGER rentabilidad_lineas_no_truncate BEFORE TRUNCATE ON rentabilidad_lineas EXECUTE FUNCTION rentabilidad_no_truncate();
CREATE TRIGGER rentabilidad_ejecuciones_no_truncate BEFORE TRUNCATE ON rentabilidad_ejecuciones EXECUTE FUNCTION rentabilidad_no_truncate();
CREATE TRIGGER rentabilidad_snapshots_no_truncate BEFORE TRUNCATE ON rentabilidad_snapshots EXECUTE FUNCTION rentabilidad_no_truncate();
