-- Vuelta atrás de 20261203_area3_movimientos_duplicado_de.
-- ANTES: guardar la auditoría (COPY/pg_dump de area3_movimientos_duplicados_auditoria) y ejecutar el DESMARCAR
-- de los apuntes marcados (script privado/desmarcar-prestamo-4012.cjs), para que ninguna lectura dependa de la columna.
DROP TRIGGER IF EXISTS area3_mov_dup_aud_solo_insertar ON "area3_movimientos_duplicados_auditoria";
DROP TABLE IF EXISTS "area3_movimientos_duplicados_auditoria";
DROP FUNCTION IF EXISTS area3_movimientos_duplicados_solo_insertar();
DROP INDEX IF EXISTS "movimientos_bancarios_duplicado_de_idx";
ALTER TABLE "movimientos_bancarios" DROP CONSTRAINT IF EXISTS "movimientos_bancarios_duplicado_de_ck";
ALTER TABLE "movimientos_bancarios" DROP COLUMN IF EXISTS "duplicado_de_id";
