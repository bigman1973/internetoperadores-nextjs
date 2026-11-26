-- Área 3, staging: discriminante honesto de la atestación humana sin actividad.
-- No altera el enum, ni los triggers append-only, ni saldos/apuntes/importaciones.
ALTER TABLE "cortes_cobertura_manual_b3"
  ADD COLUMN "comprobacion_sin_movimientos" BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN "cortes_cobertura_manual_b3"."comprobacion_sin_movimientos" IS
  'Confirmación humana de ausencia de movimientos; saldo derivado en servidor. source_version es la huella de las fuentes, no el corte importado.';
