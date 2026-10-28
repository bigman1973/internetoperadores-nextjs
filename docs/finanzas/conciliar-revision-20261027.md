# Conciliar · Estado verificado de la revisión

**Fecha:** 27/10/2026. **Entorno:** staging exclusivamente. **Estado:** validación funcional cerrada; apertura en frío aún NO aprobada. No se ha publicado ni modificado producción con esta revisión.

## Resumen

La pantalla sirve directamente la proyección precalculada en el HTML autorizado. No reconstruye al abrir y no repite el mismo GET después de hidratar. Historial y relación de facturas bancarias de intereses se cargan cuando se abren. El corte de Emitidas, el caso de proveedor discrepante señalado, Documento/Nota y los veinte casos variados como Lorena están comprobados. La comisión final baja de dos segundos en la muestra medida, pero la apertura completa aún no.

## 1. Velocidad: mediciones reales y límite pendiente

| Medición | Referencia | Resultado final | Conclusión |
|---|---:|---:|---|
| Apertura, tres contextos nuevos de navegador | 14,73 / 8,96 / 7,60 s | 7,18 / 4,44 / 3,66 s | No cumple <2 s |
| Confirmar comisión como Lorena | 9,34 s observados por Claude | 1,26 s en el ensayo final | Una muestra cumple; no garantiza todos los POST |
| Deshacer esa comisión | — | 1,49 s | Reversión comprobada |
| Retirada automática tras confirmar/replay | — | 1,06 s | Refresco comprobado |
| Restitución automática después de deshacer | — | 6,27 s | Funciona, pero no es instantánea |

**Método de apertura:** Chromium fuera de Next.js, por HTTPS público, con tres contextos nuevos y caché de navegador vacía. Se espera la primera fila visible y dos frames de pintura. Se conservan todas las muestras originales. Este método no reproduce el ordenador de Víctor ni garantiza un arranque frío de la función serverless. Los tiempos de confirmación proceden del ensayo por API con los permisos reales de Lorena; no son INP de campo ni equivalen al tiempo de pintura del aviso de la interfaz.

La función declara y acredita desde dentro la región **sfo1**. No se atribuye su región al campo de entrada de RuntimeLogs. En dos renders finales, el lector terminó a los 54 y 124 ms acumulados desde entrar en la página; el layout, a los 17 y 64 ms. Esos tiempos NO sustituyen la apertura completa: quedan costes de arranque, transporte y recursos del navegador cuya contribución individual no se demuestra con esta muestra.

La última optimización mantiene la comprobación viva dentro de la misma transacción de confirmar/deshacer, sólo en Conciliar de staging: bloquea sesión, actor y destino, verifica caducidad y flags en cada sentencia y no comparte permisos entre solicitudes. Fuera de ese perímetro continúa la revalidación anterior. Cuatro pruebas reales de concurrencia en PostgreSQL local comprueban los bloqueos y la denegación de una revocación previa a una nueva transacción.

## 2. Emitidas: corte y significado del saldo

Corte configurable de presentación, por defecto **01/01/2026**, validado como fecha de calendario. Las anteriores se muestran en un bloque plegado independiente, «Anteriores a la fecha de corte», y no cuentan en el resumen operativo.

Con el corte por defecto quedan **3.632 facturas y 1.144.192,34 € sin cobro confirmado**. El bloque anterior queda en **0 facturas / 0 €**: todas las emitidas actualmente importadas en este conjunto son de 2026. Por ello el corte no reduce el total actual. Se ha comprobado también un corte alternativo que sí separa las anteriores del resumen.

La cifra no acredita deuda real: mide ausencia de cobros confirmados en el panel, y aún hay cobros históricos pendientes de confirmar. No se usa el estado COBRADA/PENDIENTE de ISP Gestión; ISP sólo aporta las facturas. Remesas y confirming descuentan saldo únicamente mediante confirmaciones del panel.

## 3. Proveedor discrepante y columnas

El pago de BUTPO señalado ya aparece en **ámbar**, con candidata existente, motivo de discrepancia y sin Confirmar. La señal de proveedor aproximada sólo permite revisión; no convierte diferencias de número, importe o fecha en un verde. La comprobación final contra la proyección desplegada obtuvo HTTP 200 y verificó esas cuatro condiciones.

