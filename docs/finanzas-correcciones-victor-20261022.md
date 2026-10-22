# Finanzas — correcciones de preproducción de Víctor

## Alcance exclusivo de staging

No se cambia main/producción, Azure ni la URI de Microsoft. No se envían correos o notificaciones y no se ejecutan sincronizaciones. La BD sigue siendo `io_staging_finanzas`, con usuario dedicado del mismo nombre.

### Confirming de Draxton

Las comunicaciones de la carpeta `3. Confirming Draxton 2026`, actuales o identificadas en el historial de ubicación B1, quedan fuera de facturas de compra, Por pagar, IVA soportado y fuentes económicas B4. Los registros y archivos originales no se borran. El metadato aditivo permite distinguirlos sin modificar importes.

En un abono de Conciliación puede revisarse el archivo, elegirlo y confirmar su asociación **sólo como soporte documental no monetario**. No genera una factura recibida, un vínculo económico, un importe cobrado ni un estado de factura. La asociación tiene versión, huella de fuente, auditoría, idempotencia y revocación motivada. Las referencias históricas que conservan item y ruta completa se resuelven únicamente en la biblioteca explícita verificada en B1, sin rellenar automáticamente filas.

### Nóminas y archivos del movimiento

Para un cargo abierto, `Empleado, NETO y mes` presenta nóminas existentes de Personal del mes bancario o anterior. El neto se lee como texto decimal exacto. El empleado y el período son visibles. Una persona selecciona una nómina o las varias que paga la transferencia y verifica el soporte; sólo se suma la selección explícita, sin buscar subconjuntos ni aplicar tolerancias. Una liquidación no sustituye al documento correspondiente al neto de la nómina.

`Preparar borrador B4` puede crear únicamente un wrapper de la nómina fuente; no concilia. La revisión y confirmación final siguen siendo acciones humanas B4 independientes. Ninguna lectura crea nóminas, wrappers o vínculos.

Todo nuevo cargo JUSTIFICADO exige dentro de la transacción un archivo controlado de la fuente o un soporte B5 completo del propio movimiento. Los cargos históricos sin archivo se conservan y se muestran como incidencia, sin repararlos ni vincularlos automáticamente. Nóminas, recibidas, tickets, modelos/cuotas AAPP y soportes B5/C9 se listan y descargan desde el drawer o `Movimientos → Archivos y justificantes`. Los IDs de biblioteca, URLs preautorizadas y datos internos no se exponen. La descarga revalida pertenencia y permisos vivos, limita el tamaño a 12 MiB y nunca acepta una URL del navegador.

### Bloques recuperados

Facturación mantiene los KPI B7 bancarios y añade Resumen mensual: facturación, número de facturas, V-Valley, Arrow, IPS Norte, porcentaje de mayoristas, remesado y número de remesas. Facturación por serie incluye filtro de mes. Son volúmenes documentales ISP, no cobros supuestos.

Facturas recibidas recupera la previsión documental de IVA soportado/repercutido e IRPF, por fecha de factura, incluidos abonos y retenciones. No es una declaración ni sustituye la revisión fiscal. Excluye confirming, copias y lecturas inválidas. Las facturas válidas con IVA no deducible mantienen su base e IRPF; sólo ese IVA no entra en soportado. Con un error de lectura no se presenta un cero ni un subtotal antiguo.

## Cómo probar staging

1. Pendientes → Por pagar y Facturas recibidas: buscar documentos de confirming; no deben aparecer como compras ni incrementar IVA soportado.
2. Conciliación → abono confirming: descargar y revisar el soporte, elegirlo y confirmar su asociación documental; comprobar que no se alteran KPI o líneas bancarias por esa acción. La prueba automatizada usa únicamente fixtures interceptadas.
3. Conciliación → cargo de nómina: buscar candidatas, verificar empleado/neto/mes y archivo, seleccionar una o varias, preparar y revisar. Ningún vínculo existe hasta confirmar B4.
4. Movimientos → Archivos y justificantes y drawer B4: descargar el archivo perteneciente al movimiento. Una fuente sin archivo no puede justificar un cargo nuevo.
5. Facturación: comprobar Resumen mensual y filtro de mes de series, manteniendo cobrado/pendiente bancarios. Facturas recibidas: seleccionar fechas y revisar previsión IVA/IRPF.

## Validación y publicación

La migración C9 es aditiva y se validó con rollback y snapshots de conservación antes de aplicarse exclusivamente a staging. Las pruebas puras, lecturas reales sin escritura, pruebas PostgreSQL rollback, build y validadores sintéticos se registran en el historial de desarrollo al cerrar el commit. Se desactiva expresamente el POST de conciliación automática heredada (no sólo el caso Draxton), así como la antigua sincronización confirming que creaba compras y cobros automáticos. No se presenta el login Azure como corregido.

## Puerta de producción y vuelta atrás

Se requiere el nuevo OK explícito de Víctor sobre el commit de estas correcciones. Después: copia completa consistente de la BD de producción, restauración real en una BD temporal aislada y comparación; revisión y prueba del SQL aditivo sobre la copia; migración de producción conservando datos; despliegue del SHA aprobado; prueba sin escrituras de login, Pendientes, Conciliación, Facturación, Facturas recibidas y Movimientos. No se ejecutan inicializadores de vínculos ni se trasladan datos de staging a producción.

Si falla una puerta previa, no se despliega. Si falla el smoke test, deshabilitar las nuevas mutaciones y volver al despliegue/commit previamente congelado, dejando las tablas y columnas aditivas. Restaurar la BD completa no es automático: requiere revisar operaciones posteriores, una nueva copia del estado actual y autorización explícita, ya que puede perder datos posteriores al snapshot.
