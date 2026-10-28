-- Conciliar v1: proyección materializada, recibos propios e historial.
-- Migración estrictamente aditiva. No altera Prisma, fuentes ISP, B4, B5, B6 ni datos legacy.
-- La proyección se reconstruye manualmente en staging; GET no la modifica.

CREATE TYPE "AccionOperacionConciliar" AS ENUM ('CONFIRMAR', 'PEDIR', 'DESHACER');
CREATE TYPE "EstadoOperacionConciliar" AS ENUM ('APLICADA', 'PARCIAL', 'REVERTIDA');

CREATE TABLE "conciliar_proyecciones" (
  "id" text NOT NULL,
  "tab" text NOT NULL CHECK ("tab" IN ('COBROS','EMITIDAS','PAGOS','RECIBIDAS')),
  "movimiento_id" text NULL REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "cuenta_id" text NULL REFERENCES "cuentas_bancarias"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "fecha" date NOT NULL,
  "importe_centimos" integer NOT NULL,
  "pendiente_centimos" integer NOT NULL,
  "color" text NOT NULL CHECK ("color" IN ('VERDE','AMBAR','ROJO')),
  "grupo" text NULL CHECK ("grupo" IS NULL OR length(btrim("grupo")) BETWEEN 1 AND 120),
  "motivo" text NOT NULL CHECK (length(btrim("motivo")) BETWEEN 1 AND 1200),
  "concepto" text NOT NULL DEFAULT '' CHECK (length("concepto") <= 1200),
  "banco" text NULL CHECK ("banco" IS NULL OR length("banco") <= 300),
  "cuenta" text NULL CHECK ("cuenta" IS NULL OR length("cuenta") <= 300),
  "documento" jsonb NULL CHECK ("documento" IS NULL OR jsonb_typeof("documento")='object'),
  "propuesta" text NULL CHECK ("propuesta" IS NULL OR length("propuesta") <= 500),
  "seleccionable" boolean NOT NULL DEFAULT false,
  "diferencia_centimos" integer NOT NULL,
  "links_movimiento" jsonb NULL CHECK ("links_movimiento" IS NULL OR jsonb_typeof("links_movimiento")='array'),
  "detail" text NULL CHECK ("detail" IS NULL OR length("detail") <= 4000),
  "source" jsonb NOT NULL CHECK (jsonb_typeof("source")='object'),
  "source_fingerprint" text NOT NULL CHECK ("source_fingerprint" ~ '^[a-f0-9]{64}$'),
  "updated_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conciliar_proyecciones_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conciliar_proyecciones_tab_sort_idx"
  ON "conciliar_proyecciones" ("tab", "color", "fecha" DESC, "id");
CREATE INDEX "conciliar_proyecciones_movimiento_idx"
  ON "conciliar_proyecciones" ("movimiento_id") WHERE "movimiento_id" IS NOT NULL;
CREATE INDEX "conciliar_proyecciones_cuenta_fecha_idx"
  ON "conciliar_proyecciones" ("cuenta_id", "fecha" DESC) WHERE "cuenta_id" IS NOT NULL;
CREATE INDEX "conciliar_proyecciones_updated_idx"
  ON "conciliar_proyecciones" ("updated_at" DESC);

CREATE TABLE "operaciones_conciliar" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "actor_id" integer NOT NULL REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "accion" "AccionOperacionConciliar" NOT NULL,
  "estado" "EstadoOperacionConciliar" NOT NULL DEFAULT 'APLICADA',
  "idempotency_key" uuid NOT NULL,
  "request_hash" text NOT NULL CHECK ("request_hash" ~ '^[a-f0-9]{64}$'),
  "operacion_padre_id" uuid NULL REFERENCES "operaciones_conciliar"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "resultado" jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("resultado")='object'),
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revertida_at" timestamptz NULL,
  CONSTRAINT "operaciones_conciliar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "operaciones_conciliar_actor_key_uk" UNIQUE ("actor_id", "idempotency_key")
);

CREATE INDEX "operaciones_conciliar_actor_created_idx"
  ON "operaciones_conciliar" ("actor_id", "created_at" DESC, "id" DESC);
CREATE INDEX "operaciones_conciliar_parent_idx"
  ON "operaciones_conciliar" ("operacion_padre_id") WHERE "operacion_padre_id" IS NOT NULL;

