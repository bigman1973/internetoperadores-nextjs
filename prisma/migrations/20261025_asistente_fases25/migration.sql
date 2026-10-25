-- Fases 2–5 de Asistente: sólo tablas nuevas. No altera datos o tablas existentes.
CREATE TABLE "asistente_contactos_seguros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "referencia_tipo" TEXT NOT NULL CHECK ("referencia_tipo" IN ('LEAD', 'ESCALADO')),
    "referencia_id" UUID NOT NULL,
    "conversacion_id" UUID,
    "cifrado" TEXT NOT NULL,
    "key_version" TEXT NOT NULL,
    "borrar_despues" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asistente_contactos_seguros_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asistente_contactos_seguros_referencia_tipo_referencia_id_key" UNIQUE ("referencia_tipo", "referencia_id"),
    CONSTRAINT "asistente_contactos_seguros_conversacion_id_fkey"
      FOREIGN KEY ("conversacion_id") REFERENCES "asistente_conversaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "asistente_contactos_seguros_borrar_despues_idx"
  ON "asistente_contactos_seguros"("borrar_despues");

CREATE TABLE "asistente_gestion_privacidad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" TEXT NOT NULL CHECK ("tipo" IN ('PURGA', 'SUPRESION', 'REVOCACION')),
    "objetivo_hash" TEXT NOT NULL,
    "actor_id" INTEGER,
    "ejecutor" TEXT NOT NULL,
    "resultado" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asistente_gestion_privacidad_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asistente_gestion_privacidad_created_at_idx"
  ON "asistente_gestion_privacidad"("created_at");
