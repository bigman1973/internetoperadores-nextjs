-- Finanzas B4 — companion guards for the additive Prisma migration
--
-- Companion source. Apply only the consolidated migration.sql after review,
-- in the isolated staging database. These guards run in the same transaction
-- immediately AFTER Prisma has created the B4 tables/enums/FKs.
-- It deliberately makes no change to legacy financial fields or legacy enums.
--
-- Preconditions supplied by schema-b4.prisma:
--   * all B4 FKs use ON DELETE/UPDATE RESTRICT;
--   * B4 monetary fields are PostgreSQL integer cents (signed, native INT range
--     -2147483648..2147483647), never Float/Decimal;
--   * `importe_objetivo_centimos IS NULL` means unknown and must remain in review,
--     never an invented 0/capacity;
--   * the application performs approval in a SERIALIZABLE transaction and locks
--     the state/document rows. These triggers are a backstop, not an auto-matcher.


-- One state row has a closed reason matrix. A justificado/sin_documento row cannot
-- carry an NO_REQUIERE reason; NO_REQUIERE cannot be reasonless.
ALTER TABLE "estado_justificacion_movimientos"
  ADD CONSTRAINT "estado_justificacion_b4_motivo_matriz_ck"
  CHECK (
    (estado = 'NO_REQUIERE'::"EstadoJustificacionMovimiento" AND motivo_no_requiere IS NOT NULL)
    OR
    (estado IN ('SIN_DOCUMENTO'::"EstadoJustificacionMovimiento", 'JUSTIFICADO'::"EstadoJustificacionMovimiento")
      AND motivo_no_requiere IS NULL)
  ),
  ADD CONSTRAINT "estado_justificacion_b4_version_positiva_ck"
  CHECK (version >= 1);

-- DocumentoConciliable is a genuine FK wrapper, not a polymorphic type+id pair.
-- Exactly one concrete target is mandatory. IMPUESTO_TGSS alone accepts either
-- DocumentoAAPP or PagoFraccionado (still exactly one target).
ALTER TABLE "documentos_conciliables"
  ADD CONSTRAINT "documento_b4_un_objetivo_ck"
  CHECK (
    ((factura_recibida_id IS NOT NULL)::int +
     (factura_emitida_id IS NOT NULL)::int +
     (remesa_id IS NOT NULL)::int +
     (nomina_id IS NOT NULL)::int +
     (documento_aapp_id IS NOT NULL)::int +
     (pago_fraccionado_id IS NOT NULL)::int +
     (documento_prestamo_id IS NOT NULL)::int +
     (gasto_id IS NOT NULL)::int +
     (traspaso_interno_id IS NOT NULL)::int) = 1
  ),
  ADD CONSTRAINT "documento_b4_tipo_objetivo_ck"
  CHECK (
    (tipo = 'FACTURA_RECIBIDA'::"TipoDocumentoConciliable" AND factura_recibida_id IS NOT NULL)
    OR (tipo = 'FACTURA_EMITIDA'::"TipoDocumentoConciliable" AND factura_emitida_id IS NOT NULL)
    OR (tipo = 'REMESA'::"TipoDocumentoConciliable" AND remesa_id IS NOT NULL)
    OR (tipo = 'NOMINA'::"TipoDocumentoConciliable" AND nomina_id IS NOT NULL)
    OR (tipo = 'IMPUESTO_TGSS'::"TipoDocumentoConciliable" AND (documento_aapp_id IS NOT NULL OR pago_fraccionado_id IS NOT NULL))
    OR (tipo = 'PRESTAMO'::"TipoDocumentoConciliable" AND documento_prestamo_id IS NOT NULL)
    OR (tipo = 'TICKET'::"TipoDocumentoConciliable" AND gasto_id IS NOT NULL)
    OR (tipo = 'TRASPASO'::"TipoDocumentoConciliable" AND traspaso_interno_id IS NOT NULL)
  ),
  ADD CONSTRAINT "documento_b4_objetivo_firmado_no_cero_ck"
  CHECK (
    importe_objetivo_centimos IS NULL
    OR (importe_objetivo_centimos BETWEEN -2147483648 AND 2147483647
        AND importe_objetivo_centimos <> 0)
  ),
  ADD CONSTRAINT "documento_b4_signo_por_tipo_ck"
  CHECK (
    importe_objetivo_centimos IS NULL
    OR (tipo = 'REMESA'::"TipoDocumentoConciliable" AND importe_objetivo_centimos > 0)
    -- Non-remittance sources retain their actual signed economic objective,
    -- including credit notes and refunds. The API verifies the real source.
    OR tipo <> 'REMESA'::"TipoDocumentoConciliable"
  ),
  ADD CONSTRAINT "documento_b4_version_positiva_ck"
  CHECK (version >= 1);

