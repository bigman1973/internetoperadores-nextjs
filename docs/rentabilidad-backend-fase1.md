# Rentabilidad mensual — Backend de Fase 1

## Alcance

Nuevo namespace analítico `lib/rentabilidad`. No altera registros `contratos_servicio`, contratos GGCC, facturas, movimientos, nóminas, Azure o ISP. No publica ni envía correo. No contiene datos privados ni credenciales. El primer diagnóstico está fuera del repo, en `diagnostico-modelo.md` del workspace.

### Archivos

- `types.ts`: tipos JSON, precisión decimal exacta, moneda, catálogo y reglas confirmadas.
- `store.ts`: `readInputs`, `normalizeInitialPayload`, `importInitial`, `saveRule`, `ensureExceptions`, `resolveException`, `appendRun`, `saveSnapshot`, `listSnapshots`, `listRecentRuns`, `getRuleHistory`, `getExternalCostHistory`, `listResolvedExceptions`; planners puros compartidos con las pruebas.
- `importers.ts`: CSV nativo con comillas/multilínea y XLSX mediante dependencia existente `xlsx`; preview sin BD.
- `isp.ts`: adaptadores env-only, GET upstream y bloqueo de API avanzada no contratada. No inventa una ruta listado299.
- `prisma/migrations/20261124_area3_rentabilidad/migration.sql`: cuatro tablas nuevas y guards físicos.
- `scripts/rentabilidad-import.ts`, `scripts/rentabilidad-sync.ts`: CLI voluntarias y cerradas por configuración.
- `scripts/test-rentabilidad-backend.ts`: fixtures sintéticas unitarias, nunca datos analíticos de demostración.

## Datos e invariantes

`rentabilidad_versiones` guarda catálogo, contratos, reglas, costes, referencias, cola y decisiones con `kind + stable_key + version`. `rentabilidad_lineas` conserva la clave hash de `(codigoContratoIsp, fechaFuente, concepto, precio decimal exacto canónico)`. La columna `importe_base_decimal` y payload `importeBaseDecimal` son la fuente exacta; `importe_base_centimos` es **solo presentación redondeada**, nunca identidad ni base del cálculo. El lexema original permanece en `baseAmount` del JSON normalizado o `importeBaseLexema` del CSV nativo.

Precios contractuales de cuatro decimales y descuentos se preservan como texto exacto. `cuotaPeriodoCentimos` solo se añade si el precio admite dos decimales exactos. `contractedMonthlyAmount` del analista mantiene su fórmula validada mientras no cambien precio, descuento o periodicidad. Un cambio económico ISP invalida ese neto mensual y sus aliases; el cálculo posterior usa `(precio + descuento) / meses`, nunca el bruto ni la caché anterior. Repetir la misma entrada ISP no reintroduce una caché obsoleta. Datos inexistentes no se convierten a cero.

El envelope privado del analista `io-normalized-initial-1.0` se normaliza preservando campos ingleses, añadiendo aliases españoles. `source` objeto pasa a `sourceLocator` con marcador LORENA/ISP_LISTADO299/COSTES_XLSX_INITIAL. Los 70 costes externos iniciales son referencias de contraste, no un segundo conjunto de costes para sumar encima de los 220 costes iniciales.

Cada fila entrante normaliza **antes de mezclar** los grupos EN/ES de proveedor, producto, fechas, estado/activo, precio, descuento y periodicidad (`periodicityMonths`, `periodMonths`, `periodicidadMeses`). Un `null` explícito limpia todos los aliases del grupo; aliases contradictorios en una misma fila fallan con `ALIAS_CONFLICT`. La procedencia de proveedor Lorena bloquea los cambios ISP tanto del proveedor como del producto. Cambiar proveedor sin producto nuevo limpia `product`, `productoId`, `producto` para reclasificar, no conserva el producto de otro proveedor. `estadoOriginal` permanece intacto; activo con baja pasada genera revisión durable, sin fabricar fechas ni corregir silenciosamente el estado fuente.

