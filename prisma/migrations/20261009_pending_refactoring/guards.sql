-- Garantías del catálogo documental separado. No modifica facturas recibidas ni repartos.
ALTER TABLE documentos_refacturacion_pendiente
  ADD CONSTRAINT pendientes_refacturacion_estado_check
  CHECK (estado IN ('DETECTADO','ANALIZANDO','LISTO','REVISION','CAMBIADO','ERROR')),
  ADD CONSTRAINT pendientes_refacturacion_version_check CHECK (version > 0),
  ADD CONSTRAINT pendientes_refacturacion_size_check CHECK (size >= 0),
  ADD CONSTRAINT pendientes_refacturacion_hash_check CHECK (hash IS NULL OR hash ~ '^[a-f0-9]{64}$');
