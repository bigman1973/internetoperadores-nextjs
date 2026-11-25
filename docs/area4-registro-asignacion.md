# Registro y asignación auditada · contrato de integración

## API existente (no se crea otra ruta)

`/api/admin/usuarios/propuestas` conserva GET y comandos de personas. GET solo lee y añade `snapshot.registry?`. POST usa JSON cerrado con límite real de 256 KiB y same-origin. El propietario debe ser la identidad canónica viva, activa y SUPER_ADMIN; ningún contexto de actuación es válido.

```ts
// Todos los campos son obligatorios. Ningún rol ni V se preselecciona.
const drafts = [{
  sectionKey: 'clave-canónica-de-sección',
  roles: { superadmin: '', gerente: '', contabilidad: '', comercial: '', draxton: '', empleado: '' }
}]
POST { action: 'preview-sections', drafts }
// => { proposal: SectionAssignmentProposal }
POST { action: 'assign-sections', drafts, confirmed: true, revision: proposal.revision }
// => { ok: true, snapshot: UsersSnapshot }
```

Valores de rol: subconjuntos de VECX, sin duplicados; E/C/X exige V. La normalización ordena VECX. Las seis claves son expresas y cerradas. `superadmin:'VE CX'` no es válido: usar `VECX` si el humano selecciona todo. La identidad propietaria ya tiene su excepción independiente; marcar su fila no crea otro Superadmin. Un mapa con seis valores vacíos es revisión denegada persistible, no apartado pendiente. No se admiten descriptores, `current`, roles inferidos ni grant metadata del cliente. Las superficies se capturan siempre del catálogo servidor.

`SectionAssignmentProposal` exportado desde `section-assignments.ts` y `users-contract.ts`: `{revision,drafts,rows,catalogueRevision,baselineRevision,assignmentRevision}`. Cada row contiene `{sectionKey,label,group,surfaces,before,roles}`; `before` es el mapa previo válido o null. Cada superficie es `{id,path,kind,descriptor,actions}`. `kind:'page'|'api'`, `actions:('V'|'E'|'C'|'X')[]`.

`Area4RegistrySnapshot`: `{revision,catalogueRevision,baselineRevision,assignments,available,pending,assigningAllowed,warnings}`. `pending` contiene `{sectionKey,label,group,surfaces}` para descriptores aún no revisados; una sección histórica con ruta nueva puede estar pendiente. `assignments` contiene `{sectionKey,auditId,auditCreatedAt,valid,surfaces,roles}`; roles puede ser null ante evidencia inválida. Ninguna fecha/Map/Set/BigInt en payloads. `UsersSnapshot.registry` es opcional para compatibilidad con fixtures/UI anterior.

## Integración de guardias / SSR / menú (padre)

```ts
import { validateArea4NewSurfaceConsent, type Area4ConsentLiveUser } from '@/lib/area4/users-proposals'
import { loadArea4SectionAssignmentState, area4SectionSurfaceAssigned } from '@/lib/area4/section-assignments'

const consent = await validateArea4NewSurfaceConsent(db, liveUser, match, capability, ownerId, assignments /* opcional */)
// Intersectar además evaluateArea4Capability y todas las guardias propias.
// Para una superficie nueva, pasar newSurfaceConsent:consent,
// requireExactGrant:true; nunca usar la plantilla como un grant.
```

`Area4ConsentDatabase = Pick<PrismaClient,'usuarioAdmin'|'permisoArea'|'auditoriaPermisosArea4'>`. `Area4ConsentLiveUser` debe representar datos vivos: `{id,activo,rol,roles:string[],perfilAsignado:string|null,permisosArea4Vivos:boolean,grants:readonly (Area4Grant & {areaId:string})[]}`. Los grants deben estar completos, no solo el padre o las filas del código consultado: la identidad se verifica contra todo el resultado auditado. Cada grant tiene `codigo,lectura,escritura,confirmar,exportar`. No derivar un rol humano de VISOR, nombre, etiqueta, sesión o JWT.

`validateArea4NewSurfaceConsent(db,liveUser,match,capability,ownerId,assignments?)` devuelve `Promise<boolean>`. Baseline retorna true sin consultas añadidas: esto no sustituye ACL/política previa. El propietario canónico activo conserva la excepción. Para nuevas superficies, requiere adopción viva, grant exacto V + capability, área activa, propietario auditante vivo canónico, último PERFIL_APLICADO de origen exacto coherente con identidad/roles primarios/perfil/estado/grants completos, entitlement individual exacto de id/descriptor/código/capability y asignación última válida del rol. Viejos eventos sin metadatos nuevos solo certifican baseline. Contextos de actuación deben rechazarse en el consumidor; este helper no recibe una sesión ni autoriza acting.

