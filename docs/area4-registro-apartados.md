# Registro único de apartados · Área 4

## Estado de la implementación · 25/11/2026

El registro único está implementado en `lib/area4/section-registry.ts`: rutas/patrones, códigos reales, nombres, siete grupos, acciones V/E/C/X, contratos de solicitud y metadatos de presentación. De él se derivan ambos menús (histórico y agrupado), el menú fácil/técnico, `USERS_SECTIONS`, la matriz de Roles y las etiquetas/clasificación de acciones. El interruptor sigue siendo únicamente de presentación: cambiar al menú antiguo no concede acceso ni cambia las URL.

La referencia histórica permanece bloqueada en `4d03c9a3`: **439 superficies y 79 identidades**, con descriptores y hashes literales comprobados por pruebas. La base integrada posterior añade dos APIs reales M365: son nuevas, sin evidencia histórica, y aparecen pendientes en `crm.contactos`. Registrar una ruta dentro de un apartado antiguo no la abre por el permiso padre ni por el fallback Gerente.

La pantalla Usuarios muestra **«Apartados nuevos sin asignar»** y **«Asignar a roles»**. La asignación se persiste mediante una operación append-only en la auditoría existente; no necesita migración nueva, no adopta cuentas y no cambia permisos personales. El código de persistencia está implementado y probado con una BD en memoria; **esta entrega no ejecuta escrituras en la BD compartida ni acredita un POST HTTP real**. La integración y aceptación autenticada en el staging único corresponden a la integradora/Víctor.

## Procedimiento obligatorio para cada Área, incluidas 1 y 5

1. Antes de crear una página `/admin` o un handler `/api/admin`, comunicar a Área 4 y a la integradora: nombre visible, ruta exacta, grupo, código de permiso real (existente o nuevo), métodos, acciones, alcance sobre datos propios/ajenos y restricciones de propietario/actuación. Incluir rutas auxiliares, dinámicas, exportaciones, confirmaciones y GET con efectos o requisitos de edición.
2. Área 4 incorpora cada superficie real **exactamente una vez** en el registro común. Los otros propietarios solicitan el cambio; no duplican inventarios ni modifican por su cuenta menú, matriz o guardas comunes. Usar el patrón físico `[id]`, no identificadores de personas. No registrar rutas inexistentes ni inventar un código que ningún servidor comprueba.
3. Declarar `actions` por superficie y su contrato `request` cuando proceda. V = ver; E = editar; C = confirmar; X = exportar. La clasificación normal de mutaciones exige V+E, y los comandos de confirmación/exportación añaden C/X. Las excepciones de preview y los selectores JSON son contratos cerrados, no una confianza en lo que indique el cliente.
4. Si un método necesita acciones adicionales, declararlas en `request.requiredActions`. Caso real: `/api/admin/crm/contactos/[id]/m365/borrador` declara GET y HEAD con `['V', 'E']` porque su handler exige edición y genera un borrador; no se degrada a V por llamarse GET. No ejecutar este GET como una lectura inocua: puede llamar a OpenAI.
5. **Nunca copiar ni regenerar `baselineDescriptor`/`baselineIdentity` para una alta nueva o un cambio de contrato.** El descriptor incorpora identidad, ruta, tipo, acciones y contrato. Una etiqueta/grupo cosméticos no alteran derechos; un nuevo código, ruta, acción o contrato exige revisión. Los hashes históricos no se actualizan para hacer pasar una nueva funcionalidad como antigua.
6. Mantener en el servidor del módulo sesión viva, actividad, permiso, alcance de datos y sus restricciones propias. La frontera común no sustituye guardas financieras, de empleados, CRM, propietario ni actuación. Si Personal y Nóminas comparten autorización, coordinar la separación con su dueño: una etiqueta de menú no garantiza aislamiento.
7. Si se necesita catálogo de BD, preparar una migración **aditiva** con prefijo de Área y coordinarla con la integradora. No aplicar migraciones, adoptar cuentas, asignar roles, activar sincronizaciones o enviar comunicaciones como consecuencia de registrar o desplegar.
8. Ejecutar `pnpm test:area4:inventory`, `pnpm test:area4` y **`pnpm build` antes de cada push**. El build ejecuta obligatoriamente `prisma generate && pnpm test:area4:inventory && next build`. El inventario compara todas las páginas/APIs administrativas físicas y falla por ausentes, duplicadas o sobrantes. No omitirlo ni añadir una excepción para una ruta sin registrar.
9. Entregar SHA de rama propia, guía y evidencias a la integradora. Solo ella integra en staging; nada a producción desde una tarea de Área. Registrar el desarrollo en `desarrollo_historial` o entregar los registros preparados cuando la escritura compartida está reservada, indicando expresamente que no están insertados.

