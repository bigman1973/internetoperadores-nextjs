-- CreateEnum
CREATE TYPE "EstadoGestionPendienteB5" AS ENUM ('PENDIENTE', 'PEDIDO', 'RECIBIDO', 'VINCULADO', 'NO_REQUIERE');

-- CreateEnum
CREATE TYPE "AccionAuditoriaGestionPendienteB5" AS ENUM ('CREACION', 'ACTUALIZACION');

-- CreateEnum
CREATE TYPE "EstadoAdjuntoPendienteB5" AS ENUM ('RESERVADO', 'UPLOAD_COMPLETO');

-- CreateTable
CREATE TABLE "gestiones_pendientes_movimiento_b5" (
    "id" UUID NOT NULL,
    "movimiento_id" TEXT NOT NULL,
    "responsable_admin_id" INTEGER,
    "nota" TEXT,
    "estado" "EstadoGestionPendienteB5" NOT NULL DEFAULT 'PENDIENTE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gestiones_pendientes_movimiento_b5_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias_gestiones_pendientes_b5" (
    "id" UUID NOT NULL,
    "gestion_id" UUID NOT NULL,
    "movimiento_id" TEXT NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "accion" "AccionAuditoriaGestionPendienteB5" NOT NULL,
    "version_anterior" INTEGER NOT NULL,
    "version_resultante" INTEGER NOT NULL,
    "snapshot_anterior" JSONB NOT NULL,
    "snapshot_resultado" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_gestiones_pendientes_b5_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarjetas_financieras_b5" (
    "last4" VARCHAR(4) NOT NULL,
    "titular_admin_id" INTEGER,
    "registrada_por_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarjetas_financieras_b5_pkey" PRIMARY KEY ("last4")
);

