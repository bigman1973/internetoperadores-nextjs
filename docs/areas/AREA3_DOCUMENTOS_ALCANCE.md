# Área 3 — cambio de enfoque documental

**Decisión de Claude con Víctor: 30/10/2026, 12:13 (Madrid).** Esta decisión sustituye el objetivo previo de cerrar b/c/e/f como una sola tanda. No constituye una orden de publicación.

## Continúa

- **c — Rectificativas:** enlazadas inequívocamente a su factura original. Pendiente documental = importe original − suma de rectificativas válidas confirmadas; si ya hay pagos/cobros humanos confirmados, se restan también sin duplicarlos. Una propuesta o relación rechazada no reduce el pendiente. Confirmar, rechazar y deshacer requieren permiso efectivo, auditoría e idempotencia.
- **d — Duplicados por huella:** conservar el núcleo y adaptador existentes, sus garantías de contenido y revisión de conflictos. No borrar documentos, fusionar importes ni iniciar un desarrollo nuevo para el futuro buzón.

## Parado y conservado

- **f:** Graph delta, webhooks, despacho incremental y vigilancia de carpetas.
- **b:** detección de borrados en OneDrive y su recorrido de refresco asociado.
- Versiones nuevas causadas por **sustitución de archivos externos**.
- Otros nuevos desarrollos del sistema documental, incluido **e**, no se continúan en esta ronda: el mandato vigente permite sólo c y d existente. Los confirmings ya validados en producción no se modifican.

Referencia de conservación: **`9533809c8300bdfd1a382ba6557cd4176686804d`**, en el historial de `area3-documentos`. Sus fuentes, pruebas y migraciones existentes se conservan sin borrado ni reescritura de historial. Los interruptores de vigilancia permanecen apagados; no se registran nuevos webhooks ni se hacen llamadas a Graph.

Los identificadores de contenido y enlaces inmutables ya existentes que utiliza c pueden seguir leyéndose para acreditar la factura original. Eso no autoriza crear vigilancia, reaccionar a sustituciones ni desarrollar una nueva versión de ese mecanismo.

## Modelo de entrada única — todavía no iniciar

Víctor preparará el diseño: Lorena subirá documentos al buzón del panel, se guardará el original con huella, se leerá y validará, y se archivará después en OneDrive con nombre estándar. Es sólo una dirección acordada, **no un diseño ni autorización de implementación**. No crear buzón, subida, OCR nuevo, validación de entrada ni archivado/nomenclatura OneDrive antes de recibir el diseño cerrado.

## Publicación y otras áreas

No publicar b, f ni versiones por sustitución. **No hacer un merge indiscriminado de toda `area3-documentos` o del staging histórico a producción:** esas referencias contienen piezas conservadas ahora excluidas. Una futura tanda c/d debe aislar expresamente sus cambios y dependencias y superar las puertas de las áreas.

Cualquier publicación necesita validación y orden expresa de Claude, turno 13:00/19:00 Madrid, batería real, build, copia nueva restaurada y plan de vuelta atrás. Esta nota no levanta las seis diferencias de estado de la batería de staging.

`area4-usuarios-permisos` y `area1-crm` continúan con su alcance anterior y no se modifican por esta decisión. No cambiar producción ni sus sincronizaciones existentes, ni enviar correos o notificaciones.

## Recorrido puntual c/d autorizado el 30/10 a las 14:02

Sólo `area3-documentos` y la BD aislada de staging: recorrer las recibidas ya guardadas y crear únicamente enlaces `PROPOSED` cuando exista una referencia literal inequívoca a la original del mismo proveedor/CIF. Una semilla v1 de metadatos para la identidad histórica no contiene bytes ni acredita archivo privado; no genera sucesoras ni reacciona a sustituciones. El recorrido respeta las decisiones humanas previas y es idempotente. Lorena confirma, rechaza o devuelve a pendiente desde Conciliar, con su permiso efectivo y auditoría; el proceso nunca lo hace por ella.

Para duplicados se permite una lectura finita autenticada de los originales ya identificados por staging, exclusivamente para calcular SHA-256 de sus bytes. Se guarda en una tabla `area3_` independiente como metadato append-only; los archivos inaccesibles se cuentan, nunca reciben una huella ficticia. Los grupos por contenido se muestran como avisos, sin borrar ni fusionar. No hay enumeración de carpetas, nuevas importaciones, vigilancia, OCR, subida o archivado del futuro buzón.

Las herramientas `scripts/area3-propose-credit-notes.ts` y `scripts/area3-fingerprint-existing-documents.ts` son explícitas y manuales, sin cron. Su modo de aplicación está limitado por identidad de staging y opt-in. Antes de aplicar esta tanda se exige copia completa restaurada, ensayo SQL con rollback, conservación de las fuentes financieras, idempotencia, build y smoke real de Lorena en el preview.

**Límite de la tanda:** si Claude no la ha validado antes de las 18:30, no entra en la ventana de las 19:00 y queda para el siguiente turno a las 13:00. Esto no programa ni autoriza una publicación futura. Producción y sus sincronizaciones siguen intactas.
