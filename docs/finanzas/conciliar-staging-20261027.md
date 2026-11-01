# Conciliar · avance de staging

**Ámbito:** staging aislado. No hay autorización de producción para esta pantalla. La autorización anterior de rendimiento/asistente no se extiende a Conciliar.

**Estado de cierre de esta tanda:** fases de reutilización, persistencia y pantalla implementadas. Validación parcial aprobada, pero NO se declara cumplida la aceptación completa ni preparado el paso a producción.

## Fase 1 · fuentes existentes reutilizadas

Se reutilizan las facturas emitidas importadas de ISP Gestión, la composición y los recibos de las remesas ya importadas de OneDrive, los documentos y líneas de confirming, las nóminas y sus documentos de Personal, las fichas y contratos del cliente, y los motores existentes de propuestas, confirmación monetaria, terceros, auditoría y deshacer. No se ha creado una importación nueva ni se han ejecutado OneDrive o ISP.

ISP no acredita ningún cobro: el pendiente se calcula con el importe de la factura y las asignaciones confirmadas del panel. Las propuestas no reducen el saldo. Las facturas presentes en ISP pero aún no preparadas como documentos conciliables también aparecen en la pestaña de emitidas.

Se han incorporado sólo las facturas nuevas faltantes en staging, conservando las confirmaciones anteriores. Además, se han indexado las 56 facturas distintas presentes en las líneas importadas de confirming como documentos conciliables; esta indexación no confirma movimientos.

## Fase 2 · persistencia y seguridad

Copia completa de staging con restauración local verificada. Dos migraciones aditivas de infraestructura: proyección/recibos y soporte documental de intereses. Ensayo local y aplicación comprobaron la conservación de las tablas de negocio.

La pantalla y sus acciones son exclusivas de staging. Lorena conserva el perfil limitado; la actuación usa sus permisos reales y registra al actor real. Los justificantes sólo se resuelven desde una fila o soporte financiero vigente y un localizador almacenado. No se admite una URL o un archivo de Personal arbitrario.

Confirmar un lote revalida los datos y guarda toda la operación de forma atómica. Deshacer revierte la confirmación y la identificación de tercero creada por esa decisión, sin sobrescribir identificaciones anteriores. Las propuestas cambiadas devuelven una explicación y no un éxito parcial. Los reintentos usan una clave idempotente.

## Fase 3 · pantalla y clasificación

Cuatro pestañas: Cobros sin factura, Facturas sin cobrar, Pagos sin factura y Facturas sin pagar. La vista reutiliza los saldos monetarios reales, incluye los abonos de proveedor y ofrece enlaces al movimiento que casa. Las facturas pendientes no se describen como documentos inexistentes ni reciben el botón Pedir.

Filas ordenadas por semáforo y por importe absoluto descendente; búsqueda única; exportación compatible con Excel; confirmación directa individual y de verdes seleccionados; actividad reciente; justificante lateral; Para pedir interno. Roboto servida por la aplicación, colores corporativos y diseño móvil/oscuro.

El verde de una factura exige cuadre al céntimo, referencia bancaria compatible y fecha documental no posterior. Nómina: empleado, mes y líquido actuales. Traspaso: se conserva además la prueba bilateral y de saldos ya aprobada; una simple pareja de igual importe no basta. Las deducciones de confirming se toman de importes expresamente almacenados, no de la diferencia bancaria.

## Fase 4 · comprobaciones completadas

Quince baterías puras de Conciliar pasan en el árbol actual, incluidas las regresiones nuevas de navegación, consulta SQL compuesta y alcance transaccional. Las once iniciales cubren: acceso, backend, contrato de navegador, confirming, tercero, intereses, refresco nativo, pendientes/abonos, plantillas SQL, traspasos y UI. También pasan las regresiones existentes de política y clasificador de actuación. No se presenta esta evidencia como aceptación humana.