-- CreateTable
CREATE TABLE "adjuntos_pendientes_b5" (
    "nombre_tercero" TEXT,
    "concepto" TEXT,
    "mime_type" TEXT,
    "id" UUID NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "payload_hash" CHAR(64) NOT NULL,
    "movimiento_id" TEXT NOT NULL,
    "tipo_documento" VARCHAR(16) NOT NULL DEFAULT 'SOPORTE',
    "fecha_documento" DATE,
    "importe_documento_centimos" INTEGER,
    "estado" "EstadoAdjuntoPendienteB5" NOT NULL DEFAULT 'RESERVADO',
    "file_sha256" CHAR(64) NOT NULL,
    "storage_name" TEXT NOT NULL,
    "gasto_id" TEXT,
    "documento_conciliable_id" UUID,
    "drive_id" TEXT,
    "onedrive_item_id" TEXT,
    "authenticated_web_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "adjuntos_pendientes_b5_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gestiones_pendientes_movimiento_b5_movimiento_id_key" ON "gestiones_pendientes_movimiento_b5"("movimiento_id");

-- CreateIndex
CREATE INDEX "gestiones_pendientes_movimiento_b5_responsable_admin_id_upd_idx" ON "gestiones_pendientes_movimiento_b5"("responsable_admin_id", "updated_at");

-- CreateIndex
CREATE INDEX "gestiones_pendientes_movimiento_b5_estado_updated_at_idx" ON "gestiones_pendientes_movimiento_b5"("estado", "updated_at");

-- CreateIndex
CREATE INDEX "auditorias_gestiones_pendientes_b5_movimiento_id_created_at_idx" ON "auditorias_gestiones_pendientes_b5"("movimiento_id", "created_at");

-- CreateIndex
CREATE INDEX "auditorias_gestiones_pendientes_b5_gestion_id_created_at_idx" ON "auditorias_gestiones_pendientes_b5"("gestion_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "adjuntos_pendientes_b5_gasto_id_key" ON "adjuntos_pendientes_b5"("gasto_id");

-- CreateIndex
CREATE UNIQUE INDEX "adjuntos_pendientes_b5_documento_conciliable_id_key" ON "adjuntos_pendientes_b5"("documento_conciliable_id");

-- CreateIndex
CREATE UNIQUE INDEX "adjuntos_pendientes_b5_onedrive_item_id_key" ON "adjuntos_pendientes_b5"("onedrive_item_id");

-- CreateIndex
CREATE INDEX "adjuntos_pendientes_b5_movimiento_id_created_at_idx" ON "adjuntos_pendientes_b5"("movimiento_id", "created_at");

-- CreateIndex
CREATE INDEX "adjuntos_pendientes_b5_estado_updated_at_idx" ON "adjuntos_pendientes_b5"("estado", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "adjuntos_pendientes_b5_actor_id_idempotency_key_key" ON "adjuntos_pendientes_b5"("actor_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "gestiones_pendientes_movimiento_b5" ADD CONSTRAINT "gestiones_pendientes_movimiento_b5_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "gestiones_pendientes_movimiento_b5" ADD CONSTRAINT "gestiones_pendientes_movimiento_b5_responsable_admin_id_fkey" FOREIGN KEY ("responsable_admin_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_gestiones_pendientes_b5" ADD CONSTRAINT "auditorias_gestiones_pendientes_b5_gestion_id_fkey" FOREIGN KEY ("gestion_id") REFERENCES "gestiones_pendientes_movimiento_b5"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_gestiones_pendientes_b5" ADD CONSTRAINT "auditorias_gestiones_pendientes_b5_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_gestiones_pendientes_b5" ADD CONSTRAINT "auditorias_gestiones_pendientes_b5_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarjetas_financieras_b5" ADD CONSTRAINT "tarjetas_financieras_b5_titular_admin_id_fkey" FOREIGN KEY ("titular_admin_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tarjetas_financieras_b5" ADD CONSTRAINT "tarjetas_financieras_b5_registrada_por_id_fkey" FOREIGN KEY ("registrada_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "adjuntos_pendientes_b5" ADD CONSTRAINT "adjuntos_pendientes_b5_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "adjuntos_pendientes_b5" ADD CONSTRAINT "adjuntos_pendientes_b5_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "adjuntos_pendientes_b5" ADD CONSTRAINT "adjuntos_pendientes_b5_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gastos"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "adjuntos_pendientes_b5" ADD CONSTRAINT "adjuntos_pendientes_b5_documento_conciliable_id_fkey" FOREIGN KEY ("documento_conciliable_id") REFERENCES "documentos_conciliables"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- B5: únicamente estructuras nuevas; sin inferir cobros/pagos ni vínculos.
ALTER TABLE gestiones_pendientes_movimiento_b5
 ADD CONSTRAINT b5_gestion_version CHECK(version>=1),
 ADD CONSTRAINT b5_gestion_nota CHECK(nota IS NULL OR length(btrim(nota)) BETWEEN 1 AND 2000),
 ADD CONSTRAINT b5_gestion_estado_humano CHECK(estado::text IN('PENDIENTE','PEDIDO','RECIBIDO'));
ALTER TABLE auditorias_gestiones_pendientes_b5
 ADD CONSTRAINT b5_auditoria_versiones CHECK(version_anterior>=1 AND version_resultante=version_anterior+1);
ALTER TABLE tarjetas_financieras_b5
 ADD CONSTRAINT b5_tarjeta_catalogo CHECK(last4 IN('9029','6440','2390','8964')),
 ADD CONSTRAINT b5_tarjeta_no_inventar_titular CHECK(last4 IN('9029','6440') OR titular_admin_id IS NULL);
ALTER TABLE adjuntos_pendientes_b5
 ADD CONSTRAINT b5_adjunto_tipo CHECK(tipo_documento IN('TICKET','SOPORTE')),
 ADD CONSTRAINT b5_adjunto_hashes CHECK(payload_hash ~ '^[a-f0-9]{64}$' AND file_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT b5_adjunto_nombre CHECK(storage_name ~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|jpg|png)$'),
 ADD CONSTRAINT b5_adjunto_ticket_importe CHECK(tipo_documento<>'TICKET' OR (fecha_documento IS NOT NULL AND importe_documento_centimos IS NOT NULL AND importe_documento_centimos>0)),
 ADD CONSTRAINT b5_adjunto_soporte_no_compra CHECK(tipo_documento<>'SOPORTE' OR (gasto_id IS NULL AND documento_conciliable_id IS NULL)),
 ADD CONSTRAINT b5_adjunto_estado CHECK(
  (estado::text='RESERVADO' AND gasto_id IS NULL AND documento_conciliable_id IS NULL AND drive_id IS NULL AND onedrive_item_id IS NULL AND authenticated_web_url IS NULL)
  OR (estado::text='UPLOAD_COMPLETO' AND drive_id IS NOT NULL AND onedrive_item_id IS NOT NULL AND authenticated_web_url LIKE 'https://%' AND (tipo_documento='SOPORTE' OR (gasto_id IS NOT NULL AND documento_conciliable_id IS NOT NULL)))
 );
CREATE FUNCTION b5_rechazar_edicion_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'B5 conserva sus registros de auditoría sin edición ni borrado' USING ERRCODE='55000';
END;
$$;
CREATE TRIGGER b5_auditoria_inmutable BEFORE UPDATE OR DELETE ON auditorias_gestiones_pendientes_b5 FOR EACH ROW EXECUTE FUNCTION b5_rechazar_edicion_auditoria();
CREATE TRIGGER b5_tarjetas_inmutables BEFORE UPDATE OR DELETE ON tarjetas_financieras_b5 FOR EACH ROW EXECUTE FUNCTION b5_rechazar_edicion_auditoria();
CREATE FUNCTION b5_preservar_adjunto() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'B5 no borra adjuntos' USING ERRCODE='55000'; END IF;
 IF OLD.estado::text='UPLOAD_COMPLETO' THEN RAISE EXCEPTION 'B5 conserva el adjunto completado' USING ERRCODE='55000'; END IF;
 IF (to_jsonb(OLD)-ARRAY['estado','gasto_id','documento_conciliable_id','drive_id','onedrive_item_id','authenticated_web_url','updated_at']) IS DISTINCT FROM (to_jsonb(NEW)-ARRAY['estado','gasto_id','documento_conciliable_id','drive_id','onedrive_item_id','authenticated_web_url','updated_at']) THEN RAISE EXCEPTION 'B5 no altera la reserva ni su identidad' USING ERRCODE='55000'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER b5_adjuntos_preservados BEFORE UPDATE OR DELETE ON adjuntos_pendientes_b5 FOR EACH ROW EXECUTE FUNCTION b5_preservar_adjunto();
