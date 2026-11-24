# Área 9 — entrega local, 24/11/2026

## Estado real

**Preparado y probado sin BD; no validado en staging ni producción.** La tarea principal incorporó los tres modelos y la inversa a `prisma/schema.prisma` y generó Prisma. Este subtrabajo no modificó ese archivo. La migración `20261124_area9_historial_publicaciones` sigue siendo SQL preparado: no se ha aplicado ni consultado ninguna BD. No se han ejecutado Git, browser, emails, sincronizaciones ni conexiones productivas. No se modificaron `update-historial.js`, sus workflows ni `areas-publication-gate.yml`.

No hay un hook automático activado. La entrega incluye un capturador offline y una rama de registro **opcional y exclusiva de staging aislado existente**, que no se ha ejecutado. El capturador no es evidencia de que haya ocurrido un despliegue.

### Bloqueo de contrato real de publicación

La tarea principal sí conoce el repositorio autorizado `bigman1973/internetoperadores-nextjs` y revisó en solo lectura diez deployments recientes: todos Preview, no productivos. Revisó también el estado success de uno y el formato de un registro Vercel READY con target production del proyecto autorizado. Se conserva el capturador desactivado: falta el verificador autenticado de recibos y la autorización para conectar automatización. Estos metadatos no son una orden de publicación ni acreditan que esta rama esté publicada.

La respuesta real de Vercel contiene `project.id`, `target`, `readyState`, `ready` y `meta.githubCommitSha`; el capturador admite esa forma y la normalizada `projectId`, rechazando discrepancias. No se cambia `verifiedDeploymentContract` a true en ningún contrato real. Inspección solo de metadatos; sin HTTP productivo ni DML.

Comprobar SHA completo, entorno exacto, `production_environment`, `transient_environment`, estado exitoso y URL. Los últimos diez pueden no incluir producción; su ausencia no demuestra que nunca haya habido producción. Para Vercel, verificar por lectura autenticada proyecto, `target`, SHA y el instante real de `READY`. Una preview no se reclasifica por rama, alias ni flag. No activar automatización productiva al realizar esta inspección.

## Archivos y esquema

El ámbito modificado es la página, cliente y dos rutas de historial, nuevos `lib/area9/*`, `scripts/area9-*`, SQL Área9 y documentos de resultado. No se han editado permisos comunes, empleados, menú ni cabecera.

El fragmento `docs/area9-schema-fragment.prisma` es **referencia ya incorporada, no debe añadirse de nuevo**. Modelos: `Area9Publicacion` → `area9_pub_publicaciones`, `Area9PublicacionPeticion` → `area9_pub_peticiones`, `Area9Migracion` → `area9_hist_migraciones`. Inversa ya incorporada: `PeticionInterna.publicacionesArea9 Area9PublicacionPeticion[]`. Las nuevas tablas son aditivas, sin `area9_sis_`; no reescriben desarrollos ni peticiones. FK de vínculos y migraciones usa RESTRICT. SHA de publicación exige 40 hex minúsculas, entorno staging/produccion y checksum SHA-256. `deploymentKey` único da idempotencia por despliegue, no por push o commit.

## API exacta

Todas las respuestas de historial usan `Cache-Control: private, no-store`. Autorización local: lectura con `requireArea8Auth({ management: true, area: 'admin.historial' })`; escritura con `{ management: true, write: true, owner: true, area: 'admin.historial' }`. Nunca se codifica un ID/email de owner. Además se comprueba `owner && !acting` antes de escribir. Se propagan errores de autenticación 401/403 sin detalles internos. Fallos técnicos devuelven mensajes genéricos; esquema no disponible, 503; conflictos, 409.

`GET /api/admin/historial` conserva la vista por defecto `desarrollos`, filtros `tipo` y `estado`, y `{ registros, total, page, limit }`. Solo Prisma ORM `desarrolloHistorial.findMany/count`; no SQL interpolado ni unsafe. `page` es entero 1..1.000.000; `limit` es entero 1..100, por defecto 50. Valores vacíos, NaN, Infinity, negativos y mayores del límite se rechazan con 400. `commit_hash` y `rama` conservan snake_case; `automatico` identifica registros de desarrollo con commit/rama o marca automática de autor. No se inventan timestamps que el modelo de desarrollo no contiene.