`loadArea4SectionAssignmentState(db,ownerId)` es read-only/acotado y retorna `Area4SectionAssignmentState`; `area4SectionSurfaceAssigned(match,state,role,capability?)` es función pura de elegibilidad de plantilla, NO consentimiento personal. Baseline es compatibilidad, no nueva concesión. No usar el booleano de plantilla solo para autorizar. Reusar `assignments` de un mismo snapshot servidor es opcional; no almacenar/cachear concesiones entre solicitudes. Baseline-only no añade consultas de auditoría de asignación.

## Persistencia y CAS

Sin migración. Solo INSERT en `auditoriaPermisosArea4`, operación `SECCION_ROLES_ASIGNADOS`, origen `/api/admin/usuarios/propuestas`, `areaCodigo:'section:'+sectionKey`, objetivoUsuarioId null. Este marcador identifica sección (no wildcard ACL). `despues` cerrado: `{version:1,sectionKey,surfaces,roles,revision,catalogueRevision,baselineRevision,ownerId,confirmed:true}`. El último evento por marcador/origen/operación manda aunque sea corrupto o de actor incorrecto; nunca se busca atrás un grant válido. Un descriptor nuevo dentro de la misma sección NO hereda la revisión anterior. Ningún UPDATE/DELETE de auditoría; ninguna escritura de UsuarioAdmin, PermisoUsuario ni PerfilPermisos al asignar.

Preview `RepeatableRead`; apply `Serializable`, relectura del owner y estado último, SHA256 vincula catálogo completo, baseline, assignments, owner vivo con updatedAt y borrador normalizado. Lote de INSERT atómico y sin retry. P2034 y CAS stale piden nueva confirmación. P2021 en lectura de esta auditoría cierra solo las superficies nuevas; otros fallos se propagan. GET/preview/build nunca escriben.

Aplicar exige `AREA4_STAGING_SECTION_ASSIGN=1`, `FINANCE_STAGING_SANDBOX=1`, DSN PostgreSQL con usuario/base `io_staging_finanzas`, entorno nunca VERCEL production, origen HTTPS staging exacto o preview host configurado y ausencia de `IO_PRODUCTION_READ_ONLY=1` y `FINANCE_DEPLOYMENT_READ_ONLY=1`. La autorización de personas `AREA4_STAGING_USER_APPLY` no habilita asignación ni al revés. Las guardias Prisma/SQL FinanceSandbox existentes siguen intactas; no se ejecuta ninguna aplicación real en esta entrega.

## Metadatos personales y compatibilidad

Al confirmar persona, `PERFIL_APLICADO.despues` añade servidor-only `confirmed:true`, `ownerId`, `assignmentRevision`, `registryEntitlements` y `roleTemplateSnapshot`. Cada entitlement: `{id,descriptor,sectionKey,code,actions,assignmentAuditId}`. Snapshot de plantilla: `{version:1,templates,sections,areas,baselineCodes,compiled}`; áreas contiene id/codigo/activo y compiled el mapa completo de flags intencionales, incluido deny. Se recompila contra las filas/plantillas apply-time para comprobar extras y grants completos; no se compara la identidad histórica con la plantilla actual. Por ello, asignar un apartado después no pierde la elección humana original, pero tampoco añade entitlements a una persona. Revocar asignación cierra por intersección con latest.

`UsersCurrentState.assignments`, `.resolvedRoles` y `.registryMatches` son opcionales para fixtures backward-compatible. `resolvedUsersRoles(state)` obtiene una copia resuelta, nunca muta semillas globales. Snapshot, propuesta, aplicación y CAS usan esas plantillas. El parámetro servidor opcional de catálogo en helpers/read/apply permite ficción SOLO en pruebas en memoria; nunca viene del JSON ni se incorpora al inventario físico.

## Evidencia local

En progreso: batería nueva `scripts/test-area4-section-assignments.ts`; regresión existente 17/17 verificada inicialmente. TypeScript check-only no mostró errores de archivos B, pero el repositorio tiene errores preexistentes fuera de scope; no se anuncia typecheck global verde ni build. No git/build/deps/Prisma generate/BD/browser/HTTP real/email/Graph/Azure.

### Helper adicional disponible para el padre

