-- B3, exclusivamente BD aislada staging: cobertura del extracto importado.
-- Nullable, aditivo; no cambia saldos, movimientos ni conciliaciones.
ALTER TABLE "cuentas_bancarias" ADD COLUMN "fecha_corte_extracto" TIMESTAMP(3);
