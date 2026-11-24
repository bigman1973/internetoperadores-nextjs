# Área 4 · Usuarios, permisos y menú · Informe de avance

**24/11/2026 · Objetivo 1 únicamente · NO READY / NO INTEGRAR.**

## Estado y referencia

Rama `area4-usuarios-permisos`, actualizada sobre staging `33ef7235164d0f9fd60e7f8efeabbca098606102`. Incorpora CRM y pipelines, Rentabilidad, Subida, Sistemas, Impuestos y Presupuesto. Conflicto del evaluador resuelto conservando ambos lados. Los módulos propietarios, páginas/APIs, cálculos, migraciones nuevas y `lib/prisma.ts` permanecen idénticos a staging; el diferencial Prisma solo añade los campos/modelos anteriores de Área4. No se modifica clasificación SQL de Área3.

Esta tarea no escribe en staging remoto ni producción, no aplica SQL ni cambia usuarios, y no envía emails, notificaciones o sincronizaciones ni toca Azure. WEB INTERNET OPERADORES es la única integradora. Objetivo2 —Peticiones/Historial— no iniciado. Guardar el candidato en su rama no autoriza integración. El SHA de entrega se comunica después del push verificado; no se confunde con la base staging.

El `pnpm build` final de esta actualización terminó con **código0 a las20:33:17CET**, posterior a todos los cierres de código. BD aislada io_staging_finanzas con default_transaction_read_only=on, credenciales externas retiradas y sin comando de migración. El repositorio usa `typescript.ignoreBuildErrors=true`: build no implica typecheck limpio ni aceptación HTTP.

## Foto y límites de las diferencias

Fuente conservada de esta jornada: lectura transaccional autorizada de la **copia aislada de staging**, nueve cuentas Usuarios Admin y142 filas V/E, sin emails ni datos de clientes. No se ha refrescado el snapshot en la tanda E. No es producción ni censo de todos los empleados; snapshot privado fuera de Git. La integradora confirma roles/actividad, pero tampoco dispone de conexión productiva.

En esa lectura faltaban C/X, `permisos_area4_vivos` y tablas Área4. No se ha aplicado la migración candidata. «Después» es **destino aprobado/preparado**, no cambios ejecutados. «Antes» describe rol/grants; sin sesiones autorizadas no acredita la carga de sus páginas/operaciones. No es equivalencia productiva superada.

| Persona | Antes: observado en staging | Después aprobado/preparado | Diferencia y límite |
|---|---|---|---|
| Víctor | SUPER_ADMIN activo, sin perfil granular | Único propietario SUPER_ADMIN, todo el panel y usuarios/permisos/auditoría | Principal vivo e ID canónico, no email/rol secundario. Configuración productiva pendiente de verificar. |
| David | GERENTE activo y roles secundarios de negocio, sin perfil granular | GERENTE ajustable; negocio salvo Usuarios/permisos/auditoría/Actuar como | Retirada aprobada de identidades. Rentabilidad/Sistemas y aprobaciones Subida/Presupuesto conservan límites propietarios. Impuestos/Presupuesto por rol real, sin actuación. |
| Jordi | VISOR activo, perfil «Gerente»; grants amplios incluidos admin/Usuarios y negativas hijas | GERENTE ajustable, sin Usuarios/permisos/auditoría/Actuar como | Cambio de rol/retirada aprobados. Revisar negativas históricas deliberadas antes de aplicar plantilla; no borrarlas por herencia. Mismas reservas que David. |
| Lorena | GERENTE activa y roles secundarios de negocio; perfil granular vacío en esta foto | CONTABILIDAD + Clientes V con subapartados + RRHH completo | Pierde otros ámbitos no concedidos. E introduce una reserva explícita: Impuestos solo V; Presupuesto no accesible a Contabilidad, aunque tenga finanzas V/E/C/X. Retirar «solo modo fácil» exige transición humana append-only; no ejecutada. |
| Alejandro | VISOR activo, «Draxton Senior», ocho subáreas V/E | Las mismas ocho subáreas Draxton | V/E y enlaces conservados en plantilla. Proyectos y equivalencia C/X NO acreditados; no ampliar raíces para esconder dependencias. |
| Jesús | VISOR activo, «Draxton Senior», las mismas ocho subáreas V/E | Las mismas ocho subáreas Draxton | Igual límite que Alejandro. Cuenta/grants originales sin cambios. |
| Patricia | VISOR activa, sin grants administrativos | Portal propio + Peticiones propias; sin panel administrativo | Perfil preparado. Propiedad/carga de flujos nativos pendiente de sesión real; el borde admin no los protege por extensión. |
| Iván | VISOR activo; Clientes V; Migración Adamo y Todos V/E; otras filas negativas | Cuenta inactiva, sin borrado | Baja NO ejecutada. Producción DESCONOCIDA; identificar cuenta productiva y obtener OK antes. |
| Tutorial Bot | SUPER_ADMIN activo, roles secundarios vacíos | Cuenta inactiva, historial conservado | Baja NO ejecutada; producción DESCONOCIDA. SUPER_ADMIN no canónico no obtiene autoridad candidata. |

