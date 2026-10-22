-- CreateEnum
CREATE TYPE "EstadoAsignacionDevolucionRemesaB6" AS ENUM ('PROPUESTA', 'CONFIRMADA');

-- CreateEnum
CREATE TYPE "AccionAuditoriaRemesaB6" AS ENUM ('ASOCIACION_FACTURAS_CONFIRMADA', 'DEVOLUCION_ASOCIADA');

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "remesa_id" INTEGER;

-- CreateTable
CREATE TABLE "asignaciones_devolucion_remesa_b6" (
    "id" UUID NOT NULL,
    "remesa_id" INTEGER NOT NULL,
    "factura_isp_id" INTEGER NOT NULL,
    "movimiento_id" TEXT,
    "vinculo_id" UUID,
    "importe_centimos" INTEGER NOT NULL,
    "estado" "EstadoAsignacionDevolucionRemesaB6" NOT NULL DEFAULT 'PROPUESTA',
    "confirmada_por_id" INTEGER,
    "confirmada_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_devolucion_remesa_b6_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_remesa_b6" (
    "id" UUID NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "remesa_id" INTEGER NOT NULL,
    "movimiento_id" TEXT,
    "asignacion_id" UUID,
    "accion" "AccionAuditoriaRemesaB6" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "source_hash" TEXT NOT NULL,
    "snapshot_solicitud" JSONB NOT NULL,
    "snapshot_resultado" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_remesa_b6_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_devolucion_remesa_b6_vinculo_id_key" ON "asignaciones_devolucion_remesa_b6"("vinculo_id");

-- CreateIndex
CREATE INDEX "asignaciones_devolucion_remesa_b6_remesa_id_factura_isp_id_idx" ON "asignaciones_devolucion_remesa_b6"("remesa_id", "factura_isp_id");

-- CreateIndex
CREATE INDEX "asignaciones_devolucion_remesa_b6_movimiento_id_idx" ON "asignaciones_devolucion_remesa_b6"("movimiento_id");

-- CreateIndex
CREATE INDEX "asignaciones_devolucion_remesa_b6_factura_isp_id_idx" ON "asignaciones_devolucion_remesa_b6"("factura_isp_id");

-- CreateIndex
CREATE INDEX "auditoria_remesa_b6_remesa_id_created_at_idx" ON "auditoria_remesa_b6"("remesa_id", "created_at");

-- CreateIndex
CREATE INDEX "auditoria_remesa_b6_movimiento_id_created_at_idx" ON "auditoria_remesa_b6"("movimiento_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "auditoria_remesa_b6_actor_id_idempotency_key_key" ON "auditoria_remesa_b6"("actor_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "facturas_remesa_id_idx" ON "facturas"("remesa_id");

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_remesa_id_fkey" FOREIGN KEY ("remesa_id") REFERENCES "remesas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asignaciones_devolucion_remesa_b6" ADD CONSTRAINT "asignaciones_devolucion_remesa_b6_remesa_id_fkey" FOREIGN KEY ("remesa_id") REFERENCES "remesas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asignaciones_devolucion_remesa_b6" ADD CONSTRAINT "asignaciones_devolucion_remesa_b6_factura_isp_id_fkey" FOREIGN KEY ("factura_isp_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asignaciones_devolucion_remesa_b6" ADD CONSTRAINT "asignaciones_devolucion_remesa_b6_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asignaciones_devolucion_remesa_b6" ADD CONSTRAINT "asignaciones_devolucion_remesa_b6_vinculo_id_fkey" FOREIGN KEY ("vinculo_id") REFERENCES "vinculos_movimiento_documento"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "asignaciones_devolucion_remesa_b6" ADD CONSTRAINT "asignaciones_devolucion_remesa_b6_confirmada_por_id_fkey" FOREIGN KEY ("confirmada_por_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditoria_remesa_b6" ADD CONSTRAINT "auditoria_remesa_b6_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditoria_remesa_b6" ADD CONSTRAINT "auditoria_remesa_b6_remesa_id_fkey" FOREIGN KEY ("remesa_id") REFERENCES "remesas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditoria_remesa_b6" ADD CONSTRAINT "auditoria_remesa_b6_movimiento_id_fkey" FOREIGN KEY ("movimiento_id") REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "auditoria_remesa_b6" ADD CONSTRAINT "auditoria_remesa_b6_asignacion_id_fkey" FOREIGN KEY ("asignacion_id") REFERENCES "asignaciones_devolucion_remesa_b6"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- B6 Remesa ↔ Factura ISP guards — Guardas aditivas de staging, incluidas en migration.sql.
--
-- Preconditions, in the same reviewed *isolated staging* migration transaction:
--   1. Prisma generated the enum/tables/FKs from schema.fragment.prisma.
--   2. `facturas.remesa_id` is the one additive legacy-table change, with an
--      indexed FK to remesas(id) ON DELETE/UPDATE RESTRICT.
--   3. Existing B4 migration supplied b4_importe_bancario_centimos(double precision).
--
-- This script contains no backfill, no DML, no trigger on a legacy table, and no
-- alteration of a legacy payment/status/reconciliation field. In particular, its
-- refund proof is checked ONLY when a B6 assignment is INSERTed. B4 deshacer
-- later soft-disables vinculos (`activo=false`) and must not be blocked; readers
-- must join current B4 `activo + APLICADA/no revertida + JUSTIFICADO` themselves.

-- Both values have distinct meaning:
-- payload_hash is the stable canonical request comparator for idempotency;
-- source_hash is immutable-source evidence and must never include Factura.remesa_id.
ALTER TABLE "auditoria_remesa_b6"
  ADD CONSTRAINT "auditoria_remesa_b6_key_no_vacia_ck"
    CHECK (length(btrim("idempotency_key")) > 0),
  ADD CONSTRAINT "auditoria_remesa_b6_payload_hash_sha256_ck"
    CHECK ("payload_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auditoria_remesa_b6_source_hash_sha256_ck"
    CHECK ("source_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "auditoria_remesa_b6_version_metadata_ck"
    CHECK (
      "snapshot_resultado" ? 'version'
      AND "snapshot_resultado"->>'version' = 'B6_REMESAS_V1'
      AND "snapshot_solicitud" ? 'action'
      AND (
        ("accion" = 'ASOCIACION_FACTURAS_CONFIRMADA'::"AccionAuditoriaRemesaB6"
          AND "movimiento_id" IS NULL AND "asignacion_id" IS NULL
          AND "snapshot_solicitud"->>'action' = 'asociar_facturas')
        OR
        ("accion" = 'DEVOLUCION_ASOCIADA'::"AccionAuditoriaRemesaB6"
          AND "movimiento_id" IS NOT NULL AND "asignacion_id" IS NOT NULL
          AND "snapshot_solicitud"->>'action' = 'asociar_devolucion')
      )
    );

-- B6 presently admits only confirmed refund facts. PROPUESTA remains an enum value
-- solely for a future separately-reviewed workflow; it is not a writable B6 state.
ALTER TABLE "asignaciones_devolucion_remesa_b6"
  ADD CONSTRAINT "asignacion_devolucion_b6_confirmada_solo_ck"
    CHECK (
      "estado" = 'CONFIRMADA'::"EstadoAsignacionDevolucionRemesaB6"
      AND "movimiento_id" IS NOT NULL
      AND "vinculo_id" IS NOT NULL
      AND "confirmada_por_id" IS NOT NULL
      AND "confirmada_at" IS NOT NULL
    ),
  ADD CONSTRAINT "asignacion_devolucion_b6_importe_negativo_ck"
    CHECK ("importe_centimos" BETWEEN -2147483648 AND -1);

-- An INSERT must prove one whole, current B4 negative REMESA principal line plus only explicit differences. The
-- B4 physical bank amount is re-converted by its approved exact helper; no legacy
-- payment status, cobrado field, DevolucionRemesa, or inferred identity is read.
CREATE OR REPLACE FUNCTION b6_assert_asignacion_devolucion_insertada(p_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  a record;
  evidencia record;
  objetivo_factura bigint;
  ya_devuelto bigint;
BEGIN
  SELECT * INTO a
    FROM "asignaciones_devolucion_remesa_b6"
   WHERE id = p_id
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'B6 asignación de devolución % no existe', p_id USING ERRCODE = '23503';
  END IF;

  -- Lock all real B4/current-source rows used by the proof. No `operacion_id`
  -- shortcut exists: physical provenance is v.operacion_creacion_id.
  SELECT
      f.id AS factura_id, f.remesa_id AS factura_remesa_id, f.total AS factura_total,
      v.id AS vinculo_id, v.movimiento_id, v.activo AS vinculo_activo,
      v.tipo_linea, v.importe_centimos AS vinculo_centimos,
      d.activo AS documento_activo, d.tipo AS documento_tipo, d.remesa_id AS documento_remesa_id,
      o.estado AS operacion_estado, o.revertida_at,
      e.estado AS movimiento_estado,
      b4_importe_bancario_centimos(m.importe) AS banco_centimos,
      d.importe_objetivo_centimos AS objetivo_remesa,
      r.total_importe*100 AS fuente_remesa_centimos,
      (SELECT COALESCE(SUM(z.importe_centimos),0) FROM vinculos_movimiento_documento z WHERE z.movimiento_id=v.movimiento_id AND z.activo) AS cierre_centimos,
      (SELECT COUNT(*) FROM vinculos_movimiento_documento z WHERE z.movimiento_id=v.movimiento_id AND z.activo AND z.tipo_linea='DOCUMENTO'::"TipoLineaVinculo") AS documentos_actuales
    INTO evidencia
    FROM "facturas" f
    JOIN "vinculos_movimiento_documento" v ON v.id = a.vinculo_id
    JOIN "documentos_conciliables" d ON d.id = v.documento_conciliable_id
    JOIN remesas r ON r.id=d.remesa_id
    JOIN "operaciones_justificacion_b4" o ON o.id = v.operacion_creacion_id
    JOIN "estado_justificacion_movimientos" e ON e.movimiento_id = v.movimiento_id
    JOIN "movimientos_bancarios" m ON m.id = v.movimiento_id
   WHERE f.id = a.factura_isp_id
   FOR KEY SHARE OF f, v, d, o, e, m, r;

  IF NOT FOUND
     OR evidencia.factura_remesa_id IS DISTINCT FROM a.remesa_id
     OR NOT evidencia.vinculo_activo
     OR evidencia.tipo_linea <> 'DOCUMENTO'::"TipoLineaVinculo"
     OR NOT evidencia.documento_activo
     OR evidencia.documento_tipo <> 'REMESA'::"TipoDocumentoConciliable"
     OR evidencia.documento_remesa_id IS DISTINCT FROM a.remesa_id
     OR evidencia.movimiento_id IS DISTINCT FROM a.movimiento_id
     OR evidencia.operacion_estado <> 'APLICADA'::"EstadoOperacionB4"
     OR evidencia.revertida_at IS NOT NULL
     OR evidencia.movimiento_estado <> 'JUSTIFICADO'::"EstadoJustificacionMovimiento"
     OR evidencia.banco_centimos IS NULL
     OR evidencia.banco_centimos >= 0
     OR evidencia.cierre_centimos <> evidencia.banco_centimos
     OR evidencia.documentos_actuales <> 1
     OR evidencia.objetivo_remesa <> evidencia.fuente_remesa_centimos
     OR a.importe_centimos <> evidencia.vinculo_centimos
     OR a.importe_centimos >= 0 THEN
    RAISE EXCEPTION 'B6 devolución % no acredita una línea B4 REMESA completa, activa, negativa, aplicada y exactamente justificada', p_id
      USING ERRCODE = '23514';
  END IF;

  -- Factura.total is numeric(10,2), nevertheless derive only exact signed cents
  -- and reject zero/negative capacity. The whole negative line is never prorated.
  IF evidencia.factura_total IS NULL
     OR evidencia.factura_total <= 0
     OR (evidencia.factura_total * 100) <> trunc(evidencia.factura_total * 100)
     OR (evidencia.factura_total * 100) > 2147483647 THEN
    RAISE EXCEPTION 'B6 devolución % no tiene objetivo positivo exacto para factura ISP %', p_id, a.factura_isp_id
      USING ERRCODE = '23514';
  END IF;
  objetivo_factura := (evidencia.factura_total * 100)::bigint;

  -- Count only refund facts with *current* B4 proof. A later B4 deshacer leaves
  -- the immutable B6 row/audit intact but removes it from current capacity reads.
  SELECT COALESCE(SUM(-(x.importe_centimos::bigint)), 0)::bigint
    INTO ya_devuelto
    FROM "asignaciones_devolucion_remesa_b6" x
    JOIN "vinculos_movimiento_documento" xv
      ON xv.id = x.vinculo_id AND xv.activo
    JOIN "documentos_conciliables" xd
      ON xd.id = xv.documento_conciliable_id
     AND xd.activo
     AND xd.tipo = 'REMESA'::"TipoDocumentoConciliable"
    JOIN "operaciones_justificacion_b4" xo
      ON xo.id = xv.operacion_creacion_id
     AND xo.estado = 'APLICADA'::"EstadoOperacionB4"
     AND xo.revertida_at IS NULL
    JOIN "estado_justificacion_movimientos" xe
      ON xe.movimiento_id = x.movimiento_id
     AND xe.estado = 'JUSTIFICADO'::"EstadoJustificacionMovimiento"
   WHERE x.factura_isp_id = a.factura_isp_id
     AND x.estado = 'CONFIRMADA'::"EstadoAsignacionDevolucionRemesaB6";

  IF ya_devuelto > objetivo_factura THEN
    RAISE EXCEPTION 'B6 devolución % excede la capacidad exacta de factura ISP %; una línea B4 no se prorratea', p_id, a.factura_isp_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- This deferred trigger is intentionally on INSERT ONLY. It validates an insert
-- after its service has inserted its fact and audit in one transaction, but B4
-- active/state/operation changes in later deshacer transactions never call it.
CREATE OR REPLACE FUNCTION b6_guard_asignacion_devolucion_insert_ct()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM b6_assert_asignacion_devolucion_insertada(NEW.id);
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER "b6_asignacion_devolucion_insert_ct"
AFTER INSERT ON "asignaciones_devolucion_remesa_b6"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION b6_guard_asignacion_devolucion_insert_ct();

-- Refund facts and audit records are append-only. No state update, cleanup loop,
-- delete, truncate, or cascade-based erasure is part of B6. RESTRICT FKs make
-- source-row deletes fail rather than silently removing evidence.
CREATE OR REPLACE FUNCTION b6_rechazar_mutacion_asignacion_devolucion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'B6 asignaciones_devolucion_remesa_b6 es una bitácora inmutable'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "b6_asignacion_devolucion_no_update_delete_tr"
BEFORE UPDATE OR DELETE ON "asignaciones_devolucion_remesa_b6"
FOR EACH ROW EXECUTE FUNCTION b6_rechazar_mutacion_asignacion_devolucion();
CREATE TRIGGER "b6_asignacion_devolucion_no_truncate_tr"
BEFORE TRUNCATE ON "asignaciones_devolucion_remesa_b6"
FOR EACH STATEMENT EXECUTE FUNCTION b6_rechazar_mutacion_asignacion_devolucion();

CREATE OR REPLACE FUNCTION b6_rechazar_mutacion_auditoria_remesa()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'B6 auditoria_remesa_b6 es una bitácora sólo-aditiva'
    USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "b6_auditoria_remesa_no_update_delete_tr"
BEFORE UPDATE OR DELETE ON "auditoria_remesa_b6"
FOR EACH ROW EXECUTE FUNCTION b6_rechazar_mutacion_auditoria_remesa();
CREATE TRIGGER "b6_auditoria_remesa_no_truncate_tr"
BEFORE TRUNCATE ON "auditoria_remesa_b6"
FOR EACH STATEMENT EXECUTE FUNCTION b6_rechazar_mutacion_auditoria_remesa();

-- Reader invariant (documentation, not another trigger): B5/B7 must count an
-- CONFIRMADA refund only through the same current B4 joins used above: v.activo,
-- d.activo+d.tipo REMESA, o.APLICADA+o.revertida_at IS NULL, and e.JUSTIFICADO.
-- Do not trust CONFIRMADA alone after B4 deshacer.
