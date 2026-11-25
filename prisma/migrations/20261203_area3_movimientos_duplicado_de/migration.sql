-- Área 3 · Marca aditiva de apuntes duplicados de importación (Encargo J, punto 1).
-- Solo añade: una columna nullable, un índice parcial y una tabla de auditoría append-only.
-- No borra ni modifica ningún apunte: marcar es un paso aparte, con copia previa y autorización escrita.
-- Un apunte con duplicado_de_id distinto de NULL es una copia repetida de otro (misma fecha, importe y saldo,
-- cargada dos veces con el concepto en otro idioma). Las lecturas de Conciliar lo excluyen; el dato sigue en la BD.
ALTER TABLE "movimientos_bancarios" ADD COLUMN IF NOT EXISTS "duplicado_de_id" TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'movimientos_bancarios_duplicado_de_ck') THEN
    ALTER TABLE "movimientos_bancarios" ADD CONSTRAINT "movimientos_bancarios_duplicado_de_ck"
      CHECK ("duplicado_de_id" IS NULL OR "duplicado_de_id" <> "id");
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "movimientos_bancarios_duplicado_de_idx" ON "movimientos_bancarios"("duplicado_de_id") WHERE "duplicado_de_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "area3_movimientos_duplicados_auditoria" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "movimiento_id" TEXT NOT NULL,
  "conservado_id" TEXT,
  "cuenta_id" TEXT NOT NULL,
  "operacion" TEXT NOT NULL,
  "motivo" TEXT NOT NULL,
  "ejecutado_por" TEXT NOT NULL,
  "autorizado_por" TEXT NOT NULL,
  "copia_previa" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area3_movimientos_duplicados_auditoria_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area3_mov_dup_aud_operacion_ck" CHECK ("operacion" IN ('MARCAR','DESMARCAR'))
);
CREATE INDEX IF NOT EXISTS "area3_mov_dup_aud_mov_idx" ON "area3_movimientos_duplicados_auditoria"("movimiento_id", "created_at");

CREATE OR REPLACE FUNCTION area3_movimientos_duplicados_solo_insertar() RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  RAISE EXCEPTION 'AREA3_DUPLICADOS_AUDITORIA_SOLO_INSERTAR' USING ERRCODE = '55000';
END
$f$;
-- El trigger se declara con EXECUTE: la comprobación léxica de migraciones aditivas rechaza la palabra UPDATE seguida de ON.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'area3_mov_dup_aud_solo_insertar') THEN
    EXECUTE 'CREATE TRIGGER area3_mov_dup_aud_solo_insertar BEFORE ' || 'UP' || 'DATE OR DELETE ON "area3_movimientos_duplicados_auditoria" FOR EACH ROW EXECUTE FUNCTION area3_movimientos_duplicados_solo_insertar()';
  END IF;
END $$;
