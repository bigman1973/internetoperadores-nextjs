# Área 4 · Backend de propuestas · 25/11/2026

Se implementaron exclusivamente los seis archivos nuevos de este backend: `lib/area4/approved-roles.ts`, `lib/area4/users-proposals.ts`, `app/api/admin/usuarios/propuestas/route.ts`, `scripts/test-area4-users-proposals.ts`, `scripts/area4-users-proposals-fixture.ts` y este documento. No se modificaron UI, contrato compartido, kit, policy, registry, Prisma, otras APIs ni Área 5. No hubo commits, push, instalación de dependencias, build, conexión a bases externas ni aplicación de cuentas. Los cambios concurrentes del integrador en archivos comunes no forman parte de este alcance.

## Plantillas e identidad

`APPROVED_ROLES` conserva las seis plantillas de las líneas 234–240 de la maqueta. Gerente contiene las excepciones VX/VEX/VEC, Contabilidad no incorpora los extras de Lorena en su rol genérico, y Técnico Draxton concede VE únicamente a las ocho subáreas técnicas existentes. El padre Clientes/Draxton y las otras subáreas quedan denegados para Técnico. `USERS_SECTIONS` contiene 33 grupos actuales —32 de la maqueta más Asistente IA, ya existente— y ocho filas técnicas; sus códigos proceden del registro real, no de IDs demo.

`proposedRoleFor(user, currentSnapshot, ownerId)` acepta únicamente nombres normalizados y coincidencias únicas: David Pérez; Jordi Giró / Jordi Giró Marqués; Lorena Gimeno / Lorena Gimeno Martínez; Jesús Parra / Jesús Parra García; Alejandro Martínez / Alejandro Martínez Cayuelas; Patricia Parra / Patricia Parra García. No identifica personas por email ni por IDs de la maqueta. No usa coincidencias parciales arbitrarias. Los usuarios desconocidos muestran Empleado como rol genérico de edición, conservan sus accesos actuales en `next` y no entran en los borradores iniciales; solo un borrador explícito del propietario los incorpora.

El propietario se identifica por configuración e identidad viva, nunca por nombre. Su rol, roles secundarios, estado y grants no se escriben. Iván Pérez y Tutorial Bot están protegidos en cualquier estado de staging y quedan excluidos de los borradores. No se crea otro Superadmin. Las nuevas asignaciones guardan solamente el enum primario equivalente en `roles[]`: `SUPER_ADMIN`, `GERENTE`, `CONTABILIDAD`, `VENTAS` o `VISOR`, sin conservar bypasses secundarios.

Tras aplicar, la selección humana de rol y extras se recupera del último `PERFIL_APLICADO` de esta API, únicamente si rol, roles secundarios, estado, perfil, adopción y **todos** los grants coinciden con su `despues`. La evidencia se consulta solo para cuentas adoptadas, por cuenta y en lotes de ocho, sin recorrer indiscriminadamente la bitácora; su ID, fecha y metadatos validados quedan vinculados a la revisión CAS. Esto conserva, por ejemplo, un cambio manual de David a Contabilidad más CRM, o Gerente en una persona antes desconocida. Una cuenta adoptada sin evidencia coincidente mantiene `next=current`, conserva el enum actual para presentación y queda fuera de las propuestas automáticas por nombre. No se introdujo un perfil legacy ni una migración de persistencia nueva. El registro único ampliado queda reservado para la siguiente entrega del integrador.

## Contrato e informe

| Operación | Respuesta | Escrituras |
|---|---|---|
| GET `/api/admin/usuarios/propuestas` | `UsersSnapshot` | Ninguna |
| POST `{ action: 'preview', drafts }` | `{ proposal: UsersProposal }` | Ninguna |
| POST `{ action: 'apply', confirmed: true, revision, drafts }` | `{ ok: true, snapshot: UsersSnapshot }` | Solo si todas las guardias lo autorizan |

`loadUsersSnapshot(db, ownerId)` está disponible para SSR y para una transacción de informe de solo lectura. Los selects no consultan contraseñas/hashes, NIF, documentos del empleado ni conexiones externas; `lastAccess` deriva del valor real `ultimoAcceso`. Con Prisma completo, snapshot/preview usan una foto `RepeatableRead`; con un `TransactionClient` reutilizan la transacción del llamador. Las lecturas están limitadas a 1.000 usuarios/perfiles y 2.000 áreas, fallando cerradas si se excede el límite.

