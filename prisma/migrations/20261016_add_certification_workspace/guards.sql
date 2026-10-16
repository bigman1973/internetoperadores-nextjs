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
