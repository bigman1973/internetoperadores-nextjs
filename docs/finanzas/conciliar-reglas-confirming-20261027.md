# Conciliar: confirming, Emitidas y velocidad

**27/10/2026 · Staging · Manus AI**

Se han leído los 43 archivos del directorio autorizado de SharePoint, incluidas las dos subcarpetas y los archivos sueltos. Hay **14 liquidaciones BBVA y 6 liquidaciones Caixa con sus 6 XLS de detalle**. Las 20 liquidaciones cuadran documentalmente al céntimo. Esto no significa que estén conciliadas o que se hayan cobrado sus facturas en el panel.

## Qué lee el importador

El proveedor general de sincronización de OneDrive ya recorre la carpeta de confirming de forma recursiva. Incluye sus subcarpetas, los archivos de la raíz y los XLS; sigue la paginación de Graph. Los guarda como catálogo de soportes de cliente: no ejecuta OCR de factura de proveedor, no crea un cargo bancario y no confirma cobros. Esta revisión comprobó su código, pero **no ejecutó la sincronización**.

La ruta histórica específica de confirming es distinta: su GET sólo enumera las dos subcarpetas predefinidas y no incluye los archivos sueltos. Su POST sigue bloqueado, porque el código antiguo auto-vinculaba y marcaba facturas como cobradas. No se ha reactivado.

Se ha añadido en staging una lectura de auditoría acotada a la carpeta autorizada, protegida por sesión, permisos vivos y guarda de staging. Se verificó el sitio, se descargaron los 43 archivos y se clasificaron por contenido. No se han importado, vinculado ni confirmado estas liquidaciones.

## Resultado del cuadre de 2026

**BBVA: 14 liquidaciones; 14 cuadran al céntimo; 0 descuadres documentales.** Se comprobaron tanto el resumen como las 44 líneas de facturas. Las columnas desplazadas se interpretan físicamente: nominal e interés no se intercambian por el nombre de la cabecera. Una liquidación inicialmente parecía incompleta porque dos números de factura estaban divididos en fragmentos de texto; se corrigió el extractor y la suma completa quedó acreditada. No era un descuadre del documento.

**Caixa: 6 liquidaciones PDF con 6 XLS asociados; las 6 cuadran al céntimo; 0 descuadres documentales.** Las 18 líneas del XLS suman el nominal del PDF. El PDF aporta intereses, comisión, IVA explícito, neto, fecha de liquidación y cuenta de abono. En las seis parejas, la diferencia entre neto XLS y neto PDF coincide con el IVA expresamente declarado; se verificó esa diferencia como control, pero no se utilizó para calcular ni rellenar el IVA.

Los **15 avisos de cesión** quedan excluidos de las liquidaciones. Los **2 PDF sueltos de mayo y junio son correos con listados de facturas**: sirven como soporte de composición, pero no declaran una liquidación bancaria con intereses, comisión, IVA y neto. No se convierten en liquidaciones por su nombre.

No hay una lista de liquidaciones con descuadre monetario: **ninguna de las 20 presenta un descuadre documental**. Sí existe la siguiente lista de revisión bancaria.

### Cuadre con el banco: no confundirlo con el cuadre del documento

Los 20 netos tienen una coincidencia única por importe en el libro bancario de staging, cuyo último movimiento es del 08/10/2026. La igualdad de importe por sí sola no acredita el vínculo.

En **8 casos —2 BBVA y 6 Caixa—** también coincide la cuenta documentada y la fecha es coherente. Las seis parejas Caixa tienen el detalle completo y sus fechas normalizadas. Son candidatas documentales/bancarias, no conciliaciones confirmadas ni una acreditación de que toda su capacidad de factura esté disponible.

En los **12 BBVA restantes**, el neto existe y coincide con un abono de BBVA de la misma fecha, pero el IBAN de la ficha bancaria no coincide con el declarado en las liquidaciones y no pasa el control de validación. Todas estas discrepancias se concentran en una ficha bancaria y una cuenta documentada. Los IBAN extraídos de los PDF sí pasan el control. El IBAN identifica la cuenta y sus dígitos de control permiten detectar errores de transcripción [1] [2]. No se ha cambiado la ficha ni se ha ignorado esta discrepancia.

Las liquidaciones BBVA afectadas son las del **17/02, 18/03 —dos liquidaciones—, 17/04, 20/05, 18/06, 07/07, 20/07, 24/07, 07/08, 10/08 y 04/09 de 2026**. Deben seguir en revisión hasta verificar la ficha contra el extracto o certificado de titularidad y autorizar su corrección. Las dos liquidaciones BBVA de enero no tienen este bloqueo: documentan abono en Santander. Por tanto, el banco emisor no debe imponerse como banco depositario.

### Lo que aún falta integrar

El parser conserva ya los tres conceptos explícitos, pero el núcleo persistido de confirmación todavía netea interés y comisión sin IVA. Es necesaria una ampliación aditiva y versionada del resumen documental y un motivo independiente de IVA de comisión. No se ha aplicado DDL ni backfill financiero en esta revisión.

