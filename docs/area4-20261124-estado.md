# Área 4 · Usuarios, permisos y menú · Informe de avance

**24/11/2026 · Objetivo 1 únicamente · NO READY / NO INTEGRAR.**

## Estado y referencia

Rama `area4-usuarios-permisos`, actualizada sobre el staging verificado `46bf9a611f54ecb1767fb35789dd089b56d43f47`, que incorpora CRM, Rentabilidad, Subida de precios y Sistemas y servicios. Conflictos resueltos. Los módulos propietarios de Subida/Sistemas, sus páginas/APIs y `lib/prisma.ts` permanecen idénticos a esa referencia; no se modifica la clasificación SQL de Área 3.

Esta tarea no ha escrito en staging remoto ni producción, no ha aplicado SQL ni cambiado usuarios, y no ha enviado emails, notificaciones o sincronizaciones ni tocado Azure. WEB INTERNET OPERADORES sigue siendo la única integradora. Peticiones e Historial —objetivo 2— no se han iniciado. Guardar el candidato en su rama no autoriza su integración.

El último `pnpm build`, posterior a incorporar Sistemas y todas las correcciones de código, terminó con código 0 a las 19:30 CET. Los builds previos también fueron verdes. Un build no acredita aceptación HTTP ni typecheck limpio: el repositorio usa `typescript.ignoreBuildErrors=true`.

## Foto y límites del informe de diferencias

Fuente: lectura transaccional autorizada de la **copia aislada de staging**, nueve cuentas de Usuarios Admin y 142 filas V/E, sin emails ni datos de clientes. No es una foto productiva ni un censo de todos los empleados. El snapshot privado no se incluye en Git. La integradora confirma los roles/actividad, pero tampoco dispone de conexión productiva.

En la lectura de staging aún faltaban C/X, el marcador `permisos_area4_vivos` y las tablas Área4. Esta tarea no ha aplicado la migración candidata. «Después» significa **destino aprobado y preparado**, no cambios de cuenta ya realizados. «Antes» describe rol/grants observados; sin sesiones autorizadas no acredita la carga de todas sus páginas y operaciones. No es una equivalencia productiva superada.

| Persona | Antes: observado en staging | Después aprobado/preparado | Diferencia y límite |
|---|---|---|---|
| Víctor | SUPER_ADMIN activo, sin perfil granular asignado | Único propietario SUPER_ADMIN, todo el panel y usuarios/permisos/auditoría | Su autoridad se conserva por principal vivo e ID canónico, no por email/rol secundario. Verificar su configuración productiva antes de publicar. |
| David | GERENTE activo y roles secundarios de negocio, sin perfil granular | GERENTE ajustable; negocio salvo Usuarios/permisos/auditoría/Actuar como | Retirada aprobada de administración de identidades. Rentabilidad/Sistemas y aprobación Subida mantienen las restricciones propias actuales, no resueltas por la plantilla amplia. |
| Jordi | VISOR activo, perfil «Gerente»; grants amplios, incluido `admin`/`admin.usuarios`, y negativas hijas | GERENTE ajustable, sin Usuarios/permisos/auditoría/Actuar como | Cambio de rol y retirada aprobados. La negativa hija prevalece: revisar qué filas históricas eran revocaciones deliberadas antes de aplicar la plantilla. Misma reserva de módulos que David. |
| Lorena | GERENTE activa y roles secundarios de negocio; campo de perfil granular vacío en esta foto | CONTABILIDAD completa + Clientes V, con subapartados + RRHH completo | Pierde los demás ámbitos no concedidos. Clientes solo consulta. Retirar «solo modo fácil» exige transición humana en su servicio append-only; no se ha ejecutado ni basta cambiar la etiqueta de rol. |
| Alejandro | VISOR activo, «Draxton Senior», ocho subáreas V/E | Las mismas ocho subáreas Draxton | V/E y enlaces conservados en plantilla. Proyectos y equivalencia C/X todavía NO acreditados; no ampliar Contratos/Empleados/Clientes para ocultar la dependencia. |
| Jesús | VISOR activo, «Draxton Senior», las mismas ocho subáreas V/E | Las mismas ocho subáreas Draxton | Mismo límite que Alejandro. Cuenta y grants originales sin cambios. |
| Patricia | VISOR activa, sin grants administrativos | Portal propio + Peticiones propias; sin panel administrativo | Perfil preparado. Propiedad/carga de los flujos nativos pendiente de sesión real; el borde `/admin` no los protege por extensión. |
| Iván | VISOR activo; Clientes V; Migración Adamo y Todos V/E; otras filas negativas | Cuenta inactiva, sin borrado | Baja no ejecutada. Estado productivo DESCONOCIDO. Acción aparte pendiente de identificar cuenta productiva y OK. |
| Tutorial Bot | SUPER_ADMIN activo, roles secundarios vacíos | Cuenta inactiva, historial conservado | Baja no ejecutada; estado productivo DESCONOCIDO. Un SUPER_ADMIN no canónico no obtiene autoridad en la política candidata. |

