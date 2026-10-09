-- CreateTable
CREATE TABLE "grupos_coste_operadora" (
    "id" TEXT NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "clave" VARCHAR(240) NOT NULL,
    "ambito" VARCHAR(40) NOT NULL,
    "zona" VARCHAR(160),
    "conexion" VARCHAR(160),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_coste_operadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fuentes_coste_operadora" (
    "id" TEXT NOT NULL,
    "clave_origen" VARCHAR(64) NOT NULL,
    "origen" VARCHAR(20) NOT NULL,
    "empresa_pagadora" VARCHAR(160) NOT NULL,
    "periodo" VARCHAR(7) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'BORRADOR',
    "snapshot" JSONB NOT NULL,
    "fuente_version" VARCHAR(64) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "notas" TEXT,
    "documento_drive" TEXT,
    "documento_item" TEXT,
    "documento_hash" VARCHAR(64),
    "documento_nombre" VARCHAR(200),
    "creado_por" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fuentes_coste_operadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_coste_operadora" (
    "id" TEXT NOT NULL,
    "fuente_id" TEXT NOT NULL,
    "factura_id" TEXT NOT NULL,
    "rol" VARCHAR(20) NOT NULL,
    "version" VARCHAR(64) NOT NULL,

    CONSTRAINT "documentos_coste_operadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articulos_coste_operadora" (
    "id" TEXT NOT NULL,
    "fuente_id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "importe" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "articulos_coste_operadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_coste_operadora" (
    "id" TEXT NOT NULL,
    "fuente_id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "accion" VARCHAR(30) NOT NULL,
    "datos" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_coste_operadora_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "grupos_coste_operadora_clave_key" ON "grupos_coste_operadora"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "fuentes_coste_operadora_clave_origen_key" ON "fuentes_coste_operadora"("clave_origen");

-- CreateIndex
CREATE UNIQUE INDEX "fuentes_coste_operadora_documento_item_key" ON "fuentes_coste_operadora"("documento_item");

-- CreateIndex
CREATE UNIQUE INDEX "fuentes_coste_operadora_documento_hash_key" ON "fuentes_coste_operadora"("documento_hash");

-- CreateIndex
CREATE INDEX "fuentes_coste_operadora_periodo_estado_idx" ON "fuentes_coste_operadora"("periodo", "estado");

-- CreateIndex
CREATE INDEX "fuentes_coste_operadora_origen_periodo_idx" ON "fuentes_coste_operadora"("origen", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_coste_operadora_factura_id_key" ON "documentos_coste_operadora"("factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_coste_operadora_fuente_id_rol_key" ON "documentos_coste_operadora"("fuente_id", "rol");

-- CreateIndex
CREATE INDEX "articulos_coste_operadora_grupo_id_idx" ON "articulos_coste_operadora"("grupo_id");

-- CreateIndex
CREATE UNIQUE INDEX "articulos_coste_operadora_fuente_id_indice_key" ON "articulos_coste_operadora"("fuente_id", "indice");

-- CreateIndex
CREATE INDEX "auditoria_coste_operadora_fuente_id_created_at_idx" ON "auditoria_coste_operadora"("fuente_id", "created_at");

-- AddForeignKey
ALTER TABLE "documentos_coste_operadora" ADD CONSTRAINT "documentos_coste_operadora_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "fuentes_coste_operadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_coste_operadora" ADD CONSTRAINT "documentos_coste_operadora_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulos_coste_operadora" ADD CONSTRAINT "articulos_coste_operadora_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "fuentes_coste_operadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articulos_coste_operadora" ADD CONSTRAINT "articulos_coste_operadora_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos_coste_operadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_coste_operadora" ADD CONSTRAINT "auditoria_coste_operadora_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "fuentes_coste_operadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Garantías aditivas sobre tablas nuevas y guardas de INSERT/UPDATE en relaciones.
-- No cambian ni eliminan filas existentes. No aplican repartos.
ALTER TABLE grupos_coste_operadora ADD CONSTRAINT grupos_operadora_ambito_check CHECK (
  (ambito = 'GLOBAL_RED_PROPIA' AND zona IS NULL AND conexion IS NULL) OR
  (ambito = 'ZONA' AND LENGTH(BTRIM(zona)) > 0 AND LENGTH(BTRIM(conexion)) > 0)
);
ALTER TABLE fuentes_coste_operadora ADD CONSTRAINT fuentes_operadora_estado_check CHECK (estado IN ('BORRADOR','REVISADO','ARCHIVADO'));
ALTER TABLE fuentes_coste_operadora ADD CONSTRAINT fuentes_operadora_origen_check CHECK (origen IN ('PROPIA','TERCERO'));
ALTER TABLE documentos_coste_operadora ADD CONSTRAINT documentos_operadora_rol_check CHECK (rol IN ('ORIGINAL','REFACTURA'));
ALTER TABLE articulos_coste_operadora ADD CONSTRAINT articulos_operadora_indice_check CHECK (indice >= -1 AND indice < 200);

CREATE OR REPLACE FUNCTION guard_operator_document_reservation() RETURNS TRIGGER AS $$
BEGIN
  -- Todas las vías que escriben enlaces se sincronizan con esta fila.
  PERFORM id FROM facturas_recibidas WHERE id = NEW.factura_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM vinculaciones_facturas WHERE factura_recibida_id = NEW.factura_id)
    OR EXISTS (SELECT 1 FROM imputaciones_coste_cliente WHERE factura_id = NEW.factura_id AND confirmado = true)
    OR EXISTS (SELECT 1 FROM facturas_recibidas WHERE id = NEW.factura_id AND imputado_a_ventas = true) THEN
    RAISE EXCEPTION 'La factura ya tiene costes imputados a ventas; no puede reservarse como coste de operadora' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_operator_document_reservation BEFORE INSERT OR UPDATE ON documentos_coste_operadora
  FOR EACH ROW EXECUTE FUNCTION guard_operator_document_reservation();

CREATE OR REPLACE FUNCTION guard_operator_sale_link() RETURNS TRIGGER AS $$
DECLARE invoice_id TEXT;
BEGIN
  IF TG_TABLE_NAME = 'vinculaciones_facturas' THEN invoice_id := NEW.factura_recibida_id;
  ELSE
    IF NEW.confirmado IS NOT TRUE THEN RETURN NEW; END IF;
    invoice_id := NEW.factura_id;
  END IF;
  PERFORM id FROM facturas_recibidas WHERE id = invoice_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM documentos_coste_operadora WHERE factura_id = invoice_id) THEN
    RAISE EXCEPTION 'Factura reservada en Costes de operadora; no se puede imputar directamente a ventas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_operator_purchase_link BEFORE INSERT OR UPDATE ON vinculaciones_facturas
  FOR EACH ROW EXECUTE FUNCTION guard_operator_sale_link();
CREATE TRIGGER guard_operator_client_pool BEFORE INSERT OR UPDATE ON imputaciones_coste_cliente
  FOR EACH ROW EXECUTE FUNCTION guard_operator_sale_link();

ALTER TABLE grupos_coste_operadora ADD CONSTRAINT grupos_operadora_zona_no_null CHECK (ambito <> 'ZONA' OR (zona IS NOT NULL AND conexion IS NOT NULL));
ALTER TABLE fuentes_coste_operadora ADD CONSTRAINT fuentes_operadora_periodo_check CHECK (periodo ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$');
ALTER TABLE fuentes_coste_operadora ADD CONSTRAINT fuentes_operadora_version_check CHECK (version >= 1 AND fuente_version ~ '^[a-f0-9]{64}$' AND clave_origen ~ '^[a-f0-9]{64}$');
ALTER TABLE fuentes_coste_operadora ADD CONSTRAINT fuentes_operadora_pdf_hash_check CHECK (documento_hash IS NULL OR documento_hash ~ '^[a-f0-9]{64}$');

CREATE OR REPLACE FUNCTION guard_operator_invoice_sale_flag() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.imputado_a_ventas = true AND EXISTS (SELECT 1 FROM documentos_coste_operadora WHERE factura_id = NEW.id) THEN
    RAISE EXCEPTION 'Factura reservada en Costes de operadora; no se puede marcar imputada a ventas' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER guard_operator_invoice_sale_flag BEFORE UPDATE OF imputado_a_ventas ON facturas_recibidas
  FOR EACH ROW EXECUTE FUNCTION guard_operator_invoice_sale_flag();
