-- Área 1: captura web local en la ficha CRM existente. No importa ni modifica histórico.
-- Aplicación a staging únicamente tras coordinación; no ejecutar contra producción.
ALTER TABLE "crm_registros_hubspot" ALTER COLUMN "hubspot_id" DROP NOT NULL;

ALTER TABLE "leads_migracion_web" ADD COLUMN "area1_crm_contacto_id" TEXT;
ALTER TABLE "leads_soluciones" ADD COLUMN "area1_crm_contacto_id" TEXT;
ALTER TABLE "leads_partners" ADD COLUMN "area1_crm_contacto_id" TEXT;
ALTER TABLE "altas_servicio" ADD COLUMN "area1_crm_contacto_id" TEXT;

CREATE TABLE "area1_crm_captaciones_web" (
  "id" TEXT NOT NULL,
  "contacto_id" TEXT NOT NULL,
  "formulario" TEXT NOT NULL,
  "web_origen" TEXT,
  "pagina_origen" TEXT,
  "fecha_envio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "segmento_crm" "SegmentoCrm" NOT NULL,
  "consentimiento_privacidad" BOOLEAN,
  "consentimiento_newsletter" BOOLEAN NOT NULL DEFAULT false,
  "consentimiento_version" TEXT,
  "datos" JSONB NOT NULL,
  "referencia_tipo" TEXT,
  "referencia_id" TEXT,
  "huella" TEXT NOT NULL,
  "clave_idempotencia" TEXT NOT NULL,
  CONSTRAINT "area1_crm_captaciones_web_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_crm_captaciones_web_contacto_id_fkey" FOREIGN KEY ("contacto_id")
    REFERENCES "crm_registros_hubspot"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "area1_crm_captaciones_web_clave_idempotencia_key" ON "area1_crm_captaciones_web"("clave_idempotencia");
CREATE INDEX "area1_crm_captaciones_web_contacto_id_fecha_envio_idx" ON "area1_crm_captaciones_web"("contacto_id", "fecha_envio" DESC);
CREATE INDEX "area1_crm_captaciones_web_huella_fecha_envio_idx" ON "area1_crm_captaciones_web"("huella", "fecha_envio");
CREATE INDEX "area1_leads_migracion_contacto_idx" ON "leads_migracion_web"("area1_crm_contacto_id");
CREATE INDEX "area1_leads_soluciones_contacto_idx" ON "leads_soluciones"("area1_crm_contacto_id");
CREATE INDEX "area1_leads_partners_contacto_idx" ON "leads_partners"("area1_crm_contacto_id");
CREATE INDEX "area1_altas_contacto_idx" ON "altas_servicio"("area1_crm_contacto_id");

ALTER TABLE "leads_migracion_web" ADD CONSTRAINT "area1_leads_migracion_contacto_fkey"
  FOREIGN KEY ("area1_crm_contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads_soluciones" ADD CONSTRAINT "area1_leads_soluciones_contacto_fkey"
  FOREIGN KEY ("area1_crm_contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads_partners" ADD CONSTRAINT "area1_leads_partners_contacto_fkey"
  FOREIGN KEY ("area1_crm_contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "altas_servicio" ADD CONSTRAINT "area1_altas_contacto_fkey"
  FOREIGN KEY ("area1_crm_contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reversión: revertir el código, NO borrar columnas, fichas ni evidencias ya capturadas.
