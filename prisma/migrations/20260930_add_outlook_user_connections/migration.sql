-- Conexión OAuth delegada por usuario para crear reuniones en su propia agenda de Outlook.
-- Solo se almacena el refresh token cifrado; la relación se elimina al borrar el usuario.
CREATE TABLE IF NOT EXISTS "outlook_conexiones" (
    "id" TEXT NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "microsoft_object_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "refresh_token_cifrado" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "conectado_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_uso_at" TIMESTAMP(3),
    "ultimo_error" TEXT,
    "revocado_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "outlook_conexiones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "outlook_conexiones_usuario_id_key" ON "outlook_conexiones"("usuario_id");
CREATE INDEX IF NOT EXISTS "outlook_conexiones_email_idx" ON "outlook_conexiones"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "outlook_conexiones_tenant_id_microsoft_object_id_key" ON "outlook_conexiones"("tenant_id", "microsoft_object_id");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'outlook_conexiones_usuario_id_fkey'
    ) THEN
        ALTER TABLE "outlook_conexiones"
        ADD CONSTRAINT "outlook_conexiones_usuario_id_fkey"
        FOREIGN KEY ("usuario_id") REFERENCES "usuarios_admin"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