La reconstrucción completa del resumen pasó con rollback y se guardó en staging: 6.126 filas; fuente de 3.640 facturas emitidas. No se crearon confirmaciones monetarias ni comunicaciones. Las cifras pueden diferir de producción porque se conservan las decisiones previas del staging.

**Antes:** mediana de 10,24 s en cinco lecturas autenticadas de Modo fácil. **Después (lector ligero, cinco muestras):** mediana de 0,93 s; muestras posteriores entre 0,61 y 1,00 s, pero primera lectura en frío de 4,23 s. El objetivo inferior a dos segundos NO queda acreditado en frío. Estas mediciones son de laboratorio autenticado, no métricas de usuarios reales.

## Pendientes antes de declarar la revisión funcional lista

La pantalla está publicada sólo en staging con Vercel READY. Se verificaron las cuatro pestañas como Lorena: 50 filas visibles en cada primera página, bloqueo del resto de Finanzas y móvil de 390 px sin desbordamiento horizontal. Las cinco capturas adjuntas se anonimizaron antes de guardar y se revisaron visualmente. Las cuatro respuestas HTTP reales también pasan el parser del navegador.

Una comisión se confirmó por API actuando realmente como Lorena en 9,34 s y se deshizo. La comprobación posterior en sólo lectura acredita un único recibo para su clave idempotente, un recibo de deshacer y la confirmación en estado revertido. No queda esa comisión confirmada por el ensayo. La salida de actuación del guion agotó su espera; se cerró exclusivamente su sesión huérfana con auditoría y guardias de sesión propia/recibo revertido. No se modificaron sesiones ajenas.

Continúan pendientes: apertura inferior a dos segundos en frío; aceptación de veinte movimientos variados en diez minutos con todos los tipos solicitados; comprobación funcional desplegada de PDF controlado, Para pedir, factura bancaria de intereses y el caso de referencia contradictoria. Las pruebas puras de esos controles no sustituyen la aceptación humana ni el ensayo desplegado. Las trazas de refresco señalaron reconstrucciones pendientes después de acciones: debe quedar comprobada la actualización automática antes del cierre.

Los confirmings siguen en revisión. Se descargaron dos PDFs reales ya importados mediante el visor existente de staging: el parser reconoce seis referencias pero no recupera de forma determinista los importes y las deducciones por columna. No se han inventado intereses ni aplicado un relleno basado en diferencias. Otro intento de visor respondió 200 sin PDF válido; no cuenta como justificante verificado. Los enlaces documentales de los candidatos actuales todavía no están acreditados para Lorena.

La alternativa conserva el importador y los PDFs existentes: completar la extracción o validar manualmente las líneas e intereses explícitos del documento antes de reconstruir las propuestas. No se debe pedir otra exportación de cartera ISP, inferir intereses desde el abono ni presentar como ausente un PDF que sí existe.

## Diagnóstico de aceptación

Una comisión exacta se confirmó por API como administrador en 6,36 s y se deshizo correctamente; su recibo figura como revertido. Los ensayos como Lorena detectaron búsqueda SQL compuesta inicialmente rechazada por la política de actuación, consultas globales dentro de helpers transaccionales y recursión de la auditoría por evaluación perezosa fuera de AsyncLocalStorage. La última causa se reprodujo con Prisma real y PostgreSQL local; se corrigió manteniendo FOR SHARE y auditoría transaccional. La siguiente prueba reveló dos alias SQL del agregador de terceros reutilizado incompatibles con la gramática revisada. Se corrigieron sin ampliar el guard: pasan 169 plantillas de la cadena completa y, después del despliegue, la comisión de Lorena devuelve 200 y queda revertida con su recibo. El problema original de esa comisión ya tiene evidencia desplegada, pero no acredita todos los métodos ni la salida y refresco automáticos del flujo completo.

## Puerta de producción

## Perfiles de batería y evidencia privada