-- Partial unique indexes are explicit rather than Prisma @unique attributes: a
-- null FK does not consume a uniqueness slot and the SQL DDL documents the intended
-- post-check physical invariant for each of the nine subtype destinations.
CREATE UNIQUE INDEX "documento_b4_factura_recibida_uq"
  ON "documentos_conciliables" (factura_recibida_id) WHERE factura_recibida_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_factura_emitida_uq"
  ON "documentos_conciliables" (factura_emitida_id) WHERE factura_emitida_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_remesa_uq"
  ON "documentos_conciliables" (remesa_id) WHERE remesa_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_nomina_uq"
  ON "documentos_conciliables" (nomina_id) WHERE nomina_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_documento_aapp_uq"
  ON "documentos_conciliables" (documento_aapp_id) WHERE documento_aapp_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_pago_fraccionado_uq"
  ON "documentos_conciliables" (pago_fraccionado_id) WHERE pago_fraccionado_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_prestamo_uq"
  ON "documentos_conciliables" (documento_prestamo_id) WHERE documento_prestamo_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_gasto_ticket_uq"
  ON "documentos_conciliables" (gasto_id) WHERE gasto_id IS NOT NULL;
CREATE UNIQUE INDEX "documento_b4_traspaso_uq"
  ON "documentos_conciliables" (traspaso_interno_id) WHERE traspaso_interno_id IS NOT NULL;

ALTER TABLE "documentos_prestamo"
  ADD CONSTRAINT "prestamo_b4_objetivo_firmado_no_cero_ck"
  CHECK (
    importe_objetivo_centimos IS NULL
    OR (importe_objetivo_centimos BETWEEN -2147483648 AND 2147483647
        AND importe_objetivo_centimos <> 0)
  );

ALTER TABLE "traspasos_internos"
  ADD CONSTRAINT "traspaso_b4_movimientos_distintos_ck"
  CHECK (movimiento_origen_id <> movimiento_destino_id);

-- A line is either a document assignment or an explicit difference, never both.
-- It is all signed cents and zero is forbidden. Both operation FKs are RESTRICT
-- by the Prisma schema so reversing only marks the original line inactive.
ALTER TABLE "vinculos_movimiento_documento"
  ADD CONSTRAINT "vinculo_b4_linea_matriz_ck"
  CHECK (
    (tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo"
      AND documento_conciliable_id IS NOT NULL AND motivo_diferencia IS NULL)
    OR
    (tipo_linea = 'DIFERENCIA'::"TipoLineaVinculo"
      AND documento_conciliable_id IS NULL AND motivo_diferencia IS NOT NULL)
  ),
  ADD CONSTRAINT "vinculo_b4_importe_firmado_no_cero_ck"
  CHECK (importe_centimos BETWEEN -2147483648 AND 2147483647 AND importe_centimos <> 0),
  ADD CONSTRAINT "vinculo_b4_anulacion_no_auto_ck"
  CHECK (operacion_anulacion_id IS NULL OR operacion_anulacion_id <> operacion_creacion_id);

ALTER TABLE "operaciones_justificacion_b4"
  ADD CONSTRAINT "operacion_b4_version_esperada_positiva_ck"
  CHECK (version_esperada >= 1),
  ADD CONSTRAINT "operacion_b4_version_resultante_positiva_ck"
  CHECK (version_resultante IS NULL OR version_resultante >= 1),
  ADD CONSTRAINT "operacion_b4_key_no_vacia_ck"
  CHECK (length(btrim(idempotency_key)) > 0),
  ADD CONSTRAINT "operacion_b4_hash_no_vacio_ck"
  CHECK (length(btrim(payload_hash)) > 0),
  ADD CONSTRAINT "operacion_b4_no_auto_reversion_ck"
  CHECK (revierte_operacion_id IS NULL OR revierte_operacion_id <> id);

-- `importe` is legacy Float. The only permitted path to bank cents is the exact
-- finite two-decimal conversion below. An infinity, NaN, >INT range, or fraction
-- of a cent yields NULL and blocks JUSTIFICADO at deferred constraint time.
CREATE OR REPLACE FUNCTION b4_importe_bancario_centimos(p_importe double precision)
RETURNS integer
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT CASE
    WHEN p_importe::text IN ('NaN', 'Infinity', '-Infinity') THEN NULL
    WHEN (p_importe::text::numeric * 100) <> trunc(p_importe::text::numeric * 100) THEN NULL
    WHEN (p_importe::text::numeric * 100) < -2147483648
      OR (p_importe::text::numeric * 100) > 2147483647 THEN NULL
    ELSE (p_importe::text::numeric * 100)::integer
  END
