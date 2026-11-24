-- Área 8: aditiva. No cambia estados ni usuarios históricos, no envía avisos.
ALTER TABLE "peticiones_internas" ADD COLUMN "area8_pagina_url" TEXT;
ALTER TABLE "peticiones_internas" ADD COLUMN "area8_urgencia" TEXT NOT NULL DEFAULT 'media';
ALTER TABLE "peticiones_internas" ADD COLUMN "area8_responsable_id" INTEGER;
ALTER TABLE "peticiones_internas" ADD COLUMN "area8_tramitada_at" TIMESTAMP(3);
ALTER TABLE "peticiones_internas" ADD CONSTRAINT "area8_responsable_fk" FOREIGN KEY ("area8_responsable_id") REFERENCES "usuarios_admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "area8_peticiones_responsable_idx" ON "peticiones_internas"("area8_responsable_id");
CREATE TABLE "area8_peticion_eventos" (
  "id" TEXT PRIMARY KEY,
  "peticion_id" INTEGER NOT NULL,
  "usuario_email" TEXT NOT NULL,
  "actor_id" INTEGER NOT NULL,
  "estado_anterior" TEXT NOT NULL,
  "estado_nuevo" TEXT NOT NULL,
  "mensaje" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leido_at" TIMESTAMP(3),
  CONSTRAINT "area8_evento_peticion_fk" FOREIGN KEY ("peticion_id") REFERENCES "peticiones_internas"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "area8_eventos_peticion_fecha_idx" ON "area8_peticion_eventos"("peticion_id", "created_at");
CREATE INDEX "area8_eventos_usuario_fecha_idx" ON "area8_peticion_eventos"("usuario_email", "created_at");
