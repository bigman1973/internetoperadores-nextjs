-- AlterTable
ALTER TABLE "facturas_recibidas" ADD COLUMN     "estado_carpeta" TEXT,
ADD COLUMN     "etiqueta_materiales" BOOLEAN,
ADD COLUMN     "onedrive_drive_id" TEXT,
ADD COLUMN     "onedrive_ruta_actual" TEXT;

-- CreateTable
CREATE TABLE "historial_ubicaciones_facturas_recibidas" (
    "id" TEXT NOT NULL,
    "factura_id" TEXT NOT NULL,
    "autor_id" INTEGER NOT NULL,
    "motivo" TEXT NOT NULL,
    "anterior" JSONB NOT NULL,
    "actual" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historial_ubicaciones_facturas_recibidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historial_ubicaciones_facturas_recibidas_factura_id_created_idx" ON "historial_ubicaciones_facturas_recibidas"("factura_id", "created_at");

-- AddForeignKey
ALTER TABLE "historial_ubicaciones_facturas_recibidas" ADD CONSTRAINT "historial_ubicaciones_facturas_recibidas_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
