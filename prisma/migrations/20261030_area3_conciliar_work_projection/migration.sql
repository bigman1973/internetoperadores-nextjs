-- Area 3 only. Derived read-side data; no financial source/backfill mutation.
-- Apply after backup. A manual initial rebuild prepares existing rows.
ALTER TABLE conciliar_proyecciones ADD COLUMN read_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE estado_proyeccion_conciliar ADD COLUMN read_accounts jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE area3_conciliar_projection_changes (
  kind text NOT NULL,
  source_id text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(kind,source_id)
);
CREATE FUNCTION area3_conciliar_record_projection_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; source_key text;
BEGIN
  -- Las acciones/refrescos bloquean primero este singleton. Mantener el mismo
  -- orden en cada trigger evita que un writer retenga una fila de cola mientras
  -- espera al estado y un refresco retenga el estado mientras espera la cola.
  UPDATE estado_proyeccion_conciliar SET dirty_at=CURRENT_TIMESTAMP,dirty_reason='AREA3_AFFECTED_CHANGE' WHERE singleton=true;
  IF TG_OP='DELETE' THEN row_data=to_jsonb(OLD); ELSE row_data=to_jsonb(NEW); END IF;
  source_key=COALESCE(row_data->>TG_ARGV[1],'');
  IF source_key<>'' THEN
    INSERT INTO area3_conciliar_projection_changes(kind,source_id) VALUES(TG_ARGV[0],source_key)
    ON CONFLICT(kind,source_id) DO UPDATE SET changed_at=CURRENT_TIMESTAMP;
  END IF;
  IF TG_OP='UPDATE' AND COALESCE(to_jsonb(OLD)->>TG_ARGV[1],'')<>source_key THEN
    INSERT INTO area3_conciliar_projection_changes(kind,source_id) VALUES(TG_ARGV[0],to_jsonb(OLD)->>TG_ARGV[1])
    ON CONFLICT(kind,source_id) DO UPDATE SET changed_at=CURRENT_TIMESTAMP;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER area3_conciliar_change_movement AFTER INSERT OR UPDATE OR DELETE ON movimientos_bancarios FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','id');
CREATE TRIGGER area3_conciliar_change_b4_state AFTER INSERT OR UPDATE OR DELETE ON estado_justificacion_movimientos FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_b4_link AFTER INSERT OR UPDATE OR DELETE ON vinculos_movimiento_documento FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_received AFTER INSERT OR UPDATE OR DELETE ON facturas_recibidas FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('RECEIVED','id');
CREATE TRIGGER area3_conciliar_change_issued AFTER INSERT OR UPDATE OR DELETE ON facturas_emitidas FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('ISSUED','id');
CREATE TRIGGER area3_conciliar_change_proposal AFTER INSERT OR UPDATE OR DELETE ON modo_facil_propuestas_cobro FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_payroll AFTER INSERT OR UPDATE OR DELETE ON nominas FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('PAYROLL','id');
CREATE TRIGGER area3_conciliar_change_request AFTER INSERT OR UPDATE OR DELETE ON gestiones_pendientes_movimiento_b5 FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_attachment AFTER INSERT OR UPDATE OR DELETE ON adjuntos_pendientes_b5 FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_account AFTER INSERT OR UPDATE OR DELETE ON cuentas_bancarias FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('ACCOUNT','id');
CREATE TRIGGER area3_conciliar_change_remittance AFTER INSERT OR UPDATE OR DELETE ON remesas FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('REMITTANCE','id');
CREATE TRIGGER area3_conciliar_change_b4_operation AFTER INSERT OR UPDATE OR DELETE ON operaciones_justificacion_b4 FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_liquidation AFTER INSERT OR UPDATE OR DELETE ON liquidaciones_confirming_documentales FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('CONFIRMING','confirming_id');
CREATE TRIGGER area3_conciliar_change_support AFTER INSERT OR UPDATE OR DELETE ON soportes_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE INDEX area3_conciliar_projection_work_sort ON conciliar_proyecciones(tab,(abs(importe_centimos::bigint)),id);
CREATE INDEX area3_conciliar_projection_received_source ON conciliar_proyecciones((source->>'facturaRecibidaId'));
CREATE INDEX area3_conciliar_projection_issued_source ON conciliar_proyecciones((source->>'facturaEmitidaId'));
UPDATE estado_proyeccion_conciliar SET dirty_at=CURRENT_TIMESTAMP,dirty_reason='AREA3_INITIAL_READSIDE_REBUILD_REQUIRED' WHERE singleton=true;

-- Additional documentary evidence changes only invalidate the derived work queue.
CREATE TRIGGER area3_conciliar_change_request_audit AFTER INSERT ON auditorias_gestiones_pendientes_b5 FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_p1 AFTER INSERT ON decisiones_tercero_modo_facil FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('MOVEMENT','movimiento_id');
CREATE TRIGGER area3_conciliar_change_liquidation_line AFTER INSERT ON lineas_liquidacion_confirming FOR EACH ROW EXECUTE FUNCTION area3_conciliar_record_projection_change('ISSUED','factura_emitida_id');
