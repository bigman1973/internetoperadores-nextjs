-- Vuelta atrás de 20261129_area9_sistemas_ajustes (manual y con copia previa).
DELETE FROM area9_sis_incidencias WHERE id = 'area9-seed-20261124-do-descartado';
DELETE FROM area9_sis_servicios WHERE slug = 'brevo-staging';
ALTER TABLE area9_sis_servicios DROP CONSTRAINT IF EXISTS area9_sis_servicios_tipo_pago_check;
ALTER TABLE area9_sis_servicios DROP CONSTRAINT IF EXISTS area9_sis_servicios_coste_estimado_check;
ALTER TABLE area9_sis_servicios DROP COLUMN IF EXISTS coste_estimado_nota;
ALTER TABLE area9_sis_servicios DROP COLUMN IF EXISTS coste_estimado_mensual;
ALTER TABLE area9_sis_servicios DROP COLUMN IF EXISTS tipo_pago;
ALTER TABLE area9_sis_servicios DROP COLUMN IF EXISTS descartado_motivo;
ALTER TABLE area9_sis_servicios DROP COLUMN IF EXISTS descartado_at;
DELETE FROM _prisma_migrations WHERE migration_name = '20261129_area9_sistemas_ajustes';
