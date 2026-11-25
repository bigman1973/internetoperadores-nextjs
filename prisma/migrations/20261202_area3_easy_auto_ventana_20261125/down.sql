-- Vuelta atrás COORDINADA (código + SQL). Restituye la ventana original solo para filas nuevas
-- (NOT VALID) para que una política ya registrada hasta 2026-11-25 (tabla append-only, sin
-- UPDATE/DELETE) no impida la reversión. Esa política seguiría existiendo: al volver al código
-- anterior (ventana 2026-10-08) deja de seleccionarse como activa; sus recibos siguen siendo
-- reversibles con 'deshacer' porque no se borra nada.
DO $$
BEGIN
  IF current_database() <> 'io_staging_finanzas' THEN RETURN; END IF;
  IF to_regclass('public.politicas_auto_modo_facil') IS NULL THEN RETURN; END IF;
  ALTER TABLE "politicas_auto_modo_facil" DROP CONSTRAINT IF EXISTS "politica_auto_mf_ventana_ck";
  ALTER TABLE "politicas_auto_modo_facil" ADD CONSTRAINT "politica_auto_mf_ventana_ck"
    CHECK ("datos_desde" = DATE '2026-01-01' AND "datos_hasta" = DATE '2026-10-08') NOT VALID;
END $$;
