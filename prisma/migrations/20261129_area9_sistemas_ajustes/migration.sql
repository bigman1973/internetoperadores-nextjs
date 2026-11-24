-- Área 9 · Sistemas y servicios, ajustes del 24/11 (Víctor). Solo aditiva y re-ejecutable.
-- 1) «Descartado»: se guarda con estado en_baja + descartado_at (no se toca el CHECK de estado).
-- 2) Forma de pago: FACTURA (por defecto), TARJETA_SIN_FACTURA (cargo de tarjeta sin factura en el panel) o INCLUIDO (sin coste propio).
-- 3) Importe estimado mensual (EUR) para los servicios que se pagan con tarjeta y no tienen factura.
ALTER TABLE area9_sis_servicios ADD COLUMN IF NOT EXISTS descartado_at TIMESTAMP(3);
ALTER TABLE area9_sis_servicios ADD COLUMN IF NOT EXISTS descartado_motivo TEXT;
ALTER TABLE area9_sis_servicios ADD COLUMN IF NOT EXISTS tipo_pago TEXT NOT NULL DEFAULT 'FACTURA';
ALTER TABLE area9_sis_servicios ADD COLUMN IF NOT EXISTS coste_estimado_mensual NUMERIC(12,2);
ALTER TABLE area9_sis_servicios ADD COLUMN IF NOT EXISTS coste_estimado_nota TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area9_sis_servicios_tipo_pago_check') THEN
    ALTER TABLE area9_sis_servicios ADD CONSTRAINT area9_sis_servicios_tipo_pago_check CHECK (tipo_pago IN ('FACTURA','TARJETA_SIN_FACTURA','INCLUIDO'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area9_sis_servicios_coste_estimado_check') THEN
    ALTER TABLE area9_sis_servicios ADD CONSTRAINT area9_sis_servicios_coste_estimado_check CHECK ((coste_estimado_mensual IS NULL OR coste_estimado_mensual >= 0) AND (coste_estimado_nota IS NULL OR length(coste_estimado_nota) <= 500) AND (descartado_motivo IS NULL OR length(descartado_motivo) <= 500));
  END IF;
END $$;
-- Brevo con dos claves: la de producción (BREVO_API_KEY, ya existente) y la de staging «Panel IO – staging» (BREVO_API_KEY_STAGING, creada el 24/11 por Víctor).
INSERT INTO area9_sis_servicios (slug, nombre, proveedor, categoria, descripcion, modulos, entornos, periodicidad, variables_esperadas, estado, orden, notas, fecha_alta, tipo_pago)
VALUES ('brevo-staging', 'Brevo · clave «Panel IO – staging»', 'Brevo (Sendinblue)', 'marketing',
  'Segunda clave de API de la misma cuenta de Brevo, creada el 24/11/2026 por Víctor con el nombre «Panel IO – staging». Solo se usa en staging: el panel lee BREVO_API_KEY_STAGING y, si no existe, BREVO_API_KEY. No tiene coste propio.',
  ARRAY['CRM','Comunicados','Captación web'], ARRAY['staging'], 'MENSUAL', ARRAY['BREVO_API_KEY_STAGING'], 'en_prueba', 71,
  'Pendiente de verificar con /api/admin/crm/brevo/estado (solo lectura). Con una clave válida, staging envía correos reales: no probar formularios ni comunicados.', DATE '2026-11-24', 'INCLUIDO')
ON CONFLICT (slug) DO NOTHING;
INSERT INTO area9_sis_incidencias (id, fecha_hora, tipo, titulo, detalle, servicio_id, autor_nombre)
SELECT 'area9-seed-20261124-do-descartado', TIMESTAMP '2026-11-24 21:30', 'DECISION', 'DigitalOcean descartado',
  'La IP fija de salida hacia ISP irá en una máquina propia de IO (direccionamiento RIPE). Correo enviado a Esteve con los requisitos. No hay droplet ni cuenta que mantener.',
  (SELECT id FROM area9_sis_servicios WHERE slug = 'digitalocean'), 'Víctor Giró'
WHERE EXISTS (SELECT 1 FROM area9_sis_servicios WHERE slug = 'digitalocean')
ON CONFLICT (id) DO NOTHING;
