-- Área 1 · Caché diaria de «Lo que hay que saber» (resumen con IA de la ficha de cliente). Solo añade.
CREATE TABLE IF NOT EXISTS "area1_crm_ficha_ia" (
  "id" TEXT NOT NULL,
  "empresa_id" TEXT NOT NULL,
  "dia" DATE NOT NULL,
  "huella" TEXT NOT NULL,
  "puntos" JSONB NOT NULL,
  "modelo" TEXT NOT NULL,
  "creado_por_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_crm_ficha_ia_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_crm_ficha_ia_empresa_dia_key" ON "area1_crm_ficha_ia"("empresa_id", "dia");
