# Conciliar: confirming documentado y cuellos de botella

Fecha: 27/10/2026. Ámbito exclusivo: staging. Producción y `main` no modificadas.

## Confirming documental

Se han añadido y ensayado en una restauración local las tablas inmutables C11, su versionado, las guardas de suma documental y el motivo B4 `IVA_COMISION`. La copia completa de staging se restauró y comprobó antes de aplicar el esquema aditivo.

En staging se persistieron atómicamente 20 liquidaciones a partir de 26 soportes ya archivados: 14 BBVA y 6 Caixa PDF+XLS. No hubo descarga nueva, Graph, sincronización, creación de facturas recibidas, alteración de fuentes monetarias ni confirmación automática. Los avisos de cesión no son liquidaciones.

La evidencia conserva nominal por factura, intereses, comisión, IVA de comisión, neto, fechas y su procedencia, cuenta depositaria explícita y hashes documentales. Para BBVA las columnas desplazadas se validan contra el resumen; para Caixa prevalece el neto del PDF y el detalle XLS no se usa para inventar un IVA ausente. Las liquidaciones Caixa usan la cuenta depositaria Santander, no una cuenta del banco emisor por defecto.

Conciliar exige cuadre al céntimo, capacidad de factura y relación bancaria única en ambos sentidos. Cualquier diferencia o empate queda para revisión. Al confirmar se imputan las facturas por nominal completo y las tres deducciones como líneas separadas. Repetición y reversión conservan auditoría de actor real y efectivo.

Se han confirmado, repetido y deshecho desde la interfaz real de Lorena una liquidación de cada banco. Las verificaciones comprobaron nominales, tres deducciones, soporte vigente/revocado, reapertura de todas las facturas, auditoría y cierre de actuación. No queda retenido ningún cobro de esos ensayos. La API ajena de Facturas recibidas continuó bloqueada con 403.

## Refresco y permisos

Confirmar y Deshacer actualizan la proyección dentro de la misma transacción mediante un delta canónico de filas y dependencias afectadas. La respuesta contiene una vista que sólo se aplica si coincide con pestaña, búsqueda, página, corte e histórico del navegador. El delta no limpia invalidaciones ajenas ni sustituye la revalidación viva.

Los ensayos PostgreSQL locales de remesa, BBVA y Caixa comparan, tanto al confirmar como al deshacer, la proyección completa del delta con una reconstrucción canónica posterior. La vista del POST coincide con el GET y los recibos repetidos no duplican pagos. Todos los ensayos locales terminan con rollback.

La ACL inicial se resuelve en el render SSR actual y se entrega ligada al actor efectivo. Al cambiar de actor se remonta el contexto. Las APIs mantienen sus comprobaciones vivas; no hay caché compartida de permisos ni herencia de permisos del superadministrador durante la actuación.

## Causas verificadas de CPU

1. `easy-counterparty-db.ts`, `addCandidate`: por cada candidato se recorrían los anteriores y se recalculaba su SHA-256. El catálogo de búsqueda tenía un coste cuadrático de hashes. Ahora un `Set` creado dentro de esa lectura evita el recálculo. Se mantienen la primera candidata, orden, etiquetas, semillas y el serializador canónico histórico. No existe índice entre peticiones ni actores.
2. `easy-auto-core.ts`, `selectBilateralTransfers`: el texto del mismo movimiento se normalizaba dentro de cada pareja posible. Ahora se calcula la elegibilidad una vez por invocación, preservando duplicados, orden de origen y todos los criterios de importe, fecha, unicidad, titularidad y cadena de saldos.
3. `conciliar-confirming.ts`: un abono con evidencia C11 vigente no vuelve a ejecutar el matcher legado C9. Los abonos no cubiertos conservan sus diagnósticos anteriores.

Pruebas sintéticas ejecutan los helpers reales. Acreditan equivalencia completa de candidatos, huellas y controles, y que 2.000 inserciones de catálogo producen 2.000 hashes y 320 movimientos sólo requieren 320 normalizaciones. Se descartaron una reescritura SQL B7 y un serializador especial porque ya no eran necesarios para eliminar los costes dominantes.

## Mediciones y límites

Estas cifras son de la copia PostgreSQL local, no del navegador externo ni una acreditación del SLA:

| Flujo local final, con rollback | Confirmar | Deshacer |
|---|---:|---:|
| BBVA | 783,05 ms | 595,88 ms |
| Caixa | 660,52 ms | 464,15 ms |
| Remesa | 1.544,29 ms | 429,61 ms |

La última apertura externa anterior a este parche de CPU seguía por encima de dos segundos. Lorena: 4.922,52 / 2.539,63 / 3.483,92 ms hasta datos visibles, en tres contextos nuevos. Víctor: 3.235,27 / 2.952,46 / 2.499,57 ms. Se conservan todas las muestras; no se sustituyen por SSR, SQL o TTFB.

La mejora CPU no puede atribuirse a la apertura inicial: ésta sirve una proyección precalculada y no ejecuta esos núcleos. Las fases de red muestran conexión TCP/TLS, espera y transferencia/hidratación como componentes relevantes. El DNS de staging está verificado en Vercel, sin proxy detectado; Vercel indica `ipStatus=required-change` para su destino actual. La zona autoritativa es externa a Vercel. Este hallazgo no demuestra que un cambio DNS, por sí solo, garantice menos de dos segundos.

El build y los tipos del alcance del parche mínimo se verificaron; permanecen seis diagnósticos TypeScript conocidos en archivos ajenos, sin modificar. Las 43 baterías puras del alcance pasan. Antes de declarar cerrado el criterio de velocidad se requiere medir de nuevo el despliegue final en un navegador externo y separar POST Deshacer de restitución visual total.

## Paso a producción

No autorizado todavía. Sólo puede proponerse después de acreditar apertura y Deshacer inferiores a dos segundos, revisión de Claude y nuevo OK de Víctor. Entonces: nueva copia completa con restauración comprobada, migraciones únicamente aditivas, sin comunicaciones, sincronizaciones ni vínculos automáticos, prueba rápida y vuelta atrás coordinada de despliegue y datos.
