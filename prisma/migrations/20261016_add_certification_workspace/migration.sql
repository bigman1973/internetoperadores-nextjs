-- CreateTable
CREATE TABLE "programas_certificacion" (
    "id" TEXT NOT NULL,
    "norma" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'POR_DEFINIR',
    "consultora" TEXT,
    "responsable" TEXT,
    "aprobador" TEXT,
    "alcance" TEXT,
    "notas" TEXT,
    "entidad" TEXT,
    "referencia" TEXT,
    "fechaEmision" DATE,
    "fechaCaducidad" DATE,
    "documentoAcreditacionId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programas_certificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hitos_certificacion" (
    "id" TEXT NOT NULL,
    "programa_id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "responsable" TEXT,
    "fechaObjetivo" DATE,
    "evidencia" TEXT,
    "notas" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hitos_certificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos_certificacion" (
    "id" TEXT NOT NULL,
    "programa_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'BORRADOR',
    "nombre_archivo" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "drive_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "creado_por" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_certificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuestionarios_seguridad" (
    "id" TEXT NOT NULL,
    "empresa" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "contacto" TEXT,
    "email_contacto" TEXT,
    "fechaLimite" DATE,
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "respuestas" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuestionarios_seguridad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_certificacion" (
    "id" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "recurso_id" TEXT NOT NULL,
    "norma" TEXT,
    "actor_id" INTEGER NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_certificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programas_certificacion_norma_key" ON "programas_certificacion"("norma");

-- CreateIndex
CREATE INDEX "hitos_certificacion_programa_id_orden_idx" ON "hitos_certificacion"("programa_id", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "hitos_certificacion_programa_id_clave_key" ON "hitos_certificacion"("programa_id", "clave");

-- CreateIndex
CREATE INDEX "documentos_certificacion_programa_id_created_at_idx" ON "documentos_certificacion"("programa_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_certificacion_programa_id_sha256_tipo_key" ON "documentos_certificacion"("programa_id", "sha256", "tipo");

-- CreateIndex
CREATE INDEX "cuestionarios_seguridad_updated_at_idx" ON "cuestionarios_seguridad"("updated_at");

-- CreateIndex
CREATE INDEX "auditoria_certificacion_recurso_recurso_id_created_at_idx" ON "auditoria_certificacion"("recurso", "recurso_id", "created_at");

-- AddForeignKey
ALTER TABLE "hitos_certificacion" ADD CONSTRAINT "hitos_certificacion_programa_id_fkey" FOREIGN KEY ("programa_id") REFERENCES "programas_certificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos_certificacion" ADD CONSTRAINT "documentos_certificacion_programa_id_fkey" FOREIGN KEY ("programa_id") REFERENCES "programas_certificacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additional additive checks. No existing business tables or records are changed.
ALTER TABLE programas_certificacion ADD CONSTRAINT certificacion_norma_valida CHECK (norma IN ('ISO27001','TISAX'));
ALTER TABLE programas_certificacion ADD CONSTRAINT certificacion_estado_valido CHECK (estado IN ('POR_DEFINIR','IMPLANTACION','PREPARACION_AUDITORIA','AUDITORIA','VIGENTE'));
ALTER TABLE programas_certificacion ADD CONSTRAINT certificacion_version_positiva CHECK (version > 0);
ALTER TABLE programas_certificacion ADD CONSTRAINT certificacion_fechas_coherentes CHECK ("fechaEmision" IS NULL OR "fechaCaducidad" IS NULL OR "fechaEmision" < "fechaCaducidad");
ALTER TABLE programas_certificacion ADD CONSTRAINT certificacion_vigencia_documentada CHECK (estado <> 'VIGENTE' OR (length(trim(coalesce(entidad,''))) > 0 AND length(trim(coalesce(referencia,''))) > 0 AND length(trim(coalesce(alcance,''))) > 0 AND "fechaEmision" IS NOT NULL AND "fechaCaducidad" IS NOT NULL AND "documentoAcreditacionId" IS NOT NULL));
ALTER TABLE hitos_certificacion ADD CONSTRAINT certificacion_hito_estado_valido CHECK (estado IN ('PENDIENTE','EN_CURSO','COMPLETADO','NO_APLICA'));
ALTER TABLE hitos_certificacion ADD CONSTRAINT certificacion_hito_version_positiva CHECK (version > 0);
ALTER TABLE hitos_certificacion ADD CONSTRAINT certificacion_hito_evidencia CHECK (estado NOT IN ('COMPLETADO','NO_APLICA') OR length(trim(coalesce(evidencia,''))) >= 15);
ALTER TABLE documentos_certificacion ADD CONSTRAINT certificacion_documento_tipo CHECK (tipo IN ('BORRADOR','POLITICA','PROCEDIMIENTO','EVIDENCIA','CERTIFICADO','RESULTADO_TISAX'));
ALTER TABLE documentos_certificacion ADD CONSTRAINT certificacion_documento_limite CHECK (bytes > 0 AND bytes <= 4194304 AND sha256 ~ '^[a-f0-9]{64}$' AND mime IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
ALTER TABLE cuestionarios_seguridad ADD CONSTRAINT cuestionario_estado_valido CHECK (estado IN ('BORRADOR','REVISION','VALIDADO'));
ALTER TABLE cuestionarios_seguridad ADD CONSTRAINT cuestionario_version_positiva CHECK (version > 0);
ALTER TABLE cuestionarios_seguridad ADD CONSTRAINT cuestionario_23_respuestas CHECK (jsonb_typeof(respuestas) = 'array' AND jsonb_array_length(respuestas) = 23);
