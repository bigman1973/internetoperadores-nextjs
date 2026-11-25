-- Área 1: consentimiento y estado de suscripción por contacto en la ficha única.
-- Fuente HUBSPOT: derivado de las propiedades de HubSpot ya guardadas en el panel. Fuente BREVO: conciliación posterior.
-- Aditiva y re-ejecutable.
CREATE TABLE IF NOT EXISTS "area1_crm_consentimientos" (
  "id" TEXT NOT NULL,
  "contacto_id" TEXT NOT NULL,
  "canal" TEXT NOT NULL DEFAULT 'EMAIL',
  "fuente" TEXT NOT NULL,
  "estado" TEXT NOT NULL,
  "base_legal" TEXT,
  "bajas_tipos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "rebote" BOOLEAN NOT NULL DEFAULT false,
  "marketing" BOOLEAN,
  "fecha_origen" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_crm_consentimientos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_crm_consentimientos_contacto_id_canal_fuente_key" ON "area1_crm_consentimientos"("contacto_id", "canal", "fuente");
CREATE INDEX IF NOT EXISTS "area1_crm_consentimientos_estado_idx" ON "area1_crm_consentimientos"("estado");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_consentimientos_contacto_id_fkey') THEN
    ALTER TABLE "area1_crm_consentimientos" ADD CONSTRAINT "area1_crm_consentimientos_contacto_id_fkey"
      FOREIGN KEY ("contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
