-- Área 1 · CRM · Carga de clientes ISP Gestión en el CRM unificado.
-- Solo aditiva: crea tablas nuevas area1_isp_*; no modifica tablas existentes.
-- ISP Gestión manda en clientes, contratos y facturación: estas tablas son su
-- copia trazable dentro del panel. Los vínculos con fichas CRM se proponen y
-- los confirma una persona (area1_isp_vinculos).

CREATE TABLE IF NOT EXISTS "area1_isp_importaciones" (
  "id" TEXT NOT NULL,
  "fichero_nombre" TEXT NOT NULL,
  "fichero_hash" TEXT NOT NULL,
  "fichero_bytes" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'APLICADA',
  "actor_id" INTEGER,
  "actor_email" TEXT,
  "resumen" JSONB NOT NULL,
  "brevo_verificado" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_isp_importaciones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "area1_isp_importaciones_fichero_hash_idx" ON "area1_isp_importaciones"("fichero_hash");
CREATE INDEX IF NOT EXISTS "area1_isp_importaciones_created_at_idx" ON "area1_isp_importaciones"("created_at");

CREATE TABLE IF NOT EXISTS "area1_isp_clientes" (
  "id" TEXT NOT NULL,
  "isp_cliente_id" TEXT NOT NULL,
  "codigo" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "nombre_comercial" TEXT,
  "cif" TEXT,
  "nif" TEXT,
  "doc_normalizado" TEXT,
  "persona_fisica" BOOLEAN NOT NULL,
  "segmento_crm" "SegmentoCrm" NOT NULL,
  "categoria" INTEGER,
  "email" TEXT,
  "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "telefono" TEXT,
  "movil" TEXT,
  "domicilio" TEXT,
  "numero" TEXT,
  "piso" TEXT,
  "puerta" TEXT,
  "codigo_postal" TEXT,
  "municipio" TEXT,
  "provincia" TEXT,
  "pais" TEXT,
  "comercial" INTEGER,
  "agente" INTEGER,
  "fecha_inicio" DATE,
  "fecha_fin" DATE,
  "factura_mail" BOOLEAN NOT NULL DEFAULT false,
  "recibe_publicidad_isp" BOOLEAN NOT NULL DEFAULT false,
  "idioma" TEXT,
  "baneado" BOOLEAN NOT NULL DEFAULT false,
  "estado_marketing" TEXT NOT NULL DEFAULT 'SIN_CONSENTIMIENTO',
  "baja_marketing_motivo" TEXT,
  "baja_marketing_at" TIMESTAMP(3),
  "huella" TEXT NOT NULL,
  "cliente_web_id" INTEGER,
  "crm_contacto_id" TEXT,
  "crm_empresa_id" TEXT,
  "presente_en_ultimo_fichero" BOOLEAN NOT NULL DEFAULT true,
  "primera_importacion_id" TEXT,
  "ultima_importacion_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_isp_clientes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_isp_clientes_estado_marketing_check" CHECK ("estado_marketing" IN ('APTO', 'BAJA', 'SIN_CONSENTIMIENTO', 'SIN_EMAIL'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_isp_clientes_isp_cliente_id_key" ON "area1_isp_clientes"("isp_cliente_id");
CREATE INDEX IF NOT EXISTS "area1_isp_clientes_codigo_idx" ON "area1_isp_clientes"("codigo");
CREATE INDEX IF NOT EXISTS "area1_isp_clientes_doc_normalizado_idx" ON "area1_isp_clientes"("doc_normalizado");
CREATE INDEX IF NOT EXISTS "area1_isp_clientes_cliente_web_id_idx" ON "area1_isp_clientes"("cliente_web_id");
CREATE INDEX IF NOT EXISTS "area1_isp_clientes_crm_contacto_id_idx" ON "area1_isp_clientes"("crm_contacto_id");
CREATE INDEX IF NOT EXISTS "area1_isp_clientes_crm_empresa_id_idx" ON "area1_isp_clientes"("crm_empresa_id");
CREATE INDEX IF NOT EXISTS "area1_isp_clientes_estado_marketing_idx" ON "area1_isp_clientes"("estado_marketing");
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_isp_clientes_cliente_web_id_fkey') THEN
    ALTER TABLE "area1_isp_clientes" ADD CONSTRAINT "area1_isp_clientes_cliente_web_id_fkey" FOREIGN KEY ("cliente_web_id") REFERENCES "clientes_web"("id") ON DELETE SET NULL;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_isp_clientes_crm_contacto_id_fkey') THEN
    ALTER TABLE "area1_isp_clientes" ADD CONSTRAINT "area1_isp_clientes_crm_contacto_id_fkey" FOREIGN KEY ("crm_contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE SET NULL;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_isp_clientes_crm_empresa_id_fkey') THEN
    ALTER TABLE "area1_isp_clientes" ADD CONSTRAINT "area1_isp_clientes_crm_empresa_id_fkey" FOREIGN KEY ("crm_empresa_id") REFERENCES "crm_empresas"("id") ON DELETE SET NULL;
  END IF;
END $area1$;

CREATE TABLE IF NOT EXISTS "area1_isp_contratos" (
  "id" TEXT NOT NULL,
  "isp_contrato_id" INTEGER NOT NULL,
  "codigo_contrato_isp" TEXT NOT NULL,
  "serie" TEXT,
  "isp_cliente_row_id" TEXT,
  "asignacion_cliente" TEXT NOT NULL,
  "candidatos_cliente" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "cliente_nombre_fichero" TEXT NOT NULL,
  "doc_normalizado" TEXT,
  "estado" TEXT NOT NULL,
  "activo" BOOLEAN NOT NULL,
  "tarifa" TEXT,
  "descripcion" TEXT,
  "linea_asociada" TEXT,
  "importe_sin_iva" DECIMAL(14,4),
  "descuento" DECIMAL(14,4),
  "velocidad" TEXT,
  "fecha_alta" DATE,
  "fecha_baja" DATE,
  "permanencia_hasta" DATE,
  "permanencia_texto" TEXT,
  "periodicidad" TEXT,
  "forma_pago" TEXT,
  "proveedor" TEXT,
  "identificador_operador" TEXT,
  "observaciones" TEXT,
  "contrato_servicio_id" INTEGER,
  "huella" TEXT NOT NULL,
  "presente_en_ultimo_fichero" BOOLEAN NOT NULL DEFAULT true,
  "ultima_importacion_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_isp_contratos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_isp_contratos_asignacion_check" CHECK ("asignacion_cliente" IN ('NIF', 'NIF_NOMBRE', 'AMBIGUO', 'HUERFANO'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_isp_contratos_isp_contrato_id_key" ON "area1_isp_contratos"("isp_contrato_id");
CREATE INDEX IF NOT EXISTS "area1_isp_contratos_codigo_contrato_isp_idx" ON "area1_isp_contratos"("codigo_contrato_isp");
CREATE INDEX IF NOT EXISTS "area1_isp_contratos_isp_cliente_row_id_idx" ON "area1_isp_contratos"("isp_cliente_row_id");
CREATE INDEX IF NOT EXISTS "area1_isp_contratos_contrato_servicio_id_idx" ON "area1_isp_contratos"("contrato_servicio_id");
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_isp_contratos_isp_cliente_row_id_fkey') THEN
    ALTER TABLE "area1_isp_contratos" ADD CONSTRAINT "area1_isp_contratos_isp_cliente_row_id_fkey" FOREIGN KEY ("isp_cliente_row_id") REFERENCES "area1_isp_clientes"("id") ON DELETE SET NULL;
  END IF;
END $area1$;

CREATE TABLE IF NOT EXISTS "area1_isp_facturacion_mensual" (
  "id" TEXT NOT NULL,
  "codigo_cliente" TEXT NOT NULL,
  "anio" INTEGER NOT NULL,
  "mes" INTEGER NOT NULL,
  "importe_base" DECIMAL(14,2) NOT NULL,
  "ultima_importacion_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_isp_facturacion_mensual_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_isp_facturacion_mensual_mes_check" CHECK ("mes" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_isp_facturacion_mensual_codigo_anio_mes_key" ON "area1_isp_facturacion_mensual"("codigo_cliente", "anio", "mes");
CREATE INDEX IF NOT EXISTS "area1_isp_facturacion_mensual_anio_mes_idx" ON "area1_isp_facturacion_mensual"("anio", "mes");

CREATE TABLE IF NOT EXISTS "area1_isp_vinculos" (
  "id" TEXT NOT NULL,
  "isp_cliente_row_id" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "destino_id" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "confianza" TEXT NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
  "detalle" JSONB,
  "revisado_por" TEXT,
  "revisado_at" TIMESTAMP(3),
  "ultima_importacion_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_isp_vinculos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_isp_vinculos_tipo_check" CHECK ("tipo" IN ('CLIENTE_WEB', 'CRM_CONTACTO', 'CRM_EMPRESA', 'CREAR_CONTACTO', 'CREAR_EMPRESA')),
  CONSTRAINT "area1_isp_vinculos_confianza_check" CHECK ("confianza" IN ('ALTA', 'MEDIA', 'BAJA')),
  CONSTRAINT "area1_isp_vinculos_estado_check" CHECK ("estado" IN ('PENDIENTE', 'CONFIRMADO', 'DESCARTADO', 'OBSOLETO'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_isp_vinculos_cliente_tipo_destino_key" ON "area1_isp_vinculos"("isp_cliente_row_id", "tipo", "destino_id");
CREATE INDEX IF NOT EXISTS "area1_isp_vinculos_estado_tipo_idx" ON "area1_isp_vinculos"("estado", "tipo");
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_isp_vinculos_isp_cliente_row_id_fkey') THEN
    ALTER TABLE "area1_isp_vinculos" ADD CONSTRAINT "area1_isp_vinculos_isp_cliente_row_id_fkey" FOREIGN KEY ("isp_cliente_row_id") REFERENCES "area1_isp_clientes"("id") ON DELETE CASCADE;
  END IF;
END $area1$;