`GET ?vista=publicaciones[&entorno=staging|produccion]` devuelve registros de publicación separados de desarrollos: `id`, `deployment_key`, `entorno`, `commit_hash`, `fecha_publicacion`, `titulo`, `resumen`, `fuente`, `url`, `migraciones`, `created_at`, `automatico:true`, `total_vinculos` y `vinculos`. Cada vínculo contiene `peticion_id`, fecha, confirmante, título, estado canónico y fecha de cierre; nunca email ni descripción privada de la petición. Se muestran como máximo 100 vínculos por publicación y se devuelve el total para señalar truncamiento.

`GET ?vista=migraciones` lee **metadatos de la BD actual** de `_prisma_migrations`, únicamente `id`, `migration_name`, `checksum`, `finished_at`; exige `finished_at IS NOT NULL AND rolled_back_at IS NULL`, con consultas parametrizadas y LIMIT. `registros` son aplicadas, `total` su número; `preparadas` compara la página de archivos locales contra registros aplicados y el checksum calculado, con `totalPreparadas`. Estados: `aplicada`, `preparada`, `checksum_distinto`, `no_verificable`. Las dos listas se paginan por separado con el mismo page/limit. No se muestran contenido SQL, logs, credenciales ni datos de negocio. Si no se puede consultar el registro aplicado, no se finge que el SQL esté aplicado. `area9_hist_migraciones` es la instantánea opcional capturada con publicaciones; no sustituye la fuente viva `_prisma_migrations`.

`POST` sin acción o con `accion:"crear_desarrollo"` crea exclusivamente un desarrollo manual. Campos admitidos: título, descripción, tipo, estado, fecha y autor heredado; el autor enviado se ignora y se utiliza el nombre autenticado. `commitHash`/`commit_hash`, rama y campos de ledger se rechazan. `PUT /historial/ID` y `DELETE /historial/ID` son owner-only y solo para manuales: no aceptan IDs de publicación, vista de ledger ni desarrollos automáticos, incluso con commit vacío marcado. Se comprueba procedencia y se actualiza/elimina condicionalmente en transacción Serializable; un cambio concurrente no habilita edición automática.

`POST {"accion":"vincular_peticion","publicacionId":"CUID","peticionId":123,"confirmo":true}` requiere owner real y confirmación booleana literal. En una transacción Serializable comprueba publicación existente y petición **ya hecha/resuelta**, `feedbackSatisfecho === true` y `fechaCierre` válida; solo crea el vínculo con ID/nombre de confirmante. No actualiza la petición ni le añade conformidad. Repetir el vínculo es idempotente, sin sobrescribir confirmante. Petición no conforme/cerrada: 409. JSON inválido: 400. Se reutilizan `readBody` y `checkWriteOrigin` de Área8 para JSON acotado y origen exacto; DELETE también comprueba origen.

No existe endpoint humano para crear, editar o eliminar una publicación automática, snapshot automático ni vínculo del ledger ya confirmado.

## Capturador preparado

`lib/area9/capture.ts` es puro: no red, Git, BD, secretos ni efectos laterales. Recibe `{payload, signature}`; la firma Ed25519 cubre JSON canónico con claves ordenadas, verificada con una clave pública fijada en un **contrato administrado fuera del recibo**. El archivo de contrato es una entrada de confianza del integrador, no puede venir del navegador ni del emisor no fiable. Un hash, `validated:true` o un build no sustituyen esa firma y la lectura autenticada que la precede. Este subtrabajo no suministra ni activa el verificador autenticado: deberá incorporarse tras comprobar el contrato real.

Contrato: `version:1`, `provider:github|vercel`, `scope` (owner/repo o projectId), `providerEnvironment` exacto, `environment:staging|produccion`, `databaseIdentityHash` SHA-256, `verifierPublicKeyPem`, `verifiedDeploymentContract`. **Debe permanecer `verifiedDeploymentContract:false` mientras no haya evidencia externa.** Las fixtures marcan true únicamente para probar recibos ficticios.

Payload firmado: versión, proveedor/alcance, `verificationMethod:"authenticated-provider-read"`, `fetchedAt` ISO UTC, hash de identidad de BD, deployment, título/resumen claros y `migrations`. GitHub: deployment con id, SHA40, environment exacto, `production_environment` coherente y `transient_environment:false`; status normalizado con `deployment_id`, state success, created_at y URL pública segura. **`deployment_id` es la asociación normalizada por el verificador desde el endpoint autenticado de estados, no una afirmación de que GitHub emita ese campo crudo.** Vercel: proyecto exacto, target staging/production (jamás preview), readyState READY, ready verificable y meta.githubCommitSha. Esos campos y su normalización son un contrato preparado pendiente de contrastar con las respuestas reales; no un evento activado.

