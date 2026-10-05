-- CreateTable
CREATE TABLE "nomina_documentos" (
    "id" TEXT NOT NULL,
    "nomina_id" TEXT NOT NULL,
    "drive_item_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nomina_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "nomina_documentos_drive_item_id_key" ON "nomina_documentos"("drive_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "nomina_documentos_nomina_id_tipo_key" ON "nomina_documentos"("nomina_id", "tipo");

-- AddForeignKey
ALTER TABLE "nomina_documentos" ADD CONSTRAINT "nomina_documentos_nomina_id_fkey" FOREIGN KEY ("nomina_id") REFERENCES "nominas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
