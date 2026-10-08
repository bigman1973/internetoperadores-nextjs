-- CreateTable
CREATE TABLE "proveedores_venta_referencia" (
    "id" TEXT NOT NULL,
    "factura_emitida_id" TEXT NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "proveedor_key" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proveedores_venta_referencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proveedores_venta_referencia_factura_emitida_id_proveedor_k_key" ON "proveedores_venta_referencia"("factura_emitida_id", "proveedor_key");

-- AddForeignKey
ALTER TABLE "proveedores_venta_referencia" ADD CONSTRAINT "proveedores_venta_referencia_factura_emitida_id_fkey" FOREIGN KEY ("factura_emitida_id") REFERENCES "facturas_emitidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
