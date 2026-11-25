# Área 4 · Importaciones CRM autorizadas solo en staging

Autorización directa de Claude del 25/11/2026, 02:34:24 CET, tras reevaluación limpia de `ea1c828f556237c3e21161ef8ae1b009f0595c4f`. Esta entrega abre únicamente los dos POST indicados más abajo en el staging aislado. No ejecuta cargas ni activa flags. Claude hará **Simular** antes de que Víctor aplique. La única tarea que integra en staging es «WEB INTERNET OPERADORES»; producción no se publica desde Área 4.

## Integración conjunta y dependencias

El registro único REAL de `239590c39d912b27675fedb490b8f07660c971c1` es un requisito de esta excepción: contiene los descriptores históricos congelados y los helpers surface-aware usados aquí. No aplicar el commit pequeño de excepción sobre el registro antiguo. La rama `area4-usuarios-permisos` integra `423040f4f5d0cdb3e5f2ca477e9de41e94f04d52` y `ea1c828f556237c3e21161ef8ae1b009f0595c4f`, conservando los dos tipos comunes de recibo, y se actualiza al staging `81f1a0c37218b2fcd1d923bdf0e5f03d06d574de`. El kit io-ui se toma íntegro de ese staging, sin ediciones propias.

## Entorno e identidad

La excepción exige configuración de servidor: `FINANCE_STAGING_SANDBOX=1`, `VERCEL_ENV=preview`, `VERCEL_GIT_COMMIT_REF=staging`, y una `DATABASE_URL` PostgreSQL con usuario y base `io_staging_finanzas`, validados mediante `financeEnvironment` existente. Ningún cuerpo, query o cabecera puede elegir ese entorno. La propia preview de rama Área 4 no permite aplicar importaciones.

`FINANCE_DEPLOYMENT_READ_ONLY=1` **o** `IO_PRODUCTION_READ_ONLY=1` cierran la excepción. Los bloqueos externos, financieros y de vínculos automáticos se conservan; los dos importadores son operaciones manuales que no envían comunicaciones ni hacen escrituras a HubSpot/Brevo. Sus lecturas nativas a proveedores siguen perteneciendo al Área 1. No se amplía la lista de sincronizaciones ni se abre M365, `/isp/vinculos` o rutas vecinas.

Antes de leer el cuerpo, middleware revalida la sesión administrativa, el ID, la fila activa, el rol principal `SUPER_ADMIN` y la identidad propietaria canónica configurada. Un rol secundario, otro Superadmin, JWT antiguo, cuenta inactiva o actor enviado por el cliente no autorizan. Cualquier claim de actuación presente se rechaza. Los handlers vuelven a comprobar el propietario real antes del negocio y firman el recibo con su ID vivo.

Además, ambos POST exigen `Origin` HTTPS idéntico al origen de `request.url`, usando `strictSameOrigin` existente; `Sec-Fetch-Site`, si está presente, debe ser exactamente `same-origin`. Se rechazan origen ausente, `null`, otro host aunque sea same-site y peticiones cross-site antes de decodificar. No se crean cookies ni un nuevo flujo de autenticación. Los fetch de las pantallas existentes envían automáticamente el Origin del navegador.

## Contratos físicos y capacidades

| Pantalla / API | Contrato cerrado | Capacidad |
|---|---|---|
| `/admin/crm/isp` → `POST /api/admin/crm/isp/importar` | Multipart, un solo `fichero` `.xlsx`, hasta 4 MiB; total hasta 4 MiB + 64 KiB. `modo=simular` o modo ausente; `consultarBrevo` opcional `1`/`0`. Sin campos de aplicación. | V; sin intento de confirmación ni escrituras de negocio. |
| Mismo POST ISP, **Aplicar** | `modo=aplicar`, `confirmacion=APLICAR`, `hashEsperado` SHA256 lowerhex de 64 caracteres; campos desconocidos o duplicados se rechazan. El handler verifica que el hash coincide realmente con los bytes del XLSX previamente simulado. | V/E/C; propietario real exclusivamente. |
| `/admin/crm/hubspot-historial` → `POST /api/admin/crm/hubspot/historial` | JSON único literal `{"confirmar":true}`, permitiendo solo whitespace JSON. Máximo 16 KiB de bytes reales. No extras, coerciones, claves duplicadas ni hash inventado. | V/E/C; propietario real exclusivamente. |

