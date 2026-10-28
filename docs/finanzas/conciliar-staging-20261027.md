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

- [ ] Revisión de Claude y aceptación de Lorena.
- [ ] OK explícito de Víctor para esta pantalla.
- [ ] Nueva copia completa de producción y restauración verificada.
- [ ] Ensayo del plan aditivo y conservación de datos sobre la copia nueva.
- [ ] Composición selectiva de código sin mezclar tareas no autorizadas.
- [ ] Recálculo con fuentes de producción; nunca copiar propuestas o confirmaciones de staging.
- [ ] Permisos mínimos, smoke y plan de vuelta atrás al despliegue anterior.

La vuelta atrás de staging consiste en retirar la entrada Conciliar y regresar al despliegue anterior. Las tablas nuevas pueden conservarse: no hace falta borrar negocio. Las confirmaciones de aceptación deben deshacerse con sus recibos antes de cerrar el ensayo. La copia privada completa no se adjunta a la entrega.