Las reglas se versionan con INSERT; modificaciones de contrato analítico hacen nueva versión, no update de fuentes originales. `costRule.method=EXCLUIR` permanece válido para excluir estructura. `periodAnchor`, si está presente, solo admite `INVOICE_MONTH` con `period=ANUAL`; cualquier otro valor/combinación produce `INVALID_PERIOD_ANCHOR`. Nunca se asigna ese ancla por defecto. Las decisiones usan una clave estable y estado PENDIENTE/RESUELTA; la cola derivada no reabre una excepción resuelta. Confirmar un coste requiere `costKey` durable en la excepción o entrada backend y añade versión REAL del coste objetivo. Cuando cambia el importe se actualizan `baseAmount`, `amount`, `importe`, `importeBase`, `importeBaseDecimal`, `importeBaseExacto` y los céntimos derivados, incluidos los aliases opcionales ya existentes. Nunca confirma de forma ficticia una alerta sin coste verificable.

Lectura `readInputs` paginada de 500; destinada a rebuild explícito, no GET de pantalla. `listSnapshots` devuelve máximo 50 últimas versiones por mes/tipo, con payload; snapshot acepta hasta 8 MiB saneados, resto de filas 128 kB. Hash snapshot excluye `generatedAt`, `runs`, `snapshots`, e incluye resto del informe, mes y tipo.

### Historial para la UI

`listRecentRuns(limit=50, offset=0)`, `getRuleHistory(key?, limit=100, offset=0)`, `getExternalCostHistory(key?, limit=100, offset=0)` y `listResolvedExceptions(limit=100, offset=0)` devuelven `Promise<JsonRecord[]>`. Los historiales conservan todas las versiones, no solo la última por clave; sin clave filtran por los tipos pertinentes. Orden descendente estable por `created_at,id`, `LIMIT/OFFSET` parametrizados, máximo 100 filas por página. No llaman a `readInputs` ni leen las líneas facturadas. Límite inválido o offset negativo/fraccional produce `INVALID_HISTORY_PAGE`.

Formato de runs: `{id, process, sourceHash, payload, createdAt}`. Formato de historial y resueltas: `{id, kind, key, version, sourceHash, payload, actorId, createdAt}`. `createdAt` es ISO. `getRuleHistory` incluye `tariffRule` y `costRule`; `getExternalCostHistory` únicamente `externalCost`. `listResolvedExceptions` toma primero la última versión por clave y después filtra `payload.estado=RESUELTA`: una excepción reabierta no aparece aunque conserve versiones resueltas anteriores. Para el botón Deshacer se envía `exceptionKey: item.key, action: REABRIR`.

## Seguridad e importación

Todas las escrituras requieren configuración explícita `FINANCE_STAGING_SANDBOX=1`, URL con base/usuario `io_staging_finanzas`, entorno no production, identidad viva dentro de transacción y actor activo `SUPER_ADMIN`. SQL triggers repiten aislamiento y rol, bloquean UPDATE/DELETE/TRUNCATE y verifican secuencia de versiones. Lock de escritor compartido serializa batches. Importación por batches de 250: cada batch es atómico y una repetición tras interrupción no duplica líneas/versiones. FKs SQL opcionales a fuentes existentes con RESTRICT; no se fuerza un match de contrato Excel a ID ISP sin prueba.

CLI import: ruta absoluta **fuera del repositorio** en `RENTABILIDAD_IMPORT_FILE`. Preview es el modo por defecto.

```bash
# Preview, sin BD ni aprobación de escritura
RENTABILIDAD_IMPORT_FILE=/ruta/privada/listado.csv npx tsx scripts/rentabilidad-import.ts --kind lines
RENTABILIDAD_IMPORT_FILE=/ruta/privada/contratos.xlsx npx tsx scripts/rentabilidad-import.ts --kind contracts
RENTABILIDAD_IMPORT_FILE=/ruta/privada/normalized.json npx tsx scripts/rentabilidad-import.ts --normalized
# Apply exige además configuración aislada, actor real y aprobación explícita
# RENTABILIDAD_IMPORT_APPROVED=1 RENTABILIDAD_IMPORT_ACTOR_ID=<id> ... --apply
```

No `.env` cargado automáticamente por CLI, no fallbacks hacia producción. Logs solo contadores, hashes e índices/códigos de rechazo. Nunca contenido de filas, claves de acceso o respuestas ISP.

## ISP y automatismos

