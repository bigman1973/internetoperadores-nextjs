-- AlterTable
ALTER TABLE "vinculos_movimiento_documento" ADD COLUMN     "centro_coste_finanzas_id" UUID,
ADD COLUMN     "version_centro_coste" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "centros_coste_finanzas" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(64) NOT NULL,
    "nombre" VARCHAR(160) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "creado_por_id" INTEGER NOT NULL,
    "actualizado_por_id" INTEGER NOT NULL,

    CONSTRAINT "centros_coste_finanzas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias_centros_coste_finanzas_b8" (
    "id" UUID NOT NULL,
    "centro_coste_finanzas_id" UUID,
    "vinculo_movimiento_documento_id" UUID,
    "actor_id" INTEGER NOT NULL,
    "accion" VARCHAR(48) NOT NULL,
    "idempotency_key" VARCHAR(160),
    "payload_hash" CHAR(64) NOT NULL,
    "value_hash" CHAR(64) NOT NULL,
    "source_note_rule" VARCHAR(64) NOT NULL,
    "snapshot_solicitud" JSONB NOT NULL,
    "snapshot_resultado" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditorias_centros_coste_finanzas_b8_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recibos_eleccion_centro_b8" (
    "id" UUID NOT NULL,
    "operacion_b4_id" UUID NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "idempotency_key" VARCHAR(160) NOT NULL,
    "metadata_hash" CHAR(64) NOT NULL,
    "related_source_hash_p2" CHAR(64) NOT NULL,
    "source_note_rule" VARCHAR(64) NOT NULL,
    "snapshot_solicitud" JSONB NOT NULL,
    "snapshot_resultado" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recibos_eleccion_centro_b8_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "centros_coste_finanzas_codigo_key" ON "centros_coste_finanzas"("codigo");

-- CreateIndex
CREATE INDEX "centros_coste_finanzas_activo_codigo_idx" ON "centros_coste_finanzas"("activo", "codigo");

-- CreateIndex
CREATE INDEX "auditorias_centros_coste_finanzas_b8_centro_coste_finanzas__idx" ON "auditorias_centros_coste_finanzas_b8"("centro_coste_finanzas_id", "created_at");

-- CreateIndex
CREATE INDEX "auditorias_centros_coste_finanzas_b8_vinculo_movimiento_doc_idx" ON "auditorias_centros_coste_finanzas_b8"("vinculo_movimiento_documento_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auditorias_centros_coste_finanzas_b8_actor_id_idempotency_k_key" ON "auditorias_centros_coste_finanzas_b8"("actor_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_eleccion_centro_b8_operacion_b4_id_key" ON "recibos_eleccion_centro_b8"("operacion_b4_id");

-- CreateIndex
CREATE INDEX "recibos_eleccion_centro_b8_metadata_hash_idx" ON "recibos_eleccion_centro_b8"("metadata_hash");

-- CreateIndex
CREATE UNIQUE INDEX "recibos_eleccion_centro_b8_actor_id_idempotency_key_key" ON "recibos_eleccion_centro_b8"("actor_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "vinculos_movimiento_documento_centro_coste_finanzas_id_acti_idx" ON "vinculos_movimiento_documento"("centro_coste_finanzas_id", "activo");

-- AddForeignKey
ALTER TABLE "vinculos_movimiento_documento" ADD CONSTRAINT "vinculos_movimiento_documento_centro_coste_finanzas_id_fkey" FOREIGN KEY ("centro_coste_finanzas_id") REFERENCES "centros_coste_finanzas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "centros_coste_finanzas" ADD CONSTRAINT "centros_coste_finanzas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "centros_coste_finanzas" ADD CONSTRAINT "centros_coste_finanzas_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_centros_coste_finanzas_b8" ADD CONSTRAINT "auditorias_centros_coste_finanzas_b8_centro_coste_finanzas_fkey" FOREIGN KEY ("centro_coste_finanzas_id") REFERENCES "centros_coste_finanzas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_centros_coste_finanzas_b8" ADD CONSTRAINT "auditorias_centros_coste_finanzas_b8_vinculo_movimiento_do_fkey" FOREIGN KEY ("vinculo_movimiento_documento_id") REFERENCES "vinculos_movimiento_documento"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditorias_centros_coste_finanzas_b8" ADD CONSTRAINT "auditorias_centros_coste_finanzas_b8_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "recibos_eleccion_centro_b8" ADD CONSTRAINT "recibos_eleccion_centro_b8_operacion_b4_id_fkey" FOREIGN KEY ("operacion_b4_id") REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "recibos_eleccion_centro_b8" ADD CONSTRAINT "recibos_eleccion_centro_b8_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Finanzas B8 — añadir después del DDL Prisma B8 en la MISMA migración de
-- staging. Sólo ADD CONSTRAINT/INDEX y CREATE de guards: sin BEGIN/COMMIT,
-- DML, DROP, seed, backfill, enum B4 ni cambios de importes/snapshots B4.

ALTER TABLE centros_coste_finanzas
  ADD CONSTRAINT centro_coste_finanzas_codigo_normalizado_ck
    CHECK (codigo = upper(btrim(codigo)) AND codigo ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
  ADD CONSTRAINT centro_coste_finanzas_nombre_no_vacio_ck
    CHECK (length(btrim(nombre)) BETWEEN 1 AND 160),
  ADD CONSTRAINT centro_coste_finanzas_version_positiva_ck CHECK (version >= 1);

ALTER TABLE vinculos_movimiento_documento
  ADD CONSTRAINT vinculo_b8_version_centro_no_negativa_ck CHECK (version_centro_coste >= 0);

ALTER TABLE auditorias_centros_coste_finanzas_b8
  ADD CONSTRAINT auditoria_b8_accion_matriz_ck CHECK (
    (accion IN ('CATALOGO_CREADO','CATALOGO_EDITADO','CATALOGO_DESACTIVADO')
      AND centro_coste_finanzas_id IS NOT NULL AND vinculo_movimiento_documento_id IS NULL AND idempotency_key IS NULL)
    OR
    (accion IN ('ASIGNACION','DESASIGNACION','ASIGNACION_EN_CONFIRMACION_B4')
      AND centro_coste_finanzas_id IS NOT NULL AND vinculo_movimiento_documento_id IS NOT NULL AND idempotency_key IS NOT NULL)
  ),
  ADD CONSTRAINT auditoria_b8_key_no_vacia_ck CHECK (idempotency_key IS NULL OR length(btrim(idempotency_key)) > 0),
  ADD CONSTRAINT auditoria_b8_payload_hash_sha256_ck CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT auditoria_b8_value_hash_sha256_ck CHECK (value_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT auditoria_b8_source_note_rule_ck CHECK (source_note_rule = 'EXPLICIT_UI_SELECTION_ONLY'),
  ADD CONSTRAINT auditoria_b8_version_metadata_ck CHECK (
    snapshot_resultado ? 'version' AND snapshot_resultado->>'version' = 'B8_CENTROS_COSTE_V1'
    AND snapshot_solicitud ? 'origen'
  );

ALTER TABLE recibos_eleccion_centro_b8
  ADD CONSTRAINT recibo_b8_metadata_hash_sha256_ck CHECK (metadata_hash ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT recibo_b8_related_source_hash_p2_sha256_ck CHECK (related_source_hash_p2 ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT recibo_b8_source_note_rule_ck CHECK (source_note_rule = 'EXPLICIT_UI_SELECTION_ONLY'),
  ADD CONSTRAINT recibo_b8_snapshot_schema_ck CHECK (
    snapshot_solicitud ? 'schema' AND snapshot_solicitud->>'schema' = 'B8_CENTRO_RECEIPT_V1'
    AND snapshot_resultado ? 'schema' AND snapshot_resultado->>'schema' = 'B8_CENTRO_RECEIPT_V1'
    AND snapshot_resultado ? 'mapping'
  );

-- The FK/version update is physically narrow. Ordinary B4 deshacer does not
-- change either B8 field and therefore keeps historical metadata legal.
CREATE FUNCTION b8_guard_mutacion_vinculo_centro()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.centro_coste_finanzas_id IS NOT DISTINCT FROM OLD.centro_coste_finanzas_id
     AND NEW.version_centro_coste = OLD.version_centro_coste THEN
    RETURN NEW;
  END IF;
  IF NEW.version_centro_coste <> OLD.version_centro_coste + 1 THEN
    RAISE EXCEPTION 'B8 version_centro_coste debe incrementar exactamente una unidad' USING ERRCODE = '23514';
  END IF;
  IF NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id
     OR NEW.documento_conciliable_id IS DISTINCT FROM OLD.documento_conciliable_id
     OR NEW.tipo_linea IS DISTINCT FROM OLD.tipo_linea
     OR NEW.importe_centimos IS DISTINCT FROM OLD.importe_centimos
     OR NEW.motivo_diferencia IS DISTINCT FROM OLD.motivo_diferencia
     OR NEW.activo IS DISTINCT FROM OLD.activo
     OR NEW.operacion_creacion_id IS DISTINCT FROM OLD.operacion_creacion_id
     OR NEW.operacion_anulacion_id IS DISTINCT FROM OLD.operacion_anulacion_id THEN
    RAISE EXCEPTION 'B8 sólo permite actualizar FK centro/version; B4 conserva importe, enlace, estado y vida de línea' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER b8_vinculo_update_estrecho_tr
BEFORE UPDATE ON vinculos_movimiento_documento
FOR EACH ROW EXECUTE FUNCTION b8_guard_mutacion_vinculo_centro();

-- Backstop of current B4 evidence. App code additionally holds B4's advisory
-- bank lock and executes the injected actual DocumentoConciliable source policy
-- in the same SERIALIZABLE tx. bool_and is COALESCE(false), so empty/unknown
-- active-operation sets never prove eligibility. Signed credits remain valid.
CREATE FUNCTION b8_assert_asignacion_vinculo_actual(p_vinculo_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE p record;
BEGIN
  SELECT
    v.tipo_linea, v.activo, v.centro_coste_finanzas_id, e.estado AS estado_actual,
    b4_importe_bancario_centimos(m.importe) AS banco_centimos,
    (SELECT COALESCE(SUM(x.importe_centimos) FILTER (WHERE x.activo), 0)::bigint
       FROM vinculos_movimiento_documento x WHERE x.movimiento_id = v.movimiento_id) AS cierre_centimos,
    (SELECT COUNT(*) FILTER (WHERE x.activo AND x.tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")::bigint
       FROM vinculos_movimiento_documento x WHERE x.movimiento_id = v.movimiento_id) AS documentos_actuales,
    (SELECT COALESCE(bool_and(COALESCE(o.estado = 'APLICADA'::"EstadoOperacionB4" AND o.revertida_at IS NULL, false))
        FILTER (WHERE x.activo), false)
       FROM vinculos_movimiento_documento x
       LEFT JOIN operaciones_justificacion_b4 o ON o.id = x.operacion_creacion_id
      WHERE x.movimiento_id = v.movimiento_id) AS operaciones_activas_aplicadas,
    c.activo AS centro_activo
  INTO p
  FROM vinculos_movimiento_documento v
  JOIN movimientos_bancarios m ON m.id = v.movimiento_id
  JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
  LEFT JOIN centros_coste_finanzas c ON c.id = v.centro_coste_finanzas_id
  WHERE v.id = p_vinculo_id
  FOR KEY SHARE OF v, m, e;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'B8 vínculo inexistente' USING ERRCODE = '23514';
  END IF;
  IF p.centro_coste_finanzas_id IS NOT NULL THEN
    SELECT activo INTO p.centro_activo FROM centros_coste_finanzas WHERE id=p.centro_coste_finanzas_id FOR SHARE;
    IF NOT FOUND OR p.centro_activo IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'B8 centro seleccionado inexistente o inactivo' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF p.tipo_linea <> 'DOCUMENTO'::"TipoLineaVinculo"
     OR NOT p.activo
     OR p.estado_actual <> 'JUSTIFICADO'::"EstadoJustificacionMovimiento"
     OR p.banco_centimos IS NULL
     OR p.cierre_centimos <> p.banco_centimos
     OR p.documentos_actuales < 1
     OR p.operaciones_activas_aplicadas IS DISTINCT FROM true
     OR (p.centro_activo IS NOT NULL AND p.centro_activo IS DISTINCT FROM true) THEN
    RAISE EXCEPTION 'B8 exige DOCUMENTO B4 activo/JUSTIFICADO, importe banco actual conocido, cierre firmado exacto, todas las operaciones activas APLICADA/no revertidas y centro activo' USING ERRCODE = '23514';
  END IF;
END;
$$;
CREATE FUNCTION b8_guard_asignacion_vinculo_ct()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM b8_assert_asignacion_vinculo_actual(NEW.id);
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER b8_asignacion_vinculo_actual_ct
AFTER UPDATE OF centro_coste_finanzas_id, version_centro_coste ON vinculos_movimiento_documento
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION b8_guard_asignacion_vinculo_ct();

CREATE FUNCTION b8_guard_catalogo_centro()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version <> OLD.version + 1 THEN RAISE EXCEPTION 'B8 catálogo exige incremento unitario de versión' USING ERRCODE = '23514'; END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.creado_por_id IS DISTINCT FROM OLD.creado_por_id THEN RAISE EXCEPTION 'B8 catálogo no permite reescribir creación' USING ERRCODE = '23514'; END IF;
  IF OLD.activo = false AND NEW.activo = true THEN RAISE EXCEPTION 'B8 no reactiva centros desactivados' USING ERRCODE = '23514'; END IF;
  IF OLD.activo = true AND NEW.activo = false AND (NEW.codigo IS DISTINCT FROM OLD.codigo OR NEW.nombre IS DISTINCT FROM OLD.nombre) THEN RAISE EXCEPTION 'B8 desactivar no puede editar código/nombre' USING ERRCODE = '23514'; END IF;
  IF OLD.activo = NEW.activo AND NEW.codigo IS NOT DISTINCT FROM OLD.codigo AND NEW.nombre IS NOT DISTINCT FROM OLD.nombre THEN RAISE EXCEPTION 'B8 catálogo no admite actualización vacía' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER b8_catalogo_versionado_tr
BEFORE UPDATE ON centros_coste_finanzas FOR EACH ROW EXECUTE FUNCTION b8_guard_catalogo_centro();

-- Independent audit and receipt streams are immutable, including the valid
-- no-centre receipt. No trigger modifies B4 snapshots or source records.
CREATE FUNCTION b8_rechazar_mutacion_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% es append-only B8', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER b8_auditoria_no_update_delete_tr
BEFORE UPDATE OR DELETE ON auditorias_centros_coste_finanzas_b8
FOR EACH ROW EXECUTE FUNCTION b8_rechazar_mutacion_append_only();
CREATE TRIGGER b8_auditoria_no_truncate_tr
BEFORE TRUNCATE ON auditorias_centros_coste_finanzas_b8
FOR EACH STATEMENT EXECUTE FUNCTION b8_rechazar_mutacion_append_only();
CREATE TRIGGER b8_recibo_no_update_delete_tr
BEFORE UPDATE OR DELETE ON recibos_eleccion_centro_b8
FOR EACH ROW EXECUTE FUNCTION b8_rechazar_mutacion_append_only();
CREATE TRIGGER b8_recibo_no_truncate_tr
BEFORE TRUNCATE ON recibos_eleccion_centro_b8
FOR EACH STATEMENT EXECUTE FUNCTION b8_rechazar_mutacion_append_only();
