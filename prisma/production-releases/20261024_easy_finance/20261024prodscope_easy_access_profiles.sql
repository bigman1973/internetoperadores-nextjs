-- Release productivo dedicado 20261024: sólo railway/postgres; no usar Prisma.
-- Fuente staging auditada: 20261024_easy_access_profiles/migration.sql SHA-256 ba8f28600b06f8a6327996ca9b6d8a3fe82fa63ed6bcc8dad3f51d0ba95e4f00.
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

CREATE TABLE perfiles_acceso_modo_facil (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 usuario_id integer NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 version integer NOT NULL CHECK (version>0),
 perfil text NOT NULL CHECK(perfil IN ('MODO_FACIL_ONLY','RESTABLECIDO')),
 actor_id integer NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
 instruccion text NOT NULL CHECK(length(instruccion) BETWEEN 10 AND 1000),
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(usuario_id,version)
);
CREATE INDEX perfiles_acceso_modo_facil_user_idx ON perfiles_acceso_modo_facil(usuario_id,version DESC);
CREATE FUNCTION perfiles_acceso_modo_facil_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'EASY_ACCESS_APPEND_ONLY'; END IF;
 IF current_database()<>'railway' OR current_user<>'postgres' THEN RAISE EXCEPTION 'EASY_ACCESS_PRODUCTION_ONLY'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('easy-profile:'||NEW.usuario_id::text,0));
 IF NEW.version<>COALESCE((SELECT MAX(version)+1 FROM perfiles_acceso_modo_facil WHERE usuario_id=NEW.usuario_id),1) THEN RAISE EXCEPTION 'EASY_ACCESS_VERSION_CONFLICT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM usuarios_admin WHERE id=NEW.actor_id AND activo AND rol::text IN ('SUPER_ADMIN','GERENTE')) THEN RAISE EXCEPTION 'EASY_ACCESS_ACTOR_INVALID'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER perfiles_acceso_modo_facil_guard_trigger BEFORE INSERT OR UPDATE OR DELETE ON perfiles_acceso_modo_facil FOR EACH ROW EXECUTE FUNCTION perfiles_acceso_modo_facil_guard();
