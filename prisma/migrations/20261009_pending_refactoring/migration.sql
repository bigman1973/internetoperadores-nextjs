-- CreateTable
CREATE TABLE "documentos_refacturacion_pendiente" (
    "id" TEXT NOT NULL,
    "drive" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "ruta" TEXT NOT NULL,
    "nombre" VARCHAR(240) NOT NULL,
    "mime" VARCHAR(100),
    "etag" TEXT,
    "size" INTEGER NOT NULL,
    "modificado_at" TIMESTAMP(3),
    "hash" VARCHAR(64),
    "estado" VARCHAR(30) NOT NULL DEFAULT 'DETECTADO',
    "resultado" JSONB,
    "texto_busqueda" TEXT,
    "incidencia" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "fuente_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documentos_refacturacion_pendiente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_refacturacion_pendiente_hash_key" ON "documentos_refacturacion_pendiente"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_refacturacion_pendiente_fuente_id_key" ON "documentos_refacturacion_pendiente"("fuente_id");

-- CreateIndex
CREATE INDEX "documentos_refacturacion_pendiente_estado_created_at_idx" ON "documentos_refacturacion_pendiente"("estado", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_refacturacion_pendiente_drive_item_key" ON "documentos_refacturacion_pendiente"("drive", "item");

-- AddForeignKey
ALTER TABLE "documentos_refacturacion_pendiente" ADD CONSTRAINT "documentos_refacturacion_pendiente_fuente_id_fkey" FOREIGN KEY ("fuente_id") REFERENCES "fuentes_coste_operadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
