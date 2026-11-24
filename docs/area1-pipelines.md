# Área 1 · Pipelines de venta de IO en el CRM del panel

Objetivo 1 del encargo «dejar HubSpot listo para la baja» (24/11/2026).

## Qué hay
- Migración `prisma/migrations/20261126_area1_crm_pipelines/migration.sql` (aditiva, re-ejecutable): tablas
  `area1_crm_pipelines`, `area1_crm_pipeline_etapas`, `area1_crm_negocios` y `area1_crm_negocio_movimientos`
  (auditoría de cada cambio de etapa), más la siembra de los 8 pipelines y sus 69 etapas (`ON CONFLICT DO NOTHING`).
- Tablas independientes de `crm_*_hubspot`, porque la sincronización completa de HubSpot (`lib/hubspot-listas.ts`) borra y recrea esas tablas.
- Página `/admin/crm/pipelines` (pestaña por pipeline, Kanban con arrastrar y soltar y selector, alta de negocio vinculada a empresa o contacto, previsión ponderada). Enlace desde `/admin/crm`.
- APIs bajo `/api/admin/crm/pipelines` (permiso `admin.crm.empresas`; escribir requiere escritura).
- Reglas puras en `lib/crm-pipelines-core.ts`; batería `pnpm exec tsx scripts/test-area1-pipelines.ts`.

## Los 8 pipelines (interpretación a confirmar por Víctor)
| Pipeline panel | Etapas | IDs HubSpot |
|---|---|---|
| Particulares | propias (Solicitud recibida 20 % … Alta en proceso 95 %) | 3796663525 |
| Comunicaciones Unificadas, Conectividad Avanzada, Soluciones Móviles, Infraestructura de Red, ExaGrid | plantilla (Consulta recibida 10 % … Alta en proceso 95 %) | 3796663526, 3796663527, 3796653275, 3796653276, 3796653279 |
| Mantenimiento IT | las de «IO-mantenimiento IT» (Lead nuevo 10 % … Contrato firmado 95 %) | 3908790469 + plantilla 3796653277 |
| Migración Web | las de «IO-MIGRACION WEB» (Lead nuevo 10 % … Verificación/testing 90 %, Completada) | 3908836560 + plantilla 3796653278 |

Criterios: cada pipeline termina en una etapa GANADA (100 %, cierra con fecha) y una PERDIDA (0 %, motivo obligatorio:
Precio, Competencia, Sin respuesta, No viable técnicamente, Cliente desiste, Duplicado u Otro con detalle). Reabrir limpia cierre y motivo.

## Negocios que migrar desde HubSpot
Ninguno: los 10 pipelines IO de HubSpot tienen 0 negocios. Los 45 del «Sales Pipeline» y los de LFDeal/FPlanet no son de IO.
La columna `hubspot_deal_id` (única) queda preparada por si Víctor decide traer alguno.

## Aplicación (integradora)
`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/migrations/20261126_area1_crm_pipelines/migration.sql` (o `prisma migrate deploy`).
Comprobación: `select count(*) from area1_crm_pipelines` = 8 y `select count(*) from area1_crm_pipeline_etapas` = 69.
Vuelta atrás: revertir el commit; las tablas pueden quedarse sin uso (no se borran).
