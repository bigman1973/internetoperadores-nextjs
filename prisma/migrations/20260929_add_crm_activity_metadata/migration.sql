-- Metadata estructurada para correos, reuniones y otras actividades CRM.
-- Cambio aditivo e idempotente; la columna se aplicó mediante `prisma db push` según
-- el procedimiento operativo de este proyecto.
ALTER TABLE "crm_actividades"
ADD COLUMN IF NOT EXISTS "metadatos" JSONB;
