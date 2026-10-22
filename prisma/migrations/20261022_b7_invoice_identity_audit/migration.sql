-- CreateTable
CREATE TABLE "identidad_factura_isp_eventos_b7" (
    "id" UUID NOT NULL,
    "factura_emitida_id" TEXT NOT NULL,
    "factura_isp_id" INTEGER NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "fuente_hash" VARCHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identidad_factura_isp_eventos_b7_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "identidad_factura_isp_eventos_b7_factura_emitida_id_key" ON "identidad_factura_isp_eventos_b7"("factura_emitida_id");

-- CreateIndex
CREATE UNIQUE INDEX "identidad_factura_isp_eventos_b7_factura_isp_id_key" ON "identidad_factura_isp_eventos_b7"("factura_isp_id");

-- CreateIndex
CREATE INDEX "identidad_factura_isp_eventos_b7_created_at_idx" ON "identidad_factura_isp_eventos_b7"("created_at");

-- AddForeignKey
ALTER TABLE "identidad_factura_isp_eventos_b7" ADD CONSTRAINT "identidad_factura_isp_eventos_b7_factura_emitida_id_fkey" FOREIGN KEY ("factura_emitida_id") REFERENCES "facturas_emitidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identidad_factura_isp_eventos_b7" ADD CONSTRAINT "identidad_factura_isp_eventos_b7_factura_isp_id_fkey" FOREIGN KEY ("factura_isp_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "identidad_factura_isp_eventos_b7" ADD CONSTRAINT "identidad_factura_isp_eventos_b7_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- B7: identidad externa exacta, no evidencia de cobro.
CREATE OR REPLACE FUNCTION b7_validate_identity_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE fi facturas_emitidas%ROWTYPE; f facturas%ROWTYPE; cents integer;
BEGIN
  SELECT * INTO STRICT fi FROM facturas_emitidas WHERE id=NEW.factura_emitida_id FOR UPDATE;
  SELECT * INTO STRICT f FROM facturas WHERE id=NEW.factura_isp_id FOR SHARE;
  cents:=b4_importe_bancario_centimos(fi.total);
  IF fi.origen_sistema IS DISTINCT FROM 'ISPGestion' OR f.isp_gestion_id<=0
     OR fi.id_externo IS DISTINCT FROM f.isp_gestion_id::text
     OR fi.num_factura IS DISTINCT FROM f.numero_documento OR fi.serie IS DISTINCT FROM f.serie_factura
     OR fi.cliente IS DISTINCT FROM f.nombre_completo OR fi.cif IS DISTINCT FROM f.nif_cif
     OR fi.fecha::date IS DISTINCT FROM f.fecha::date OR cents IS NULL OR f.total*100<>cents
     OR (fi.factura_isp_id IS NOT NULL AND fi.factura_isp_id<>f.id)
     OR EXISTS(SELECT 1 FROM facturas_emitidas otra WHERE otra.factura_isp_id=f.id AND otra.id<>fi.id)
     OR NOT EXISTS(SELECT 1 FROM usuarios_admin u WHERE u.id=NEW.actor_id AND u.activo AND u.rol='SUPER_ADMIN')
     OR NEW.fuente_hash!~'^[0-9a-f]{64}$'
     OR NEW.snapshot->>'idExterno' IS DISTINCT FROM fi.id_externo
     OR NEW.snapshot->>'noAcreditaCobro' IS DISTINCT FROM 'true'
  THEN RAISE EXCEPTION 'B7 identidad de fuente no verificable o actor no autorizado' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b7_identity_event_insert BEFORE INSERT ON identidad_factura_isp_eventos_b7 FOR EACH ROW EXECUTE FUNCTION b7_validate_identity_event();

CREATE OR REPLACE FUNCTION b7_identity_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'B7 bitácora de identidad inmutable' USING ERRCODE='55000'; END $$;
CREATE TRIGGER b7_identity_event_immutable BEFORE UPDATE OR DELETE ON identidad_factura_isp_eventos_b7 FOR EACH ROW EXECUTE FUNCTION b7_identity_event_immutable();

CREATE OR REPLACE FUNCTION b7_guard_fi_identity_fk() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.factura_isp_id IS NOT DISTINCT FROM OLD.factura_isp_id THEN RETURN NEW; END IF;
  IF OLD.factura_isp_id IS NOT NULL OR NEW.factura_isp_id IS NULL
     OR NOT EXISTS(SELECT 1 FROM identidad_factura_isp_eventos_b7 e WHERE e.factura_emitida_id=NEW.id AND e.factura_isp_id=NEW.factura_isp_id)
  THEN RAISE EXCEPTION 'B7 enlace de identidad no auditado o reasignación prohibida' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER b7_fi_identity_fk BEFORE UPDATE OF factura_isp_id ON facturas_emitidas FOR EACH ROW EXECUTE FUNCTION b7_guard_fi_identity_fk();
