-- Acelera la vinculación y detección de coincidencias entre contactos CRM y clientes.
-- Los correos de ambas tablas se almacenan normalizados en minúsculas y sin espacios.
CREATE INDEX IF NOT EXISTS "clientes_web_email_idx" ON "clientes_web"("email");