Los límites se aplican leyendo un clone acotado y no consumiendo el original del handler. Se comprueban bytes reales también sin Content-Length; una cancelación de tee no se espera mientras el original está intacto. Middleware no interpreta XLSX ni certifica su contenido. GET/HEAD/OPTIONS no son importaciones autorizadas; conservan sus guardias y semántica nativas. Métodos de escritura distintos de POST y variantes de ruta no heredan la excepción.

Los contratos viven en las dos entradas de `lib/area4/section-registry.ts`: `stagingImport`, límite físico, `requiredActions.POST=['C']` y, solo en ISP, `readOnlyReview='isp-closed-simulation'`. El clasificador reduce a V únicamente el comando mínimo validado `{modo:'simular'}` en esa superficie. No se añaden heurísticas globales basadas en booleanos o etiquetas.

## Registry y auditoría

La evidencia histórica sigue siendo **439 descriptores y 79 identidades literales**, con los SHA256 originales intactos. De las 441 superficies físicas actuales, 437 conservan el contrato baseline; los dos contratos de importación cambiados quedan **pendientes**, junto a los dos M365 nuevos: cuatro superficies pendientes en tres apartados. No se rebaselina, asigna, consiente ni adopta automáticamente ninguna cuenta. Incluso un consentimiento futuro no sustituye la restricción de estos POST a propietario real en staging.

Para Aplicar e Importar, el límite común registra `CONFIRMACION_SOLICITADA` con `fase=ANTES_DEL_HANDLER`, `resultado=INTENTO`, propietario vivo como actor, `areaCodigo=admin.crm`, objetivo administrativo nulo y sin payload, archivo, hash ni datos personales. Si ese INSERT falla, se devuelve 503 antes del negocio. **No es un recibo de importación completada**. Simular no emite ese intento.

El resultado fiel lo emiten los importadores del Área 1 mediante `CRM_IMPORTACION_ISP` y `CRM_IMPORTACION_HUBSPOT`: EXITO, DUPLICADO, ERROR o PARCIAL; hash/journal, conteos confirmados por objeto y duración, sin nombres, emails, CIF ni errores crudos. ISP escribe éxito/duplicado dentro de su transacción; rollback y recibo ERROR aparte con cero confirmados si falla. HubSpot cuenta solo lotes confirmados; un fallo del journal no impide intentar el recibo y conserva la causa inicial. No se añaden migraciones.

## Evidencia y límites

La batería focal ejecuta el middleware completo y los helpers reales con `NextRequest`/`NextResponse`, sesión y BD sintéticas; comprueba entorno, propietario, actuación, origen, confirmaciones duplicadas, contratos, capacidades, auditoría, readonly, externos, vecinos, límites y cuerpo original intacto. Se ejecuta mediante `pnpm test:area4:registry` junto al baseline locked, asignaciones y UI de seis roles. No ejecuta handlers ni importaciones, SQL, correo, Graph o Azure y no acredita aceptación HTTP o render autenticado.

La reevaluación de Área 1 ejecutó diez casos nativos de wiring con BD en memoria y red bloqueada; no acredita rollback de PostgreSQL real. El build debe pasar sobre el SHA exacto antes del push explícito de la rama propia. READY solo se afirma cuando lo confirma Vercel para ese SHA. La integradora recibe aparte los resultados exactos, el estado del preview y el historial preparado, sin insertar registros en la BD compartida desde esta tarea.
