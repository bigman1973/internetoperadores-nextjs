-- CreateTable
CREATE TABLE "empleado_documentos" (
    "id" TEXT NOT NULL,
    "empleado_id" TEXT NOT NULL,
    "drive_item_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "anio" INTEGER,
    "mes" INTEGER,
    "sha256" TEXT NOT NULL,
    "subido_por" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleado_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empleado_documentos_drive_item_id_key" ON "empleado_documentos"("drive_item_id");

-- CreateIndex
CREATE INDEX "empleado_documentos_empleado_id_created_at_idx" ON "empleado_documentos"("empleado_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "empleado_documentos_empleado_id_tipo_sha256_key" ON "empleado_documentos"("empleado_id", "tipo", "sha256");

-- AddForeignKey
ALTER TABLE "empleado_documentos" ADD CONSTRAINT "empleado_documentos_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
