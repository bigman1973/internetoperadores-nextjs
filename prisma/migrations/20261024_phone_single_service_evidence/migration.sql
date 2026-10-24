-- Evidencia documental inmutable para propuestas analíticas, EXCLUSIVA staging.
-- No asigna costes, no concilia banco y no altera las facturas ni contratos fuente.
CREATE TABLE "evidencias_coste_telefono_stage" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "factura_id" TEXT NOT NULL,
  "pdf_sha256" CHAR(64) NOT NULL,
  "telefono" CHAR(9) NOT NULL,
  "base_centimos" INTEGER NOT NULL,
  "base_fuente_text" TEXT NOT NULL,
  "total_fuente_text" TEXT NOT NULL,
  "numero_factura" TEXT NOT NULL,
  "fecha_factura" DATE NOT NULL,
  "servicio_desde" DATE NOT NULL,
  "servicio_hasta" DATE NOT NULL,
  "version_extractor" TEXT NOT NULL,
  "evidencia" JSONB NOT NULL,
  "creada_por_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "evidencias_coste_telefono_stage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "evidencia_telefono_hash_ck" CHECK ("pdf_sha256" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "evidencia_telefono_numero_ck" CHECK ("telefono" ~ '^[6789][0-9]{8}$'),
  CONSTRAINT "evidencia_telefono_base_ck" CHECK ("base_centimos" > 0),
  CONSTRAINT "evidencia_telefono_periodo_ck" CHECK ("servicio_desde" <= "servicio_hasta" AND "servicio_hasta" <= "fecha_factura"),
  CONSTRAINT "evidencia_telefono_extractor_ck" CHECK ("version_extractor" = 'TELEFONICA_UNICA_PDF_V1'),
  CONSTRAINT "evidencia_telefono_schema_ck" CHECK (("evidencia"->>'schema' = 'TELEFONICA_UNICA_PDF_V1') IS TRUE),
  CONSTRAINT "evidencia_telefono_factura_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "evidencia_telefono_actor_fkey" FOREIGN KEY ("creada_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "evidencias_coste_telefono_stage_factura_pdf_version_key" ON "evidencias_coste_telefono_stage"("factura_id","pdf_sha256","version_extractor");
CREATE INDEX "evidencias_coste_telefono_stage_factura_created_idx" ON "evidencias_coste_telefono_stage"("factura_id","created_at");
CREATE FUNCTION telefono_stage_rechazar_mutacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La evidencia PDF de telefonía es inmutable' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER "telefono_stage_no_update_delete" BEFORE UPDATE OR DELETE ON "evidencias_coste_telefono_stage" FOR EACH ROW EXECUTE FUNCTION telefono_stage_rechazar_mutacion();
CREATE TRIGGER "telefono_stage_no_truncate" BEFORE TRUNCATE ON "evidencias_coste_telefono_stage" FOR EACH STATEMENT EXECUTE FUNCTION telefono_stage_rechazar_mutacion();
