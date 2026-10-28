-- Promoción explícita Conciliar autorizada por Víctor, 28/10/2026.
-- SQL aditivo derivado del origen; no alterar migraciones staging aplicadas.
DO $$ BEGIN IF NOT (current_database()='railway' AND current_user='postgres') THEN RAISE EXCEPTION 'CONCILIAR_PRODUCTION_IDENTITY_REQUIRED'; END IF; END $$;
-- C10 — soporte documental de intereses confirming Draxton.
--
-- Esta migración no modifica campos económicos legados, no crea DocumentoConciliable,
-- no actualiza FacturaEmitida/MovimientoBancario y no reactiva el importador Graph.
-- Un lote sólo acredita cómo una DIFERENCIA B4 de INTERESES ya aplicada se compone de
-- ConfirmingLinea persistidas. La diferencia B4 continúa siendo la única línea que
-- cierra el movimiento y la única que participa en la conciliación monetaria.

CREATE TYPE "EstadoSoporteInteresConfirmingDraxton" AS ENUM ('CONFIRMADO', 'REVOCADO');
CREATE TYPE "AccionAuditoriaSoporteInteresConfirmingDraxton" AS ENUM ('CONFIRMACION', 'REVOCACION', 'VINCULACION_FACTURA_INTERES', 'DESVINCULACION_FACTURA_INTERES');

