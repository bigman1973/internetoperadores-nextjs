-- Area 3 · Modo fácil automático (traspasos propios y comisiones): amplía la ventana
-- autorizable hasta 2026-11-25 (decisión de Víctor, 25/11/2026, transmitida por Claude).
-- ADITIVA y sin DML: la política vieja (hasta 2026-10-08) queda como histórico append-only;
-- la ventana nueva exige una política nueva registrada y atestaciones propias.
-- SOLO STAGING: fuera de la base io_staging_finanzas no hace nada (producción conserva la
-- ventana original 2026-10-08 en BD y en código). Atómica (un solo DO) y no-op sin tabla.
DO $$
BEGIN
  IF current_database() <> 'io_staging_finanzas' THEN
    RAISE NOTICE 'Ampliación de ventana solo para staging: sin cambios en %', current_database();
    RETURN;
  END IF;
  IF to_regclass('public.politicas_auto_modo_facil') IS NULL THEN
    RAISE NOTICE 'politicas_auto_modo_facil no existe: sin cambios';
    RETURN;
  END IF;
  ALTER TABLE "politicas_auto_modo_facil" DROP CONSTRAINT IF EXISTS "politica_auto_mf_ventana_ck";
  ALTER TABLE "politicas_auto_modo_facil" ADD CONSTRAINT "politica_auto_mf_ventana_ck"
    CHECK ("datos_desde" = DATE '2026-01-01' AND "datos_hasta" IN (DATE '2026-10-08', DATE '2026-11-25'));
END $$;
