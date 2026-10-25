-- Propuestas de cobro del Modo fácil (sólo propuestas; nunca justifica nada por sí misma).
-- Aditiva: dos tablas nuevas append-only, sus índices y su guardia. No altera tablas existentes.
-- La confirmación humana se registra en B4 (operaciones, vínculos y eventos) y se deshace por bloque.

CREATE TABLE "modo_facil_generaciones_cobro" (
  "id" uuid PRIMARY KEY,
  "creada_at" timestamptz NOT NULL DEFAULT now(),
  "fuente" text NOT NULL CHECK (length("fuente") BETWEEN 3 AND 200),
  "resumen" jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof("resumen") = 'object')
);

CREATE TABLE "modo_facil_propuestas_cobro" (
  "id" uuid PRIMARY KEY,
  "generacion_id" uuid NOT NULL REFERENCES "modo_facil_generaciones_cobro"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "movimiento_id" text NOT NULL REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "movimiento_par_id" text NULL REFERENCES "movimientos_bancarios"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  "importe_movimiento_centimos" bigint NOT NULL CHECK ("importe_movimiento_centimos" <> 0),
  "metodo" text NOT NULL CHECK ("metodo" IN ('REMESA_VENCIMIENTO','REMESA_UNION','REMESA_RESIDUO','REF_FACTURA','REF_FACTURA_PARCIAL','COBRO_ISP','CLIENTE_IMPORTE','SUMA_CLIENTE','CONFIRMING_C9','TRASPASO_PROPIO','DEVOLUCION_RECIBO')),
  "nivel" text NOT NULL CHECK ("nivel" IN ('EXACTA','REVISAR')),
  "estado_propuesto" text NOT NULL CHECK ("estado_propuesto" IN ('JUSTIFICADO','NO_REQUIERE')),
  "motivo_no_requiere" text NULL CHECK ("motivo_no_requiere" IS NULL OR "motivo_no_requiere" IN ('TRASPASO_INTERNO_SIN_DOCUMENTO')),
  "lineas" jsonb NOT NULL CHECK (jsonb_typeof("lineas") = 'array' AND jsonb_array_length("lineas") <= 40),
  "composicion" jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof("composicion") = 'array'),
  "explicacion" text NOT NULL CHECK (length("explicacion") BETWEEN 3 AND 600),
  "fingerprint" text NOT NULL CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "modo_facil_propuestas_cobro_generacion_mov_uk" UNIQUE ("generacion_id", "movimiento_id"),
  CONSTRAINT "modo_facil_propuestas_cobro_no_requiere_ck" CHECK (("estado_propuesto" = 'NO_REQUIERE') = ("motivo_no_requiere" IS NOT NULL)),
  CONSTRAINT "modo_facil_propuestas_cobro_par_ck" CHECK (("metodo" = 'TRASPASO_PROPIO') = ("movimiento_par_id" IS NOT NULL)),
  CONSTRAINT "modo_facil_propuestas_cobro_par_distinto_ck" CHECK ("movimiento_par_id" IS NULL OR "movimiento_par_id" <> "movimiento_id"),
  CONSTRAINT "modo_facil_propuestas_cobro_lineas_ck" CHECK (("estado_propuesto" = 'NO_REQUIERE') = (jsonb_array_length("lineas") = 0))
);

CREATE INDEX "modo_facil_propuestas_cobro_cola_idx" ON "modo_facil_propuestas_cobro" ("generacion_id", "nivel", "importe_movimiento_centimos" DESC);
CREATE INDEX "modo_facil_propuestas_cobro_mov_idx" ON "modo_facil_propuestas_cobro" ("movimiento_id");
CREATE INDEX "modo_facil_propuestas_cobro_par_idx" ON "modo_facil_propuestas_cobro" ("movimiento_par_id");
CREATE INDEX "modo_facil_generaciones_cobro_creada_idx" ON "modo_facil_generaciones_cobro" ("creada_at" DESC, "id" DESC);

CREATE FUNCTION modo_facil_cobros_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'MODO_FACIL_COBROS_APPEND_ONLY' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER "modo_facil_generaciones_cobro_append_only_tr"
  BEFORE UPDATE OR DELETE ON "modo_facil_generaciones_cobro"
  FOR EACH ROW EXECUTE FUNCTION modo_facil_cobros_append_only();
CREATE TRIGGER "modo_facil_generaciones_cobro_no_truncate_tr"
  BEFORE TRUNCATE ON "modo_facil_generaciones_cobro"
  FOR EACH STATEMENT EXECUTE FUNCTION modo_facil_cobros_append_only();
CREATE TRIGGER "modo_facil_propuestas_cobro_append_only_tr"
  BEFORE UPDATE OR DELETE ON "modo_facil_propuestas_cobro"
  FOR EACH ROW EXECUTE FUNCTION modo_facil_cobros_append_only();
CREATE TRIGGER "modo_facil_propuestas_cobro_no_truncate_tr"
  BEFORE TRUNCATE ON "modo_facil_propuestas_cobro"
  FOR EACH STATEMENT EXECUTE FUNCTION modo_facil_cobros_append_only();