CREATE TABLE "lotes_soporte_interes_confirming_draxton" (
  "id" UUID NOT NULL,
  "movimiento_id" TEXT NOT NULL,
  "vinculo_diferencia_id" UUID NOT NULL,
  "factura_recibida_id" TEXT NOT NULL,
  "factura_interes_id" TEXT,
  "factura_interes_referencia" TEXT,
  "factura_interes_emisor" TEXT,
  "estado" "EstadoSoporteInteresConfirmingDraxton" NOT NULL DEFAULT 'CONFIRMADO',
  "importe_total_centimos" INTEGER NOT NULL,
  "fuente_hash" CHAR(64) NOT NULL,
  "fuente_snapshot" JSONB NOT NULL,
  "confirmado_por_id" INTEGER NOT NULL,
  "confirmado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revocado_por_id" INTEGER,
  "revocado_at" TIMESTAMP(3),
  "motivo_revocacion" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lotes_soporte_interes_confirming_draxton_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lineas_soporte_interes_confirming_draxton" (
  "id" UUID NOT NULL,
  "lote_id" UUID NOT NULL,
  "confirming_linea_id" TEXT NOT NULL,
  "factura_emitida_id" TEXT NOT NULL,
  "importe_interes_centimos" INTEGER NOT NULL,
  "fuente_hash" CHAR(64) NOT NULL,
  "fuente_snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lineas_soporte_interes_confirming_draxton_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "auditorias_soporte_interes_confirming_draxton" (
  "id" UUID NOT NULL,
  "lote_id" UUID NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "accion" "AccionAuditoriaSoporteInteresConfirmingDraxton" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload_hash" CHAR(64) NOT NULL,
  "snapshot" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "auditorias_soporte_interes_confirming_draxton_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lotes_soporte_interes_confirming_draxton_vinculo_diferencia_key"
  ON "lotes_soporte_interes_confirming_draxton"("vinculo_diferencia_id");
CREATE INDEX "lotes_soporte_interes_confirming_draxton_movimiento_estado_idx"
  ON "lotes_soporte_interes_confirming_draxton"("movimiento_id", "estado");
CREATE INDEX "lotes_soporte_interes_confirming_draxton_documento_estado_idx"
  ON "lotes_soporte_interes_confirming_draxton"("factura_recibida_id", "estado");
CREATE UNIQUE INDEX "lotes_soporte_interes_confirming_draxton_factura_interes_confirmado_key"
  ON "lotes_soporte_interes_confirming_draxton"("factura_interes_id")
  WHERE "factura_interes_id" IS NOT NULL AND "estado"='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton";
CREATE UNIQUE INDEX "lineas_soporte_interes_confirming_draxton_lote_linea_key"
  ON "lineas_soporte_interes_confirming_draxton"("lote_id", "confirming_linea_id");
CREATE INDEX "lineas_soporte_interes_confirming_draxton_factura_idx"
  ON "lineas_soporte_interes_confirming_draxton"("factura_emitida_id");
CREATE UNIQUE INDEX "auditorias_soporte_interes_confirming_draxton_actor_key"
  ON "auditorias_soporte_interes_confirming_draxton"("actor_id", "idempotency_key");
CREATE INDEX "auditorias_soporte_interes_confirming_draxton_lote_created_idx"
  ON "auditorias_soporte_interes_confirming_draxton"("lote_id", "created_at");

ALTER TABLE "lotes_soporte_interes_confirming_draxton"
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_movimiento_fkey"
    FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_vinculo_fkey"
    FOREIGN KEY ("vinculo_diferencia_id") REFERENCES "vinculos_movimiento_documento"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_documento_fkey"
    FOREIGN KEY ("factura_recibida_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_factura_interes_fkey"
    FOREIGN KEY ("factura_interes_id") REFERENCES "facturas_recibidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_confirmador_fkey"
    FOREIGN KEY ("confirmado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_revocador_fkey"
    FOREIGN KEY ("revocado_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "lineas_soporte_interes_confirming_draxton"
  ADD CONSTRAINT "lineas_soporte_interes_confirming_draxton_lote_fkey"
    FOREIGN KEY ("lote_id") REFERENCES "lotes_soporte_interes_confirming_draxton"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lineas_soporte_interes_confirming_draxton_confirming_linea_fkey"
    FOREIGN KEY ("confirming_linea_id") REFERENCES "confirming_lineas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "lineas_soporte_interes_confirming_draxton_factura_emitida_fkey"
    FOREIGN KEY ("factura_emitida_id") REFERENCES "facturas_emitidas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "auditorias_soporte_interes_confirming_draxton"
  ADD CONSTRAINT "auditorias_soporte_interes_confirming_draxton_lote_fkey"
    FOREIGN KEY ("lote_id") REFERENCES "lotes_soporte_interes_confirming_draxton"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "auditorias_soporte_interes_confirming_draxton_actor_fkey"
    FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "lotes_soporte_interes_confirming_draxton"
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_importe_ck"
    CHECK ("importe_total_centimos" BETWEEN 1 AND 2147483647),
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_hash_ck"
    CHECK ("fuente_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_version_ck"
    CHECK ("version" >= 1),
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_factura_interes_ck"
    CHECK (("factura_interes_id" IS NULL AND "factura_interes_referencia" IS NULL AND "factura_interes_emisor" IS NULL)
      OR ("factura_interes_id" IS NOT NULL AND length(btrim("factura_interes_referencia")) BETWEEN 3 AND 160
        AND length(btrim("factura_interes_emisor")) BETWEEN 3 AND 160)),
  ADD CONSTRAINT "lotes_soporte_interes_confirming_draxton_estado_ck"
    CHECK (("estado" = 'CONFIRMADO' AND "revocado_por_id" IS NULL AND "revocado_at" IS NULL AND "motivo_revocacion" IS NULL)
      OR ("estado" = 'REVOCADO' AND "revocado_por_id" IS NOT NULL AND "revocado_at" IS NOT NULL
        AND length(btrim("motivo_revocacion")) BETWEEN 1 AND 2000));

ALTER TABLE "lineas_soporte_interes_confirming_draxton"
  ADD CONSTRAINT "lineas_soporte_interes_confirming_draxton_importe_ck"
    CHECK ("importe_interes_centimos" BETWEEN 1 AND 2147483647),
  ADD CONSTRAINT "lineas_soporte_interes_confirming_draxton_hash_ck"
    CHECK ("fuente_hash" ~ '^[0-9a-f]{64}$');

ALTER TABLE "auditorias_soporte_interes_confirming_draxton"
  ADD CONSTRAINT "auditorias_soporte_interes_confirming_draxton_key_ck"
    CHECK (length(btrim("idempotency_key")) BETWEEN 1 AND 160),
  ADD CONSTRAINT "auditorias_soporte_interes_confirming_draxton_hash_ck"
    CHECK ("payload_hash" ~ '^[0-9a-f]{64}$');

-- Source is deliberately checked at mutation time. Runtime first applies the
-- same archivoRecibidaControlado helper, which binds the configured financial
-- library for the historical private path; this SQL backstop never invents a
-- drive and accepts only the literal private scope plus a safe item id.
CREATE FUNCTION c10_confirming_source_ok(p_factura_recibida_id text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM facturas_recibidas fr
    WHERE fr.id = p_factura_recibida_id
      AND COALESCE(fr.onedrive_item_id, '') ~ '^[A-Za-z0-9!_.~-]{4,220}$'
      AND (
        COALESCE(fr.onedrive_drive_id, '') ~ '^[A-Za-z0-9!_.~-]{4,220}$'
        OR (
          COALESCE(fr.archivo_onedrive, '') LIKE '2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/%'
          AND substring(fr.archivo_onedrive FROM char_length('2. Contabilidad y finanzas/2. Facturas recibidas/1. Facturas recibidas- Internet Operadores/') + 1) ~ '^[0-9]{4}/'
          AND position('..' IN fr.archivo_onedrive) = 0
          AND position('://' IN fr.archivo_onedrive) = 0
        )
      )
      AND (
        COALESCE(fr.carpeta_origen, '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
        OR COALESCE(fr.archivo_onedrive, '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
        OR COALESCE(fr.onedrive_ruta_actual, '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
        OR EXISTS (
          SELECT 1 FROM historial_ubicaciones_facturas_recibidas h
          WHERE h.factura_id=fr.id
            AND (
              COALESCE(h.anterior->>'carpetaOrigen', '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
              OR COALESCE(h.anterior->>'archivoOneDrive', '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
              OR COALESCE(h.anterior->>'oneDriveRutaActual', '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
              OR COALESCE(h.actual->>'carpetaOrigen', '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
              OR COALESCE(h.actual->>'archivoOneDrive', '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
              OR COALESCE(h.actual->>'oneDriveRutaActual', '') ~* '(^|[/\\])3\. Confirming Draxton 2026([/\\]|$)'
            )
        )
      )
  )
$$;

-- C10 never creates/consumes a received invoice. A manual relation stores the
-- reviewed confirming reference and human-confirmed normalized issuer in the
-- lot. It never compares that confirming reference with the bank invoice's own
-- document number. A bank fee or depositary account is never issuer evidence.
CREATE FUNCTION c10_normalizar_emisor_bancario(p_valor text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN btrim(COALESCE(p_valor,''))='' THEN NULL
    WHEN regexp_replace(upper(translate(btrim(p_valor), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[.,;:()]+', ' ', 'g') ~ '^BBVA( (S ?A|SA))?$'
      OR regexp_replace(upper(translate(btrim(p_valor), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[.,;:()]+', ' ', 'g') LIKE '%BANCO BILBAO VIZCAYA ARGENTARIA%' THEN 'BBVA'
    WHEN regexp_replace(upper(translate(btrim(p_valor), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[.,;:()]+', ' ', 'g') ~ '^CAIXABANK( (S ?A|SA))?$'
      OR regexp_replace(upper(translate(btrim(p_valor), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[.,;:()]+', ' ', 'g') LIKE '%CAIXA BANK%' THEN 'CAIXABANK'
    WHEN regexp_replace(upper(translate(btrim(p_valor), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[.,;:()]+', ' ', 'g') ~ '^(BANCO )?SANTANDER( (S ?A|SA))?$' THEN 'SANTANDER'
    ELSE regexp_replace(regexp_replace(upper(translate(btrim(p_valor), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')), '[.,;:()]+', ' ', 'g'), '\\s+', ' ', 'g')
  END
$$;

CREATE FUNCTION c10_factura_interes_ok(p_lote_id uuid, p_factura_interes_id text, p_referencia_humana text, p_emisor_humano text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM lotes_soporte_interes_confirming_draxton l
    JOIN facturas_recibidas origen ON origen.id=l.factura_recibida_id
    JOIN facturas_recibidas interes ON interes.id=p_factura_interes_id
    WHERE l.id=p_lote_id
      AND l.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton"
      AND interes.id <> origen.id
      AND interes.naturaleza_documento='FACTURA_RECIBIDA'::"NaturalezaDocumentoFinanciero"
      AND interes.calidad='VALIDA'::"CalidadFacturaRecibida"
      AND interes.copia_de_id IS NULL AND interes.conflicto_identidad=false AND interes.duplicado_externo=false
      AND length(btrim(COALESCE(interes.num_factura,''))) BETWEEN 1 AND 160
      AND length(btrim(COALESCE(p_referencia_humana,''))) BETWEEN 3 AND 160
      AND length(btrim(COALESCE(p_emisor_humano,''))) BETWEEN 3 AND 160
      AND btrim(COALESCE(origen.num_factura,''))=btrim(p_referencia_humana)
      AND c10_normalizar_emisor_bancario(interes.proveedor)=c10_normalizar_emisor_bancario(p_emisor_humano)
      AND c10_normalizar_emisor_bancario(p_emisor_humano) IS NOT NULL
      AND interes.fecha::date >= origen.fecha::date
      AND (interes.total::text::numeric * 100)=l.importe_total_centimos::numeric
      AND NOT EXISTS (
        SELECT 1 FROM documentos_conciliables d
        JOIN vinculos_movimiento_documento v ON v.documento_conciliable_id=d.id AND v.activo=true
        WHERE d.factura_recibida_id=interes.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM lotes_soporte_interes_confirming_draxton usado
        WHERE usado.factura_interes_id=interes.id AND usado.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton"
          AND usado.id<>l.id
      )
  )
$$;

-- The lot can only reference one active, non-reverted B4 difference of exactly
-- matching magnitude. Its update path is one-way revocation and cannot erase B4.
CREATE FUNCTION c10_guard_lote_soporte_interes_confirming()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_movimiento text;
  v_tipo "TipoLineaVinculo";
  v_motivo "MotivoDiferencia";
  v_importe integer;
  v_activo boolean;
  v_operacion_estado "EstadoOperacionB4";
  v_operacion_revertida timestamp(3);
  v_estado_b4 "EstadoJustificacionMovimiento";
BEGIN
  SELECT v.movimiento_id, v.tipo_linea, v.motivo_diferencia, v.importe_centimos, v.activo,
         o.estado, o.revertida_at, e.estado
    INTO v_movimiento, v_tipo, v_motivo, v_importe, v_activo,
         v_operacion_estado, v_operacion_revertida, v_estado_b4
    FROM vinculos_movimiento_documento v
    JOIN operaciones_justificacion_b4 o ON o.id = v.operacion_creacion_id
    LEFT JOIN estado_justificacion_movimientos e ON e.movimiento_id = v.movimiento_id
   WHERE v.id = NEW.vinculo_diferencia_id
   FOR KEY SHARE OF v, o;

  IF NOT FOUND OR v_movimiento <> NEW.movimiento_id OR v_tipo <> 'DIFERENCIA'::"TipoLineaVinculo"
     OR v_motivo <> 'INTERESES'::"MotivoDiferencia" OR v_importe <> -NEW.importe_total_centimos THEN
    RAISE EXCEPTION 'C10 exige una diferencia B4 de INTERESES, negativa y del mismo movimiento' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT v_activo OR v_operacion_estado <> 'APLICADA'::"EstadoOperacionB4" OR v_operacion_revertida IS NOT NULL
       OR v_estado_b4 <> 'JUSTIFICADO'::"EstadoJustificacionMovimiento" THEN
      RAISE EXCEPTION 'C10 sólo soporta una diferencia B4 activa, aplicada y justificada' USING ERRCODE = '23514';
    END IF;
    IF NEW.estado <> 'CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton" OR NEW.version <> 1
       OR NEW.revocado_por_id IS NOT NULL OR NEW.revocado_at IS NOT NULL OR NEW.motivo_revocacion IS NOT NULL
       OR NEW.factura_interes_id IS NOT NULL OR NEW.factura_interes_referencia IS NOT NULL OR NEW.factura_interes_emisor IS NOT NULL
       OR NOT c10_confirming_source_ok(NEW.factura_recibida_id) THEN
      RAISE EXCEPTION 'C10 alta exige fuente confirming controlada y lote confirmado inicial' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton" THEN
    IF OLD.estado <> 'CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton"
       OR NEW.version <> OLD.version
       OR NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id
       OR NEW.vinculo_diferencia_id IS DISTINCT FROM OLD.vinculo_diferencia_id
       OR NEW.factura_recibida_id IS DISTINCT FROM OLD.factura_recibida_id
       OR NEW.importe_total_centimos IS DISTINCT FROM OLD.importe_total_centimos
       OR NEW.fuente_hash IS DISTINCT FROM OLD.fuente_hash
       OR NEW.fuente_snapshot IS DISTINCT FROM OLD.fuente_snapshot
       OR NEW.confirmado_por_id IS DISTINCT FROM OLD.confirmado_por_id
       OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at
       OR NEW.revocado_por_id IS DISTINCT FROM OLD.revocado_por_id
       OR NEW.revocado_at IS DISTINCT FROM OLD.revocado_at
       OR NEW.motivo_revocacion IS DISTINCT FROM OLD.motivo_revocacion
       OR NOT v_activo OR v_operacion_estado <> 'APLICADA'::"EstadoOperacionB4" OR v_operacion_revertida IS NOT NULL
       OR v_estado_b4 <> 'JUSTIFICADO'::"EstadoJustificacionMovimiento" THEN
      RAISE EXCEPTION 'C10 sólo permite vincular o desvincular evidencia de factura mientras B4 sigue vigente' USING ERRCODE = '23514';
    END IF;
    IF NOT ((OLD.factura_interes_id IS NULL AND NEW.factura_interes_id IS NOT NULL AND NEW.factura_interes_referencia IS NOT NULL AND NEW.factura_interes_emisor IS NOT NULL
        AND c10_factura_interes_ok(NEW.id, NEW.factura_interes_id, NEW.factura_interes_referencia, NEW.factura_interes_emisor))
      OR (OLD.factura_interes_id IS NOT NULL AND NEW.factura_interes_id IS NULL AND NEW.factura_interes_referencia IS NULL AND NEW.factura_interes_emisor IS NULL)) THEN
      RAISE EXCEPTION 'C10 sólo permite una vinculación documental explícita o su desvinculación' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF OLD.estado <> 'CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton"
       OR NEW.estado <> 'REVOCADO'::"EstadoSoporteInteresConfirmingDraxton"
       OR NEW.version <> OLD.version + 1
       OR NEW.movimiento_id IS DISTINCT FROM OLD.movimiento_id
       OR NEW.vinculo_diferencia_id IS DISTINCT FROM OLD.vinculo_diferencia_id
       OR NEW.factura_recibida_id IS DISTINCT FROM OLD.factura_recibida_id
       OR NEW.factura_interes_id IS DISTINCT FROM OLD.factura_interes_id
       OR NEW.factura_interes_referencia IS DISTINCT FROM OLD.factura_interes_referencia
       OR NEW.factura_interes_emisor IS DISTINCT FROM OLD.factura_interes_emisor
       OR NEW.importe_total_centimos IS DISTINCT FROM OLD.importe_total_centimos
       OR NEW.fuente_hash IS DISTINCT FROM OLD.fuente_hash
       OR NEW.fuente_snapshot IS DISTINCT FROM OLD.fuente_snapshot
       OR NEW.confirmado_por_id IS DISTINCT FROM OLD.confirmado_por_id
       OR NEW.confirmado_at IS DISTINCT FROM OLD.confirmado_at THEN
      RAISE EXCEPTION 'C10 sólo permite revocar una vez sin reescribir la evidencia' USING ERRCODE = '23514';
    END IF;
    IF v_activo OR v_operacion_revertida IS NULL THEN
      RAISE EXCEPTION 'C10 primero exige deshacer B4; no oculta una diferencia de intereses todavía activa' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lotes_soporte_interes_confirming_draxton_guard_tr
  BEFORE INSERT OR UPDATE ON lotes_soporte_interes_confirming_draxton
  FOR EACH ROW EXECUTE FUNCTION c10_guard_lote_soporte_interes_confirming();

-- Every child is an existing line from exactly the controlled source document and
-- keeps its own FE identity. The exact cents conversion is asserted again in the
-- server helper; this SQL check is a backstop against a missing/zero legacy field.
CREATE FUNCTION c10_guard_linea_soporte_interes_confirming()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_documento text;
  v_estado "EstadoSoporteInteresConfirmingDraxton";
  v_linea_documento text;
  v_linea_factura text;
  v_interes double precision;
BEGIN
  SELECT factura_recibida_id, estado INTO v_documento, v_estado
    FROM lotes_soporte_interes_confirming_draxton WHERE id = NEW.lote_id FOR KEY SHARE;
  SELECT confirming_id, factura_emitida_id, intereses INTO v_linea_documento, v_linea_factura, v_interes
    FROM confirming_lineas WHERE id = NEW.confirming_linea_id FOR KEY SHARE;
  IF EXISTS (
    SELECT 1
      FROM lineas_soporte_interes_confirming_draxton old_line
      JOIN lotes_soporte_interes_confirming_draxton old_lote ON old_lote.id=old_line.lote_id
     WHERE old_line.confirming_linea_id=NEW.confirming_linea_id
       AND old_lote.estado='CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton"
  ) THEN
    RAISE EXCEPTION 'C10 una ConfirmingLinea ya tiene soporte de interés activo' USING ERRCODE = '23505';
  END IF;
  IF NOT FOUND OR v_estado <> 'CONFIRMADO'::"EstadoSoporteInteresConfirmingDraxton"
     OR v_linea_documento <> v_documento OR v_linea_factura IS DISTINCT FROM NEW.factura_emitida_id
     OR v_interes IS NULL OR v_interes <= 0
     OR (v_interes::text::numeric * 100) <> NEW.importe_interes_centimos::numeric THEN
    RAISE EXCEPTION 'C10 línea sin interés explícito exacto o fuera de su confirming/factura' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lineas_soporte_interes_confirming_draxton_guard_tr
  BEFORE INSERT ON lineas_soporte_interes_confirming_draxton
  FOR EACH ROW EXECUTE FUNCTION c10_guard_linea_soporte_interes_confirming();

-- Deferred equality makes the lot atomic: every B4 cent of INTERESES queda
-- documentado, y las líneas no pueden aportar ni un céntimo extra.
CREATE FUNCTION c10_assert_total_lote_soporte_interes(p_lote_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_estado "EstadoSoporteInteresConfirmingDraxton";
  v_total integer;
  v_lineas bigint;
BEGIN
  SELECT estado, importe_total_centimos INTO v_estado, v_total
    FROM lotes_soporte_interes_confirming_draxton WHERE id = p_lote_id FOR KEY SHARE;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT COALESCE(SUM(importe_interes_centimos), 0) INTO v_lineas
    FROM lineas_soporte_interes_confirming_draxton WHERE lote_id = p_lote_id;
  IF v_lineas <> v_total THEN
    RAISE EXCEPTION 'C10 el total de líneas % no coincide con lote % en %', v_lineas, v_total, p_lote_id USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE FUNCTION c10_guard_total_lote_soporte_interes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM c10_assert_total_lote_soporte_interes(CASE WHEN TG_TABLE_NAME = 'lotes_soporte_interes_confirming_draxton' THEN NEW.id ELSE NEW.lote_id END);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER lotes_soporte_interes_confirming_draxton_total_ct
  AFTER INSERT OR UPDATE ON lotes_soporte_interes_confirming_draxton
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION c10_guard_total_lote_soporte_interes();
CREATE CONSTRAINT TRIGGER lineas_soporte_interes_confirming_draxton_total_ct
  AFTER INSERT ON lineas_soporte_interes_confirming_draxton
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION c10_guard_total_lote_soporte_interes();

CREATE FUNCTION c10_rechazar_mutacion_evidencia()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% es evidencia C10 inmutable', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER lineas_soporte_interes_confirming_draxton_no_update_delete_tr
  BEFORE UPDATE OR DELETE ON lineas_soporte_interes_confirming_draxton
  FOR EACH ROW EXECUTE FUNCTION c10_rechazar_mutacion_evidencia();
CREATE TRIGGER auditorias_soporte_interes_confirming_draxton_no_update_delete_tr
  BEFORE UPDATE OR DELETE ON auditorias_soporte_interes_confirming_draxton
  FOR EACH ROW EXECUTE FUNCTION c10_rechazar_mutacion_evidencia();
