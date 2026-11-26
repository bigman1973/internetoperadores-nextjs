-- PREPARADA, NO EJECUTADA: destinos nativos empresa sin persona ficticia.
-- No actualiza ni borra actividades/tareas antiguas. NULL conserva el ámbito histórico de contacto.
BEGIN;
ALTER TABLE "crm_actividades" ADD COLUMN "empresa_id" TEXT;
ALTER TABLE "crm_actividades" ALTER COLUMN "contacto_id" DROP NOT NULL;
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "crm_empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_actividades" ADD CONSTRAINT "crm_actividades_destino_check"
  CHECK ("contacto_id" IS NOT NULL OR "empresa_id" IS NOT NULL);
CREATE INDEX "crm_actividades_empresa_fecha_idx" ON "crm_actividades"("empresa_id", "fecha_actividad" DESC);
ALTER TABLE "crm_tareas" ADD COLUMN "empresa_id" TEXT;
ALTER TABLE "crm_tareas" ALTER COLUMN "contacto_id" DROP NOT NULL;
ALTER TABLE "crm_tareas" ADD CONSTRAINT "crm_tareas_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "crm_empresas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "crm_tareas" ADD CONSTRAINT "crm_tareas_destino_check"
  CHECK ("contacto_id" IS NOT NULL OR "empresa_id" IS NOT NULL);
CREATE INDEX "crm_tareas_empresa_estado_vence_idx" ON "crm_tareas"("empresa_id", "estado", "vence_at");
COMMIT;