Restantes empleados: Portal propio + Peticiones propias. No se inventan personas fuera de la foto Usuarios Admin.

Ocho subáreas bajo `admin.clientes.ggcc.draxton.`: actualizaciones, contrato_guardias, informes, kpis, organigrama, personal, proyectos, seguimiento. Todas V/E en la foto de Alejandro/Jesús. La ausencia antigua de C/X **no prueba** que no confirmaran/exportaran; desmarcarlas puede ser una pérdida no aprobada. Equivalencia por operación, dependencias de Proyectos, negativas de Jordi, propiedad Portal y alcance dashboard técnicos siguen pendientes.

## Menú y registro

Siete grupos aprobados: Inicio, Comercial, Clientes y contratos, Finanzas, Personas, Operación y Administración. URLs conservadas. Interruptor persistente, histórico predeterminado, activación primero Víctor; no activado en BD compartida ni probado en pantalla. Contenedores pueden promover hijos autorizados, nunca datos/enlace del padre.

Conciliar `/admin/finanzas/conciliar` y Para pedir `/admin/finanzas/para-pedir` propios en Finanzas, ACL viva `admin.finanzas.conciliacion`. Modo fácil heredado conservado sin duplicación; Confirmados vista interna. Banda/salida de actuación conservadas.

Registro exhaustivo actual: **116 páginas,307 APIs,423 superficies y79 secciones**, sin duplicados. Incluye la página y cinco APIs reales de CRM pipelines bajo `admin.crm`. Sistemas `/admin/sistemas` y cinco APIs `/api/admin/sistemas/{servicios,estado-vivo,costes,incidencias,tasas}` en Administración: propietario real, sin actuación/delegación granular; `admin.sistemas` identifica registro/guardia, no se inserta grant en BD. Prefijo propietario `area9_sis_*` reservado, separado del objetivo2.

E incorpora dos hijos Finanzas: `finanzas.impuestos` → `/admin/finanzas/impuestos`; `finanzas.presupuesto` → `/admin/finanzas/presupuesto`. Sus identificadores de registro `admin.finanzas.impuestos/presupuesto` **no crean códigos ni grants en BD**. Se reutiliza la primitiva pura propietaria `permisosFin` como límite adicional: Conta principal/secundaria solo V en Impuestos, no Presupuesto; Gerente opera pero no aprueba Presupuesto; aprobación del propietario real; sin actuación/simulación. Grant general Finanzas no delega a VISOR ni anula revocación personal. Guardias financieras vivas originales intactas.

## Seguridad y auditoría candidata

Principal vivo en páginas admin y APIs admin. V/E/C/X adicionales, no sustituyen guardias del módulo. Áreas exclusivas y restricciones E incluso antes de adopción; excepción ACL propia exacta; control Actuar como conserva ledger. Error BD falla cerrado: compatibilidad solo P2022 con tabla/columna canónicas exactas, no substring ni columna backup.

Negativa hija prevalece; revocar conserva false; roles/perfiles incompatibles se rechazan hasta transición humana. ACL adoptada vacía deniega también a Gerente. Cliente actualiza marcador al recibir una foto SSR nueva verificada y no lo rebaja por ausencia del dato. Actuación no hereda actor real; carga fallida no muestra enlaces sin verificar.