`readArea4SurfaceAccessUser(db,id):Promise<Area4ConsentLiveUser|null>` en `users-proposals.ts`, donde db solo requiere `usuarioAdmin`. Hace findUnique con identidad/estado/perfil/adopción y todos los grants completos (acotados a 2001, rechaza >2000), sin nombre/email/passwordHash/NIF ni fechas personales. Puede alimentar directamente `validateArea4NewSurfaceConsent`. El helper de consentimiento consulta su propio último PERFIL_APLICADO y owner activo, aunque `liveUser` no traiga `approvedAssignment`.

Revisión local 01:30 CET: 25 pruebas nuevas + 17 existentes = **42/42 PASS**, log `/tmp/area4-b-all-tests.log`. TypeScript check-only posterior: cero diagnósticos de archivos B (`/tmp/area4-b-types2.log`); hay errores ajenos preexistentes, por lo que no se afirma typecheck global PASS. No se ha ejecutado build ni ningún apply real. El adaptador de fixture usa copias en memoria y metadata generada por funciones servidor; no se registró ninguna ruta ficticia como handler real.

## Freeze B · 25/11/2026 01:34 CET

Fuentes B congeladas para integración del padre: `lib/area4/section-assignments.ts`, `users-contract.ts`, `users-proposals.ts`, `audit.ts`, `app/api/admin/usuarios/propuestas/route.ts`, `scripts/area4-users-proposals-fixture.ts`, `scripts/test-area4-section-assignments.ts`, esta guía. No se modificaron registry/roles/policy/middleware/UI/package/Prisma/schema/Áreas 1/5.

Evidencia final: **26 pruebas nuevas + 17 existentes = 43/43 PASS**, `/tmp/area4-b-all-tests.log`. Incluye prueba del handler local (Request/Response en memoria, ningún HTTP real), forma exacta `{proposal}` / `{ok,snapshot}`, owner/noacting/origen/contrato cerrado, audit-only durable, CAS/owner date/catalogue/baseline/latest, denegación revisada, rollback del segundo INSERT y Serializable sin retry, wrongactor/latest inválido, rutas nuevas del mismo código CRM, grant E sin V rechazado, revocación por intersección, auditoría legacy baseline-only, preservación de identidad contra compilación apply-time, extras forjados/grants parciales y P2021 failclosed sin ocultar otros errores.

TypeScript check-only final: cero diagnósticos en archivos B, `/tmp/area4-b-types-final.log`; el repositorio conserva diagnósticos fuera de scope. ESLint no pudo analizar archivos debido a la configuración existente `Converting circular structure to JSON` en @eslint/eslintrc/react; log `/tmp/area4-b-eslint.log`, sin cambios de configuración/deps. No git/build/generate/DB/browser/HTTP real/email/Graph/Azure. Las garantías transaccionales reales están implementadas para flags explícitos, pero ninguna escritura real ni aceptación en staging se ha ejecutado.

**Importante para autor UI:** payloads finales son `drafts`, respuesta preview **`{proposal}`**, respuesta assign **`{ok:true,snapshot}`**, no `sections` / `sectionProposal` / `registry` top-level. `snapshot.registry` es donde está el estado serializable. Los handlers físicos vigentes siguen siendo únicamente los reales; la ficción aparece solo en pruebas.

## Integración parental · 25/11/2026

La evidencia freeze B anterior corresponde a su catálogo de prueba antes de las altas M365. El candidato integrado mantiene 439 superficies históricas bloqueadas y añade dos APIs reales M365 como nuevas/pending bajo `crm.contactos`; el caso baseline-only ahora declara explícitamente su catálogo histórico y conserva cero consultas auditadas. El catálogo completo prueba una lectura auditada y cero escrituras al consultar.

El consentimiento se integra en middleware antes de los fallbacks, helper servidor real, semillas SSR/cliente y menú. La protección cliente también intersecta superficie exacta y grant V exacto; no se autoriza por la semilla de un rol previsualizado. Los contratos por método se derivan del registro: GET/HEAD del borrador M365 exigen V+E sin invocar OpenAI durante las pruebas. El bloque financiero general sigue cerrando ambos POST CRM; su eventual apertura con la opción C es una entrega distinta. La guía operativa actual es `docs/area4-registro-apartados.md`.

Los resultados definitivos de batería, typecheck, build, SHA y preview se entregan en el informe de esta tanda; esta guía no convierte pruebas sintéticas en HTTP real ni declara cuentas aplicadas.