Los restantes empleados tienen como destino Portal propio + Peticiones propias. No se inventan identidades fuera de la foto de Usuarios Admin.

### Ocho subáreas técnicas

Todas comparten `admin.clientes.ggcc.draxton.`: `actualizaciones`, `contrato_guardias`, `informes`, `kpis`, `organigrama`, `personal`, `proyectos`, `seguimiento`. Alejandro y Jesús tienen V/E en las ocho filas observadas.

La base antigua no tiene C/X: su ausencia **no prueba** que antes no pudieran confirmar/exportar. La plantilla candidata desmarca C/X técnicas; si bloquea una operación que antes funcionaba, sería una pérdida no aprobada y deberá corregirse antes de READY. También quedan sin acreditar dependencias de Proyectos, negativas históricas de Jordi, restricciones de módulos frente a Gerente, propiedad del Portal y alcance del dashboard respecto de técnicos. No se da una matriz pura por prueba de equivalencia.

## Desarrollo local y registro

Siete grupos aprobados: Inicio, Comercial, Clientes y contratos, Finanzas, Personas, Operación y Administración. URLs conservadas. Interruptor persistente para volver al menú histórico, histórico predeterminado y activación primero para Víctor. No se ha activado en una BD compartida ni probado en pantalla. Un contenedor puede promover hijos autorizados, pero no concede datos ni enlace del padre.

Conciliar `/admin/finanzas/conciliar` y Para pedir `/admin/finanzas/para-pedir` tienen entrada propia en Finanzas, permiso vivo `admin.finanzas.conciliacion`. Modo fácil `/admin/finanzas/modo-facil` se conserva sin duplicación; Confirmados sigue como vista interna. Banda/salida de actuación conservadas.

Registro exhaustivo: **113 páginas y 295 APIs**, sin duplicados. Rentabilidad/Subida incluidas. Sistemas, recién incorporado, usa `/admin/sistemas` y cinco APIs `/api/admin/sistemas/{servicios,estado-vivo,costes,incidencias,tasas}`, entrada «Sistemas y servicios» en Administración, identificador de registro `admin.sistemas`. Su guardia real es exclusiva del propietario, sin actuación ni delegación granular. No se inserta un permiso en BD para delegarlo. Su módulo y migración `area9_sis_*` permanecen intactos y reservados, separados del futuro objetivo 2.

Impuestos y Presupuesto todavía no están implementados en staging ni tienen rutas/códigos finales confirmados. No se inventan páginas activas. Su dueña aportará esos contratos cuando existan.

Servidor: principal vivo para páginas `/admin` y APIs `/api/admin`; C/X son controles adicionales, no sustituyen guardias del módulo. Áreas exclusivas protegidas incluso antes de adopción. ACL propia tiene excepción exacta; control Actuar como conserva su guardia propia. Error de BD no autoriza: solo la ausencia exacta de la nueva columna permite compatibilidad pre-migración.

Revocar conserva negativa; negativa hija prevalece; Gerente admite ajustes. Perfil limitado incompatible con rol privilegiado se rechaza hasta transición humana. Cliente/SSR mantienen identidad efectiva y marcador de adopción: cero grants adoptados no resucitan roles, Gerente no salta denegaciones y los enlaces esperan una ACL verificada. Actuación efectiva no hereda al actor real.