El coordinador verificó el 24/11/2026 que `contratos_todos` devuelve 403 por API avanzada no contratada. El adapter bloquea sin petición por defecto y no reintenta; solo una futura reacreditación explícita `RENTABILIDAD_ISP_ADVANCED_REACCREDITED=1` habilita la ruta GET conocida. Usuario/hash/base exclusivamente env. Proxy opcional env transporta POST con `method: GET`; credencial proxy propia y HTTPS.

Alternativa exportador remoto: `RENTABILIDAD_EXPORT_ENABLED=1`, URL HTTPS, `RENTABILIDAD_EXPORT_ALLOWED_HOST` exacto, token env. Solo GET, sin redirects, timeout y límite 40 MiB. Falta de configuración produce BLOQUEADO. El código no configura, programa ni ejecuta por sí solo ese exportador; su origen y licencia deben acreditarse antes de habilitarlo.

CLI sync exige `RENTABILIDAD_SYNC_APPROVED=1`, actor y aislamiento. Un caso sin export escribe solamente ejecución BLOQUEADO, procesados 0; no finge éxito. **No se ha lanzado esta CLI en la implementación.** La integración de cron pertenece al coordinador y no modifica el worker financiero existente.

## Validación realizada sin BD

- 30 pruebas unitarias propias pasan: las 12 previas y 18 regresiones de aliases EN/ES, importación inicial normalizada + ISP real sintético, precio/descuento/periodicidad, producto, estado contradictorio, confirmación monetaria, compensaciones de contrato/coste/regla, guardas de versión/hash, idempotencia y ancla anual explícita.
- `applyVersions` usa exactamente `planVersion`/`mergeVersionPayload` que prueban las regresiones; no se prueba un merge paralelo simplificado. Ejecución: `env -u DATABASE_URL -u FINANCE_STAGING_SANDBOX node_modules/.bin/tsx --test scripts/test-rentabilidad-backend.ts`.
- Preview nativo: 15.824 líneas y 1.342 contratos; cero rechazados.
- Validación pura del payload del analista: 1.342 contratos; 15.824 líneas con 15.824 identidades únicas; 220 costes; 91 referencias; 21 productos; 8 reglas desdobladas. Cero rechazados.
- Transpilación sintáctica de seis archivos propios sin diagnósticos. No constituye comprobación global de tipos ni build.

Los previews y transpilación de los puntos anteriores pertenecen a la validación de la implementación inicial; esta revisión ejecutó únicamente las pruebas puras. El coordinador comunica DDL ya aplicado únicamente staging. Pendiente para el coordinador: probar actor/guards físicos, reimportación real y contadores DB, ciclo de decisiones/compensaciones staging, FK GGCC acreditadas, conexión de historiales/run en UI y snapshots. El modelo Prisma declara scalars de FK y SQL declara constraints a fuentes; no usar `db push` ni diff automático que retire esos constraints sin revisión. Esta revisión no ejecutó Prisma generate, migración, build, tsc global, commit/push, sync ni BD.

## Rollback reversible sin pérdida

1. Apagar habilitación del módulo y automatismos nuevos; ocultar menú/API sin abrir permisos legacy ni cambiar producción.
2. Volver al código previo; conservar tablas analíticas, fuentes, auditoría y cierres.
3. `REABRIR` añade versiones compensatorias de contrato, coste y regla, y nueva decisión/excepción PENDIENTE. Cada decisión económica guarda `effects[]` con la versión/payload/hash anteriores y `expectedAppliedVersion`/`expectedAppliedHash`. Solo compensa si todos los objetivos siguen exactamente en esa versión/hash; cualquier cambio posterior falla cerrado con `REOPEN_REVISION_CONFLICT` (409), sin escrituras parciales. Restaura íntegramente el payload previo; una regla/coste externo creado por la decisión recibe una versión `active:false`. Una decisión legacy económica sin prueba anterior falla con `REOPEN_REVIEW_REQUIRED` (409). Una resolución distinta sobre excepción ya resuelta exige reabrir primero. Repetir la misma decisión o reapertura es idempotente, sin versiones infinitas. Nunca DELETE/UPDATE ni reescritura de cierres previos.
4. Reversión estructural solo con aprobación y tablas nuevas **vacías** comprobadas; después de cargar datos, no ejecutar DROP/DELETE/TRUNCATE. No se incluye un script destructivo automático.
