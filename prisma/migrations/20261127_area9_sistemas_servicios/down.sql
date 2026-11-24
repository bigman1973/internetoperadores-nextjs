-- Vuelta atrás de 20261127_area9_sistemas_servicios (no la ejecuta Prisma; solo manual y con copia previa).
DROP TABLE IF EXISTS area9_sis_auditoria;
DROP TABLE IF EXISTS area9_sis_incidencias;
DROP TABLE IF EXISTS area9_sis_tasas;
DROP TABLE IF EXISTS area9_sis_costes_manuales;
DROP TABLE IF EXISTS area9_sis_reglas_coste;
DROP TABLE IF EXISTS area9_sis_servicios;
DELETE FROM _prisma_migrations WHERE migration_name = '20261127_area9_sistemas_servicios';
