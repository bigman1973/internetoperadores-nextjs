# Rentabilidad · operación y revisión en staging

## Alcance

Módulo independiente en `/admin/rentabilidad`, solo para una cuenta activa cuyo rol principal vivo sea `SUPER_ADMIN`, sin «Actuar como». No modifica Conciliar, sus proyecciones ni las rutas anteriores de rentabilidad de Finanzas. No altera facturas, contratos GGCC, nóminas, cobros o pagos. Los costes de otras sociedades son exclusivamente analíticos. No hay autorización para producción.

## Fuentes y cálculo

La carga inicial usa contratos de Lorena, líneas del listado 299 y observaciones de coste. Mantiene localizador, procedencia y precisión decimal original. Reimportar conserva la clave exacta contrato/fecha/concepto/precio; se añaden versiones de maestros cuando hay cambios. La referencia aprobada y los costes Excel por fecha de factura son vistas separadas, nunca fuentes adicionales de coste real.

El ingreso real usa el mes de servicio explícito cuando existe. Si la exportación solo aporta fecha de factura, queda identificado el fallback temporal y su falta de acreditación. El coste se imputa por factura y reglas versionadas: ingreso, Mb o asignación directa inequívoca a contrato/cliente/sede. Las anualidades sin cobertura documental son estimadas; una regla de inicio en mes de factura necesita confirmación expresa. Las bimestrales requieren ambos meses acreditados. Las comisiones utilizan una fuente canónica por producto/mes y advierten solapamientos. El redondeo monetario solo se aplica al presentar agregados.

La vista contratada usa ingreso contractual y coste de proveedor firmado acreditado. No reemplaza costes contratados ausentes por el coste facturado. Personal desconocido o sin nómina válida, falta de factura, reparto ambiguo y estimaciones impiden presentar margen definitivo. Los costes reales parciales de producto se rotulan como subtotales conocidos.

En «Contratado vs. real» se conserva un bloque separado de referencias históricas Draxton. Sus importes provienen de referencias importadas con localizadores, no de constantes del código. La nota narrativa de FTTO no sustituye la ficha GGCC vigente ni una oferta firmada. El agregado internacional no se asigna al mes seleccionado sin cobertura documental. Ninguna de estas referencias alimenta los costes, los KPI ni las alertas operativas.

## Seguridad y reversión

Única migración: `20261124_area3_rentabilidad`, cuatro tablas nuevas append-only. UPDATE, DELETE y TRUNCATE están bloqueados; escrituras con actor activo verificado y lock transaccional. El módulo comprueba tanto URL como identidad SQL de la base aislada y queda inoperante en producción. Ninguna credencial ni dato financiero privado forma parte de estos archivos.

Reabrir una excepción compensa la decisión mediante nuevas versiones, incluyendo el payload anterior completo de contrato/coste/regla. Si una versión posterior modifica un objetivo, la reapertura se deniega sin escrituras parciales para revisión. Las reglas nuevas se compensan como inactivas, no se borran. Se conserva auditoría, actor e idempotencia.

Vuelta atrás operativa: deshabilitar la programación de esta tarea con `manus-config schedule update --enabled=false`, apagar `RENTABILIDAD_ENABLED` exclusivamente en preview/staging y restaurar su despliegue anterior. Las tablas y versiones se conservan. No hacer DROP ni borrar registros. Una futura retirada física requeriría exportación verificada y autorización específica. La migración no cambia el esquema financiero existente.

## Programación externa de staging

Vercel Cron no ejecuta previews. Se ha registrado una única ScheduleTask de Manus para esta tarea, activa, con cron de seis campos `0 0 4 * * *`, zona `Europe/Madrid`: diaria a las 04:00 locales, adaptándose al horario de verano. Tiene adjunta la habilidad `automation-and-scheduling`. Su identificador es el `taskUid` confirmado por el servicio; no se inventa un UID independiente.

La tarea despierta el sandbox e invoca mediante `scripts/run-rentabilidad-staging-daily.cjs` solamente `https://staging.internetoperadores.com/api/cron/rentabilidad-daily`. El secreto independiente `RENTABILIDAD_STAGING_CRON_SECRET` está en variables de preview/staging y en un archivo privado de entorno fuera del repositorio; no se reutiliza ni cambia el `CRON_SECRET` global. El invocador exige target staging, no sigue redirecciones, limita tiempo y respuesta y solo imprime contadores/estados. Si falta el archivo privado, falla cerrado: no reconstruye credenciales.

El handler exige Bearer, interruptor, base aislada y actor válido. Cada ejecución registra `DAILY_START` y `DAILY_END`, comprueba las fuentes ISP autorizadas, propone costes externos estimados y recalcula el mes corriente y anterior con las facturas ya importadas y las alertas. El día 5 de Madrid guarda un cierre versionado del mes anterior, manteniendo pendientes. El registro habilitado no acredita una entrega futura, un SLA ni ejecución exactamente una vez; la repetición deriva fotos idempotentes cuando las entradas no cambian. Un fallo de fuente queda visible aunque las operaciones analíticas disponibles terminen.