Se conservan cierres anteriores: Content-Type no elude C; parejas manuales exigen C; REVIEW_PREVIEW cerrado Conciliar solo V; rechazo de clon grande sin await cancel. Conciliar16KiB, otros comandos8MiB, solo inventario JSON; lotes/uploads ordinarios conservan handler. Mapa completo por operación pendiente de aceptación.

Usuarios/permisos preparan auditoría append-only transaccional exclusiva Víctor. El borde registra **CONFIRMACION_SOLICITADA / EXPORTACION_SOLICITADA**, antes del handler, actor real/efectivo; deniega si no registra. **NO acredita éxito de negocio**: integración transaccional de confirmación/exportación completadas sigue pendiente. Ninguna escritura candidata en BD compartida.

## Pruebas y límites de esta actualización

| Comprobación | Evidencia |
|---|---|
| pnpm test:area4 | Verde: política, menú, registro, matriz, middleware, cliente y SSR. |
| Middleware real con BD/sesión sintéticas | **639 checks**,110 páginas admin,cinco perfiles; incluye E, grants heredados, Conta secundaria, negativas, aprobación, actuación, ACL vacía y P2022 casi coincidente. 200 = despacho, NO página cargada. |
| Componentes cliente reales y hooks sintéticos | **56 checks**, SSR y rerender del marcador; sin navegador/HTTP. |
| SSR existente | Verde: contenedor sin enlace padre, Gerente, actuación, Lorena, placeholder y firma. |
| CRM pipelines / Impuestos-Presupuesto | **14/16 pruebas** propietarias ligeras verdes; no DML/sync. |
| Alto riesgo | 33 rutas,70 Draxton,4 Exagrid verdes con dobles. |
| Conciliar / actuación | Acceso, respuesta, perfil de borde y compatibilidad SQL verdes; no confirmación/deshacer real. |
| Subida / Sistemas | 23/14 pruebas ligeras verdes; módulos propietarios intactos. |
| Migraciones | **59**, revisión lexical verde, SQL aplicado por esta tarea:NO. Down E no ejecutado. No ensayo SQL. |
| Typecheck global | Pase final posterior al build,20:35CET, devuelve2 por errores globales de staging, incluidos Tickets/params. Sin diagnósticos en fuentes Área4 revisadas de esta tanda; NO afirmar typecheck global limpio. |
| Build | Código0,20:33:17CET. BD aislada read-only, credenciales externas retiradas, sin comando de migración. |
| HTTP real todas las páginas | **NO EJECUTADO**, exit2 PENDING_AUTHORIZED_HTTP_FIXTURES. No login ni sesiones falsas/usuarios de prueba creados. |
| Pantalla/móvil400px | Pendiente. No se anuncia prueba visual inexistente. |

Runner HTTP limitado al staging único, mismo origen incluso tras normalizar fixtures, GET y redirect manual; exige cinco perfiles con rol real/configurado y propietario canónico, sin actuación, y fixtures dinámicos antes de solicitar páginas. Comprueba HTML/SSR/denegación y APIs GET anónimas incluidas E; no navegador ni flujos completos. Roles/ACL de prueba y candidato deben estar preparados con autorización del integrador antes de ejecutarlo. Matriz/dobles NO sustituyen aceptación.

## Pendientes para integrar

Catálogo/migración en entorno autorizado; equivalencia por usuario/operación; Proyectos y C/X técnicos; transición humana Lorena; auditoría de éxito; restricciones de módulos frente a matriz; sesiones/fixtures para HTTP y pantalla400px. Producción no disponible; bajas separadas sin ejecutar. No ampliar raíces ni inventar sesiones para lograr verde.

Aviso a WEB INTERNET OPERADORES: **NO READY / NO INTEGRAR**, actualización de base y contratos, no petición de publicación. Historial `area4-20261124-historial-pendiente.json` preparado **NO INSERTADO**; rama propia no dispara Action exclusivo de staging. Solo integradora, tras integración aprobada, comprobará duplicados e insertará los desarrollos faltantes. TODO local actualizado no equivale a escritura BD.
