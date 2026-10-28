-- Promoción explícita Conciliar autorizada por Víctor, 28/10/2026.
-- SQL aditivo derivado del origen; no alterar migraciones staging aplicadas.
DO $$ BEGIN IF NOT (current_database()='railway' AND current_user='postgres') THEN RAISE EXCEPTION 'CONCILIAR_PRODUCTION_IDENTITY_REQUIRED'; END IF; END $$;
-- Corrección documentada de una ficha bancaria: sólo auditoría aditiva.
-- Aplicación manual exclusiva de staging después de copia y restauración comprobadas.
DO $$ BEGIN
  IF NOT (current_database()='railway' AND current_user='postgres') THEN
    RAISE EXCEPTION 'ACCOUNT_CORRECTION_STAGING_ONLY';
  END IF;
END $$;

CREATE TABLE auditorias_correccion_cuenta_bancaria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id TEXT NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT,
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  usuario_efectivo_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  ejecutor VARCHAR(80) NOT NULL,
  motivo VARCHAR(1000) NOT NULL,
  iban_anterior VARCHAR(80) NOT NULL,
  iban_nuevo VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT correccion_cuenta_iban_distinto_ck CHECK (iban_anterior <> iban_nuevo),
  CONSTRAINT correccion_cuenta_motivo_ck CHECK (length(btrim(motivo)) > 20)
);
CREATE INDEX correccion_cuenta_audit_fecha_idx ON auditorias_correccion_cuenta_bancaria(cuenta_id,created_at);
CREATE FUNCTION impedir_mutacion_auditoria_cuenta() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'ACCOUNT_AUDIT_APPEND_ONLY'; END $$;
CREATE TRIGGER correccion_cuenta_audit_append_only BEFORE UPDATE OR DELETE ON auditorias_correccion_cuenta_bancaria
  FOR EACH ROW EXECUTE FUNCTION impedir_mutacion_auditoria_cuenta();
