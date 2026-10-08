-- CreateTable
CREATE TABLE "comentarios_facturas_recibidas" (
    "id" TEXT NOT NULL,
    "factura_id" TEXT NOT NULL,
    "autor_id" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "solicitud_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comentarios_facturas_recibidas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "comentarios_facturas_recibidas_factura_id_created_at_idx" ON "comentarios_facturas_recibidas"("factura_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "comentarios_facturas_recibidas_factura_id_solicitud_id_key" ON "comentarios_facturas_recibidas"("factura_id", "solicitud_id");

-- AddForeignKey
ALTER TABLE "comentarios_facturas_recibidas" ADD CONSTRAINT "comentarios_facturas_recibidas_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comentarios_facturas_recibidas" ADD CONSTRAINT "comentarios_facturas_recibidas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
