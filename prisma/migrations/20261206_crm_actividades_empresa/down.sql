-- PREPARADO, NO EJECUTADO. Reversión SIN borrar registros ni atribuirlos a una persona.
-- Si ya se ha usado el ámbito empresa, preservar/exportar y decidir su tratamiento antes de revertir.
BEGIN;
LOCK TABLE "crm_actividades", "crm_tareas" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "crm_actividades" WHERE "empresa_id" IS NOT NULL OR "contacto_id" IS NULL LIMIT 1)
     OR EXISTS (SELECT 1 FROM "crm_tareas" WHERE "empresa_id" IS NOT NULL OR "contacto_id" IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'Reversión bloqueada: existen actividades/tareas de empresa; no se permite perder su asociación.';
  END IF;
END $$;
DROP INDEX "crm_actividades_empresa_fecha_idx";
ALTER TABLE "crm_actividades" DROP CONSTRAINT "crm_actividades_destino_check";
ALTER TABLE "crm_actividades" DROP CONSTRAINT "crm_actividades_empresa_id_fkey";
ALTER TABLE "crm_actividades" ALTER COLUMN "contacto_id" SET NOT NULL;
ALTER TABLE "crm_actividades" DROP COLUMN "empresa_id";
DROP INDEX "crm_tareas_empresa_estado_vence_idx";
ALTER TABLE "crm_tareas" DROP CONSTRAINT "crm_tareas_destino_check";
ALTER TABLE "crm_tareas" DROP CONSTRAINT "crm_tareas_empresa_id_fkey";
ALTER TABLE "crm_tareas" ALTER COLUMN "contacto_id" SET NOT NULL;
ALTER TABLE "crm_tareas" DROP COLUMN "empresa_id";
COMMIT;
