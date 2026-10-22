# P2 — Sincronización financiera en segundo plano

## Funcionamiento

En Facturas recibidas, el panel OneDrive permite iniciar un trabajo persistente, consultar su estado, recuentos y porcentaje, y solicitar su cancelación. En Facturación, el mismo circuito se utiliza para ISP Gestión. Cerrar la página no borra el trabajo: la cola, inventario, checkpoints, contadores y confirmaciones de cada elemento se guardan en PostgreSQL.

El worker nativo Vercel llama a `/api/cron/finance-sync-worker` cada cinco minutos. Cada invocación reclama un trabajo mediante un lease y un token de fencing, procesa páginas y elementos dentro de un presupuesto temporal y libera el trabajo para una invocación posterior. No existe un temporizador de servidor, un proceso residente, un bucle HTTP autorrecursivo ni dependencia del navegador abierto. La solicitud manual encola; su comienzo puede tardar hasta la siguiente ejecución periódica.

La ejecución diaria se programa en `/api/cron/finance-sync-daily` a **01:00 UTC**: aproximadamente 03:00 en verano y 02:00 en invierno en España peninsular. Se registra un recibo diario por fecha UTC y fuente. Si ya hay un trabajo activo, no se crea otro concurrente de la misma fuente. El cron no manda correos ni avisos externos.

## Seguridad y semántica económica

- Nuevas rutas cerradas: GET/POST/PATCH `sync-jobs`; GET de los dos crons nuevos, con `CRON_SECRET` obligatorio.
- Sesión administrativa activa, permiso específico de cada fuente, same-origin, JSON con límite real y respuestas privadas sin caché. Los permisos se vuelven a comprobar dentro de las transacciones de escritura.
- `FINANCE_BACKGROUND_SYNC_ENABLED`, `FINANCE_ONEDRIVE_SYNC_ENABLED` y `FINANCE_ISP_SYNC_ENABLED` deben valer `1` para habilitar fuentes reales en producción. `FINANCE_SYNC_SYSTEM_ACTOR_ID` identifica una cuenta de auditoría activa, verificada como SUPER_ADMIN, para los trabajos diarios; el origen del trabajo permanece marcado `DAILY_UTC`, no como una aceptación humana.
- `FINANCE_EXTERNAL_ACTIONS_DISABLED=1` sigue bloqueando otras sincronizaciones, crons, comunicaciones y correos. Las excepciones son las rutas P2 exactas. `FINANCE_DEPLOYMENT_READ_ONLY=0` permite trabajo financiero manual normal; si se activa a `1`, detiene también estas rutas de ejecución.
- Staging exige la BD y usuario `io_staging_finanzas`. No construye proveedores Graph/ISP reales ni permite los crons. Sus pruebas usan fixtures controladas o proveedores inertes.
- ISP importa exclusivamente facturas emitidas desde `facturacion`. No importa ni actualiza estados de cobro, cobros, remesas, movimientos ni conciliaciones. Los KPI B7 continúan procediendo del banco y de confirmaciones B4/B6.
- OneDrive conserva la paginación y origen B1, calidad B2 y exclusión documental de confirming Draxton. Los archivos existentes sólo admiten cambios auditados de ubicación y metadatos permitidos; discrepancias financieras pasan a revisión, sin reescribir importes históricos. OCR fallido no genera una factura ficticia a cero.
- Registrar una referencia documental para una factura nueva no crea un vínculo bancario. No se habilita ningún mecanismo legacy de autoconciliación.
- Aplicación de dominio y confirmación del elemento son una sola transacción, protegida antes y después por el fencing token y reloj PostgreSQL. Los elementos confirmados no se repiten. Los reintentos, recuperaciones y fallos sin avance están acotados.
- Cancelar es cooperativo: conserva los elementos ya confirmados y sus auditorías; no empieza los siguientes. Una transacción que hubiera confirmado antes de la solicitud de cancelación no se deshace.

## Límites explícitos

El inventario debe completarse antes de empezar a aplicar elementos. Si ISP devuelve exactamente el límite conocido de 5.000 facturas, el trabajo no asume una paginación no demostrada: queda fallido para revisión tras los reintentos acotados. Ningún resultado truncado se presenta como sincronización completa.

La confirmación de una biblioteca histórica OneDrive debe proceder de la configuración de origen verificada B1; nunca de un campo enviado por el navegador. Fuentes desconocidas o ambiguas permanecen en revisión.

## Retorno

Si falla la publicación P2, volver al deployment P1 anterior. Las cuatro tablas P2 nuevas pueden conservarse: no afectan a la versión previa ni requieren borrar datos históricos. Mantener `FINANCE_EXTERNAL_ACTIONS_DISABLED=1` y desactivar los tres flags P2 en producción, redeplegando la versión anterior si fuese necesario. Los crons del deployment anterior no incluyen las rutas P2; cualquier llamada residual tampoco pasa los bloqueos de middleware.

No restaurar una BD antigua automáticamente para retirar esta función: antes se debe valorar la pérdida de cambios posteriores a la copia y utilizar el procedimiento de respaldo y restauración previamente verificado sólo con autorización para esa pérdida. Los datos originales se comparan por snapshots antes y después del DDL aditivo.

## Comprobaciones

Pruebas puras de servicio, proveedores y parsers; regresión dinámica del middleware; rollback SQL con conservación de las 156 tablas originales de staging; prueba PostgreSQL del repositorio real y continuidad entre invocaciones sin navegador; build Next.js; validación de interfaz con toda acción financiera interceptada. La publicación a producción requiere completar esas comprobaciones y verificar el deployment por su SHA.
