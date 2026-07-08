-- CreateTable: sub_remesas_banco
-- Almacena las sub-remesas que el Santander genera al dividir una remesa ISP por fecha de vencimiento
CREATE TABLE "sub_remesas_banco" (
    "id" TEXT NOT NULL,
    "conciliacion_id" TEXT NOT NULL,
    "referencia_remesa" TEXT NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "num_recibos" INTEGER NOT NULL,
    "importe" DECIMAL(10,2) NOT NULL,
    "movimiento_bancario_id" TEXT,
    "cobrado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sub_remesas_banco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sub_remesas_banco_referencia_remesa_key" ON "sub_remesas_banco"("referencia_remesa");
CREATE INDEX "sub_remesas_banco_conciliacion_id_idx" ON "sub_remesas_banco"("conciliacion_id");
CREATE INDEX "sub_remesas_banco_movimiento_bancario_id_idx" ON "sub_remesas_banco"("movimiento_bancario_id");

-- AddForeignKey
ALTER TABLE "sub_remesas_banco" ADD CONSTRAINT "sub_remesas_banco_conciliacion_id_fkey" FOREIGN KEY ("conciliacion_id") REFERENCES "conciliaciones_remesas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sub_remesas_banco" ADD CONSTRAINT "sub_remesas_banco_movimiento_bancario_id_fkey" FOREIGN KEY ("movimiento_bancario_id") REFERENCES "movimientos_bancarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quitar constraint unique de movimiento_bancario_id en conciliaciones_remesas
-- (ya no es 1:1, ahora la relación es a través de sub_remesas_banco)
ALTER TABLE "conciliaciones_remesas" DROP CONSTRAINT IF EXISTS "conciliaciones_remesas_movimiento_bancario_id_key";

-- Añadir campo importe_cobrado a conciliaciones_remesas para el total cobrado
ALTER TABLE "conciliaciones_remesas" ADD COLUMN IF NOT EXISTS "importe_cobrado" DECIMAL(10,2);
ALTER TABLE "conciliaciones_remesas" ADD COLUMN IF NOT EXISTS "pendiente_abonar" DECIMAL(10,2);
