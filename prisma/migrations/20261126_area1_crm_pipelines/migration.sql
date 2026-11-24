-- Área 1: pipelines de venta propios del panel (sustituyen a los de HubSpot de IO).
-- Tablas independientes de crm_*_hubspot: la sincronización de HubSpot borra y recrea aquellas.
-- Aditiva y re-ejecutable. Siembra idempotente (ON CONFLICT DO NOTHING): no pisa cambios hechos en el panel.
CREATE TABLE IF NOT EXISTS "area1_crm_pipelines" (
  "id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "producto" TEXT NOT NULL,
  "segmento_crm" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "hubspot_pipeline_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_crm_pipelines_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "area1_crm_pipeline_etapas" (
  "id" TEXT NOT NULL,
  "pipeline_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL,
  "probabilidad" INTEGER NOT NULL DEFAULT 0,
  "resultado" TEXT NOT NULL DEFAULT 'ABIERTA',
  "criterio" TEXT,
  "requiere_motivo" BOOLEAN NOT NULL DEFAULT false,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_crm_pipeline_etapas_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_crm_pipeline_etapas_resultado_check" CHECK ("resultado" IN ('ABIERTA', 'GANADA', 'PERDIDA')),
  CONSTRAINT "area1_crm_pipeline_etapas_probabilidad_check" CHECK ("probabilidad" BETWEEN 0 AND 100)
);
CREATE INDEX IF NOT EXISTS "area1_crm_pipeline_etapas_pipeline_orden_idx" ON "area1_crm_pipeline_etapas"("pipeline_id", "orden");
CREATE TABLE IF NOT EXISTS "area1_crm_negocios" (
  "id" TEXT NOT NULL,
  "pipeline_id" TEXT NOT NULL,
  "etapa_id" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "importe" DECIMAL(14,2),
  "contacto_id" TEXT,
  "empresa_id" TEXT,
  "propietario_id" INTEGER,
  "propietario_nombre" TEXT,
  "fecha_cierre_prevista" DATE,
  "resultado" TEXT NOT NULL DEFAULT 'ABIERTO',
  "motivo_perdida" TEXT,
  "cerrado_at" TIMESTAMP(3),
  "notas" TEXT,
  "origen" TEXT NOT NULL DEFAULT 'PANEL',
  "hubspot_deal_id" TEXT,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "creado_por" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_crm_negocios_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "area1_crm_negocios_resultado_check" CHECK ("resultado" IN ('ABIERTO', 'GANADO', 'PERDIDO'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "area1_crm_negocios_hubspot_deal_id_key" ON "area1_crm_negocios"("hubspot_deal_id");
CREATE INDEX IF NOT EXISTS "area1_crm_negocios_pipeline_etapa_idx" ON "area1_crm_negocios"("pipeline_id", "etapa_id", "activo");
CREATE INDEX IF NOT EXISTS "area1_crm_negocios_contacto_idx" ON "area1_crm_negocios"("contacto_id");
CREATE INDEX IF NOT EXISTS "area1_crm_negocios_empresa_idx" ON "area1_crm_negocios"("empresa_id");
CREATE TABLE IF NOT EXISTS "area1_crm_negocio_movimientos" (
  "id" TEXT NOT NULL,
  "negocio_id" TEXT NOT NULL,
  "etapa_desde_id" TEXT,
  "etapa_hasta_id" TEXT NOT NULL,
  "motivo" TEXT,
  "actor" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "area1_crm_negocio_movimientos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "area1_crm_negocio_movimientos_negocio_idx" ON "area1_crm_negocio_movimientos"("negocio_id", "created_at");
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_pipeline_etapas_pipeline_id_fkey') THEN
    ALTER TABLE "area1_crm_pipeline_etapas" ADD CONSTRAINT "area1_crm_pipeline_etapas_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "area1_crm_pipelines"("id") ON DELETE RESTRICT;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_negocios_pipeline_id_fkey') THEN
    ALTER TABLE "area1_crm_negocios" ADD CONSTRAINT "area1_crm_negocios_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "area1_crm_pipelines"("id") ON DELETE RESTRICT;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_negocios_etapa_id_fkey') THEN
    ALTER TABLE "area1_crm_negocios" ADD CONSTRAINT "area1_crm_negocios_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "area1_crm_pipeline_etapas"("id") ON DELETE RESTRICT;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_negocios_contacto_id_fkey') THEN
    ALTER TABLE "area1_crm_negocios" ADD CONSTRAINT "area1_crm_negocios_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "crm_registros_hubspot"("id") ON DELETE SET NULL;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_negocios_empresa_id_fkey') THEN
    ALTER TABLE "area1_crm_negocios" ADD CONSTRAINT "area1_crm_negocios_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "crm_empresas"("id") ON DELETE SET NULL;
  END IF;
END $area1$;
DO $area1$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'area1_crm_negocio_movimientos_negocio_id_fkey') THEN
    ALTER TABLE "area1_crm_negocio_movimientos" ADD CONSTRAINT "area1_crm_negocio_movimientos_negocio_id_fkey" FOREIGN KEY ("negocio_id") REFERENCES "area1_crm_negocios"("id") ON DELETE CASCADE;
  END IF;
END $area1$;
-- Siembra: 8 pipelines de IO (etapas leídas de HubSpot el 02/11/2026).
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-particulares','IO — Particulares','Particulares (conectividad y móvil)','PARTICULAR',1,ARRAY['3796663525']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-particulares:solicitud-recibida','io-particulares','Solicitud recibida',1,20,'ABIERTA',NULL,false),
  ('io-particulares:contacto-realizado','io-particulares','Contacto realizado',2,40,'ABIERTA',NULL,false),
  ('io-particulares:propuesta-aceptada','io-particulares','Propuesta aceptada',3,70,'ABIERTA',NULL,false),
  ('io-particulares:pendiente-documentacion','io-particulares','Pendiente documentación',4,85,'ABIERTA',NULL,false),
  ('io-particulares:alta-en-proceso','io-particulares','Alta en proceso',5,95,'ABIERTA',NULL,false),
  ('io-particulares:cerrado-ganado','io-particulares','Cerrado ganado',6,100,'GANADA','Alta tramitada y contrato activo en ISP Gestión.',false),
  ('io-particulares:cerrado-perdido','io-particulares','Cerrado perdido',7,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-comunicaciones-unificadas','IO — Comunicaciones Unificadas','Comunicaciones unificadas','EMPRESA',2,ARRAY['3796663526']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-comunicaciones-unificadas:consulta-recibida','io-comunicaciones-unificadas','Consulta recibida',1,10,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:contacto-realizado','io-comunicaciones-unificadas','Contacto realizado',2,20,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:necesidades-identificadas','io-comunicaciones-unificadas','Necesidades identificadas',3,30,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:propuesta-enviada','io-comunicaciones-unificadas','Propuesta enviada',4,50,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:negociacion','io-comunicaciones-unificadas','Negociación',5,70,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:pendiente-documentacion','io-comunicaciones-unificadas','Pendiente documentación',6,85,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:alta-en-proceso','io-comunicaciones-unificadas','Alta en proceso',7,95,'ABIERTA',NULL,false),
  ('io-comunicaciones-unificadas:cerrado-ganado','io-comunicaciones-unificadas','Cerrado ganado',8,100,'GANADA','Propuesta firmada por el cliente y alta completada: contrato activo en ISP Gestión.',false),
  ('io-comunicaciones-unificadas:cerrado-perdido','io-comunicaciones-unificadas','Cerrado perdido',9,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-conectividad-avanzada','IO — Conectividad Avanzada','Conectividad avanzada','EMPRESA',3,ARRAY['3796663527']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-conectividad-avanzada:consulta-recibida','io-conectividad-avanzada','Consulta recibida',1,10,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:contacto-realizado','io-conectividad-avanzada','Contacto realizado',2,20,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:necesidades-identificadas','io-conectividad-avanzada','Necesidades identificadas',3,30,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:propuesta-enviada','io-conectividad-avanzada','Propuesta enviada',4,50,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:negociacion','io-conectividad-avanzada','Negociación',5,70,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:pendiente-documentacion','io-conectividad-avanzada','Pendiente documentación',6,85,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:alta-en-proceso','io-conectividad-avanzada','Alta en proceso',7,95,'ABIERTA',NULL,false),
  ('io-conectividad-avanzada:cerrado-ganado','io-conectividad-avanzada','Cerrado ganado',8,100,'GANADA','Propuesta firmada por el cliente y alta completada: contrato activo en ISP Gestión.',false),
  ('io-conectividad-avanzada:cerrado-perdido','io-conectividad-avanzada','Cerrado perdido',9,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-soluciones-moviles','IO — Soluciones Móviles','Soluciones móviles','EMPRESA',4,ARRAY['3796653275']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-soluciones-moviles:consulta-recibida','io-soluciones-moviles','Consulta recibida',1,10,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:contacto-realizado','io-soluciones-moviles','Contacto realizado',2,20,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:necesidades-identificadas','io-soluciones-moviles','Necesidades identificadas',3,30,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:propuesta-enviada','io-soluciones-moviles','Propuesta enviada',4,50,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:negociacion','io-soluciones-moviles','Negociación',5,70,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:pendiente-documentacion','io-soluciones-moviles','Pendiente documentación',6,85,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:alta-en-proceso','io-soluciones-moviles','Alta en proceso',7,95,'ABIERTA',NULL,false),
  ('io-soluciones-moviles:cerrado-ganado','io-soluciones-moviles','Cerrado ganado',8,100,'GANADA','Propuesta firmada por el cliente y alta completada: contrato activo en ISP Gestión.',false),
  ('io-soluciones-moviles:cerrado-perdido','io-soluciones-moviles','Cerrado perdido',9,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-infraestructura-red','IO — Infraestructura de Red','Infraestructura de red','EMPRESA',5,ARRAY['3796653276']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-infraestructura-red:consulta-recibida','io-infraestructura-red','Consulta recibida',1,10,'ABIERTA',NULL,false),
  ('io-infraestructura-red:contacto-realizado','io-infraestructura-red','Contacto realizado',2,20,'ABIERTA',NULL,false),
  ('io-infraestructura-red:necesidades-identificadas','io-infraestructura-red','Necesidades identificadas',3,30,'ABIERTA',NULL,false),
  ('io-infraestructura-red:propuesta-enviada','io-infraestructura-red','Propuesta enviada',4,50,'ABIERTA',NULL,false),
  ('io-infraestructura-red:negociacion','io-infraestructura-red','Negociación',5,70,'ABIERTA',NULL,false),
  ('io-infraestructura-red:pendiente-documentacion','io-infraestructura-red','Pendiente documentación',6,85,'ABIERTA',NULL,false),
  ('io-infraestructura-red:alta-en-proceso','io-infraestructura-red','Alta en proceso',7,95,'ABIERTA',NULL,false),
  ('io-infraestructura-red:cerrado-ganado','io-infraestructura-red','Cerrado ganado',8,100,'GANADA','Propuesta firmada por el cliente y alta completada: contrato activo en ISP Gestión.',false),
  ('io-infraestructura-red:cerrado-perdido','io-infraestructura-red','Cerrado perdido',9,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-exagrid','IO — ExaGrid','ExaGrid (backup)','EMPRESA',6,ARRAY['3796653279']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-exagrid:consulta-recibida','io-exagrid','Consulta recibida',1,10,'ABIERTA',NULL,false),
  ('io-exagrid:contacto-realizado','io-exagrid','Contacto realizado',2,20,'ABIERTA',NULL,false),
  ('io-exagrid:necesidades-identificadas','io-exagrid','Necesidades identificadas',3,30,'ABIERTA',NULL,false),
  ('io-exagrid:propuesta-enviada','io-exagrid','Propuesta enviada',4,50,'ABIERTA',NULL,false),
  ('io-exagrid:negociacion','io-exagrid','Negociación',5,70,'ABIERTA',NULL,false),
  ('io-exagrid:pendiente-documentacion','io-exagrid','Pendiente documentación',6,85,'ABIERTA',NULL,false),
  ('io-exagrid:alta-en-proceso','io-exagrid','Alta en proceso',7,95,'ABIERTA',NULL,false),
  ('io-exagrid:cerrado-ganado','io-exagrid','Cerrado ganado',8,100,'GANADA','Propuesta firmada por el cliente y alta completada: contrato activo en ISP Gestión.',false),
  ('io-exagrid:cerrado-perdido','io-exagrid','Cerrado perdido',9,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-mantenimiento-it','IO — Mantenimiento IT','Mantenimiento IT','EMPRESA',7,ARRAY['3908790469','3796653277']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-mantenimiento-it:lead-nuevo','io-mantenimiento-it','Lead nuevo',1,10,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:propuesta-enviada','io-mantenimiento-it','Propuesta enviada',2,20,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:cuestionario-completado','io-mantenimiento-it','Cuestionario completado',3,30,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:oferta-precio-cerrado','io-mantenimiento-it','Oferta precio cerrado',4,50,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:propuesta-pre-aceptada','io-mantenimiento-it','Propuesta pre-aceptada',5,70,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:reunion-visita-agendada','io-mantenimiento-it','Reunión/visita agendada',6,80,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:contrato-firmado','io-mantenimiento-it','Contrato firmado',7,95,'ABIERTA',NULL,false),
  ('io-mantenimiento-it:ganado','io-mantenimiento-it','Ganado',8,100,'GANADA','Contrato firmado y servicio de mantenimiento iniciado.',false),
  ('io-mantenimiento-it:perdido','io-mantenimiento-it','Perdido',9,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipelines" ("id","nombre","producto","segmento_crm","orden","hubspot_pipeline_ids") VALUES ('io-migracion-web','IO — Migración Web','Migración web','EMPRESA',8,ARRAY['3908836560','3796653278']::TEXT[]) ON CONFLICT ("id") DO NOTHING;
INSERT INTO "area1_crm_pipeline_etapas" ("id","pipeline_id","nombre","orden","probabilidad","resultado","criterio","requiere_motivo") VALUES
  ('io-migracion-web:lead-nuevo','io-migracion-web','Lead nuevo',1,10,'ABIERTA',NULL,false),
  ('io-migracion-web:analisis-tecnico','io-migracion-web','Análisis técnico',2,20,'ABIERTA',NULL,false),
  ('io-migracion-web:propuesta-enviada','io-migracion-web','Propuesta enviada',3,30,'ABIERTA',NULL,false),
  ('io-migracion-web:presupuesto-aceptado','io-migracion-web','Presupuesto aceptado',4,60,'ABIERTA',NULL,false),
  ('io-migracion-web:migracion-en-curso','io-migracion-web','Migración en curso',5,80,'ABIERTA',NULL,false),
  ('io-migracion-web:verificacion-testing','io-migracion-web','Verificación/testing',6,90,'ABIERTA',NULL,false),
  ('io-migracion-web:completada','io-migracion-web','Completada',7,100,'GANADA','Migración verificada y entregada al cliente.',false),
  ('io-migracion-web:perdido','io-migracion-web','Perdido',8,0,'PERDIDA','Oportunidad descartada. Motivo obligatorio: precio, competencia, sin respuesta, no viable, desiste, duplicado u otro.',true)
ON CONFLICT ("id") DO NOTHING;
-- Reversión: revertir el código; las tablas pueden quedarse sin uso. No borrar negocios.
