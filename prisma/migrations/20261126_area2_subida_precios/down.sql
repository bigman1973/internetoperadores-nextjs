-- Vuelta atrás de 20261126_area2_subida_precios (no la ejecuta Prisma; solo manual y con copia previa).
DROP TABLE IF EXISTS area2_subida_auditoria;
DROP TABLE IF EXISTS area2_subida_tipo_cliente;
DROP TABLE IF EXISTS area2_subida_escenarios;
DELETE FROM _prisma_migrations WHERE migration_name = '20261126_area2_subida_precios';
