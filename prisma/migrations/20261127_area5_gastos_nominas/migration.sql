-- Área 5 · Gastos del trabajador y nóminas.
-- Aditiva y re-ejecutable. No modifica ninguna tabla existente (gastos, gastos_empleado, nominas siguen igual).
-- Vuelta atrás en down.sql (solo borra estas tablas).

-- Cierre mensual hacia la gestoría (el envío lo hace una persona; aquí solo se guarda el borrador y quién lo marcó como enviado).
CREATE TABLE IF NOT EXISTS area5_cierres (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  periodo TEXT NOT NULL UNIQUE CHECK (periodo ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  estado TEXT NOT NULL DEFAULT 'PREPARADO' CHECK (estado IN ('PREPARADO', 'ENVIADO')),
  borrador_destinatario TEXT CHECK (borrador_destinatario IS NULL OR length(borrador_destinatario) <= 320),
  borrador_asunto TEXT CHECK (borrador_asunto IS NULL OR length(borrador_asunto) <= 300),
  borrador_cuerpo TEXT CHECK (borrador_cuerpo IS NULL OR length(borrador_cuerpo) <= 8000),
  creado_por_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  enviado_por_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  enviado_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((estado = 'ENVIADO') = (enviado_at IS NOT NULL AND enviado_por_id IS NOT NULL))
);

-- Gastos del trabajador: tickets (con IVA) y kilometraje (km x €/km).
CREATE TABLE IF NOT EXISTS area5_gastos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  empleado_id TEXT NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  tipo TEXT NOT NULL CHECK (tipo IN ('TICKET', 'KILOMETRAJE')),
  fecha DATE NOT NULL,
  concepto TEXT NOT NULL CHECK (length(concepto) BETWEEN 1 AND 200),
  categoria TEXT CHECK (categoria IS NULL OR length(categoria) <= 40),
  proyecto TEXT CHECK (proyecto IS NULL OR length(proyecto) <= 200),
  cliente TEXT CHECK (cliente IS NULL OR length(cliente) <= 200),
  comercio TEXT CHECK (comercio IS NULL OR length(comercio) <= 200),
  cif_comercio TEXT CHECK (cif_comercio IS NULL OR length(cif_comercio) <= 40),
  importe NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (importe >= 0),
  tipo_iva NUMERIC(5,2) CHECK (tipo_iva IS NULL OR tipo_iva BETWEEN 0 AND 30),
  base_imponible NUMERIC(12,2) CHECK (base_imponible IS NULL OR base_imponible >= 0),
  importe_iva NUMERIC(12,2) CHECK (importe_iva IS NULL OR importe_iva >= 0),
  km NUMERIC(9,2) CHECK (km IS NULL OR km > 0),
  eur_km NUMERIC(6,4) CHECK (eur_km IS NULL OR eur_km > 0),
  ocr_estado TEXT NOT NULL DEFAULT 'NO' CHECK (ocr_estado IN ('NO', 'OK', 'ERROR', 'OMITIDO')),
  ocr_confianza NUMERIC(4,3),
  ocr_datos JSONB,
  estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR', 'PENDIENTE', 'ACLARACION', 'APROBADO', 'RECHAZADO')),
  motivo TEXT CHECK (motivo IS NULL OR length(motivo) <= 1000),
  revisor_email TEXT,
  revisado_at TIMESTAMP(3),
  cierre_id TEXT REFERENCES area5_cierres(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (tipo <> 'KILOMETRAJE' OR estado = 'BORRADOR' OR (km IS NOT NULL AND eur_km IS NOT NULL)),
  CHECK (tipo <> 'TICKET' OR km IS NULL),
  CHECK (estado = 'BORRADOR' OR importe > 0),
  CHECK (cierre_id IS NULL OR estado = 'APROBADO')
);
CREATE INDEX IF NOT EXISTS area5_gastos_empleado_idx ON area5_gastos (empleado_id, fecha DESC);
CREATE INDEX IF NOT EXISTS area5_gastos_estado_idx ON area5_gastos (estado, created_at DESC);
CREATE INDEX IF NOT EXISTS area5_gastos_cierre_idx ON area5_gastos (cierre_id) WHERE cierre_id IS NOT NULL;

-- Foto o PDF del ticket (bytes en la propia base: privado, sin enlaces públicos ni OneDrive).
CREATE TABLE IF NOT EXISTS area5_gasto_adjuntos (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  gasto_id TEXT NOT NULL UNIQUE REFERENCES area5_gastos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 200),
  mime TEXT NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  tamano INTEGER NOT NULL CHECK (tamano BETWEEN 1 AND 10485760),
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  datos BYTEA NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area5_gasto_adjuntos_sha_idx ON area5_gasto_adjuntos (sha256);

-- Historial y aclaraciones de cada gasto (quién, cuándo, qué).
CREATE TABLE IF NOT EXISTS area5_gasto_eventos (
  id BIGSERIAL PRIMARY KEY,
  gasto_id TEXT NOT NULL REFERENCES area5_gastos(id) ON DELETE CASCADE,
  actor_email TEXT NOT NULL,
  accion TEXT NOT NULL CHECK (accion IN ('CREADO', 'EDITADO', 'ENVIADO', 'APROBADO', 'RECHAZADO', 'ACLARACION_PEDIDA', 'ACLARACION_RESPONDIDA', 'REABIERTO', 'CIERRE', 'CIERRE_DESHECHO')),
  texto TEXT CHECK (texto IS NULL OR length(texto) <= 1000),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area5_gasto_eventos_gasto_idx ON area5_gasto_eventos (gasto_id, created_at);

-- Avisos dentro del panel (no se envía ningún correo).
CREATE TABLE IF NOT EXISTS area5_avisos (
  id BIGSERIAL PRIMARY KEY,
  destinatario_email TEXT NOT NULL,
  gasto_id TEXT REFERENCES area5_gastos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('NUEVO_GASTO', 'APROBADO', 'RECHAZADO', 'ACLARACION', 'RESPUESTA', 'CIERRE')),
  texto TEXT NOT NULL CHECK (length(texto) <= 500),
  leido_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area5_avisos_dest_idx ON area5_avisos (destinatario_email, leido_at, created_at DESC);

-- Conceptos de gasto leídos de la nómina individual devuelta por la gestoría (para cuadrar con lo aprobado).
CREATE TABLE IF NOT EXISTS area5_nomina_conceptos (
  id BIGSERIAL PRIMARY KEY,
  empleado_id TEXT NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  mes SMALLINT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio SMALLINT NOT NULL CHECK (anio BETWEEN 2024 AND 2100),
  codigo TEXT NOT NULL CHECK (length(codigo) <= 10),
  concepto TEXT NOT NULL CHECK (length(concepto) <= 200),
  importe NUMERIC(12,2) NOT NULL,
  es_gasto BOOLEAN NOT NULL DEFAULT TRUE,
  dudoso BOOLEAN NOT NULL DEFAULT FALSE,
  archivo_nombre TEXT,
  importado_por_id INTEGER NOT NULL REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area5_nomina_conceptos_idx ON area5_nomina_conceptos (empleado_id, anio, mes);
