-- CreateTable
CREATE TABLE "componentes_venta_servicio" (
    "id" TEXT NOT NULL,
    "factura_emitida_id" TEXT NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "base" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "componentes_venta_servicio_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "componentes_venta_servicio_factura_emitida_id_idx" ON "componentes_venta_servicio"("factura_emitida_id");
-- CreateIndex
CREATE INDEX "componentes_venta_servicio_tipo_idx" ON "componentes_venta_servicio"("tipo");
-- AddForeignKey
ALTER TABLE "componentes_venta_servicio" ADD CONSTRAINT "componentes_venta_servicio_factura_emitida_id_fkey" FOREIGN KEY ("factura_emitida_id") REFERENCES "facturas_emitidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