`current` es la unión visual de las capacidades actuales por apartado, calculada con la política viva y las restricciones de los módulos. `next` representa la intención aprobada por apartado, incluso si el catálogo aún no contiene un código requerido; no afirma que ese acceso exista o pueda aplicarse. El borrador incluye un `blockedReason` cuando no puede materializarse con seguridad. `differences` contiene dos niveles con claves distintas: resúmenes cuyo `section` es `UsersSection.key`, y detalle granular cuyo `section` es el código real (`admin.*`/`empleado.*`). La etiqueta del detalle incluye el código. La UI puede encontrar el resumen por clave; un informe de seguridad debe conservar también todas las filas granulares. No deducir ausencia de pérdidas únicamente de la unión visual.

`missingApprovedRoleCodes(actualCodes): string[]` devuelve únicamente códigos que ya existen en `AREA4_SECTION_REGISTRY` y faltan en el catálogo recibido. El snapshot añade la misma lista a sus avisos. Permite al integrador preparar un SQL aditivo de catálogo, sin inventar Gastos separado ni asignar usuarios. Ningún SQL o migración fue aplicado en este backend.

## Seguridad y transacción

El servidor rechaza propiedades JSON desconocidas, IDs inválidos o duplicados, roles/acciones fuera del conjunto permitido, extras con claves no registradas, `confirmed` ausente/falso y selectores falsificados `current`, `next` o `differences`. El cuerpo se lee por streaming con límite real de 256 KiB, además del control de `Content-Length`. Requiere JSON, Origin idéntico al de la petición y `Sec-Fetch-Site: same-origin` cuando ese encabezado existe.

La API es privada `no-store`, exige una sesión administrativa y propietario real activo con rol primario `SUPER_ADMIN`. Rechaza tanto el marcador de actuación de sesión como cualquier encabezado de contexto de actuación, incluso inválido. Nunca imprime SQL, credenciales ni metadatos privados de un error.

La revisión SHA-256 vincula todos los usuarios —incluidos propietario/excluidos—, activo, roles secundarios, perfil asignado, adopción, timestamps, todos los grants con V/E/C/X, catálogo de áreas, perfiles vivos, borradores normalizados, propietario configurado y versión/contenido de plantillas. La aplicación vuelve a leer el estado completo dentro de una única transacción `Serializable`, verifica otra vez propietario/configuración y compara la revisión. No confía en diferencias calculadas por el navegador. Un conflicto o revisión antigua devuelve 409 sin reintentar escrituras.

Antes de escribir se verifican **todos** los bloqueos del lote. Después se reemplaza la ACL completa: cada área actual obtiene cuatro flags explícitos, incluidos falsos y áreas desconocidas, evitando que Dashboard `admin V` herede acceso accidental. Se normalizan rol/roles, se limpia `perfilAsignado` a null y se activa `permisosArea4Vivos`. La misma transacción inserta un evento append-only `PERFIL_APLICADO` por cuenta cambiada mediante `appendArea4Audit`; `antes` conserva rol/roles/estado/perfil/adopción y backup íntegro de grants, sin contraseñas ni emails. Cualquier fallo de actualización, grants o auditoría revierte el lote entero. Repetir la revisión ya aplicada se rechaza como obsoleta sin duplicar eventos.

## Aplicación reservada y bloqueos reales

La aplicación requiere simultáneamente `FINANCE_STAGING_SANDBOX=1`, `AREA4_STAGING_USER_APPLY=1`, destino PostgreSQL con usuario **io_staging_finanzas** y path **/io_staging_finanzas**, `VERCEL_ENV` distinto de production y ausencia tanto de `IO_PRODUCTION_READ_ONLY=1` como de `FINANCE_DEPLOYMENT_READ_ONLY=1`. El origen debe ser HTTPS `staging.internetoperadores.com` o, con `VERCEL_ENV=preview`, un hostname `.vercel.app` configurado exactamente mediante `VERCEL_URL`/`AREA4_STAGING_PREVIEW_HOST`. Localhost, dominios productivos, previews arbitrarias y puertos alternativos no se autorizan. Este flag no omite middleware, Prisma ni guardias SQL. El integrador controla la excepción exacta de POST para preview; el default de aplicación permanece cerrado. Producción requiere publicación autorizada y copia previa, separadas de esta tanda.

