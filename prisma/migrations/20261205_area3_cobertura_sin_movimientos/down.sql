-- Rollback de aplicación primero; no DELETE, UPDATE, CASCADE ni alteración del enum.
-- Si ya existe evidencia sin movimientos, CONSERVAR la columna aditiva. El código
-- anterior tolera columnas adicionales y la auditoría debe seguir siendo honesta.
-- Este down falla cerrado para impedir que se pierda su discriminante.
BEGIN;
LOCK TABLE "cortes_cobertura_manual_b3" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "cortes_cobertura_manual_b3" WHERE "comprobacion_sin_movimientos" LIMIT 1) THEN
    RAISE EXCEPTION 'Rollback de aplicación permitido; conservar columna: existen comprobaciones sin movimientos auditadas';
  END IF;
END $$;
ALTER TABLE "cortes_cobertura_manual_b3" DROP COLUMN "comprobacion_sin_movimientos";
COMMIT;
