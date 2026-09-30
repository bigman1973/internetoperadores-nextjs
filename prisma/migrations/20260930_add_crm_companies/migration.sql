-- CreateTable
CREATE TABLE "crm_empresas" (
    "id" TEXT NOT NULL,
    "hubspot_id" TEXT,
    "nombre" TEXT NOT NULL,
    "nombre_comercial" TEXT,
    "nif" TEXT,
    "nif_normalizado" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'SOCIEDAD',
    "segmento_crm" "SegmentoCrm" NOT NULL DEFAULT 'EMPRESA',
    "dominio" TEXT,
    "web" TEXT,
    "telefono" TEXT,
    "email" TEXT,
    "sector" TEXT,
    "direccion" TEXT,
    "codigo_postal" TEXT,
    "localidad" TEXT,
    "provincia" TEXT,
    "pais" TEXT DEFAULT 'ES',
    "descripcion" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'LOCAL',
    "propiedades_hubspot" JSONB,
    "sincronizado_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "actualizado_por" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_empresas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_empresa_contactos" (
    "empresa_id" TEXT NOT NULL,
    "contacto_id" TEXT NOT NULL,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "papel" TEXT,
    "origen" TEXT NOT NULL DEFAULT 'LOCAL',
    "etiquetas" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_empresa_contactos_pkey" PRIMARY KEY ("empresa_id","contacto_id")
);

-- CreateTable
CREATE TABLE "crm_empresa_clientes" (
    "empresa_id" TEXT NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "origen" TEXT NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_empresa_clientes_pkey" PRIMARY KEY ("empresa_id","cliente_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "crm_empresas_hubspot_id_key" ON "crm_empresas"("hubspot_id");

-- CreateIndex
CREATE INDEX "crm_empresas_nombre_idx" ON "crm_empresas"("nombre");

-- CreateIndex
CREATE INDEX "crm_empresas_nif_normalizado_idx" ON "crm_empresas"("nif_normalizado");

-- CreateIndex
CREATE INDEX "crm_empresas_dominio_idx" ON "crm_empresas"("dominio");

-- CreateIndex
CREATE INDEX "crm_empresas_segmento_crm_activo_idx" ON "crm_empresas"("segmento_crm", "activo");

-- CreateIndex
CREATE INDEX "crm_empresa_contactos_contacto_id_activo_principal_idx" ON "crm_empresa_contactos"("contacto_id", "activo", "principal");

-- CreateIndex
CREATE UNIQUE INDEX "crm_empresa_clientes_cliente_id_key" ON "crm_empresa_clientes"("cliente_id");

-- AddForeignKey
ALTER TABLE "crm_empresa_contactos" ADD CONSTRAINT "crm_empresa_contactos_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "crm_empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_empresa_contactos" ADD CONSTRAINT "crm_empresa_contactos_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_empresa_clientes" ADD CONSTRAINT "crm_empresa_clientes_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "crm_empresas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_empresa_clientes" ADD CONSTRAINT "crm_empresa_clientes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes_web"("id") ON DELETE CASCADE ON UPDATE CASCADE;
