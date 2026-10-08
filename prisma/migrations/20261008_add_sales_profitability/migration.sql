-- CreateTable
CREATE TABLE "vinculaciones_personal_facturas" (
    "id" TEXT NOT NULL,
    "factura_emitida_id" TEXT NOT NULL,
    "imputacion_horas_id" TEXT NOT NULL,
    "porcentaje" DOUBLE PRECISION NOT NULL,
    "notas" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "vinculaciones_personal_facturas_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "rentabilidad_auditoria" (
    "id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "factura_emitida_id" TEXT NOT NULL,
    "fuente_id" TEXT NOT NULL,
    "tipo_fuente" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rentabilidad_auditoria_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "vinculaciones_personal_facturas_imputacion_horas_id_idx" ON "vinculaciones_personal_facturas"("imputacion_horas_id");
-- CreateIndex
CREATE UNIQUE INDEX "vinculaciones_personal_facturas_factura_emitida_id_imputaci_key" ON "vinculaciones_personal_facturas"("factura_emitida_id", "imputacion_horas_id");
-- CreateIndex
CREATE INDEX "rentabilidad_auditoria_factura_emitida_id_created_at_idx" ON "rentabilidad_auditoria"("factura_emitida_id", "created_at");
-- CreateIndex
CREATE INDEX "rentabilidad_auditoria_tipo_fuente_fuente_id_idx" ON "rentabilidad_auditoria"("tipo_fuente", "fuente_id");
-- AddForeignKey
ALTER TABLE "vinculaciones_personal_facturas" ADD CONSTRAINT "vinculaciones_personal_facturas_factura_emitida_id_fkey" FOREIGN KEY ("factura_emitida_id") REFERENCES "facturas_emitidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "vinculaciones_personal_facturas" ADD CONSTRAINT "vinculaciones_personal_facturas_imputacion_horas_id_fkey" FOREIGN KEY ("imputacion_horas_id") REFERENCES "imputaciones_horas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "rentabilidad_auditoria" ADD CONSTRAINT "rentabilidad_auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "rentabilidad_auditoria" ADD CONSTRAINT "rentabilidad_auditoria_factura_emitida_id_fkey" FOREIGN KEY ("factura_emitida_id") REFERENCES "facturas_emitidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
