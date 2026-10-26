# Conciliar · avance de staging

**Ámbito:** staging aislado. No hay autorización de producción para esta pantalla. La autorización anterior de rendimiento/asistente no se extiende a Conciliar.

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

Once baterías puras de Conciliar pasaron antes de la última integración: acceso, backend, contrato de navegador, confirming, tercero, intereses, refresco nativo, pendientes/abonos, plantillas SQL, traspasos y UI. También pasan las regresiones existentes de política y clasificador de actuación. No se presenta esta evidencia como aceptación humana.

La reconstrucción completa del resumen pasó con rollback y se guardó en staging: 6.126 filas; fuente de 3.640 facturas emitidas. No se crearon confirmaciones monetarias ni comunicaciones. Las cifras pueden diferir de producción porque se conservan las decisiones previas del staging.

**Antes:** mediana de 10,24 s en cinco lecturas autenticadas de Modo fácil. **Después:** pendiente de medición del despliegue de Conciliar. Estas mediciones son de laboratorio autenticado, no métricas de usuarios reales.

## Pendientes antes de declarar la revisión funcional lista

La pantalla todavía no se ha publicado ni aceptado en navegador sobre el nuevo despliegue. Deben verificarse Vercel READY, lectura inferior a dos segundos, las cuatro pestañas como Lorena, confirmación y deshacer, reintento idempotente, el caso de referencia contradictoria, PDF controlado, Para pedir y capturas anonimizadas. El ensayo automatizado de veinte movimientos no sustituye la prueba de diez minutos por Lorena.

La primera reconstrucción conservadora deja los confirmings en revisión por falta de cuadre documental, importes explícitos o saldo vigente. Se está contrastando si hay pagos de subconjuntos de las facturas de un mismo PDF; no se rebaja el criterio ni se deducen intereses para obtener verdes.

## Puerta de producción

- [ ] Revisión de Claude y aceptación de Lorena.
- [ ] OK explícito de Víctor para esta pantalla.
- [ ] Nueva copia completa de producción y restauración verificada.
- [ ] Ensayo del plan aditivo y conservación de datos sobre la copia nueva.
- [ ] Composición selectiva de código sin mezclar tareas no autorizadas.
- [ ] Recálculo con fuentes de producción; nunca copiar propuestas o confirmaciones de staging.
- [ ] Permisos mínimos, smoke y plan de vuelta atrás al despliegue anterior.

La vuelta atrás de staging consiste en retirar la entrada Conciliar y regresar al despliegue anterior. Las tablas nuevas pueden conservarse: no hace falta borrar negocio. Las confirmaciones de aceptación deben deshacerse con sus recibos antes de cerrar el ensayo. La copia privada completa no se adjunta a la entrega.
