-- CreateTable
CREATE TABLE "legado_conciliacion_b4" (
    "movimiento_id" TEXT NOT NULL,
    "id" UUID NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'HISTORICO',
    "lote" TEXT NOT NULL,
    "clasificacion" TEXT NOT NULL,
    "procedencia" TEXT NOT NULL,
    "motivos" JSONB NOT NULL,
    "documentos" JSONB NOT NULL,
    "snapshot_legacy" JSONB NOT NULL,
    "source_hash" TEXT NOT NULL,
    "importe_banco_centimos" INTEGER,
    "operacion_id" UUID,
    "creado_por_id" INTEGER NOT NULL,
    "creado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legado_conciliacion_b4_pkey" PRIMARY KEY ("movimiento_id")
);

-- CreateTable
CREATE TABLE "reversiones_legado_b4" (
    "id" UUID NOT NULL,
    "lote" TEXT NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "creado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reversiones_legado_b4_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legado_conciliacion_b4_id_key" ON "legado_conciliacion_b4"("id");

-- CreateIndex
CREATE UNIQUE INDEX "legado_conciliacion_b4_operacion_id_key" ON "legado_conciliacion_b4"("operacion_id");

-- CreateIndex
CREATE INDEX "legado_conciliacion_b4_clasificacion_creado_at_idx" ON "legado_conciliacion_b4"("clasificacion", "creado_at");

-- CreateIndex
CREATE INDEX "legado_conciliacion_b4_lote_idx" ON "legado_conciliacion_b4"("lote");

-- CreateIndex
CREATE UNIQUE INDEX "reversiones_legado_b4_lote_key" ON "reversiones_legado_b4"("lote");

-- AddForeignKey
ALTER TABLE "legado_conciliacion_b4" ADD CONSTRAINT "legado_conciliacion_b4_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legado_conciliacion_b4" ADD CONSTRAINT "legado_conciliacion_b4_operacion_id_fkey" FOREIGN KEY ("operacion_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "legado_conciliacion_b4" ADD CONSTRAINT "legado_conciliacion_b4_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "reversiones_legado_b4" ADD CONSTRAINT "reversiones_legado_b4_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE legado_conciliacion_b4 ADD CONSTRAINT legado_b4_contrato_ck CHECK (
 origen='HISTORICO' AND clasificacion IN ('JUSTIFICADO','PROPUESTA','YA_B4')
 AND procedencia IN ('MANUAL','AUTOMATICO_TOLERANCIAS','DESCONOCIDO')
 AND jsonb_typeof(motivos)='array' AND jsonb_typeof(documentos)='array'
 AND jsonb_typeof(snapshot_legacy)='object' AND source_hash ~ '^[0-9a-f]{64}$'
 AND (clasificacion<>'JUSTIFICADO' OR (procedencia='MANUAL' AND operacion_id IS NOT NULL AND importe_banco_centimos IS NOT NULL))
 AND (clasificacion<>'PROPUESTA' OR operacion_id IS NULL)
);
CREATE FUNCTION legado_b4_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'El registro de heredados es inmutable; utilice una reversión auditada del lote' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER legado_b4_append_only BEFORE UPDATE OR DELETE ON legado_conciliacion_b4 FOR EACH ROW EXECUTE FUNCTION legado_b4_append_only();
CREATE TRIGGER reversion_legado_b4_append_only BEFORE UPDATE OR DELETE ON reversiones_legado_b4 FOR EACH ROW EXECUTE FUNCTION legado_b4_append_only();
CREATE FUNCTION legado_b4_validar_operacion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.clasificacion='JUSTIFICADO' AND NOT EXISTS (
  SELECT 1 FROM operaciones_justificacion_b4 o JOIN estado_justificacion_movimientos e ON e.movimiento_id=o.movimiento_id
  WHERE o.id=NEW.operacion_id AND o.movimiento_id=NEW.movimiento_id AND o.estado='APLICADA' AND o.revertida_at IS NULL
    AND e.estado='JUSTIFICADO' AND e.version=o.version_resultante
 ) THEN RAISE EXCEPTION 'La recuperación justificada necesita una operación B4 exacta vigente' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER legado_b4_operacion_ct AFTER INSERT ON legado_conciliacion_b4 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION legado_b4_validar_operacion();
ALTER TABLE reversiones_legado_b4 ADD CONSTRAINT reversion_legado_b4_motivo_ck CHECK(length(trim(motivo)) BETWEEN 10 AND 2000);
