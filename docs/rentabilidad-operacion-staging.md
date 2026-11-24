# Rentabilidad · operación y revisión en staging

## Alcance

Módulo independiente en `/admin/rentabilidad`, solo para una cuenta activa cuyo rol principal vivo sea `SUPER_ADMIN`, sin «Actuar como». No modifica Conciliar, sus proyecciones ni las rutas anteriores de rentabilidad de Finanzas. No altera facturas, contratos GGCC, nóminas, cobros o pagos. Los costes de otras sociedades son exclusivamente analíticos.

## Fuentes y cálculo

La carga inicial usa contratos de Lorena, líneas del listado 299 y observaciones de coste. Mantiene localizador, procedencia y precisión decimal original. Reimportar conserva la clave exacta contrato/fecha/concepto/precio; se añaden versiones de maestros cuando hay cambios. La referencia aprobada y los costes Excel por fecha de factura son vistas separadas, nunca fuentes adicionales de coste real.

El ingreso real usa la fecha de servicio indicada por el listado. El coste se imputa por factura y reglas versionadas: ingreso, Mb o asignación directa inequívoca a contrato/cliente/sede. Las anualidades sin cobertura documental son estimadas; una regla de inicio en mes de factura necesita confirmación expresa. Las bimestrales requieren ambos meses acreditados. Las comisiones utilizan una fuente canónica por producto/mes y advierten solapamientos. El redondeo monetario solo se aplica al presentar agregados.

La vista contratada usa ingreso contractual y coste de proveedor firmado acreditado. No reemplaza costes contratados ausentes por el coste facturado. Personal desconocido o sin nómina válida, falta de factura, reparto ambiguo y estimaciones impiden presentar margen definitivo. Los costes reales parciales de producto se rotulan como subtotales conocidos.

## Seguridad y reversión

Única migración: `20261124_area3_rentabilidad`, cuatro tablas nuevas append-only. UPDATE, DELETE y TRUNCATE están bloqueados; escrituras con actor activo verificado y lock transaccional. El módulo comprueba tanto URL como identidad SQL de la base aislada y queda inoperante en producción. Ninguna credencial ni dato financiero privado forma parte de estos archivos.

Reabrir una excepción compensa la decisión mediante nuevas versiones, incluyendo el payload anterior completo de contrato/coste/regla. Si una versión posterior modifica un objetivo, la reapertura se deniega sin escrituras parciales para revisión. Las reglas nuevas se compensan como inactivas, no se borran. Se conserva auditoría, actor e idempotencia.

Vuelta atrás operativa: apagar `RENTABILIDAD_ENABLED` en el preview de staging y restaurar su despliegue anterior; las tablas y versiones se conservan. No hacer DROP ni borrar registros. Una futura retirada física requeriría exportación verificada y autorización específica. La migración no cambia el esquema financiero existente.

## Automatización preparada, no acreditada activa

El handler `/api/cron/rentabilidad-daily` exige Bearer, interruptor, base aislada y actor válido. Cada ejecución actualiza el mes corriente y anterior; el día 5 de Madrid guarda el cierre anterior. El cierre conserva real y contractual en una misma foto versionada, mantiene pendientes y permite una nueva versión cuando cambian entradas. Los avisos son solo en el panel.

**Vercel Cron no ejecuta previews:** el horario está preparado en configuración, no activo en staging. No se ha habilitado producción ni instalado un scheduler alternativo. La API avanzada de contratos ISP devuelve 403; no se reintenta ni se automatiza un login. El adaptador de exportación listado 299 es HTTPS, host exacto y token por entorno, sin redirecciones y con límites; falta un origen remoto acreditado. No se promete autonomía completa hasta resolver estos dos bloqueos. Lorena no debe mantener un Excel mensual.

Los costes externos proponen la última cuota como ESTIMADO, respetan baja y no generan nuevas propuestas desde enero de 2027. Esto no demuestra que el traspaso de proveedores a IO ya se haya realizado.

## Cómo revisar

1. Entrar en staging con una cuenta superadmin real y salir de cualquier suplantación. Abrir el enlace del módulo; el mes por defecto es el anterior.
2. Resumen: contrastar datos operativos y bloque claramente separado de referencia. Un guion no significa cero; amarillo no es coste real.
3. Producto y mes a mes: ordenar, filtrar real/contratado y comparar la base de servicio con la referencia inicial por fecha de factura.
4. Cliente: desplegar contratos y sus fuentes de coste. Revisar negativos y pendientes, no solo totales.
5. Contratado frente a real: desplegar proveedor, sede y líneas. Diferencias solo cuando hay enlace documental inequívoco; no aplicar una nota histórica sobre la ficha GGCC actual.
6. Alertas: decidir una excepción acreditada y, si procede, guardar regla persistente. Resueltas permite reapertura compensatoria; una revisión posterior bloquea una reversión insegura.
7. Reglas y costes: consultar versiones. Editar no convierte una estimación en factura real. Confirmar cobertura anual requiere haber contrastado el documento.
8. Estado: últimas ejecuciones reales, contadores, bloqueos, hashes y snapshots. GET lee fotos preparadas y historiales acotados, no recalcula ni relee todas las líneas.
9. Exportar cada tabla: XLSX con importes numéricos, filtro, cabecera congelada y protección frente a fórmulas en texto.
10. Recalcular o guardar cierre espera resultado del servidor y conserva versiones. Tras interrupción, consultar Estado antes de repetir. No se envían correos ni se confirma contabilidad.

## Validación

Ejecutar las pruebas propias `scripts/test-rentabilidad-backend.ts`, `scripts/test-rentabilidad-engine.ts`, `scripts/test-rentabilidad-report.ts` y `scripts/test-rentabilidad-automation.ts` con `node --import tsx`. La batería de áreas existente se verifica con `pnpm test:areas --local-only`; no es evidencia de publicación en producción. `pnpm build` es obligatorio antes de push. No se modifica el arnés de otras áreas para conseguir un verde.

La aprobación de producción no está implícita en estos resultados. Requiere OK escrito de Víctor y copia nueva con restauración verificada, además de resolver los límites económicos y de automatización documentados en la entrega privada.

La limitación de programación en previews está contrastada con la documentación oficial de Vercel, consultada el 24/11/2026: [puesta en marcha de Cron](https://vercel.com/docs/schedules/cron-jobs/quickstart) y [gestión y prueba manual de Cron](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs). No se ha promovido un despliegue a producción para eludirla.

La respuesta de pantalla conserva cada contrato íntegro dentro de su cliente; no repite los mismos contratos también en la raíz. La matriz mensual envía métricas y estados, mientras el detalle del producto seleccionado conserva sus fuentes. El snapshot almacenado sigue completo: esta compactación es solo de transporte para respetar los límites de respuesta de Vercel y no modifica cálculos, cobertura, hash económico ni evidencias.