Cada migración firmada solo puede aportar `id`, `migration_name`, `checksum`, `finished_at`, `rolled_back_at`. Se excluyen las no finalizadas o revertidas. No se permite SQL ni datos extra. El lote es finito, hasta 100; si el integrador necesita lotes mayores debe diseñar paginación de evidencia, no aumentar indiscriminadamente la lectura ni deducir aplicación del repositorio. El recibo de una publicación no acredita exhaustividad histórica de migraciones.

Uso offline, por defecto dry-run; no lee ninguna conexión ni importa Prisma:

```sh
pnpm exec tsx scripts/area9-capture-publication.ts \
  --receipt /ruta/recibo-firmado.json --contract /ruta/contrato-fijado.json \
  --sha SHA40 --expected-db-identity SHA256
```

Devuelve `{dryRun:true, registrado:false, publication:...}`. `--output` escribe un candidato nuevo con permisos 0600, no sobreescribe. Producción offline requiere **ambos** `--allow-production` y `--confirm-production-sha SHA40`, además de identidad de BD exacta; incluso así **no conecta ni registra en producción**. Ningún flag transforma un target preview en producción.

La única rama futura de escritura es `--write-staging`: no admite flags productivos, solo la conexión específica `AREA9_ISOLATED_STAGING_DATABASE_URL`, con usuario y BD **`io_staging_finanzas`**, sin fallback a DATABASE_URL ni DB_*. El hash esperado es SHA-256 del JSON exacto `{host:hostname_minúsculas,port:puerto_o_"5432",database:"io_staging_finanzas",user:"io_staging_finanzas"}`; excluye contraseña. Además se contrasta `current_database/current_user` vivos antes de cualquier DML, y las migraciones del recibo contra `_prisma_migrations` realmente aplicadas. No crea el entorno ni aplica SQL. No se ejecutó esta rama. Un deployment existente no se edita; si SHA/entorno/URL/fecha difieren falla cerrado. La limitación a esa identidad es deliberada: cualquier integración diferente requiere nueva revisión explícita, no un override para apuntar a producción.

## Pruebas y pendientes

Comando ejecutado: `./node_modules/.bin/tsx scripts/area9-tests.ts`. Recibo: `docs/area9-tests-receipt.txt`. Pruebas sintéticas de API VM, recibos Ed25519 con claves efímeras, rejection de preview, doble opt-in, CLI sin entorno de conexión, conformidad humana, no-mutación de petición, idempotencia, CRUD automático bloqueado, origen/owner/acting, errores sin leak y lector de migraciones VM. Ninguna prueba abre BD, hace requests de red ni hereda secretos en el subprocess del CLI.

Recibo final de las 22:01 CET: batería Área9 **exit 0 / PASS**, SHA-256 del recibo `a8a4e43363efa5e84b2c69ffe9bd116f53aea105b8e1e44c43c3c3ca7f343041`; script probado `a4ea0b4e37ac899c5af1206457e3e7de29c6f48040f43bc48cb557cbb9b8004c`.

Se ejecutó `tsc --noEmit --incremental false --pretty false`: el chequeo global devuelve 2 por errores fuera del ámbito. La comprobación específica final de Área9 quedó **sin diagnósticos**; no se afirma build completo. El build final lo realiza la tarea principal antes de subir la rama propia. La UI tiene tarjetas responsive, controles etiquetados, estados de error, paginación y acciones solo manuales; no se ejecutó aceptación visual/browser.

Pendiente: inspección autorizada del contrato real, verificador de recibos autenticados fijado, revisión y aplicación SQL en staging aislado, aceptación visual de staging a 400px, build final y habilitación explícita de integración. Producción, workflows automáticos productivos y registro compartido siguen fuera de esta entrega.

### Registro de desarrollo pendiente para el integrador

Título: «Historial separado de desarrollos, publicaciones y migraciones». Descripción: «Se elimina SQL interpolado del historial, se añade paginación y control local owner/origen, publicaciones de solo lectura y vínculos humanos a peticiones ya cerradas, contraste de migraciones preparadas/aplicadas y capturador offline de recibos firmado. Pruebas sintéticas superadas. Pendiente contrato real y aplicación autorizada en staging». Tipo ambas, estado completado **del trabajo local**, sin afirmar publicación. No se insertó este registro en ninguna BD.
