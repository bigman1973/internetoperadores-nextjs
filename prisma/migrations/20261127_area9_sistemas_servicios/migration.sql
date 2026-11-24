-- Área 9 · Sistemas y servicios (solo superadmin): inventario de software, reglas de coste, pagos únicos, tasas USD/EUR e incidencias.
-- Aditiva y re-ejecutable. No toca ninguna tabla existente. Vuelta atrás en down.sql (solo borra estas tablas).
-- Sin contraseñas ni tokens: la API rechaza texto con apariencia de credencial y los tokens viven en variables de entorno.
CREATE TABLE IF NOT EXISTS area9_sis_servicios (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre TEXT NOT NULL CHECK (length(nombre) BETWEEN 1 AND 120),
  proveedor TEXT NOT NULL CHECK (length(proveedor) BETWEEN 1 AND 160),
  categoria TEXT NOT NULL CHECK (categoria IN ('web_infraestructura','base_datos','desarrollo_ia','marketing','ofimatica','crm','operaciones_isp')),
  descripcion TEXT CHECK (descripcion IS NULL OR length(descripcion) <= 1500),
  modulos TEXT[] NOT NULL DEFAULT '{}',
  entornos TEXT[] NOT NULL DEFAULT '{}',
  titular TEXT CHECK (titular IS NULL OR length(titular) <= 160),
  responsable TEXT CHECK (responsable IS NULL OR length(responsable) <= 160),
  plan TEXT CHECK (plan IS NULL OR length(plan) <= 200),
  estado TEXT NOT NULL DEFAULT 'por_confirmar' CHECK (estado IN ('activo','en_prueba','en_baja','por_confirmar')),
  fecha_alta DATE,
  fecha_renovacion DATE,
  periodicidad TEXT NOT NULL DEFAULT 'MENSUAL' CHECK (periodicidad IN ('MENSUAL','ANUAL','VARIABLE')),
  variables_esperadas TEXT[] NOT NULL DEFAULT '{}',
  url TEXT CHECK (url IS NULL OR length(url) <= 300),
  notas TEXT CHECK (notas IS NULL OR length(notas) <= 2000),
  estado_manual TEXT CHECK (estado_manual IS NULL OR length(estado_manual) <= 1000),
  estado_manual_at TIMESTAMP(3),
  prevision_2027_manual NUMERIC(12,2) CHECK (prevision_2027_manual IS NULL OR prevision_2027_manual >= 0),
  orden INTEGER NOT NULL DEFAULT 100,
  updated_by INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS area9_sis_reglas_coste (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  servicio_id TEXT NOT NULL REFERENCES area9_sis_servicios(id) ON DELETE RESTRICT,
  prioridad INTEGER NOT NULL DEFAULT 100 CHECK (prioridad BETWEEN 1 AND 1000),
  proveedor_regex TEXT CHECK (proveedor_regex IS NULL OR length(proveedor_regex) <= 200),
  concepto_regex TEXT CHECK (concepto_regex IS NULL OR length(concepto_regex) <= 200),
  banco_regex TEXT CHECK (banco_regex IS NULL OR length(banco_regex) <= 200),
  activa BOOLEAN NOT NULL DEFAULT true,
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (proveedor_regex IS NOT NULL OR banco_regex IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS area9_sis_reglas_servicio_idx ON area9_sis_reglas_coste (servicio_id);
CREATE TABLE IF NOT EXISTS area9_sis_costes_manuales (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  servicio_id TEXT NOT NULL REFERENCES area9_sis_servicios(id) ON DELETE RESTRICT,
  fecha DATE,
  concepto TEXT NOT NULL CHECK (length(concepto) BETWEEN 1 AND 300),
  importe NUMERIC(12,2) NOT NULL CHECK (importe >= 0),
  moneda CHAR(3) NOT NULL DEFAULT 'EUR' CHECK (moneda IN ('EUR','USD')),
  iva_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (iva_pct BETWEEN 0 AND 30),
  tipo TEXT NOT NULL CHECK (tipo IN ('RECURRENTE','UNICO')),
  estado TEXT NOT NULL DEFAULT 'REAL' CHECK (estado IN ('REAL','PREVISTO')),
  nota TEXT CHECK (nota IS NULL OR length(nota) <= 500),
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  anulado_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area9_sis_manuales_servicio_idx ON area9_sis_costes_manuales (servicio_id);
CREATE TABLE IF NOT EXISTS area9_sis_tasas (
  mes CHAR(7) PRIMARY KEY CHECK (mes ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  usd_eur NUMERIC(8,5) NOT NULL CHECK (usd_eur > 0 AND usd_eur < 5),
  fuente TEXT CHECK (fuente IS NULL OR length(fuente) <= 200),
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS area9_sis_incidencias (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  fecha_hora TIMESTAMP(3) NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('INCIDENCIA','DECISION')),
  titulo TEXT NOT NULL CHECK (length(titulo) BETWEEN 1 AND 200),
  detalle TEXT CHECK (detalle IS NULL OR length(detalle) <= 3000),
  servicio_id TEXT REFERENCES area9_sis_servicios(id) ON DELETE RESTRICT,
  autor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  autor_nombre TEXT CHECK (autor_nombre IS NULL OR length(autor_nombre) <= 160),
  anulada_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area9_sis_incidencias_fecha_idx ON area9_sis_incidencias (fecha_hora DESC);
CREATE TABLE IF NOT EXISTS area9_sis_auditoria (
  id BIGSERIAL PRIMARY KEY,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  actor_id INTEGER REFERENCES usuarios_admin(id) ON DELETE RESTRICT,
  detalle JSONB,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS area9_sis_auditoria_created_idx ON area9_sis_auditoria (created_at DESC);

-- Catálogo inicial. Solo datos que constan en el panel o en las decisiones de Víctor; titular, plan y fechas quedan vacíos para rellenar.
-- Estado «por_confirmar» salvo HubSpot (en baja, según Víctor). La pantalla enseña la última factura o cargo para ayudar a confirmarlo.
INSERT INTO area9_sis_servicios (slug, nombre, proveedor, categoria, descripcion, modulos, entornos, periodicidad, variables_esperadas, estado, orden, notas) VALUES
('vercel','Vercel','Vercel Inc.','web_infraestructura','Alojamiento y despliegue del panel de administración y de la web pública. Cada rama genera un preview; staging.internetoperadores.com recibe la rama staging.',ARRAY['Todo el panel','Web pública'],ARRAY['produccion','staging'],'MENSUAL',ARRAY['CRON_SECRET','NEXTAUTH_SECRET','NEXTAUTH_URL'],'por_confirmar',10,NULL),
('railway','Railway','Railway Corp.','base_datos','Base de datos PostgreSQL de producción y staging (hoy en el mismo servidor; separar staging está aplazado). Región US West.',ARRAY['Todo el panel','Finanzas','CRM','Rentabilidad','Subida de precios'],ARRAY['produccion','staging'],'MENSUAL',ARRAY['DATABASE_URL'],'por_confirmar',20,'Separar staging en un proyecto propio: aprobado el 24/11 y aplazado después.'),
('digitalocean','DigitalOcean','DigitalOcean LLC','web_infraestructura','Servidor pequeño previsto para dar una IP fija de salida a la API de ISP Gestión. EN PAUSA por decisión de Víctor: la opción preferida es una VM en infraestructura propia.',ARRAY['API de ISP Gestión'],ARRAY['produccion'],'MENSUAL',ARRAY[]::text[],'en_prueba',30,'En pausa desde el 24/11 a las 18:38. No hay droplet creado.'),
('github','GitHub','GitHub Inc.','web_infraestructura','Repositorio del panel (bigman1973/internetoperadores-nextjs), ramas por área y GitHub Actions: historial de desarrollos y bloqueo de publicación por turnos.',ARRAY['Historial de desarrollos','Publicación'],ARRAY['produccion','staging'],'MENSUAL',ARRAY[]::text[],'por_confirmar',40,NULL),
('dominios-dns','Dominios y DNS','Por confirmar (facturas de Nicalia y Nominalia)','web_infraestructura','Dominios de internetoperadores.com y registros DNS (web, panel, staging, futuro isp-proxy).',ARRAY['Web pública','Panel','Correo'],ARRAY['produccion','staging'],'ANUAL',ARRAY[]::text[],'por_confirmar',50,'Proveedor deducido de las facturas recibidas; confirmar con IT.'),
('isp-gestion','API de ISP Gestión','ISPGestión Provider S.L.','operaciones_isp','Facturación, contratos, remesas y clientes de IO. El panel la usa en solo lectura (importación diaria de facturas emitidas y contratos). Cuota mensual de la plataforma más la API avanzada.',ARRAY['Facturación','Conciliar','CRM · carga ISP','Rentabilidad','Subida de precios'],ARRAY['produccion','staging'],'MENSUAL',ARRAY['ISPGESTION_API_URL','ISPGESTION_API_USER','ISPGESTION_API_HASH','FINANCE_ISP_SYNC_ENABLED'],'por_confirmar',60,'ISP autoriza por IP: pendiente IP fija de salida.'),
('brevo','Brevo','Brevo (Sendinblue)','marketing','Envío de correo y listas del CRM. Sin BREVO_API_KEY el CRM funciona pero no sincroniza con Brevo.',ARRAY['CRM','Comunicados','Captación web'],ARRAY['produccion'],'MENSUAL',ARRAY['BREVO_API_KEY'],'por_confirmar',70,NULL),
('manus','Manus','Manus AI (Singapur)','desarrollo_ia','Agente de IA que desarrolla y revisa el panel. Se paga con tarjeta en USD.',ARRAY['Desarrollo del panel'],ARRAY['produccion','staging'],'VARIABLE',ARRAY[]::text[],'por_confirmar',80,NULL),
('anthropic','Claude (Anthropic)','Anthropic, PBC','desarrollo_ia','Claude para revisión, validación y coordinación del desarrollo (planes Team y uso adicional).',ARRAY['Desarrollo del panel'],ARRAY['produccion','staging'],'VARIABLE',ARRAY[]::text[],'por_confirmar',90,NULL),
('openai','OpenAI / ChatGPT','OpenAI','desarrollo_ia','Suscripciones de ChatGPT y uso de la API de OpenAI desde el panel.',ARRAY['Asistente IA'],ARRAY['produccion','staging'],'VARIABLE',ARRAY['OPENAI_API_KEY'],'por_confirmar',100,NULL),
('metricool','Metricool','Metricool Software, S.L.','marketing','Analítica web anónima y agregada de la web pública, sin cookies ni identificadores; encargado del tratamiento. No se carga en /admin.',ARRAY['Web pública'],ARRAY['produccion'],'MENSUAL',ARRAY[]::text[],'por_confirmar',110,NULL),
('microsoft-365','Microsoft 365','Microsoft (vía Telefónica Soluciones)','ofimatica','Correo, OneDrive y SharePoint (carpetas de facturas), inicio de sesión del panel con Microsoft. Las licencias se facturan a través de Telefónica Soluciones (Acens) y Microsoft Ibérica.',ARRAY['Inicio de sesión','Facturas recibidas (OneDrive)','Documentos'],ARRAY['produccion','staging'],'MENSUAL',ARRAY['AZURE_AD_CLIENT_ID','AZURE_AD_CLIENT_SECRET','AZURE_AD_TENANT_ID','MICROSOFT_GRAPH_CLIENT_ID','MICROSOFT_GRAPH_CLIENT_SECRET','MICROSOFT_GRAPH_TENANT_ID','SHAREPOINT_DRIVE_ID'],'por_confirmar',120,'Azure AD no se toca desde las tareas de desarrollo.'),
('google-workspace','Google Workspace','Google Ireland Ltd.','ofimatica','Correo y ofimática de Google para parte del equipo. Se paga por tarjeta y por Cloud 101.',ARRAY[]::text[],ARRAY['produccion'],'MENSUAL',ARRAY[]::text[],'por_confirmar',130,NULL),
('hubspot','HubSpot','HubSpot Ireland Ltd.','crm','CRM anterior. En baja: el CRM local del panel lo sustituye (sin HubSpot).',ARRAY['CRM (histórico)'],ARRAY['produccion'],'ANUAL',ARRAY['HUBSPOT_API_KEY'],'en_baja',140,'En baja según Víctor. Comprobar que no se renueva.'),
('acens','Acens (Telefónica Soluciones)','Telefónica Soluciones de Informática y Comunicaciones de España','web_infraestructura','Hosting y servicios gestionados de Acens. Sus facturas incluyen también Microsoft 365 y Panda AntiRansomware.',ARRAY['Hosting'],ARRAY['produccion'],'MENSUAL',ARRAY[]::text[],'por_confirmar',150,'Las líneas de Microsoft 365 se asignan al servicio Microsoft 365.'),
('cloud-101','Cloud 101','Cloud 101, S.L.','web_infraestructura','Mayorista cloud. Su coste entra en el producto Cloud 101 de Rentabilidad.',ARRAY['Rentabilidad'],ARRAY['produccion'],'MENSUAL',ARRAY[]::text[],'por_confirmar',160,NULL),
('supabase','Supabase','Supabase Inc.','base_datos','Hay una tarea programada que lo mantiene activo (keep-supabase-alive). Confirmar si sigue en uso.',ARRAY['Tarea programada keep-supabase-alive'],ARRAY['produccion'],'MENSUAL',ARRAY[]::text[],'por_confirmar',170,'Posible servicio en desuso.')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO area9_sis_reglas_coste (servicio_id, prioridad, proveedor_regex, concepto_regex, banco_regex, nota)
SELECT s.id, r.prioridad, r.prov, r.concepto, r.banco, r.nota FROM (VALUES
 ('vercel',100,'vercel',NULL,'vercel',NULL),
 ('railway',100,'railway',NULL,'railway',NULL),
 ('digitalocean',100,'digital ?ocean',NULL,'digital ?ocean',NULL),
 ('github',100,'github',NULL,'github',NULL),
 ('dominios-dns',100,'nicalia|nominalia|dominio',NULL,'nicalia|nominalia|dominio','Revisar si hay otros registradores.'),
 ('isp-gestion',100,'ispgesti',NULL,'ispgesti','Cuota mensual y gastos de devolución.'),
 ('brevo',100,'brevo|sendinblue',NULL,'brevo|sendinblue',NULL),
 ('manus',100,'manus',NULL,'manus ai','Solo hay cargos de tarjeta en USD, sin factura.'),
 ('anthropic',100,'anthropic',NULL,'anthropic|claude',NULL),
 ('openai',100,'openai',NULL,'openai',NULL),
 ('metricool',100,'metricool',NULL,'metricool',NULL),
 ('microsoft-365',10,'microsoft',NULL,'microsoft',NULL),
 ('microsoft-365',20,'telefonica soluciones','microsoft|office 365|productividad|365','microsoft','Licencias de Microsoft 365 facturadas por Telefónica Soluciones.'),
 ('google-workspace',100,'google','workspace|google','google ?\*? ?workspace|google workspace',NULL),
 ('hubspot',100,'hubspot',NULL,'hubspot',NULL),
 ('acens',50,'telefonica soluciones',NULL,'acens','Resto de facturas de Telefónica Soluciones (incluye Panda).'),
 ('cloud-101',100,'cloud ?101',NULL,'cloud ?101',NULL),
 ('supabase',100,'supabase',NULL,'supabase',NULL)
) AS r(slug, prioridad, prov, concepto, banco, nota)
JOIN area9_sis_servicios s ON s.slug = r.slug
WHERE NOT EXISTS (SELECT 1 FROM area9_sis_reglas_coste x WHERE x.servicio_id = s.id AND x.prioridad = r.prioridad AND x.proveedor_regex IS NOT DISTINCT FROM r.prov);

-- Pago único de la API avanzada de ISP: 600 € + IVA. Sin fecha ni cargo todavía (no hay factura ni movimiento en el panel): queda como PREVISTO.
INSERT INTO area9_sis_costes_manuales (id, servicio_id, fecha, concepto, importe, moneda, iva_pct, tipo, estado, nota)
SELECT 'area9-seed-isp-api-600', s.id, NULL, 'Alta de la API avanzada de ISP Gestión (pago único)', 600, 'EUR', 21, 'UNICO', 'PREVISTO', 'Importe indicado por Víctor: 600 € + IVA. Sin factura ni cargo en el panel; poner la fecha cuando se pague.'
FROM area9_sis_servicios s WHERE s.slug = 'isp-gestion'
ON CONFLICT (id) DO NOTHING;

INSERT INTO area9_sis_incidencias (id, fecha_hora, tipo, titulo, detalle, servicio_id, autor_nombre)
SELECT v.id, v.fh::timestamp, v.tipo, v.titulo, v.detalle, (SELECT id FROM area9_sis_servicios WHERE slug = v.slug), 'Víctor Giró'
FROM (VALUES
 ('area9-seed-20261124-caida-bd','2026-11-24 10:20','INCIDENCIA','Caída de la base de datos (10:20 a 10:35)','Staging no dejaba entrar («Can''t reach database server») y producción devolvía 500 en facturación. Staging y producción comparten servidor Postgres en Railway. Producción volvió a responder a las 10:38. Revisión del incidente en Railway pendiente.','railway'),
 ('area9-seed-20261124-railway-staging','2026-11-24 18:14','DECISION','Aprobado un proyecto Railway exclusivo para staging','Región us-west2, unos 20 USD al mes, copia saneada, sin ISP, correos, Microsoft, Azure ni pagos reales, y conservación reversible 7 días. Producción no se toca.','railway'),
 ('area9-seed-20261124-vps','2026-11-24 18:14','DECISION','Aprobado un VPS de DigitalOcean para la IP fija de ISP','Unos 5,70 € al mes, proxy de salida solo hacia internetoperadores.ispgestion.com.','digitalocean'),
 ('area9-seed-20261124-do-pausa','2026-11-24 18:38','DECISION','DigitalOcean en pausa; se prefiere una VM en infraestructura propia','IO tiene direccionamiento RIPE y red propia. Alternativa: VM detrás de una IP ya autorizada en ISP (oficina o VPN). Documento para Esteve preparado.','digitalocean'),
 ('area9-seed-20261124-railway-aplazado','2026-11-24 18:59','DECISION','Separación de bases de datos aplazada','Víctor aplaza la ejecución del plan de Railway; se retoma más adelante.','railway')
) AS v(id, fh, tipo, titulo, detalle, slug)
ON CONFLICT (id) DO NOTHING;
