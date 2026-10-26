CREATE TABLE asistente_configuracion (
  id text PRIMARY KEY CHECK (id = 'default'),
  modo text NOT NULL DEFAULT 'extractivo' CHECK (modo IN ('extractivo','local','desactivado')),
  modelo text,
  tono text NOT NULL DEFAULT 'cercano y profesional',
  bienvenida text NOT NULL DEFAULT 'Hola, soy el asistente virtual de Internet Operadores. ¿En qué puedo ayudarte?',
  horario_humano jsonb NOT NULL DEFAULT '{"zona":"Europe/Madrid","dias":[1,2,3,4,5],"inicio":"09:00","fin":"18:00"}'::jsonb,
  temas_prohibidos text[] NOT NULL DEFAULT ARRAY[]::text[],
  retencion_meses integer NOT NULL DEFAULT 12 CHECK (retencion_meses BETWEEN 1 AND 120),
  consentimiento_version text NOT NULL DEFAULT '2026-10-borrador',
  actualizado_por integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asistente_config_cambios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campo text NOT NULL,
  antes jsonb,
  despues jsonb,
  actor_id integer,
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION asistente_bloquear_cambio_config() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'asistente_config_cambios es append-only';
END;
$$;

CREATE TRIGGER asistente_config_cambios_append_only
  BEFORE UPDATE OR DELETE ON asistente_config_cambios
  FOR EACH ROW EXECUTE FUNCTION asistente_bloquear_cambio_config();

CREATE TABLE asistente_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  espacio text NOT NULL CHECK (espacio IN ('PUBLICO','CLIENTE','INTERNO')),
  tipo text NOT NULL CHECK (tipo IN ('WEB','FAQ','TARIFA','PDF','DOCX','XLSX','TXT','MD','APRENDIZAJE')),
  origen text,
  estado text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','PUBLICADO','ARCHIVADO','ERROR')),
  roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  tenant_cliente_id integer,
  version_actual integer NOT NULL DEFAULT 1 CHECK (version_actual > 0),
  usos integer NOT NULL DEFAULT 0 CHECK (usos >= 0),
  creado_por integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asistente_documento_versiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES asistente_documentos(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  contenido text NOT NULL,
  checksum text NOT NULL,
  creado_por integer,
  aprobado_por integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, version)
);

CREATE TABLE asistente_fragmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES asistente_documentos(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES asistente_documento_versiones(id) ON DELETE CASCADE,
  orden integer NOT NULL CHECK (orden >= 0),
  titulo text NOT NULL,
  contenido text NOT NULL,
  contenido_norm text NOT NULL,
  tsv tsvector GENERATED ALWAYS AS (to_tsvector('spanish', contenido_norm)) STORED,
  espacio text NOT NULL CHECK (espacio IN ('PUBLICO','CLIENTE','INTERNO')),
  roles text[] NOT NULL DEFAULT ARRAY[]::text[],
  tenant_cliente_id integer,
  activo boolean NOT NULL DEFAULT true,
  embedding real[],
  url_fuente text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version_id, orden)
);

CREATE INDEX asistente_documentos_espacio_estado_idx ON asistente_documentos (espacio, estado);
CREATE INDEX asistente_documentos_tenant_idx ON asistente_documentos (tenant_cliente_id);
CREATE INDEX asistente_versiones_documento_idx ON asistente_documento_versiones (documento_id, version);
CREATE INDEX asistente_fragmentos_tsv_idx ON asistente_fragmentos USING GIN (tsv);
CREATE INDEX asistente_fragmentos_espacio_activo_idx ON asistente_fragmentos (espacio, activo);
CREATE INDEX asistente_fragmentos_tenant_activo_idx ON asistente_fragmentos (tenant_cliente_id, activo);

CREATE TABLE asistente_conversaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canal text NOT NULL CHECK (canal IN ('PUBLICO','INTERNO','CLIENTE')),
  usuario_id integer,
  visitante_hash text,
  estado text NOT NULL DEFAULT 'ABIERTA' CHECK (estado IN ('ABIERTA','ESCALADA','CERRADA')),
  escalado_motivo text,
  mensajes integer NOT NULL DEFAULT 0 CHECK (mensajes >= 0),
  borrar_despues timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asistente_mensajes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  rol text NOT NULL CHECK (rol IN ('usuario','asistente')),
  texto_anon text NOT NULL,
  fuentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  sin_fuente boolean NOT NULL DEFAULT false,
  puntuacion real,
  intent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE asistente_valoraciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensaje_id uuid NOT NULL REFERENCES asistente_mensajes(id) ON DELETE CASCADE,
  util boolean NOT NULL,
  comentario_anon text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mensaje_id)
);

CREATE TABLE asistente_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('EMPRESA','HOGAR')),
  codigo_postal text NOT NULL,
  conexion_actual text,
  problemas text[] NOT NULL DEFAULT ARRAY[]::text[],
  usuarios integer NOT NULL CHECK (usuarios >= 0),
  urgencia text NOT NULL CHECK (urgencia IN ('ALTA','MEDIA','BAJA')),
  nombre text NOT NULL,
  email text,
  telefono text,
  empresa text,
  resumen text,
  necesidades text,
  servicio_recomendado text,
  puntuacion text NOT NULL CHECK (puntuacion IN ('CALIENTE','TEMPLADO','FRIO')),
  estado text NOT NULL DEFAULT 'NUEVO' CHECK (estado IN ('NUEVO','CONTACTADO','CERRADO','DESCARTADO')),
  consentimiento boolean NOT NULL CHECK (consentimiento),
  consentimiento_version text NOT NULL,
  consentimiento_at timestamptz NOT NULL DEFAULT now(),
  borrar_despues timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR telefono IS NOT NULL)
);