CREATE TABLE "patas_operacion_conciliar" (
  "operacion_conciliar_id" uuid NOT NULL REFERENCES "operaciones_conciliar"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "ordinal" integer NOT NULL CHECK ("ordinal" >= 1 AND "ordinal" <= 100),
  "fila_id" text NOT NULL,
  "movimiento_id" text NULL REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "operacion_b4_id" uuid NULL REFERENCES "operaciones_justificacion_b4"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "accion_b5" text NULL CHECK ("accion_b5" IS NULL OR "accion_b5" IN ('PEDIDO')),
  "bloque_propuesta_cobro_id" uuid NULL,
  "resultado" jsonb NOT NULL CHECK (jsonb_typeof("resultado")='object'),
  "created_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "patas_operacion_conciliar_pkey" PRIMARY KEY ("operacion_conciliar_id", "ordinal"),
  CONSTRAINT "patas_operacion_conciliar_fila_uk" UNIQUE ("operacion_conciliar_id", "fila_id"),
  CONSTRAINT "patas_operacion_conciliar_accion_ck" CHECK (
    ("operacion_b4_id" IS NOT NULL AND "accion_b5" IS NULL AND "bloque_propuesta_cobro_id" IS NULL)
    OR ("operacion_b4_id" IS NULL AND "accion_b5" = 'PEDIDO' AND "bloque_propuesta_cobro_id" IS NULL)
    OR ("operacion_b4_id" IS NULL AND "accion_b5" IS NULL AND "bloque_propuesta_cobro_id" IS NOT NULL)
  )
);

CREATE INDEX "patas_operacion_conciliar_b4_idx"
  ON "patas_operacion_conciliar" ("operacion_b4_id") WHERE "operacion_b4_id" IS NOT NULL;
CREATE INDEX "patas_operacion_conciliar_bloque_cobro_idx"
  ON "patas_operacion_conciliar" ("bloque_propuesta_cobro_id") WHERE "bloque_propuesta_cobro_id" IS NOT NULL;
CREATE INDEX "patas_operacion_conciliar_movimiento_idx"
  ON "patas_operacion_conciliar" ("movimiento_id") WHERE "movimiento_id" IS NOT NULL;

-- Un import, confirmación o reversión no recalcula una cola en la transacción del
-- usuario. Sólo marca la foto como pendiente para el rebuild explícito de staging.
CREATE TABLE "estado_proyeccion_conciliar" (
  "singleton" boolean NOT NULL DEFAULT true CHECK ("singleton"),
  "dirty_at" timestamptz NULL,
  "dirty_reason" text NULL CHECK ("dirty_reason" IS NULL OR length("dirty_reason") <= 120),
  "rebuilt_at" timestamptz NULL,
  "rebuilt_by_id" integer NULL REFERENCES "usuarios_admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "projection_version" bigint NOT NULL DEFAULT 0,
  CONSTRAINT "estado_proyeccion_conciliar_pkey" PRIMARY KEY ("singleton")
);
INSERT INTO "estado_proyeccion_conciliar" ("singleton","dirty_at","dirty_reason")
VALUES (true,CURRENT_TIMESTAMP,'MIGRACION_INICIAL') ON CONFLICT ("singleton") DO NOTHING;

CREATE FUNCTION conciliar_marcar_proyeccion_sucia()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "estado_proyeccion_conciliar" ("singleton","dirty_at","dirty_reason")
  VALUES (true,CURRENT_TIMESTAMP,TG_TABLE_NAME)
  ON CONFLICT ("singleton") DO UPDATE
    SET "dirty_at"=EXCLUDED."dirty_at", "dirty_reason"=EXCLUDED."dirty_reason";
  RETURN NULL;
END
$$;

-- Estas fuentes son las que forman decisiones Conciliar. Los triggers no leen
-- JSON ni hacen DML financiero; sólo dejan la UI en modo «actualización pendiente».
CREATE TRIGGER "conciliar_dirty_movimientos_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "movimientos_bancarios"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_b4_estado_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "estado_justificacion_movimientos"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_b4_operaciones_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "operaciones_justificacion_b4"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_b4_vinculos_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "vinculos_movimiento_documento"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_emitidas_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "facturas_emitidas"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_recibidas_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "facturas_recibidas"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_remesas_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "remesas"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_propuestas_cobro_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "modo_facil_propuestas_cobro"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();
CREATE TRIGGER "conciliar_dirty_nominas_tr"
  AFTER INSERT OR UPDATE OR DELETE ON "nominas"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_marcar_proyeccion_sucia();

-- Append-only receipts. A reversal is a new operation; original receipt stays immutable.
CREATE FUNCTION conciliar_rechazar_mutacion_recibo()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CONCILIAR_RECIBO_APPEND_ONLY' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER "patas_operacion_conciliar_no_update_delete_tr"
  BEFORE UPDATE OR DELETE ON "patas_operacion_conciliar"
  FOR EACH ROW EXECUTE FUNCTION conciliar_rechazar_mutacion_recibo();
CREATE TRIGGER "patas_operacion_conciliar_no_truncate_tr"
  BEFORE TRUNCATE ON "patas_operacion_conciliar"
  FOR EACH STATEMENT EXECUTE FUNCTION conciliar_rechazar_mutacion_recibo();
