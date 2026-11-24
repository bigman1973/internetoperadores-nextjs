-- Área9: SQL PREPARADO, no aplicado. No modifica datos ni tablas existentes.
CREATE TABLE "area9_pub_publicaciones" (
  "id" TEXT NOT NULL,
  "deployment_key" VARCHAR(240) NOT NULL,
  "entorno" VARCHAR(20) NOT NULL,
  "commit_hash" VARCHAR(40) NOT NULL,
  "fecha_publicacion" TIMESTAMP(3) NOT NULL,
  "titulo" VARCHAR(200) NOT NULL,
  "resumen" TEXT NOT NULL,
  "fuente" VARCHAR(20) NOT NULL,
  "url" VARCHAR(1000) NOT NULL,
  "migraciones" JSONB NOT NULL DEFAULT '[]',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area9_pub_publicaciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area9_pub_entorno_check" CHECK ("entorno" IN ('staging', 'produccion')),
  CONSTRAINT "area9_pub_sha_check" CHECK ("commit_hash" ~ '^[0-9a-f]{40}$'),
  CONSTRAINT "area9_pub_fuente_check" CHECK ("fuente" IN ('github', 'vercel')),
  CONSTRAINT "area9_pub_url_check" CHECK ("url" ~ '^https://[^[:space:]<>]+$'),
  CONSTRAINT "area9_pub_migraciones_check" CHECK (jsonb_typeof("migraciones") = 'array')
);
CREATE UNIQUE INDEX "area9_pub_publicaciones_deployment_key_key" ON "area9_pub_publicaciones"("deployment_key");
CREATE INDEX "area9_pub_publicaciones_entorno_fecha_publicacion_idx" ON "area9_pub_publicaciones"("entorno", "fecha_publicacion");

CREATE TABLE "area9_pub_peticiones" (
  "publicacion_id" TEXT NOT NULL,
  "peticion_id" INTEGER NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmado_por_int" INTEGER NOT NULL,
  "confirmado_nombre" VARCHAR(200) NOT NULL,
  CONSTRAINT "area9_pub_peticiones_pkey" PRIMARY KEY ("publicacion_id", "peticion_id"),
  CONSTRAINT "area9_pub_confirmante_check" CHECK ("confirmado_por_int" > 0),
  CONSTRAINT "area9_pub_peticiones_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "area9_pub_publicaciones"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "area9_pub_peticiones_peticion_id_fkey" FOREIGN KEY ("peticion_id") REFERENCES "peticiones_internas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "area9_pub_peticiones_peticion_id_idx" ON "area9_pub_peticiones"("peticion_id");

CREATE TABLE "area9_hist_migraciones" (
  "id" TEXT NOT NULL,
  "database_key" VARCHAR(64) NOT NULL,
  "entorno" VARCHAR(20) NOT NULL,
  "nombre" VARCHAR(255) NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "aplicada_at" TIMESTAMP(3) NOT NULL,
  "publicacion_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area9_hist_migraciones_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area9_hist_database_key_check" CHECK ("database_key" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "area9_hist_checksum_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "area9_hist_entorno_check" CHECK ("entorno" IN ('staging', 'produccion')),
  CONSTRAINT "area9_hist_migraciones_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "area9_pub_publicaciones"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "area9_hist_migraciones_database_key_nombre_checksum_key" ON "area9_hist_migraciones"("database_key", "nombre", "checksum");
CREATE INDEX "area9_hist_migraciones_entorno_aplicada_at_idx" ON "area9_hist_migraciones"("entorno", "aplicada_at");