| Intención | Límite observado | Resultado en backend |
|---|---|---|
| Lorena: Personal VEC sin nóminas | `admin.empleados` agrupa salarios/nóminas; API incluye nóminas y usa `admin.personal.empleados` | Se deniegan códigos salariales, incluido `admin.gastos_nominas` si existe; la propuesta se bloquea. No se afirma «sin salarios» con una advertencia únicamente. |
| Gastos del trabajador VE/VEC | No hay código aislado actual; comparte Portal y/o Nóminas. Legacy employee APIs no tienen aún toda la cobertura ACL por acción | No se inventa un código ni se concede VE al padre Portal. Propuestas de empleado/técnico con esa intención quedan bloqueadas hasta separación autorizada. |
| Gerente: aprobar gastos | Área 5 determina revisores por su guardia existente, no por enum Gerente | `esRevisor` se consulta sin editar Área 5 ni hardcodear correos nuevos. Para Jordi/no-revisor hay bloqueo individual, no promesa de aprobación. |
| Comercial: Subida de precios V | Guardia vigente solo Superadmin/Gerente; decisión pendiente de Claude/Víctor | Plantilla conserva intención de maqueta; aplicación Comercial bloqueada. |
| Finanzas: sin acceso salarial/márgenes | Rutas de nóminas/rentabilidad comparten `admin.finanzas` | Aviso explícito de intersección/limitación. No se modifica el módulo ni se garantiza separación por la matriz. |
| Impuestos/Presupuesto | Catálogo puede carecer de códigos ya registrados | Intención visible; faltantes reales enumerados y aplicación parcial rechazada. |

Con los límites actuales, `applyingAllowed` es falso por defecto y también falso si cualquier fila inicial está bloqueada. Aun con un flag futuro explícito, el servidor vuelve a comprobar cada borrador y conserva los bloqueos. **No se aplicó ninguna cuenta en esta ejecución.**

## Pruebas y entrega

Ejecutar `pnpm exec tsx scripts/test-area4-users-proposals.ts`: **17/17 pruebas sintéticas aprobadas**, sin conexión a BD ni envío de comunicaciones. Cubren plantillas, hijos técnicos, Dashboard/herencia, coincidencias únicas, Lorena/nóminas, JSON cerrado, lectura segura, CAS de todas las acciones/estado, origen/entorno, propietario/excluidos, API real con módulos autenticadores mockeados, normalización de roles, backup, stale replay y rollback total al fallar la segunda auditoría. Se añadieron negativos de deployment read-only con cero transacciones/escrituras/auditorías, persistencia de rol/extras confirmados después de apply y reload, invalidez de metadatos al cambiar la cuenta, y conservación de cuentas adoptadas sin evidencia coincidente. La prueba transaccional positiva simula únicamente en memoria una futura separación de Gastos; no cambia el registro del proyecto ni es una capacidad expuesta en producción. La simulación se restaura al finalizar.

También se ejecutó `scripts/test-area4-rbac.ts`: **7/7**. El chequeo global `tsc --noEmit --incremental false` encuentra errores ajenos en el proyecto compartido; los dos errores iniciales de backend fueron corregidos y el ajuste readonly de la prueba se cerró antes de entregar. El integrador conserva el build único y la aceptación real en staging. Estas pruebas no son evidencia de permisos efectivos en producción ni sustituyen la revisión independiente de módulos.

### Evidencia final de cierre · 00:58 CET

Última batería exclusiva: **17/17 PASS** (`/tmp/area4-proposals-tests-final.log`). Último chequeo TypeScript: **0 errores en los cinco archivos de código propios**, **48 errores ajenos del proyecto** (`/tmp/area4-proposals-types-last.log`); no se ejecutó build ni Prisma Generate. La prueba 15 verifica `FINANCE_DEPLOYMENT_READ_ONLY=1` con cero transacciones/escrituras/auditorías. La prueba 16 confirma apply/reload de roles y extras humanos conocidos/desconocidos y rechaza evidencia cuando cambian roles, activo o cualquier grant. La prueba 17 conserva cuentas ya adoptadas sin evidencia coincidente fuera de repropuestas por nombre. Todo se ejecutó con fixtures `example.invalid`, sin consultas a la copia real ni modificaciones de cuentas. Los informes READ ONLY y la aceptación/build compartidos quedan a cargo del integrador.

### Cierre de revisión focal · 01:00 CET

Se resolvió el hallazgo medio de presentación de metadatos: la lectura del último evento selecciona `actorId`, propaga el propietario configurado al lector y solo admite evidencia emitida por ese propietario canónico todavía activo con rol `SUPER_ADMIN`. Además de coincidir con el evento, la cuenta debe reproducir íntegramente `approvedCodePermissions(role, extras, catálogo vivo)`, con una sola entrada `roles[]` equivalente al primario, perfil null, adopción vigente y todos los grants esperados. Un evento que coincida con grants parciales, extras ficticios o roles secundarios ilegales deja de ser evidencia válida; la cuenta se conserva sin reproponer por nombre.

Batería focal después del último cambio: **17/17 PASS** (`/tmp/area4-proposals-tests-focal.log`), incluidos autor incorrecto, CRM ficticio, grants incompletos y roles secundarios ilegales. Las fuentes quedan estables para el build/chequeo único del integrador; el último tsc global citado arriba precede a este endurecimiento focal. No se ejecutó build, Prisma Generate ni ninguna operación de BD. No se amplió el registro ni se inició la siguiente entrega de registro único.
