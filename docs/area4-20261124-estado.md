# Área 4 · Estado comprobado · 24/11/2026

## No es una entrega READY
Trabajo exclusivo en `area4-usuarios-permisos`. No se ha escrito en producción ni staging, ni aplicado la migración ni cambiado usuarios. Objetivo 2 no iniciado. WEB INTERNET OPERADORES es la única tarea que integra staging.

## Referencias verificadas
La rama Área4 inicial era `3b4eed506d2d6741b058d098a3b6f40cece9c133`. Merge inicial de `origin/staging` `2b7adef`, con conflictos de sidebar-navigation, sidebar-access-evaluator y check-migrations. A las 19:09 CET `git ls-remote` muestra nuevo staging `840ebdd9f3fee9625d9c3c008616cba2b4686eea`; incorporar antes de push. Main no se modifica.

Proyecto Vercel `internetoperadores-nextjs`, ID `prj_ON4XbAFLifMywPe2jArLJYax2kKb`; equipo `team_2NvuPFVP8bTyaAeSj4Bs4Q8f`. Fuentes autorizadas: `vercel/filter_project_envs`, `get_project_env`, `get_project`, y GitHub CLI contra `github.com/bigman1973/internetoperadores-nextjs`. No guardar valores secretos en repositorio.

Consulta PostgreSQL de solo lectura 19:00 y 19:08 CET sobre BD y rol aislados `io_staging_finanzas`: no existen aún confirmar/exportar en permiso_usuarios, permisos_area4_vivos en usuarios_admin, ni auditoria_permisos_area4/configuracion_panel_area4. Foto mínima en `/tmp/area4-staging-user-snapshot.json` (privada, fuera de Git): 9 usuarios, 142 filas de grants; sin correos ni datos de clientes. Esta foto es STAGING, no producción.

Vercel trunca realmente la lista de variables a 100/141 y no se obtuvo el identificador productivo de DATABASE_URL. CLI oficial instalada temporalmente no tiene credenciales; no se inició login. Por tanto NO se ha verificado el estado actual de Iván y Tutorial Bot en PRODUCCIÓN. En la copia de staging están activos ambos (IDs 9 y 6). Consulta mínima solicitada a WEB INTERNET OPERADORES por mensaje, sin pedir cambios ni reenviar credenciales.

WEB INTERNET OPERADORES: tarea `IPQGwqQItUem8dIplGzXYS`, https://manus.im/app/IPQGwqQItUem8dIplGzXYS. Avisos entregados: retomada Área4/fronteras sin integración y solicitud de lectura productiva mínima. Su actividad actual Xfera/Rentabilidad sigue independiente.

## Cambios en curso y evidencia
Registro y menú conservan URLs, siete grupos e interruptor persistente. Rentabilidad/Subida de precios registradas. Sistemas y servicios, Presupuesto e Impuestos NO tienen página en el staging consultado; no se inventan páginas activas.

Nuevo borde del middleware aplica matriz adicional a páginas admin y todas APIs admin (incluida Finanzas) para cuentas adoptadas; owner-only desde el inicio. Excepción estricta ACL propia; plano de control Actuar como delegado a su propia guardia cerrada. Guardias SQL/Finanzas/alto riesgo se conservan, no se toca lib/prisma.ts. C/X adicionales por request-policy. Auditoría añadida de INTENTOS pre-handler, no de éxito completado.

Política con denegación hija explícita y permisos V/E/C/X; principal vivo en lib/permisos y admin-area-auth; no confiar en rol JWT; revocación hija persiste false; aplicar perfil limitado a rol privilegiado rechazado hasta transición humana. RoleContext falla cerrado ante error y expone V/E/C/X. Conteo de entrada al panel sólo admin.* (Portal propio no cuenta).

547 comprobaciones de middleware real con DB/sesión DOBLES sintéticos, sobre 106 páginas administrativas y 5 perfiles; verde. NO renderizan páginas ni son aceptación HTTP. Suites puras Área4, alto riesgo (33 rutas manifiesto, 70 checks Draxton, 4 Exagrid), contrato público y tres ligeras Conciliar verdes. Cuatro suites de actuación ligeras verdes. `test-area4-pages-http.ts` preparado: sin config privada de sesiones/fixtures autorizados devuelve salida 2 PENDING, no falso verde. No se han abierto páginas autenticadas con cada rol.

`tsc` global tiene errores de staging ajenos; el build de staging usa ignoreBuildErrors=true. Build en curso, log /tmp/area4-build.log, contra conexión staging con default_transaction_read_only=on y salidas externas OFF. No contar build verde como typecheck verde.

## Bloqueos que impiden pedir integración
Falta migración y catálogo compatibles en el entorno autorizado, sesión/fixtures y aceptación HTTP real; auditoría de confirmaciones/exportaciones COMPLETADAS dentro de las transacciones propietarias; mapa C/X completo en todas acciones/endpoints y botones; Proyectos Draxton (8 grants) usa API protegida como proyectos_singulares y dependencias Contratos/Empleados, sin permiso para ampliar esos ámbitos; transición append-only del perfil easy-only de Lorena no ejecutada; Rentabilidad actual solo superadmin y aprobación Subida solo superadmin frente plantilla Gerente amplia. Estas restricciones no se deben debilitar ni presentar como aprobadas. Foto de equivalencia productiva pendiente; historial de desarrollo pendiente de integración autorizada/Action, sin escribir en producción ni staging desde esta tarea.