El invocador devuelve exit 2 cuando la fuente ISP no termina completa; no lo confunde con una sincronización exitosa ni reintenta automáticamente. Los avisos son solo en el panel. No envía correos, no accede a Azure, no confirma contabilidad y no activa sincronizaciones financieras de producción.

## ISP: contrato implementado, disponibilidad limitada

El adaptador de contratos reutiliza exclusivamente las variables ISP existentes, nunca el fallback legacy. La API avanzada permanece bloqueada hasta una reacreditación expresa de acceso; no se automatiza el login. Solo permite `contratos_todos` GET con paginación acotada. El ID interno de ISP y el código contractual son identidades distintas: se necesita un mapeo acreditado existente, nunca se deduce el código del ID. Los campos ausentes no reactivan bajas ni sustituyen el proveedor inicial.

Para líneas hay un adaptador de exportación HTTPS explícita del listado 299, con host exacto, token por entorno, sin redirecciones y límites de tamaño/filas/columnas. No se inventa un endpoint no documentado ni se trata una cabecera de factura como detalle contractual. Falta un origen automático acreditado que aporte estas líneas. La carga CSV inicial se conserva; Lorena no debe preparar un Excel mensual. Se requiere que el origen ISP o un exportador autorizado suministre ese contrato de datos. La existencia del adaptador y del scheduler no resuelve por sí sola ese bloqueo.

La sincronización no vuelve a instalar productos, reglas, costes ni referencias iniciales. Cada fuente se registra por separado y el estado global queda parcial o bloqueado si falta la otra o faltan campos relevantes.

Los costes externos proponen la última cuota como ESTIMADO, respetan baja y no generan nuevas propuestas desde enero de 2027. Esto no demuestra que el traspaso de proveedores a IO ya se haya realizado.

## Cómo revisar

1. Entrar en staging con una cuenta superadmin real y salir de cualquier suplantación. Abrir `/admin/rentabilidad`; el mes por defecto es el anterior.
2. Resumen: contrastar datos operativos y bloque claramente separado de referencia. Un guion no significa cero; amarillo no es coste real.
3. Producto y mes a mes: ordenar, filtrar real/contratado y comparar la base de servicio con la referencia inicial por fecha de factura. La matriz anual permite revisar enero–octubre desde la foto de octubre; elegir otro mes sin snapshot preparado muestra esa ausencia.
4. Cliente: desplegar contratos y sus fuentes de coste. Revisar negativos y pendientes, no solo totales.
5. Contratado frente a real: desplegar proveedor, sede y líneas. Revisar el bloque histórico separado, sus localizadores y cobertura pendiente; no aplicarlo sobre la ficha GGCC actual.
6. Alertas: decidir una excepción acreditada y, si procede, guardar regla persistente. Resueltas permite reapertura compensatoria; una revisión posterior bloquea una reversión insegura.
7. Reglas y costes: consultar versiones. Editar no convierte una estimación en factura real. Confirmar cobertura anual requiere haber contrastado el documento.
8. Estado: configuración viva de programación y fuentes, últimas ejecuciones reales, contadores, bloqueos, hashes y snapshots. GET lee fotos preparadas e historiales acotados, no recalcula ni relee todas las líneas.
9. Exportar cada tabla: XLSX con importes numéricos, filtro, cabecera congelada y protección frente a fórmulas en texto.
10. Recalcular o guardar cierre espera resultado del servidor y conserva versiones. Tras interrupción, consultar Estado antes de repetir. No se envían correos ni se confirma contabilidad.

## Validación

Ejecutar `node --import tsx --test scripts/test-rentabilidad-*.ts`. Las regresiones del scheduler prueban el invocador sin red y la separación económica de referencias históricas. La batería de áreas existente se verifica con `pnpm test:areas --local-only`; no es evidencia de publicación en producción. `pnpm build` es obligatorio antes de cada push. No se modifica el arnés de otras áreas para conseguir un verde.

El informe privado distingue los controles iniciales, el contraste completo de enero–octubre y la ejecución posterior del endpoint desplegado. La aprobación de producción no está implícita en estos resultados: requiere OK escrito de Víctor y copia nueva con restauración verificada, además de resolver los límites económicos y de automatización documentados.

La limitación de programación en previews está contrastada con la documentación oficial de Vercel, consultada el 24/11/2026: [puesta en marcha de Cron](https://vercel.com/docs/schedules/cron-jobs/quickstart) y [gestión y prueba manual de Cron](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs). No se ha promovido un despliegue a producción para eludirla.

La respuesta de pantalla conserva cada contrato íntegro dentro de su cliente; no repite los mismos contratos también en la raíz. La matriz mensual envía métricas y estados, mientras el detalle del producto seleccionado conserva sus fuentes. El snapshot almacenado sigue completo: la compactación es solo de transporte y no modifica cálculos, cobertura, hash económico ni evidencias.