CREATE TABLE asistente_escalados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversacion_id uuid NOT NULL REFERENCES asistente_conversaciones(id) ON DELETE CASCADE,
  motivo text NOT NULL CHECK (motivo IN ('PETICION','ENFADO','SIN_RESPUESTA','OTRO')),
  dentro_horario boolean NOT NULL,
  contacto_nombre text,
  contacto_telefono text,
  contacto_email text,
  preferencia text CHECK (preferencia IN ('LLAMADA','EMAIL')),
  franja text,
  consentimiento boolean NOT NULL DEFAULT false,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ATENDIDO','DESCARTADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (consentimiento OR (contacto_nombre IS NULL AND contacto_telefono IS NULL AND contacto_email IS NULL))
);

CREATE TABLE asistente_huecos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pregunta_anon text NOT NULL,
  pregunta_norm text NOT NULL,
  canal text NOT NULL CHECK (canal IN ('PUBLICO','INTERNO','CLIENTE')),
  conversacion_id uuid REFERENCES asistente_conversaciones(id) ON DELETE SET NULL,
  mensaje_id uuid REFERENCES asistente_mensajes(id) ON DELETE SET NULL,
  tema text,
  veces integer NOT NULL DEFAULT 1 CHECK (veces > 0),
  estado text NOT NULL DEFAULT 'NUEVO' CHECK (estado IN ('NUEVO','PROPUESTO','RESUELTO','DESCARTADO')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pregunta_norm, canal)
);

CREATE TABLE asistente_propuestas_aprendizaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origen text NOT NULL CHECK (origen IN ('HUECO','VALORACION')),
  hueco_id uuid REFERENCES asistente_huecos(id) ON DELETE SET NULL,
  valoracion_id uuid REFERENCES asistente_valoraciones(id) ON DELETE SET NULL,
  pregunta text NOT NULL,
  respuesta_propuesta text NOT NULL,
  fuentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  estado text NOT NULL DEFAULT 'PROPUESTA' CHECK (estado IN ('PROPUESTA','APROBADA','DESCARTADA')),
  revisor_id integer,
  documento_id uuid REFERENCES asistente_documentos(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK ((hueco_id IS NOT NULL)::integer + (valoracion_id IS NOT NULL)::integer <= 1)
);

CREATE TABLE asistente_informes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('DIARIO','SEMANAL','MENSUAL')),
  fecha_local date NOT NULL,
  periodo_inicio timestamptz NOT NULL,
  periodo_fin timestamptz NOT NULL,
  datos jsonb NOT NULL DEFAULT '{}'::jsonb,
  generado_por text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, fecha_local)
);

CREATE TABLE asistente_informe_propuestas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  informe_id uuid NOT NULL REFERENCES asistente_informes(id) ON DELETE CASCADE,
  huella text NOT NULL,
  titulo text NOT NULL,
  detalle text NOT NULL,
  impacto integer NOT NULL CHECK (impacto BETWEEN 1 AND 5),
  esfuerzo integer NOT NULL CHECK (esfuerzo BETWEEN 1 AND 5),
  prioridad integer NOT NULL DEFAULT 0,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','ACEPTADA','DESCARTADA','HECHA')),
  decidido_por integer,
  decided_at timestamptz,
  UNIQUE (informe_id, huella)
);

CREATE TABLE asistente_rate_limit (
  clave_hash text NOT NULL,
  ventana timestamptz NOT NULL,
  contador integer NOT NULL DEFAULT 1 CHECK (contador >= 0),
  PRIMARY KEY (clave_hash, ventana)
);

CREATE INDEX asistente_conversaciones_canal_estado_idx ON asistente_conversaciones (canal, estado);
CREATE INDEX asistente_conversaciones_borrar_despues_idx ON asistente_conversaciones (borrar_despues);
CREATE INDEX asistente_mensajes_conversacion_created_idx ON asistente_mensajes (conversacion_id, created_at);
CREATE INDEX asistente_mensajes_created_idx ON asistente_mensajes (created_at);
CREATE INDEX asistente_leads_estado_created_idx ON asistente_leads (estado, created_at);
CREATE INDEX asistente_escalados_estado_created_idx ON asistente_escalados (estado, created_at);
CREATE INDEX asistente_huecos_estado_created_idx ON asistente_huecos (estado, created_at);
CREATE INDEX asistente_propuestas_aprendizaje_estado_idx ON asistente_propuestas_aprendizaje (estado, created_at);
CREATE INDEX asistente_informe_propuestas_estado_idx ON asistente_informe_propuestas (estado, prioridad);
CREATE INDEX asistente_rate_limit_ventana_idx ON asistente_rate_limit (ventana);

COMMENT ON TABLE asistente_configuracion IS 'Configuración aditiva del asistente IA privado.';
COMMENT ON TABLE asistente_documentos IS 'Conocimiento versionado del asistente IA privado.';
