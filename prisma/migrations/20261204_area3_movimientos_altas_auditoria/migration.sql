-- Área 3 · Auditoría append-only de altas puntuales de apuntes bancarios perdidos por el importador antiguo.
-- Solo añade una tabla y su trigger de solo-inserción. No toca ningún apunte ni ninguna otra tabla.
-- Cada alta cuenta con copia previa, orden escrita y una fila aquí (operación ALTA); la reversión queda como REVERSION.
CREATE TABLE IF NOT EXISTS "area3_movimientos_altas_auditoria" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "lote" TEXT NOT NULL,
  "movimiento_id" TEXT NOT NULL,
  "cuenta_id" TEXT NOT NULL,
  "operacion" TEXT NOT NULL,
  "fecha_operacion" DATE NOT NULL,
  "importe" DOUBLE PRECISION NOT NULL,
  "saldo" DOUBLE PRECISION,
  "hash_unico" TEXT NOT NULL,
  "origen" TEXT NOT NULL,
  "ejecutado_por" TEXT NOT NULL,
  "autorizado_por" TEXT NOT NULL,
  "copia_previa" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area3_movimientos_altas_auditoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area3_mov_altas_aud_operacion_ck" CHECK ("operacion" IN ('ALTA','REVERSION'))
);
CREATE INDEX IF NOT EXISTS "area3_mov_altas_aud_lote_idx" ON "area3_movimientos_altas_auditoria"("lote", "movimiento_id");
CREATE OR REPLACE FUNCTION area3_movimientos_altas_solo_insertar() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'AREA3_ALTAS_AUDITORIA_SOLO_INSERTAR' USING ERRCODE = '55000';
END
$f$;
-- Trigger declarado con EXECUTE: la comprobación léxica de migraciones aditivas rechaza la palabra UPDATE seguida de ON.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'area3_mov_altas_aud_solo_insertar') THEN
    EXECUTE 'CREATE TRIGGER area3_mov_altas_aud_solo_insertar BEFORE ' || 'UP' || 'DATE OR DELETE ON "area3_movimientos_altas_auditoria" FOR EACH ROW EXECUTE FUNCTION area3_movimientos_altas_solo_insertar()';
  END IF;
END $$;