**Documento** muestra la referencia propuesta o «—». **Nota** explica qué falta o qué no coincide, en lenguaje llano y sin repetir el documento. El detalle completo se puede abrir también en móvil; las notas disponen de su texto completo y no se depende exclusivamente del texto cortado. Capturas anonimizadas de las cuatro pestañas y móvil revisadas; sin desbordamiento horizontal en la prueba móvil.

## 4. Confirming: extracción contrastada sin inferencias

Se reutilizaron **13 liquidaciones BBVA ya archivadas**, sin pedir exportaciones nuevas ni ejecutar sincronizaciones. Sus **39 líneas** coinciden con staging en nominal, intereses y comisión explícitos. Se conservan asimismo los netos globales del documento. La extracción de cabeceras/coordenadas y los fixtures sintéticos del parser evitan atribuir a una columna el valor de otra. Los avisos que no contienen intereses no los inventan.

En estas liquidaciones aparece además un «Import a deduir» explícito. No se convierte la diferencia entre cifras en intereses, comisión, IVA o residuo supuesto. El soporte y la posterior factura bancaria deben mantener el cuadre documental y no crear un cargo ficticio ni descontar dos veces el gasto.

**Límite del emparejamiento:** ninguno de los trece netos globales ni de sus líneas coincide exactamente con un abono de la instantánea contrastada del libro. El corpus documental está fechado entre el 16/01 y el 10/08/2026, dentro del libro que termina el 08/10/2026; no se atribuye la ausencia de cuadre simplemente a PDFs posteriores al corte. Esos casos siguen ámbar, no se han forzado vinculaciones ni verdes. Si Víctor identifica el abono o la composición correcta, se podrá contrastar con ese origen antes de proponer una confirmación.

El diagnóstico preciso de capacidad B4 es **53 saldos íntegros y 4 parciales**; rectifica el agregado preliminar de 0/57. Una capacidad íntegra por sí sola no demuestra que exista un abono bancario coincidente.

## 5. Veinte movimientos variados como Lorena

**20 movimientos distintos / 20 comprobaciones funcionales**: facturas de cobro, comisión, nómina, remesa, confirming, proveedores y traspaso. Seis verdes se confirmaron, se repitieron con la misma clave para probar idempotencia y se deshicieron; catorce casos no confirmables se revisaron sin forzar su confirmación. No son veinte confirmaciones ni veinte movimientos cerrados permanentemente.

El refresco retiró los verdes confirmados y los restituyó al deshacer. El resto de Finanzas respondió 403 bajo los permisos de Lorena. La actuación propia terminó. La comprobación de sólo lectura acredita ocho recibos del recorrido de veinte casos —incluyendo dos intentos anteriores recuperados— revertidos y ocho deshacer aplicados. La comisión final de rendimiento añade un noveno recibo propio, también revertido, con su deshacer aplicado y su sesión terminada. No quedan recuperaciones propias pendientes.

## 6. Validación y conservación

- **26 baterías puras de Conciliar** pasan; incluyen contrato de navegador, acceso, SQL bajo actuación, exactitud, proveedor discrepante, parser, serialización e idempotencia.
- **4 pruebas PostgreSQL locales** de bloqueos pasan; la base y el rol temporales se eliminaron. No conectaron a staging ni producción.
- **Build final aprobado** con el bloqueo exclusivo compartido con TypeScript.
- **Cero errores de tipos del alcance**. Permanecen seis errores ajenos en archivos contrastados intactos frente a la referencia; no se ocultan como una comprobación global de tipos limpia.
- Los commits y pushes de esta revisión son sólo de staging; main conserva su referencia inicial. Historial registrado idempotentemente.
- Sin correos, sincronizaciones nuevas, confirmaciones persistentes de nuestros ensayos ni cambios de importes o documentos para forzar un cuadre.

## 7. Cómo comprobarlo y qué falta

En staging, actuar como Lorena y abrir Conciliar. En Emitidas, verificar el corte y el bloque histórico. Buscar el caso discrepante señalado: ámbar, candidata y motivo, sin Confirmar. Comprobar Documento distinto de Nota y abrir el detalle en móvil. Confirmar únicamente un verde actual y usar Deshacer desde su recibo; el ensayo realizado ya quedó revertido. Los confirming sin cuadre continúan ámbar.

**No se marca listo:** falta acreditar apertura completa inferior a dos segundos, ampliar las muestras de confirmación y reducir la espera de restitución de la proyección. El emparejamiento de las liquidaciones sin abono coincidente requiere una correspondencia documental/bancaria real, no tolerancias inventadas. No hay autorización de producción.