$$;

-- A known signed target supports a signed cumulative allocation only in the range
-- [0,target] for receivables and [target,0] for payables. Unknown targets permit
-- no active document capacity. Differences intentionally have no wrapper target.
CREATE OR REPLACE FUNCTION b4_assert_capacidad_documento(p_documento_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_objetivo integer;
  v_activo boolean;
  v_asignado bigint;
  v_lineas bigint;
BEGIN
  IF p_documento_id IS NULL THEN
    RETURN;
  END IF;

  SELECT importe_objetivo_centimos, activo
    INTO v_objetivo, v_activo
    FROM "documentos_conciliables"
   WHERE id = p_documento_id
   FOR KEY SHARE;

  -- A stale/deleted wrapper cannot silently gain capacity; its FK is RESTRICT,
  -- but this makes a missing row clear if the function is ever called directly.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B4 documento conciliable % no existe', p_documento_id
      USING ERRCODE = '23503';
  END IF;

  SELECT COALESCE(SUM(importe_centimos), 0), COUNT(*)
    INTO v_asignado, v_lineas
    FROM "vinculos_movimiento_documento"
   WHERE documento_conciliable_id = p_documento_id AND activo;

  IF NOT v_activo AND v_lineas <> 0 THEN
    RAISE EXCEPTION 'B4 documento % inactivo conserva capacidad activa', p_documento_id
      USING ERRCODE = '23514';
  END IF;
  IF v_objetivo IS NULL AND v_lineas <> 0 THEN
    RAISE EXCEPTION 'B4 documento % tiene objetivo desconocido y no admite líneas activas', p_documento_id
      USING ERRCODE = '23514';
  END IF;
  IF v_objetivo > 0 AND NOT (v_asignado BETWEEN 0 AND v_objetivo) THEN
    RAISE EXCEPTION 'B4 capacidad positiva excedida/invertida en documento %: % de %', p_documento_id, v_asignado, v_objetivo
      USING ERRCODE = '23514';
  END IF;
  IF v_objetivo < 0 AND NOT (v_asignado BETWEEN v_objetivo AND 0) THEN
    RAISE EXCEPTION 'B4 capacidad negativa excedida/invertida en documento %: % de %', p_documento_id, v_asignado, v_objetivo
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- Current state and active lines must agree at commit. A JUSTIFICADO movement has
-- ≥1 active DOCUMENTO line and sums exactly to the *current* exactly-convertible
-- bank entry. SIN_DOCUMENTO/NO_REQUIERE retain zero active lines. Aggregate locking
-- and state/document-version conflict handling remain in the approval service.
CREATE OR REPLACE FUNCTION b4_assert_estado_movimiento(
  p_movimiento_id text,
  p_exige_fila_estado boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado "EstadoJustificacionMovimiento";
  v_motivo "MotivoNoRequiere";
  v_importe_centimos integer;
  v_suma bigint;
  v_documentales bigint;
  v_lineas bigint;
BEGIN
  SELECT e.estado, e.motivo_no_requiere, b4_importe_bancario_centimos(m.importe)
    INTO v_estado, v_motivo, v_importe_centimos
    FROM "estado_justificacion_movimientos" e
    JOIN "movimientos_bancarios" m ON m.id = e.movimiento_id
   WHERE e.movimiento_id = p_movimiento_id
   FOR UPDATE OF e;

  IF NOT FOUND AND p_exige_fila_estado THEN
    -- A link can only point at a movement through its RESTRICT FK, but a state row
    -- is created by the initializer. Do not manufacture a state in a guard.
    RAISE EXCEPTION 'B4 movimiento % no tiene fila de estado', p_movimiento_id
      USING ERRCODE = '23514';
  ELSIF NOT FOUND THEN
    -- Legacy movements may still await the idempotent initializer; a bank import
    -- must not fabricate their row merely because it updates the legacy amount.
    RETURN;
  END IF;

  SELECT COUNT(*), COALESCE(SUM(importe_centimos), 0),
         COUNT(*) FILTER (WHERE tipo_linea = 'DOCUMENTO'::"TipoLineaVinculo")
    INTO v_lineas, v_suma, v_documentales
    FROM "vinculos_movimiento_documento"
   WHERE movimiento_id = p_movimiento_id AND activo;

  IF v_estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento" THEN
    IF v_importe_centimos IS NULL OR v_importe_centimos = 0 THEN
      RAISE EXCEPTION 'B4 movimiento % no tiene importe bancario convertible exactamente a céntimos', p_movimiento_id
        USING ERRCODE = '23514';
    END IF;
    IF v_documentales < 1 OR v_suma <> v_importe_centimos THEN
      RAISE EXCEPTION 'B4 JUSTIFICADO inválido para movimiento %: líneas %, documentales %, suma %, banco %',
        p_movimiento_id, v_lineas, v_documentales, v_suma, v_importe_centimos
        USING ERRCODE = '23514';
    END IF;
  ELSIF v_lineas <> 0 THEN
    RAISE EXCEPTION 'B4 movimiento % en estado % conserva líneas activas', p_movimiento_id, v_estado
      USING ERRCODE = '23514';
  ELSIF v_estado = 'NO_REQUIERE'::"EstadoJustificacionMovimiento" AND v_motivo IS NULL THEN
    RAISE EXCEPTION 'B4 NO_REQUIERE sin motivo para movimiento %', p_movimiento_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION b4_guard_capacidad_documento_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'vinculos_movimiento_documento' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM b4_assert_capacidad_documento(OLD.documento_conciliable_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM b4_assert_capacidad_documento(NEW.documento_conciliable_id);
    END IF;
  ELSE
    PERFORM b4_assert_capacidad_documento(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION b4_guard_estado_movimiento_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'vinculos_movimiento_documento' THEN
    IF TG_OP <> 'INSERT' THEN
      PERFORM b4_assert_estado_movimiento(OLD.movimiento_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
      PERFORM b4_assert_estado_movimiento(NEW.movimiento_id);
    END IF;
  ELSE
    PERFORM b4_assert_estado_movimiento(NEW.movimiento_id);
  END IF;
  RETURN NULL;
END;
$$;

-- If the legacy source amount is ever corrected after B4 initialization, preserving
-- the legacy field is allowed but the B4 current-state invariant is rechecked.
CREATE OR REPLACE FUNCTION b4_guard_importe_bancario_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM b4_assert_estado_movimiento(NEW.id, false);
  RETURN NULL;
END;
$$;

-- Deferrable constraint triggers permit an approval/reversal to make its internally
-- consistent changes in any order, but reject an incomplete transaction at COMMIT.
CREATE CONSTRAINT TRIGGER "b4_capacidad_desde_vinculo_ct"
AFTER INSERT OR UPDATE OR DELETE ON "vinculos_movimiento_documento"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION b4_guard_capacidad_documento_ct();

CREATE CONSTRAINT TRIGGER "b4_capacidad_desde_documento_ct"
AFTER UPDATE OF importe_objetivo_centimos, activo ON "documentos_conciliables"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION b4_guard_capacidad_documento_ct();

CREATE CONSTRAINT TRIGGER "b4_estado_desde_vinculo_ct"
AFTER INSERT OR UPDATE OR DELETE ON "vinculos_movimiento_documento"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION b4_guard_estado_movimiento_ct();

CREATE CONSTRAINT TRIGGER "b4_estado_desde_estado_ct"
AFTER INSERT OR UPDATE OF estado, motivo_no_requiere ON "estado_justificacion_movimientos"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION b4_guard_estado_movimiento_ct();

CREATE CONSTRAINT TRIGGER "b4_estado_desde_importe_banco_ct"
AFTER UPDATE OF importe ON "movimientos_bancarios"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION b4_guard_importe_bancario_ct();

-- Event rows are an append-only audit stream. The DB permits INSERT only; a failed
-- application transaction naturally rolls its event inserts back with its operation.
CREATE OR REPLACE FUNCTION b4_rechazar_mutacion_evento()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'B4 eventos_justificacion_b4 es una bitácora sólo-aditiva'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "b4_eventos_solo_insertar_tr"
BEFORE UPDATE OR DELETE ON "eventos_justificacion_b4"
FOR EACH ROW EXECUTE FUNCTION b4_rechazar_mutacion_evento();

CREATE TRIGGER "b4_eventos_no_truncar_tr"
BEFORE TRUNCATE ON "eventos_justificacion_b4"
FOR EACH STATEMENT EXECUTE FUNCTION b4_rechazar_mutacion_evento();

-- Rollback note: because the B4 delivery is additive, functional rollback is by
-- disabling routes/initializer and preserving B4 audit data. Do not DROP legacy data
-- or mutate legacy reconciliation columns. A future, reviewed down migration may drop
-- only B4 objects in dependency order after retaining any required audit export.
