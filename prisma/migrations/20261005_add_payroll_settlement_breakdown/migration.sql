-- Desglose informativo incluido en el total mensual; no duplica el importe de nómina.
ALTER TABLE "nominas"
  ADD COLUMN IF NOT EXISTS "liquidacion_coste" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "liquidacion_devengado" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "liquidacion_neto" DOUBLE PRECISION;
