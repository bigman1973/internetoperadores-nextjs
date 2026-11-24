-- Área 3 · Impuestos (303/111/115) y Presupuesto 2027. Aditiva y re-ejecutable: solo crea tablas nuevas area3_imp_* y area3_pre_*.
-- No toca facturas, bancos, nóminas ni Subida de precios (solo las lee). Vuelta atrás en down.sql.
CREATE TABLE IF NOT EXISTS area3_imp_presentados (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  modelo TEXT NOT NULL CHECK (modelo IN ('303','111','115')),
  ejercicio INTEGER NOT NULL CHECK (ejercicio BETWEEN 2020 AND 2100),
  trimestre INTEGER NOT NULL CHECK (trimestre BETWEEN 1 AND 4),
  importe NUMERIC(14,2) NOT NULL,
  estado TEXT NOT NULL DEFAULT 'PRESENTADO' CHECK (estado IN ('PRESENTADO','PAGADO','APLAZADO','DENEGADO')),
  fecha_presentacion DATE,
  referencia TEXT CHECK (referencia IS NULL OR length(referencia) <= 120),
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  anulado_at TIMESTAMP(3),
  anulado_por INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS area3_imp_presentados_vigente_idx ON area3_imp_presentados (modelo, ejercicio, trimestre) WHERE anulado_at IS NULL;
CREATE TABLE IF NOT EXISTS area3_imp_auditoria (
  id BIGSERIAL PRIMARY KEY,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  detalle JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area3_imp_auditoria_created_idx ON area3_imp_auditoria (created_at DESC);

CREATE TABLE IF NOT EXISTS area3_pre_versiones (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  ejercicio INTEGER NOT NULL CHECK (ejercicio BETWEEN 2020 AND 2100),
  numero INTEGER NOT NULL CHECK (numero >= 1),
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  notas TEXT CHECK (notas IS NULL OR length(notas) <= 1500),
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','APROBADO','REEMPLAZADO')),
  subida_proveedores_pct NUMERIC(6,2) NOT NULL DEFAULT 3 CHECK (subida_proveedores_pct BETWEEN -50 AND 100),
  meses_real INTEGER NOT NULL DEFAULT 10 CHECK (meses_real BETWEEN 1 AND 12),
  escenario_subida_id TEXT,
  escenario_salarial_id TEXT,
  meta JSONB,
  aprobado_por INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  aprobado_at TIMESTAMP(3),
  autor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (ejercicio, numero)
);
CREATE UNIQUE INDEX IF NOT EXISTS area3_pre_versiones_vigente_idx ON area3_pre_versiones (ejercicio) WHERE estado = 'APROBADO';
CREATE TABLE IF NOT EXISTS area3_pre_lineas (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  version_id TEXT NOT NULL REFERENCES area3_pre_versiones(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('INGRESO','GASTO')),
  naturaleza TEXT NOT NULL DEFAULT 'CORRIENTE' CHECK (naturaleza IN ('CORRIENTE','INVERSION')),
  centro TEXT NOT NULL CHECK (length(centro) BETWEEN 1 AND 120),
  cuenta TEXT NOT NULL CHECK (length(cuenta) BETWEEN 1 AND 200),
  fuente TEXT NOT NULL DEFAULT 'FACTURAS' CHECK (fuente IN ('FACTURAS','NOMINAS','SUBIDA_PRECIOS','MANUAL')),
  real_anual NUMERIC(14,2) NOT NULL DEFAULT 0,
  subida_pct NUMERIC(6,2),
  importe_auto NUMERIC(14,2) NOT NULL DEFAULT 0,
  importe NUMERIC(14,2) NOT NULL DEFAULT 0,
  origen TEXT NOT NULL DEFAULT 'AUTO' CHECK (origen IN ('AUTO','MANUAL')),
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  orden INTEGER NOT NULL DEFAULT 100,
  updated_by INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (version_id, tipo, naturaleza, centro, cuenta)
);
CREATE INDEX IF NOT EXISTS area3_pre_lineas_version_idx ON area3_pre_lineas (version_id);
CREATE TABLE IF NOT EXISTS area3_pre_auditoria (
  id BIGSERIAL PRIMARY KEY,
  accion TEXT NOT NULL,
  version_id TEXT,
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  detalle JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area3_pre_auditoria_created_idx ON area3_pre_auditoria (created_at DESC);
