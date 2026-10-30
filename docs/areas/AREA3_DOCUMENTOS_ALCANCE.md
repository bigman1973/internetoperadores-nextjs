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
