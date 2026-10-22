-- B2: exclusivamente staging aislado; originales económicos y vínculos preservados.
-- CreateEnum
CREATE TYPE "CalidadFacturaRecibida" AS ENUM ('VALIDA', 'REVISAR_LECTURA', 'COPIA');

-- CreateEnum
CREATE TYPE "ProcedenciaFechaFactura" AS ENUM ('DOCUMENTO', 'NOMBRE_ARCHIVO', 'HISTORICA', 'SIN_CONFIRMAR');

-- AlterTable
ALTER TABLE "facturas_recibidas" ADD COLUMN     "calidad" "CalidadFacturaRecibida" NOT NULL DEFAULT 'VALIDA',
ADD COLUMN     "canon_key" TEXT,
ADD COLUMN     "conflicto_identidad" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "copia_de_id" TEXT,
ADD COLUMN     "duplicado_externo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fecha_provenancia" "ProcedenciaFechaFactura",
ADD COLUMN     "version_calidad" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "revisiones_lectura_facturas_recibidas" (
    "id" TEXT NOT NULL,
    "onedrive_item_id" TEXT,
    "onedrive_drive_id" TEXT,
    "onedrive_ruta_actual" TEXT,
    "archivo_onedrive" TEXT,
    "carpeta_origen" TEXT,
    "estado_carpeta" TEXT,
    "proveedor" TEXT,
    "cif" TEXT,
    "num_factura" TEXT,
    "fecha" TIMESTAMP(3),
    "base" DOUBLE PRECISION,
    "tipo_iva" DOUBLE PRECISION,
    "importe_iva" DOUBLE PRECISION,
    "tipo_irpf" DOUBLE PRECISION,
    "importe_irpf" DOUBLE PRECISION,
    "total" DOUBLE PRECISION,
    "concepto" TEXT,
    "ocr_confianza" DOUBLE PRECISION,
    "datos_ocr_raw" TEXT,
    "motivo_revision" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resuelta_at" TIMESTAMP(3),
    "factura_resuelta_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revisiones_lectura_facturas_recibidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_calidad_facturas" (
    "id" TEXT NOT NULL,
    "factura_id" TEXT,
    "revision_id" TEXT,
    "actor_id" INTEGER,
    "accion" TEXT NOT NULL,
    "solicitud_id" TEXT,
    "huella_solicitud" TEXT,
    "detalle" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_calidad_facturas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "revisiones_lectura_facturas_recibidas_onedrive_item_id_key" ON "revisiones_lectura_facturas_recibidas"("onedrive_item_id");

-- CreateIndex
CREATE INDEX "revisiones_lectura_facturas_recibidas_resuelta_at_created_a_idx" ON "revisiones_lectura_facturas_recibidas"("resuelta_at", "created_at");

-- CreateIndex
CREATE INDEX "revisiones_lectura_facturas_recibidas_motivo_revision_creat_idx" ON "revisiones_lectura_facturas_recibidas"("motivo_revision", "created_at");

-- CreateIndex
CREATE INDEX "auditoria_calidad_facturas_factura_id_created_at_idx" ON "auditoria_calidad_facturas"("factura_id", "created_at");

-- CreateIndex
CREATE INDEX "auditoria_calidad_facturas_revision_id_created_at_idx" ON "auditoria_calidad_facturas"("revision_id", "created_at");

-- CreateIndex
CREATE INDEX "facturas_recibidas_calidad_copia_de_id_fecha_idx" ON "facturas_recibidas"("calidad", "copia_de_id", "fecha");

-- CreateIndex
CREATE INDEX "facturas_recibidas_canon_key_idx" ON "facturas_recibidas"("canon_key");

-- AddForeignKey
ALTER TABLE "facturas_recibidas" ADD CONSTRAINT "facturas_recibidas_copia_de_id_fkey" FOREIGN KEY ("copia_de_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revisiones_lectura_facturas_recibidas" ADD CONSTRAINT "revisiones_lectura_facturas_recibidas_factura_resuelta_id_fkey" FOREIGN KEY ("factura_resuelta_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_calidad_facturas" ADD CONSTRAINT "auditoria_calidad_facturas_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_calidad_facturas" ADD CONSTRAINT "auditoria_calidad_facturas_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "revisiones_lectura_facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_calidad_facturas" ADD CONSTRAINT "auditoria_calidad_facturas_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE INDEX "facturas_recibidas_duplicado_externo_idx" ON "facturas_recibidas"("duplicado_externo") WHERE "duplicado_externo" = true;
CREATE UNIQUE INDEX "auditoria_calidad_facturas_actor_id_solicitud_id_key" ON "auditoria_calidad_facturas"("actor_id", "solicitud_id") WHERE "actor_id" IS NOT NULL AND "solicitud_id" IS NOT NULL;

-- Guards: no identidades inventadas, no auto-alta basada en fallback y referencias coherentes.
ALTER TABLE "facturas_recibidas" ADD CONSTRAINT "facturas_recibidas_b2_calidad_valida"
  CHECK ("calidad" IN ('VALIDA', 'REVISAR_LECTURA', 'COPIA'));
ALTER TABLE "facturas_recibidas" ADD CONSTRAINT "facturas_recibidas_b2_fecha_provenancia_valida"
  CHECK ("fecha_provenancia" IS NULL OR "fecha_provenancia" IN ('DOCUMENTO', 'NOMBRE_ARCHIVO', 'HISTORICA', 'SIN_CONFIRMAR'));
ALTER TABLE "facturas_recibidas" ADD CONSTRAINT "facturas_recibidas_b2_copia_consistente"
  CHECK (("calidad" = 'COPIA') = ("copia_de_id" IS NOT NULL));
ALTER TABLE "facturas_recibidas" ADD CONSTRAINT "facturas_recibidas_b2_version_positiva"
  CHECK ("version_calidad" > 0);
ALTER TABLE "revisiones_lectura_facturas_recibidas" ADD CONSTRAINT "revisiones_lectura_facturas_recibidas_version_positiva"
  CHECK ("version" > 0);
ALTER TABLE "revisiones_lectura_facturas_recibidas" ADD CONSTRAINT "revisiones_lectura_facturas_recibidas_resolucion_coherente"
  CHECK (("resuelta_at" IS NULL) = ("factura_resuelta_id" IS NULL));
ALTER TABLE "auditoria_calidad_facturas" ADD CONSTRAINT "auditoria_calidad_facturas_objetivo"
  CHECK ("factura_id" IS NOT NULL OR "revision_id" IS NOT NULL);

-- Las copias conservan canon_key y se permiten. Sólo puede haber una canónica
-- VALIDA por clave; las filas históricas sin identidad permanecen con NULL.
CREATE UNIQUE INDEX "facturas_recibidas_b2_canon_key_canonica_key"
  ON "facturas_recibidas"("canon_key")
  WHERE "canon_key" IS NOT NULL AND "calidad" = 'VALIDA' AND "copia_de_id" IS NULL;
