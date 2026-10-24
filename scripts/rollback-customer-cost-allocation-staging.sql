-- PREPARADO, NO EJECUTAR AUTOMÁTICAMENTE.
-- Requiere aprobación del responsable y sólo apunta a io_staging_finanzas.
BEGIN;
DROP TABLE IF EXISTS "auditorias_reparto_coste_cliente";
DROP TABLE IF EXISTS "repartos_coste_cliente_lineas";
DROP TABLE IF EXISTS "repartos_coste_cliente_contratos";
DROP TABLE IF EXISTS "repartos_coste_cliente";
DROP FUNCTION IF EXISTS reparto_coste_cliente_guard_cierre_lineas_ct();
DROP FUNCTION IF EXISTS reparto_coste_cliente_guard_cierre_cabecera_ct();
DROP FUNCTION IF EXISTS reparto_coste_cliente_assert_cierre(text);
DROP FUNCTION IF EXISTS reparto_coste_cliente_reject_immutable_mutation();
DROP FUNCTION IF EXISTS reparto_coste_cliente_guard_header_update();
DROP FUNCTION IF EXISTS reparto_coste_cliente_guard_insert();
DROP FUNCTION IF EXISTS reparto_coste_cliente_assert_staging_role();
COMMIT;
