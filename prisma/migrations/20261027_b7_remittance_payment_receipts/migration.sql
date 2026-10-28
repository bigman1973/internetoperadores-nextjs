-- B7: evidencia inmutable por abono de remesa y subconjunto explícito de facturas.
-- DDL únicamente aditivo; NO DML, backfill ni sincronización. Staging exclusivo.
DO $$ BEGIN
  IF current_database()<>'io_staging_finanzas' OR current_user<>'io_staging_finanzas' THEN
    RAISE EXCEPTION 'B7_REMESA_RECIBO_STAGING_ONLY';
  END IF;
  IF to_regclass('public.modo_facil_propuestas_cobro') IS NULL OR to_regclass('public.auditoria_remesa_b6') IS NULL
     OR to_regclass('public.vinculos_movimiento_documento') IS NULL OR to_regclass('public.estado_proyeccion_conciliar') IS NULL THEN
    RAISE EXCEPTION 'B7_REMESA_RECIBO_PREREQUISITES_MISSING';
  END IF;
END $$;
CREATE TYPE "EstadoReciboCobroRemesaB7" AS ENUM ('CONFIRMADO');
CREATE TABLE recibos_cobro_remesa_b7 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version TEXT NOT NULL DEFAULT 'B7_REMESA_RECIBO_V1' CHECK(schema_version='B7_REMESA_RECIBO_V1'),
  estado "EstadoReciboCobroRemesaB7" NOT NULL DEFAULT 'CONFIRMADO',
  remesa_id INTEGER NOT NULL REFERENCES remesas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  movimiento_id TEXT NOT NULL REFERENCES movimientos_bancarios(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  vinculo_b4_id UUID NOT NULL UNIQUE REFERENCES vinculos_movimiento_documento(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  operacion_b4_id UUID NOT NULL REFERENCES operaciones_justificacion_b4(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  auditoria_asociacion_b6_id UUID NOT NULL REFERENCES auditoria_remesa_b6(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  propuesta_id UUID NOT NULL REFERENCES modo_facil_propuestas_cobro(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  proposal_fingerprint CHAR(64) NOT NULL CHECK(proposal_fingerprint ~ '^[a-f0-9]{64}$'),
  composition_hash CHAR(64) NOT NULL CHECK(composition_hash ~ '^[a-f0-9]{64}$'),
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  idempotency_key UUID NOT NULL,
  request_hash CHAR(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
  source_hash CHAR(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  snapshot_solicitud JSONB NOT NULL CHECK(jsonb_typeof(snapshot_solicitud)='object'
    AND snapshot_solicitud->>'schemaVersion'='B7_REMESA_RECIBO_V1'
    AND (snapshot_solicitud->>'confirmacionHumana')::boolean IS TRUE
    AND snapshot_solicitud ?& ARRAY['propuestaId','movimientoId','fingerprint','compositionHash','remesaId']),
  snapshot_resultado JSONB NOT NULL CHECK(jsonb_typeof(snapshot_resultado)='object'
    AND snapshot_resultado->>'schemaVersion'='B7_REMESA_RECIBO_V1'
    AND snapshot_resultado ?& ARRAY['remesaId','movimientoId','vinculoB4Id','operacionB4Id','auditoriaB6Id','importeCentimos','facturas']
    AND jsonb_typeof(snapshot_resultado->'facturas')='array'),
  transaction_id BIGINT NOT NULL DEFAULT txid_current(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT recibo_remesa_b7_actor_key_uk UNIQUE(actor_id,idempotency_key)
);
CREATE TABLE lineas_recibo_cobro_remesa_b7 (
  recibo_id UUID NOT NULL REFERENCES recibos_cobro_remesa_b7(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 1 AND 2000),
  factura_emitida_id TEXT NOT NULL REFERENCES facturas_emitidas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  factura_isp_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  importe_centimos INTEGER NOT NULL CHECK(importe_centimos BETWEEN 1 AND 2147483647),
  source_hash CHAR(64) NOT NULL CHECK(source_hash ~ '^[a-f0-9]{64}$'),
  snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND snapshot->>'schemaVersion'='B7_REMESA_RECIBO_V1'
    AND snapshot ?& ARRAY['facturaEmitida','facturaISP','fechaBanco','importeCentimos','compositionOrdinals']
    AND jsonb_typeof(snapshot->'facturaEmitida')='object' AND jsonb_typeof(snapshot->'facturaISP')='object'
    AND jsonb_typeof(snapshot->'compositionOrdinals')='array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(recibo_id,ordinal), UNIQUE(recibo_id,factura_emitida_id), UNIQUE(recibo_id,factura_isp_id)
);
CREATE INDEX recibos_cobro_remesa_b7_remesa_created_idx ON recibos_cobro_remesa_b7(remesa_id,created_at DESC);
CREATE INDEX recibos_cobro_remesa_b7_movimiento_idx ON recibos_cobro_remesa_b7(movimiento_id);
CREATE INDEX lineas_recibo_remesa_b7_fi_idx ON lineas_recibo_cobro_remesa_b7(factura_emitida_id);
CREATE INDEX lineas_recibo_remesa_b7_isp_idx ON lineas_recibo_cobro_remesa_b7(factura_isp_id);
CREATE FUNCTION b7_remesa_recibo_rechazar_mutacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'B7_RECIBO_REMESA_APPEND_ONLY' USING ERRCODE='55000'; END $$;
CREATE TRIGGER recibos_cobro_remesa_b7_no_update_delete_tr BEFORE UPDATE OR DELETE ON recibos_cobro_remesa_b7
  FOR EACH ROW EXECUTE FUNCTION b7_remesa_recibo_rechazar_mutacion();
CREATE TRIGGER recibos_cobro_remesa_b7_no_truncate_tr BEFORE TRUNCATE ON recibos_cobro_remesa_b7
  FOR EACH STATEMENT EXECUTE FUNCTION b7_remesa_recibo_rechazar_mutacion();
CREATE TRIGGER lineas_recibo_cobro_remesa_b7_no_update_delete_tr BEFORE UPDATE OR DELETE ON lineas_recibo_cobro_remesa_b7
  FOR EACH ROW EXECUTE FUNCTION b7_remesa_recibo_rechazar_mutacion();
CREATE TRIGGER lineas_recibo_cobro_remesa_b7_no_truncate_tr BEFORE TRUNCATE ON lineas_recibo_cobro_remesa_b7
  FOR EACH STATEMENT EXECUTE FUNCTION b7_remesa_recibo_rechazar_mutacion();
-- Cada recibo y todas sus líneas se insertan atómicamente. No se puede añadir
-- una línea a un recibo comprometido en una transacción posterior.
CREATE FUNCTION b7_remesa_linea_misma_transaccion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_tx BIGINT;
BEGIN
  SELECT transaction_id INTO receipt_tx FROM recibos_cobro_remesa_b7 WHERE id=NEW.recibo_id LIMIT 1 FOR KEY SHARE;
  IF receipt_tx IS DISTINCT FROM txid_current() THEN
    RAISE EXCEPTION 'B7_RECIBO_REMESA_LINEA_FUERA_TRANSACCION' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER linea_recibo_misma_transaccion_tr BEFORE INSERT ON lineas_recibo_cobro_remesa_b7
  FOR EACH ROW EXECUTE FUNCTION b7_remesa_linea_misma_transaccion();
CREATE FUNCTION b7_assert_recibo_cobro_remesa_insertado(p_recibo UUID) RETURNS void LANGUAGE plpgsql AS $$
DECLARE r RECORD; proof RECORD; line_count INTEGER; lines_total BIGINT; bad INTEGER; capacity_bad INTEGER;
BEGIN
  SELECT * INTO r FROM recibos_cobro_remesa_b7 WHERE id=p_recibo LIMIT 1 FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'B7_RECIBO_REMESA_NO_ENCONTRADO' USING ERRCODE='23514'; END IF;
  IF current_database()<>'io_staging_finanzas' OR current_user<>'io_staging_finanzas' THEN
    RAISE EXCEPTION 'B7_REMESA_RECIBO_STAGING_ONLY' USING ERRCODE='42501';
  END IF;
  SELECT v.movimiento_id,v.importe_centimos,v.activo,d.tipo::text AS documento_tipo,d.remesa_id,d.activo AS documento_activo,
    o.id AS operacion_id,o.estado::text AS operacion_estado,o.revertida_at,o.solicitada_por_id,o.aprobada_por_id,e.estado::text AS estado_movimiento,
    b4_importe_bancario_centimos(m.importe) AS importe_banco,cl.suma,cl.lineas,cl.operaciones_aplicadas
  INTO proof FROM vinculos_movimiento_documento v
  JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
  JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id
  JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
  JOIN movimientos_bancarios m ON m.id=v.movimiento_id
  JOIN LATERAL(SELECT COALESCE(SUM(x.importe_centimos),0)::bigint AS suma,COUNT(*)::integer AS lineas,
    BOOL_AND(COALESCE(ox.estado='APLICADA'::"EstadoOperacionB4" AND ox.revertida_at IS NULL,false)) AS operaciones_aplicadas
    FROM vinculos_movimiento_documento x LEFT JOIN operaciones_justificacion_b4 ox ON ox.id=x.operacion_creacion_id
    WHERE x.movimiento_id=v.movimiento_id AND x.activo=true LIMIT 1) cl ON true
  WHERE v.id=r.vinculo_b4_id AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" LIMIT 1 FOR KEY SHARE OF v,d,o,e,m;
  IF NOT FOUND OR proof.movimiento_id IS DISTINCT FROM r.movimiento_id OR proof.operacion_id IS DISTINCT FROM r.operacion_b4_id
    OR proof.activo IS NOT TRUE OR proof.documento_activo IS NOT TRUE OR proof.documento_tipo IS DISTINCT FROM 'REMESA'
    OR proof.remesa_id IS DISTINCT FROM r.remesa_id OR proof.operacion_estado IS DISTINCT FROM 'APLICADA' OR proof.revertida_at IS NOT NULL
    OR proof.solicitada_por_id IS DISTINCT FROM r.actor_id OR proof.aprobada_por_id IS DISTINCT FROM r.actor_id
    OR proof.estado_movimiento IS DISTINCT FROM 'JUSTIFICADO' OR proof.importe_centimos<=0 OR proof.importe_banco IS NULL OR proof.importe_banco<=0
    OR proof.importe_centimos IS DISTINCT FROM proof.importe_banco OR proof.suma IS DISTINCT FROM proof.importe_banco
    OR proof.lineas<>1 OR proof.operaciones_aplicadas IS NOT TRUE THEN
    RAISE EXCEPTION 'B7_RECIBO_REMESA_B4_INEXACTO' USING ERRCODE='23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM auditoria_remesa_b6 a WHERE a.id=r.auditoria_asociacion_b6_id AND a.remesa_id=r.remesa_id
    AND a.accion='ASOCIACION_FACTURAS_CONFIRMADA'::"AccionAuditoriaRemesaB6" LIMIT 1) THEN
    RAISE EXCEPTION 'B7_RECIBO_REMESA_B6_INEXACTO' USING ERRCODE='23514';
  END IF;
  SELECT COUNT(*),COALESCE(SUM(l.importe_centimos),0),COUNT(*) FILTER(WHERE
    fi.factura_isp_id IS DISTINCT FROM l.factura_isp_id OR f.remesa_id IS DISTINCT FROM r.remesa_id
    OR fi.total::text !~ '^[0-9]+(\.[0-9]{1,2})?$' OR f.total::text !~ '^[0-9]+(\.[0-9]{1,2})?$'
    OR (fi.total::numeric*100)<=0 OR (fi.total::numeric*100)<l.importe_centimos
    OR (fi.total::numeric*100) IS DISTINCT FROM (f.total::numeric*100)
    OR fi.fecha IS NULL OR f.fecha IS NULL OR fi.fecha::date>m.fecha_operacion::date OR f.fecha::date>m.fecha_operacion::date
    OR l.snapshot->>'schemaVersion' IS DISTINCT FROM 'B7_REMESA_RECIBO_V1')
  INTO line_count,lines_total,bad FROM lineas_recibo_cobro_remesa_b7 l
  JOIN facturas_emitidas fi ON fi.id=l.factura_emitida_id JOIN facturas f ON f.id=l.factura_isp_id
  JOIN movimientos_bancarios m ON m.id=r.movimiento_id WHERE l.recibo_id=r.id LIMIT 1;
  IF line_count<1 OR line_count>2000 OR lines_total IS DISTINCT FROM proof.importe_centimos OR bad<>0 THEN
    RAISE EXCEPTION 'B7_RECIBO_REMESA_LINEAS_INEXACTAS' USING ERRCODE='23514';
  END IF;
  -- Bloquear la fuente FI, no únicamente las líneas existentes: también protege
  -- la capacidad cuando dos confirmaciones aún no han insertado su primer recibo.
  PERFORM 1 FROM facturas_emitidas fi WHERE fi.id IN(SELECT factura_emitida_id FROM lineas_recibo_cobro_remesa_b7 WHERE recibo_id=r.id LIMIT 2000)
    ORDER BY fi.id LIMIT 2000 FOR UPDATE;
  SELECT COUNT(*) INTO capacity_bad FROM(
    SELECT l.factura_emitida_id,COALESCE(SUM(l.importe_centimos) FILTER(WHERE v.activo=true AND d.activo=true
      AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"),0) AS vivo,
      MAX((fi.total::numeric*100)::bigint) AS total_fi
    FROM lineas_recibo_cobro_remesa_b7 l JOIN facturas_emitidas fi ON fi.id=l.factura_emitida_id JOIN recibos_cobro_remesa_b7 rr ON rr.id=l.recibo_id
    LEFT JOIN vinculos_movimiento_documento v ON v.id=rr.vinculo_b4_id LEFT JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id
    LEFT JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id
    WHERE l.factura_emitida_id IN(SELECT factura_emitida_id FROM lineas_recibo_cobro_remesa_b7 WHERE recibo_id=r.id LIMIT 2000)
    GROUP BY l.factura_emitida_id LIMIT 2000) capacity WHERE vivo>total_fi OR total_fi<=0 LIMIT 1;
  IF capacity_bad<>0 THEN RAISE EXCEPTION 'B7_RECIBO_REMESA_CAPACIDAD_EXCEDIDA' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM lineas_recibo_cobro_remesa_b7 l
    JOIN documentos_conciliables d ON d.factura_emitida_id=l.factura_emitida_id AND d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable" AND d.activo=true
    JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE l.recibo_id=r.id LIMIT 1) THEN
    RAISE EXCEPTION 'B7_RECIBO_REMESA_SOLAPAMIENTO_DIRECTO' USING ERRCODE='23514';
  END IF;
  RETURN;
END $$;
CREATE FUNCTION b7_recibo_remesa_guard_ct() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM b7_assert_recibo_cobro_remesa_insertado(NEW.id); RETURN NULL; END $$;
-- Una sola validación diferida por recibo, no una por cada factura de la remesa.
CREATE CONSTRAINT TRIGGER recibo_cobro_remesa_b7_integridad_ct AFTER INSERT ON recibos_cobro_remesa_b7
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b7_recibo_remesa_guard_ct();
CREATE TRIGGER recibo_cobro_remesa_b7_dirty_tr AFTER INSERT ON recibos_cobro_remesa_b7
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER linea_recibo_cobro_remesa_b7_dirty_tr AFTER INSERT ON lineas_recibo_cobro_remesa_b7
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();

-- Protección simétrica: una confirmación B4 directa futura no puede reutilizar
-- una FI que ya consume un recibo REMESA vigente. Se bloquea la FI común bajo
-- SERIALIZABLE tanto en el recibo como en esta comprobación de la línea directa.
CREATE FUNCTION b7_guard_fi_directa_sin_recibo_remesa() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fi_id TEXT;
BEGIN
  SELECT d.factura_emitida_id INTO fi_id FROM vinculos_movimiento_documento v
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id AND d.activo=true AND d.tipo='FACTURA_EMITIDA'::"TipoDocumentoConciliable"
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE v.id=NEW.id AND v.activo=true AND v.tipo_linea='DOCUMENTO'::"TipoLineaVinculo" LIMIT 1;
  IF fi_id IS NULL THEN RETURN NULL; END IF;
  PERFORM 1 FROM facturas_emitidas WHERE id=fi_id LIMIT 1 FOR UPDATE;
  IF EXISTS(SELECT 1 FROM lineas_recibo_cobro_remesa_b7 l JOIN recibos_cobro_remesa_b7 r ON r.id=l.recibo_id
    JOIN vinculos_movimiento_documento v ON v.id=r.vinculo_b4_id AND v.activo=true
    JOIN documentos_conciliables d ON d.id=v.documento_conciliable_id AND d.activo=true AND d.tipo='REMESA'::"TipoDocumentoConciliable"
    JOIN operaciones_justificacion_b4 o ON o.id=v.operacion_creacion_id AND o.estado='APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL
    JOIN estado_justificacion_movimientos e ON e.movimiento_id=v.movimiento_id AND e.estado='JUSTIFICADO'::"EstadoJustificacionMovimiento"
    WHERE l.factura_emitida_id=fi_id LIMIT 1) THEN
    RAISE EXCEPTION 'B7_RECIBO_REMESA_SOLAPAMIENTO_DIRECTO' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER b7_fi_directa_sin_recibo_remesa_ct AFTER INSERT OR UPDATE ON vinculos_movimiento_documento
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b7_guard_fi_directa_sin_recibo_remesa();
