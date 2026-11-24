-- Área 2 · Subida de precios: escenarios guardados, tipo de cliente editable y auditoría.
-- Aditiva y re-ejecutable. No toca ninguna tabla existente. Vuelta atrás en down.sql (solo borra estas tres tablas).
CREATE TABLE IF NOT EXISTS area2_subida_escenarios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 2000),
  estado JSONB NOT NULL CHECK (jsonb_typeof(estado) = 'object'),
  periodo_desde TEXT NOT NULL CHECK (periodo_desde ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  periodo_hasta TEXT NOT NULL CHECK (periodo_hasta ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  resumen JSONB,
  estado_aprobacion TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado_aprobacion IN ('BORRADOR', 'APROBADO')),
  fecha_efecto DATE,
  resultado JSONB,
  aprobado_por INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  aprobado_at TIMESTAMP(3),
  autor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area2_subida_escenarios_created_idx ON area2_subida_escenarios (created_at DESC);

CREATE TABLE IF NOT EXISTS area2_subida_tipo_cliente (
  clave TEXT PRIMARY KEY CHECK (length(clave) BETWEEN 1 AND 200),
  nombre TEXT NOT NULL,
  tipo CHAR(1) NOT NULL CHECK (tipo IN ('E', 'R', 'P')),
  motivo TEXT CHECK (motivo IS NULL OR length(motivo) <= 500),
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS area2_subida_auditoria (
  id BIGSERIAL PRIMARY KEY,
  accion TEXT NOT NULL,
  escenario_id TEXT,
  actor_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  detalle JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area2_subida_auditoria_created_idx ON area2_subida_auditoria (created_at DESC);
