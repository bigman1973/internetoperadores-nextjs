-- Declaraciones humanas de titularidad. No activa políticas ni justifica movimientos.
-- Aditiva y append-only: una revocación se añade como una versión nueva.
CREATE TABLE declaraciones_titularidad_modo_facil (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id text NOT NULL REFERENCES cuentas_bancarias(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  estado text NOT NULL CHECK (estado IN ('DECLARADA','REVOCADA')),
  titular_declarado varchar(300) NOT NULL CHECK (length(btrim(titular_declarado)) BETWEEN 3 AND 300),
  fecha_declaracion date NOT NULL,
  confirmacion_declarada boolean NOT NULL CHECK (confirmacion_declarada = true),
  actor_id integer NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  referencia_evidencia varchar(500) NOT NULL CHECK (length(btrim(referencia_evidencia)) BETWEEN 12 AND 500),
  snapshot jsonb NOT NULL CHECK (snapshot->>'schema' = 'EASY_ACCOUNT_OWNERSHIP_DECLARATION_V1'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, version)
);
CREATE INDEX declaraciones_titularidad_modo_facil_cuenta_idx ON declaraciones_titularidad_modo_facil(cuenta_id,version DESC);
CREATE FUNCTION titularidad_declarada_modo_facil_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'TITULARIDAD_MODO_FACIL_APPEND_ONLY' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER titularidad_declarada_modo_facil_append_only_tr BEFORE UPDATE OR DELETE ON declaraciones_titularidad_modo_facil FOR EACH ROW EXECUTE FUNCTION titularidad_declarada_modo_facil_append_only();
CREATE TRIGGER titularidad_declarada_modo_facil_no_truncate_tr BEFORE TRUNCATE ON declaraciones_titularidad_modo_facil FOR EACH STATEMENT EXECUTE FUNCTION titularidad_declarada_modo_facil_append_only();
