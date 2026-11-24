-- Datos de los ajustes del 24/11 sobre filas YA existentes. Idempotente. Se ejecuta a mano después de migration.sql
-- (el validador de migraciones no admite UPDATE dentro de migration.sql). Importes en EUR con 1 USD = 0,86 EUR (aproximado).
UPDATE area9_sis_servicios SET estado = 'en_baja', descartado_at = COALESCE(descartado_at, TIMESTAMP '2026-11-24 21:30'),
  descartado_motivo = 'Decisión del 24/11: la IP fija irá en una máquina propia de IO; correo enviado a Esteve.',
  descripcion = 'Servidor pequeño que se iba a usar para dar una IP fija de salida a la API de ISP Gestión. DESCARTADO el 24/11: la IP fija irá en una máquina propia de IO.',
  notas = 'Descartado el 24/11/2026. No hay droplet ni cuenta creada.'
WHERE slug = 'digitalocean';
UPDATE area9_sis_servicios SET tipo_pago = 'TARJETA_SIN_FACTURA', coste_estimado_mensual = 17.20,
  coste_estimado_nota = 'Plan Pro de Vercel: 20 USD por usuario y mes (≈ 17,20 € con 1 usuario). Si hay más miembros de pago, multiplica. Confirmar plan e importe en el recibo de la tarjeta.',
  plan = COALESCE(plan, 'Pro') WHERE slug = 'vercel';
UPDATE area9_sis_servicios SET tipo_pago = 'TARJETA_SIN_FACTURA', coste_estimado_mensual = 17.20,
  coste_estimado_nota = 'Estimado con el plan Pro de Railway (20 USD al mes, ≈ 17,20 €) más consumo, que no se incluye. Si el plan es Hobby (5 USD) baja a ≈ 4,30 €. Confirmar plan e importe en el recibo de la tarjeta.'
WHERE slug = 'railway';
UPDATE area9_sis_servicios SET tipo_pago = 'TARJETA_SIN_FACTURA', coste_estimado_mensual = 3.44,
  coste_estimado_nota = 'Estimado con el plan Team de GitHub: 4 USD por usuario y mes (≈ 3,44 € con 1 usuario). Si la organización está en el plan gratuito, el coste es 0. Confirmar en el recibo de la tarjeta.'
WHERE slug = 'github';
UPDATE area9_sis_servicios SET nombre = 'Brevo · clave de producción', variables_esperadas = ARRAY['BREVO_API_KEY'], entornos = ARRAY['produccion'],
  descripcion = 'Envío de correo y listas del CRM. Clave antigua BREVO_API_KEY, la de producción. En staging se usa BREVO_API_KEY_STAGING (clave «Panel IO – staging»). Sin clave el CRM funciona pero no sincroniza con Brevo.'
WHERE slug = 'brevo';
UPDATE area9_sis_incidencias SET titulo = 'Separar bases de datos de Railway: aprobado, pero aplazado',
  detalle = 'Víctor aprueba el plan (proyecto Railway exclusivo para staging, us-west2, unos 20 USD al mes, copia saneada, sin ISP, correos, Microsoft, Azure ni pagos reales, conservación reversible 7 días) y lo aplaza; se retoma más adelante. Producción no se toca.'
WHERE id = 'area9-seed-20261124-railway-aplazado';
