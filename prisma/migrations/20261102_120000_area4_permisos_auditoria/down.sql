-- Vuelta atrás de area4_permisos_auditoria. Solo usar con la rama Área 4 retirada del despliegue.
-- La auditoría es append-only: se retiran los triggers antes de borrarla (se pierde su contenido; exportarla antes si hay filas).
DROP TRIGGER IF EXISTS "area4_auditoria_permisos_no_truncate" ON "auditoria_permisos_area4";
DROP TRIGGER IF EXISTS "area4_auditoria_permisos_no_update_delete" ON "auditoria_permisos_area4";
DROP TABLE IF EXISTS "auditoria_permisos_area4";
DROP FUNCTION IF EXISTS "area4_auditoria_permisos_bloquear_mutacion"();
DROP TABLE IF EXISTS "configuracion_panel_area4";
ALTER TABLE "usuarios_admin" DROP COLUMN IF EXISTS "permisos_area4_vivos";
ALTER TABLE "permiso_usuarios" DROP COLUMN IF EXISTS "exportar", DROP COLUMN IF EXISTS "confirmar";
-- Las filas insertadas en permiso_areas y perfiles_permisos (catálogo) son inertes y se dejan.