La batería de releases usa dos perfiles estrictamente separados. `PROD_NEW_RESTORE` ejecuta un Golden nuevo contra una copia local nueva y fiel de producción, pero exige además una copia privada inmutable y fechada del Golden original con su SHA-256 sellado. El nuevo Golden sólo puede ser el derivado estructural exacto autorizado: C1 Arrow y P1 Xfera pasan a `ABSENT_CONFIRMED`; C4 sustituye el verde y el conteo congelados por la regla compuesta de preflight actual. Exige el recibo privado de restauración completa **y** el recibo del clon local que acredita hashes de origen, lectura verificada y cero escrituras remotas/financieras, además de un recibo de reconstrucción de la proyección por el commit candidato y una transacción `REPEATABLE READ`/`READ ONLY`. El recibo de reconstrucción usa `CONCILIAR_CANDIDATE_REBUILD_LOCAL_V1` y declara `candidateCommit`, `projectionRebuilt: true`, `localOnly: true`, `productionWrites: 0` y el `projectionRebuiltAt` ISO exacto de `estado_proyeccion_conciliar`; el lector rechaza una proyección con otro timestamp. No abre API, navegador ni una conexión a producción.

C4 admite sólo dos ramas confirmables: `VERDE` con composición exacta y preflight actual FI→ISP→remesa/B7 completo, o `ÁMBAR` con el motivo exacto `Falta enlazar N recibos.` cuando ese mismo preflight devuelve `missingReceiptCount = N > 0`. No usa un `allowedColors` general, no conserva un 167/179 hard-coded y no calcula N con importes, SQL de sustitución ni inferencias.

`STAGE` consume exclusivamente un derivado privado del nuevo Golden de producción. Sus ocho overrides autorizados son C1, P1, C2, C3, C7, C8, P7 y P31. C1/P1 siguen `PENDING_VISIBLE` en STAGE mientras sus fuentes estén pendientes: exigen B4 pendiente y exactamente una tarea bancaria visible en COBROS/PAGOS, sin afirmar color; los espejos de EMITIDAS no cuentan como tarea ni como duplicado. C2 y P31 pasan a ausencia confirmada; C3, C7, C8 y P7 mantienen `PENDING_VISIBLE`. Antes de abrir la API o la BD real de staging, el runner valida el manifest V2: hash de la copia inmutable original, derivado PROD C1/P1/C4, hash del STAGE, autorización Claude y el conjunto exacto de ocho overrides. No existe un noveno cambio implícito y STAGE nunca sustituye el Golden de producción.

`pnpm test:areas` no ejecuta la batería API de STAGE hasta que `PROD_NEW_RESTORE` ha pasado. Ambos perfiles se aportan mediante fichero privado de modo 0600 (la copia inmutable puede ser sólo lectura 0400). `PROD_NEW_RESTORE` usa exclusivamente un descriptor PostgreSQL local privado, restringido al puerto de la copia nueva; `STAGE` conserva su `envFile` privado y el gate real de API↔BD de staging, con su foto de API, `updatedAt` y proyección del mismo entorno. No existe valor local por defecto ni bypass de API. G1–G6 y G7 permanecen dentro de la batería activa; las pruebas lifecycle/documentales archivadas se conservan protegidas como archivo y no se simulan como cobertura activa.

- [ ] Revisión de Claude y aceptación de Lorena.
- [ ] OK explícito de Víctor para esta pantalla.
- [ ] Nueva copia completa de producción y restauración verificada.
- [ ] Ensayo del plan aditivo y conservación de datos sobre la copia nueva.
- [ ] Composición selectiva de código sin mezclar tareas no autorizadas.
- [ ] Recálculo con fuentes de producción; nunca copiar propuestas o confirmaciones de staging.
- [ ] Permisos mínimos, smoke y plan de vuelta atrás al despliegue anterior.

La vuelta atrás de staging consiste en retirar la entrada Conciliar y regresar al despliegue anterior. Las tablas nuevas pueden conservarse: no hace falta borrar negocio. Las confirmaciones de aceptación deben deshacerse con sus recibos antes de cerrar el ensayo. La copia privada completa no se adjunta a la entrega.
