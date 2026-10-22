-- CreateEnum
CREATE TYPE "NaturalezaDocumentoFinanciero" AS ENUM ('FACTURA_RECIBIDA', 'SOPORTE_CONFIRMING_CLIENTE');

-- CreateEnum
CREATE TYPE "TipoSoporteFinanciero" AS ENUM ('CONFIRMING_CESION_DRAXTON');

-- CreateEnum
CREATE TYPE "EstadoSoporteConfirmingDraxton" AS ENUM ('CONFIRMADO', 'REVOCADO');

-- CreateEnum
CREATE TYPE "AccionAuditoriaSoporteConfirmingDraxton" AS ENUM ('CONFIRMACION', 'REVOCACION');

-- CreateEnum
CREATE TYPE "AccionAuditoriaClasificacionConfirmingDraxton" AS ENUM ('CLASIFICACION', 'DESCLASIFICACION');

-- AlterTable
ALTER TABLE "facturas_recibidas" ADD COLUMN     "naturaleza_documento" "NaturalezaDocumentoFinanciero" NOT NULL DEFAULT 'FACTURA_RECIBIDA',
ADD COLUMN     "tipo_soporte_financiero" "TipoSoporteFinanciero",
ADD COLUMN     "version_naturaleza_documento" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "soportes_confirming_draxton" (
    "id" UUID NOT NULL,
    "factura_recibida_id" TEXT NOT NULL,
    "movimiento_id" TEXT NOT NULL,
    "tipo" "TipoSoporteFinanciero" NOT NULL DEFAULT 'CONFIRMING_CESION_DRAXTON',
    "estado" "EstadoSoporteConfirmingDraxton" NOT NULL DEFAULT 'CONFIRMADO',
    "referencia_documental" TEXT NOT NULL,
    "fuente_hash" CHAR(64) NOT NULL,
    "fuente_snapshot" JSONB NOT NULL,
    "confirmado_por_id" INTEGER NOT NULL,
    "confirmado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_por_id" INTEGER,
    "revocado_at" TIMESTAMP(3),
    "motivo_revocacion" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "soportes_confirming_draxton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias_clasificacion_confirming_draxton" (
    "id" UUID NOT NULL,
    "factura_recibida_id" TEXT NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "accion" "AccionAuditoriaClasificacionConfirmingDraxton" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "version_anterior" INTEGER NOT NULL,
    "version_resultante" INTEGER NOT NULL,
    "snapshot_anterior" JSONB NOT NULL,
    "snapshot_resultado" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_clasificacion_confirming_draxton_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias_soportes_confirming_draxton" (
    "id" UUID NOT NULL,
    "soporte_id" UUID NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "accion" "AccionAuditoriaSoporteConfirmingDraxton" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_soportes_confirming_draxton_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "soportes_confirming_draxton_movimiento_id_estado_idx" ON "soportes_confirming_draxton"("movimiento_id", "estado");

-- CreateIndex
CREATE INDEX "soportes_confirming_draxton_factura_recibida_id_estado_idx" ON "soportes_confirming_draxton"("factura_recibida_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "soportes_confirming_draxton_factura_recibida_id_movimiento__key" ON "soportes_confirming_draxton"("factura_recibida_id", "movimiento_id");

-- CreateIndex
CREATE INDEX "auditorias_clasificacion_confirming_draxton_factura_recibid_idx" ON "auditorias_clasificacion_confirming_draxton"("factura_recibida_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auditorias_clasificacion_confirming_draxton_actor_id_idempo_key" ON "auditorias_clasificacion_confirming_draxton"("actor_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "auditorias_soportes_confirming_draxton_soporte_id_created_a_idx" ON "auditorias_soportes_confirming_draxton"("soporte_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auditorias_soportes_confirming_draxton_actor_id_idempotency_key" ON "auditorias_soportes_confirming_draxton"("actor_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_factura_recibida_id_fkey" FOREIGN KEY ("factura_recibida_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_revocado_por_id_fkey" FOREIGN KEY ("revocado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_clasificacion_confirming_draxton" ADD CONSTRAINT "auditorias_clasificacion_confirming_draxton_factura_recibi_fkey" FOREIGN KEY ("factura_recibida_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_clasificacion_confirming_draxton" ADD CONSTRAINT "auditorias_clasificacion_confirming_draxton_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_soportes_confirming_draxton" ADD CONSTRAINT "auditorias_soportes_confirming_draxton_soporte_id_fkey" FOREIGN KEY ("soporte_id") REFERENCES "soportes_confirming_draxton"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_soportes_confirming_draxton" ADD CONSTRAINT "auditorias_soportes_confirming_draxton_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Checks de contrato y guardas C9; no DML de negocio.
ALTER TABLE "auditorias_clasificacion_confirming_draxton" ADD CONSTRAINT "auditorias_clasificacion_confirming_draxton_accion_ck" CHECK ("accion" IN ('CLASIFICACION', 'DESCLASIFICACION'));
ALTER TABLE "auditorias_clasificacion_confirming_draxton" ADD CONSTRAINT "auditorias_clasificacion_confirming_draxton_version_ck" CHECK ("version_anterior" >= 1 AND "version_resultante" = "version_anterior" + 1);
ALTER TABLE "auditorias_clasificacion_confirming_draxton" ADD CONSTRAINT "auditorias_clasificacion_confirming_draxton_key_ck" CHECK (length(btrim("idempotency_key")) BETWEEN 1 AND 160);
ALTER TABLE "auditorias_clasificacion_confirming_draxton" ADD CONSTRAINT "auditorias_clasificacion_confirming_draxton_hash_ck" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_referencia_ck" CHECK (length(btrim("referencia_documental")) BETWEEN 1 AND 2000);
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_fuente_hash_ck" CHECK ("fuente_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_version_ck" CHECK ("version" >= 1);
ALTER TABLE "soportes_confirming_draxton" ADD CONSTRAINT "soportes_confirming_draxton_estado_campos_ck" CHECK (
    ("estado" = 'CONFIRMADO' AND "revocado_por_id" IS NULL AND "revocado_at" IS NULL AND "motivo_revocacion" IS NULL)
    OR
    ("estado" = 'REVOCADO' AND "revocado_por_id" IS NOT NULL AND "revocado_at" IS NOT NULL
      AND length(btrim("motivo_revocacion")) BETWEEN 1 AND 2000)
  );
ALTER TABLE "auditorias_soportes_confirming_draxton" ADD CONSTRAINT "auditorias_soportes_confirming_draxton_key_ck" CHECK (length(btrim("idempotency_key")) BETWEEN 1 AND 160);
ALTER TABLE "auditorias_soportes_confirming_draxton" ADD CONSTRAINT "auditorias_soportes_confirming_draxton_hash_ck" CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "facturas_recibidas"
  ADD CONSTRAINT "facturas_recibidas_naturaleza_soporte_c9_ck"
  CHECK (
    (("naturaleza_documento" = 'FACTURA_RECIBIDA' AND "tipo_soporte_financiero" IS NULL)
    OR
    ("naturaleza_documento" = 'SOPORTE_CONFIRMING_CLIENTE'
      AND "tipo_soporte_financiero" = 'CONFIRMING_CESION_DRAXTON'))
    AND "version_naturaleza_documento" >= 1
  );

CREATE FUNCTION c9_guard_naturaleza_documento()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version_naturaleza_documento < 1 THEN
    RAISE EXCEPTION 'C9 versión de naturaleza inválida' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.naturaleza_documento IS DISTINCT FROM OLD.naturaleza_documento
      OR NEW.tipo_soporte_financiero IS DISTINCT FROM OLD.tipo_soporte_financiero) THEN
    IF NEW.version_naturaleza_documento <> OLD.version_naturaleza_documento + 1 THEN
      RAISE EXCEPTION 'C9 clasificación exige incremento unitario de versión' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.version_naturaleza_documento <> OLD.version_naturaleza_documento THEN
    RAISE EXCEPTION 'C9 no permite cambiar versión sin reclasificación' USING ERRCODE = '23514';
  END IF;
  IF NEW.naturaleza_documento = 'SOPORTE_CONFIRMING_CLIENTE'::"NaturalezaDocumentoFinanciero"
     AND EXISTS (SELECT 1 FROM documentos_conciliables d JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true WHERE d.factura_recibida_id = NEW.id) THEN
    RAISE EXCEPTION 'C9 no permite clasificar como soporte una fuente con justificación B4 activa' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "facturas_recibidas_naturaleza_c9_tr"
  BEFORE UPDATE OF naturaleza_documento, tipo_soporte_financiero, version_naturaleza_documento ON "facturas_recibidas"
  FOR EACH ROW EXECUTE FUNCTION c9_guard_naturaleza_documento();

CREATE FUNCTION c9_guard_documento_conciliable_fuente()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE naturaleza "NaturalezaDocumentoFinanciero";
BEGIN
  IF NEW.factura_recibida_id IS NULL THEN RETURN NEW; END IF;
  SELECT naturaleza_documento INTO naturaleza FROM facturas_recibidas WHERE id = NEW.factura_recibida_id FOR KEY SHARE;
  IF naturaleza = 'SOPORTE_CONFIRMING_CLIENTE'::"NaturalezaDocumentoFinanciero" OR EXISTS (SELECT 1 FROM facturas_recibidas f WHERE f.id=NEW.factura_recibida_id AND (COALESCE(f.carpeta_origen,'') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)' OR COALESCE(f.archivo_onedrive,'') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)' OR COALESCE(f.onedrive_ruta_actual,'') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)')) THEN
    RAISE EXCEPTION 'C9 soporte confirming no puede ser DocumentoConciliable B4' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "documentos_conciliables_fuente_confirming_c9_tr"
  BEFORE INSERT OR UPDATE OF factura_recibida_id ON "documentos_conciliables"
  FOR EACH ROW EXECUTE FUNCTION c9_guard_documento_conciliable_fuente();

-- La FK sólo acredita existencia; esta guarda exige que el documento origen ya
-- haya sido clasificado por un humano como soporte confirming de cliente. No
-- evalúa ni copia importes OCR y no se relaciona con documentos_conciliables.
CREATE FUNCTION c9_guard_soporte_confirming_draxton()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  naturaleza "NaturalezaDocumentoFinanciero";
  tipo_fuente "TipoSoporteFinanciero";
BEGIN
  SELECT naturaleza_documento, tipo_soporte_financiero
    INTO naturaleza, tipo_fuente
    FROM facturas_recibidas
   WHERE id = NEW.factura_recibida_id
   FOR KEY SHARE;
  IF NOT FOUND OR naturaleza <> 'SOPORTE_CONFIRMING_CLIENTE'::"NaturalezaDocumentoFinanciero"
     OR tipo_fuente <> 'CONFIRMING_CESION_DRAXTON'::"TipoSoporteFinanciero"
     OR EXISTS (SELECT 1 FROM documentos_conciliables d JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true WHERE d.factura_recibida_id = NEW.factura_recibida_id) THEN
    RAISE EXCEPTION 'C9 exige fuente confirming sin justificación B4 activa' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado <> 'CONFIRMADO'::"EstadoSoporteConfirmingDraxton"
       OR NEW.version <> 1 OR NEW.revocado_por_id IS NOT NULL OR NEW.revocado_at IS NOT NULL OR NEW.motivo_revocacion IS NOT NULL THEN
      RAISE EXCEPTION 'C9 alta sólo permite soporte confirmado inicial, versión 1 y sin revocación' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD.estado <> 'CONFIRMADO'::"EstadoSoporteConfirmingDraxton"
       OR NEW.estado <> 'REVOCADO'::"EstadoSoporteConfirmingDraxton"
       OR NEW.version <> OLD.version + 1
       OR NEW.factura_recibida_id IS DISTINCT FROM OLD.factura_recibida_id
       OR NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id
       OR NEW.tipo IS DISTINCT FROM OLD.tipo
       OR NEW.referencia_documental IS DISTINCT FROM OLD.referencia_documental
       OR NEW.fuente_hash IS DISTINCT FROM OLD.fuente_hash
       OR NEW.fuente_snapshot IS DISTINCT FROM OLD.fuente_snapshot
       OR NEW.confirmado_por_id IS DISTINCT FROM OLD.confirmado_por_id
       OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at THEN
      RAISE EXCEPTION 'C9 sólo permite una revocación explícita y versionada; no reescribe evidencia' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "soportes_confirming_draxton_guard_tr"
  BEFORE INSERT OR UPDATE ON "soportes_confirming_draxton"
  FOR EACH ROW EXECUTE FUNCTION c9_guard_soporte_confirming_draxton();

CREATE FUNCTION c9_rechazar_mutacion_auditoria()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es append-only C9', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "auditorias_soportes_confirming_draxton_no_update_delete_tr"
  BEFORE UPDATE OR DELETE ON "auditorias_soportes_confirming_draxton"
  FOR EACH ROW EXECUTE FUNCTION c9_rechazar_mutacion_auditoria();
CREATE TRIGGER "auditorias_clasificacion_confirming_draxton_no_update_delete_tr"
  BEFORE UPDATE OR DELETE ON "auditorias_clasificacion_confirming_draxton"
  FOR EACH ROW EXECUTE FUNCTION c9_rechazar_mutacion_auditoria();