La confirmación deberá cobrar las facturas por su nominal completo y registrar interés, comisión e IVA como componentes separados, sin distribuir artificialmente el IVA global entre facturas. La factura bancaria posterior deberá relacionarse con esa liquidación, sin inventar otro cargo ni duplicar el gasto. El diseño técnico está preparado; la mejora del parser no se presenta como una integración contable terminada.

## Por qué Emitidas sigue por encima de 1,1 M€

Las **3.632 facturas son de 2026**. Por eso, el corte 01/01/2026 no excluye ninguna: el bloque histórico anterior está vacío. Los **1.144.192,34 € significan saldo sin cobro confirmado en el modelo del panel**, no deuda real ni impago acreditado.

La proyección actual distingue:

- **2.383 facturas con propuesta verde:** 299.962,66 € pendientes de confirmación.
- **340 facturas con propuesta ámbar:** 257.274,35 € para revisión.
- **92 facturas de importe cero:** revisión sin saldo monetario.
- **817 facturas sin propuesta en esta proyección:** 586.955,33 €. Tampoco puede concluirse que sean impagadas.

En total, **2.723 facturas y 557.237,01 € ya tienen alguna propuesta**. Muchas proceden de remesas: 2.566 facturas y 274.484,13 € de saldo están dentro de propuestas de ese tipo. Una propuesta verde no equivale a un cobro confirmado.

La composición de remesas ya existe en 117 propuestas con detalle 1→N. El hueco es conectar esa composición con la asociación auditable de las facturas de la remesa y su confirmación bancaria. El lector de cobros exige correctamente ambas pruebas; no debe interpretar un JSON de propuesta como pago.

**Solución propuesta, no aplicada:** mostrar «Con propuesta para confirmar», «Para revisar» y «Sin propuesta», conservando el total como «sin cobro confirmado»; reutilizar la composición ya persistida para una vista previa de asociación y, después, una confirmación humana auditable y reversible. No pedir cartera nueva a ISP y no utilizar su estado de cobro. La propuesta se ha presentado a Víctor y queda pendiente de su aprobación.

## Velocidad: mejora medida y objetivo aún incumplido

Las tres aperturas externas como Lorena, en contextos Chromium nuevos y sin caché de navegador, pintaron datos en **3,912 / 3,919 / 3,791 segundos**. La medición se hace hasta la fila pintada, no hasta SQL o TTFB. No garantiza que la función serverless arranque fría ni reproduce exactamente el ordenador de Víctor. **Ninguna cumple menos de 2 segundos.**

Se añadió una restitución transaccional de una sola comisión. Sólo funciona con proyección limpia, recibo propio de una pata y clasificación viva de comisión; recalcula la fila y su hash. Los demás casos conservan la reconstrucción completa. No se cachean ni se relajan permisos o actuación.

Se ensayó una comisión nueva desde la interfaz de Lorena, no uno de los movimientos de las veinte pruebas anteriores:

- Clic en Confirmar hasta respuesta: **1,759 s**. Hasta retirada visual: **3,086 s**.
- Clic en Deshacer hasta respuesta: **1,427 s**.
- Desde respuesta de Deshacer hasta fila repuesta y pintada: **1,304 s**, frente a los 6,266 s medidos anteriormente.
- Desde clic en Deshacer hasta fila repuesta: **2,732 s**.

Por tanto, se ha reducido la espera de restitución, pero **no se declara una experiencia completa inferior a 2 segundos**. La confirmación visual y la apertura siguen fuera del objetivo. El recibo quedó deshecho, el replay fue idempotente, el hash de decisión cambió y la proyección quedó limpia. La reversión y el fin de la actuación se comprobaron posteriormente en una transacción de sólo lectura.

Un primer intento del guion no llegó a confirmar ningún movimiento porque comprobaba el selector antes de que la fila estuviera visible. Se conserva esa evidencia; su sesión quedó cerrada con auditoría. Una recuperación del inicio se cerró también. Ningún ensayo queda presentado como confirmación financiera permanente.

## Validación y siguiente decisión

Pasan las **31 baterías puras de Conciliar y confirming**, incluidos 17 casos en las dos baterías específicas del parser. El restaurador de fila pasó además una integración PostgreSQL local con datos sintéticos y rollback obligatorio; esa prueba no sustituye la prueba de interfaz. No hay errores de tipos en los archivos del alcance. El diagnóstico global conserva errores fuera del alcance; no se afirma que todo el repositorio esté libre de ellos.

La publicación se limita a staging. Main se comprobó intacta. El historial automático de los commits de staging terminó correctamente. No hubo correos, sincronizaciones, cambios Azure, APIs externas de IA, importación de liquidaciones ni nuevas confirmaciones de cobros.

Antes de completar el confirming hace falta autorizar y documentar la corrección de la ficha BBVA, ensayar el modelo aditivo de IVA y revalidar la capacidad de las facturas. Emitidas no se cambiará sin aprobar la propuesta anterior. **Conciliar no está lista para producción y no se solicita ni se presupone autorización para publicarla.**

## References

[1]: https://clientebancario.bde.es/pcb/es/blog/que-se-esconde-tras-los-numeros-de-tu-cuenta-corriente-.html "Banco de España: estructura del IBAN y dígitos de control"
[2]: https://www.swift.com/standards/data-standards/iban-international-bank-account-number "SWIFT: estándar y registro internacional de IBAN"