Las rutas de empleado/Peticiones inventariadas conservan sus guardas de identidad y datos propios. El nuevo gate solo amplía el cierre de superficies futuras; no convierte una sesión de empleado en administrativa ni añade consultas a las rutas históricas de ese flujo.

## Dos decisiones humanas separadas

### 1. Asignar un apartado a plantillas

Solo el propietario canónico vivo, sin «Actuar como», puede revisar y confirmar. El diálogo empieza con **los seis roles sin ninguna acción marcada**. Muestra rutas, acciones y diferencias; permite dejar expresamente todos sin acceso. Cambiar la selección invalida la revisión anterior. Una confirmación añade `SECCION_ROLES_ASIGNADOS`, con descriptor completo, roles, propietario y revisión del catálogo.

Se usa la API existente `/api/admin/usuarios/propuestas`; no se añade una ruta paralela:

- POST `{ action: 'preview-sections', drafts: [{ sectionKey, roles }] }` devuelve `{ proposal }` y no escribe.
- POST `{ action: 'assign-sections', drafts, revision, confirmed: true }` devuelve `{ ok: true, snapshot }`.
- `roles` exige exactamente `superadmin`, `gerente`, `contabilidad`, `comercial`, `draxton`, `empleado`; cada valor es una cadena V/E/C/X o `''`. E/C/X requieren V.

Preview usa RepeatableRead. Confirmar usa Serializable y compara propietario vivo, fecha/revisión, catálogo, evidencia histórica, última asignación y borrador. Si cambió algo, no se reintenta automáticamente: se revisa de nuevo. El lote y sus INSERT de auditoría son atómicos. Un último evento inválido o ajeno cierra el apartado; no resucita otro anterior. Guardar las seis selecciones vacías registra una revisión denegada, no deja el apartado como olvidado.

### 2. Aplicar un perfil a una persona

Asignar una plantilla **no concede acceso automáticamente a ninguna cuenta**. La propuesta personal se revisa y confirma por separado, mediante el flujo existente. Su auditoría captura la plantilla al aplicar y los consentimientos exactos de superficies; las auditorías personales antiguas no autorizan superficies nuevas. Después se intersectan actividad/adopción viva, conjunto completo de grants, descriptor/acción, consentimiento personal y asignación vigente de plantilla. Cambiar una ruta o contrato no hereda un consentimiento antiguo.

La única excepción al cierre es el propietario canónico real, nunca otro usuario con etiqueta SUPER_ADMIN ni una actuación/previsualización de rol. Las semillas cliente/SSR son presentación, no credenciales de API. Si cambia/revoca el consentimiento se invalida el menú aunque las filas ACL sigan iguales; las páginas nuevas exigen también su grant exacto.

## Interruptores de seguridad: no activados por esta entrega

`AREA4_STAGING_SECTION_ASSIGN=1` habilita únicamente la confirmación de plantillas; `AREA4_STAGING_USER_APPLY=1` es independiente y habilita únicamente la aplicación personal. Ambos están apagados/retirados en las pruebas y build de esta entrega. Cada operación exige además propietario real, origen HTTPS staging/preview autorizado, `FINANCE_STAGING_SANDBOX=1`, conexión aislada `io_staging_finanzas`, ausencia de flags read-only y entorno no productivo. Los controles generales Prisma/BD prevalecen. No activar variables ni modificar Vercel/BD sin orden de Víctor e integración coordinada.

## CRM/M365: decisión separada de este registro

Las dos APIs nuevas reales son `/api/admin/crm/contactos/[id]/actividades/[actividadId]/m365` (GET V; POST V+E) y `/api/admin/crm/contactos/[id]/m365/borrador` (GET/HEAD V+E). Se inventarían pero permanecen pendientes para personas sin consentimiento.

**Siguen cerrados en el sandbox los POST `/api/admin/crm/contactos/[id]/actividades` y `.../actividades/[actividadId]/m365`.** La evidencia anterior demostraba aislamiento de destinatarios, no ausencia de creación de eventos Graph. Víctor ha decidido la opción C, integrada por Área 1 en `64367a5fc9ce0220cf9da31374e40c9912810d98`: se bloquea esa creación en modo aislado salvo `M365_STAGING_CALENDARIO=1`, que activará Víctor durante su prueba. La apertura de esos POST se reevalúa separadamente sobre ese SHA y sus pruebas; este registro no contiene la excepción ni activa la variable. M365 está además incluido como segmento sensible durante «Actuar como», sin bloquear todo CRM ni alterar su acceso real.

No hay cuentas modificadas, migraciones aplicadas, comunicaciones, llamadas Graph/Azure/OpenAI ni publicación de producción en esta entrega. Las pruebas sintéticas no se presentan como aceptación HTTP o visual autenticada.