Cuatro regresiones corregidas con pruebas: Content-Type no elude C; `confirmar_traspasos_propios_manual` exige C; REVIEW_PREVIEW cerrado de Conciliar requiere solo V; clon grande se rechaza sin esperar cancelación. Solo se inspeccionan los handlers JSON con selector registrados: Conciliar conserva 16 KiB, otros comandos tienen límite de 8 MiB; lotes/uploads sin selector conservan su handler. No basta un booleano de preview del cliente. El mapa C/X completo sigue pendiente de aceptación por operación.

## Auditoría: no confundir intento y éxito

Usuarios/permisos preparan auditoría append-only transaccional y lectura exclusiva de Víctor. El borde registra **CONFIRMACION_SOLICITADA / EXPORTACION_SOLICITADA** con actor real/efectivo antes del handler; si no registra, deniega.

Esto NO acredita operación completada. La confirmación/exportación efectiva debe registrar su resultado en la transacción propietaria o punto de éxito. Esa integración falta. Ningún evento candidato se ha escrito en la BD compartida desde esta tarea.

## Pruebas y límites

| Comprobación | Evidencia |
|---|---|
| `pnpm test:area4` ampliado | Verde: política, menú, registro, matriz, middleware, cliente y SSR. |
| Middleware real, sesión/BD sintéticas | **573 checks**, 107 páginas admin y cinco perfiles, más negativos. Un 200 significa despacho, NO página cargada. |
| Componentes cliente reales, SSR sintético | **21 checks**; ACL vacía/negativa, actuación, V/E/C/X y rutas. Sin navegador/HTTP. |
| Suite SSR existente | Verde: contenedor sin enlace padre, Gerente, actuación, Lorena, placeholder y firma. |
| Alto riesgo | Verde: 33 rutas, 70 checks Draxton y cuatro Exagrid, anónimo/revocación/identidad efectiva con dobles. |
| Contrato público | Verde, sin reenviar contratos. |
| Conciliar ligeras | Acceso, respuesta de acción y perfil de borde verdes; sin confirmar/deshacer operaciones reales. |
| Actuación/modo fácil | Compatible con las formas SQL de referencia, sin operaciones de BD. |
| Subida y Sistemas | 23 y 14 pruebas locales verdes, respectivamente. Módulos propietarios sin cambios Área4. |
| Migraciones | **57** revisadas lexicalmente, verde; SQL aplicado por esta tarea: NO. No es ensayo de migración. |
| Typecheck global | Último `tsc --noEmit --incremental false` devuelve 2; errores globales de staging. No se anuncia limpio. |
| Build | Último build posterior a Sistemas: código 0, 19:30 CET. DB aislada `default_transaction_read_only=on`, credenciales externas retiradas. |
| HTTP real de todas las páginas | **NO EJECUTADO**: exit2 `PENDING_AUTHORIZED_HTTP_FIXTURES`. Sin sesiones/fixtures privados autorizados. No se crean usuarios ni falsifican sesiones. |
| Pantalla/móvil400px | Pendiente; se conserva presentación corporativa, no se anuncia una prueba visual inexistente. |

El runner HTTP exige todos los perfiles y fixtures dinámicos antes de empezar, limita el origen al staging único y usa GET. Comprueba HTML/SSR y denegación, no interacciones de navegador ni flujos completos de las APIs que cada página usa. También deberán probarse dependencias/acciones reales, sin datos personales ni DML no autorizado. Las pruebas sintéticas no sustituyen esa aceptación.

## Qué impide integrar

Catálogo/migración compatibles en entorno autorizado; equivalencia efectiva por usuario y operación; Proyectos técnicos; transición humana de Lorena; restricciones de módulos frente a la matriz; auditoría de éxito; sesiones y fixtures para HTTP real y pantalla. No ampliar permisos raíz ni inventar sesiones para conseguir un verde. La foto productiva sigue sin disponibilidad.

WEB INTERNET OPERADORES ha recibido coordinación **NO READY / NO INTEGRAR**, nombres/rutas financieras y registro de Sistemas. Este informe no pide integrar ni publicar.

Bajas separadas: `area4-20261124-bajas-pendientes.md`, NO EJECUTADAS. Historial preparado: `area4-20261124-historial-pendiente.json`, **NO INSERTADO**. Esta rama no dispara el Action exclusivo de staging; solo la integradora escribe allí. Tras integración aprobada debe comprobar duplicados del Action y registrar lo que falte. TODO e historial de trabajo locales actualizados; no equivalen a una inserción en BD.
