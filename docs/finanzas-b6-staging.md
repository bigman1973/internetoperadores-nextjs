# B6 — propuestas únicas y remesas explícitas (staging)

El motor B6 sólo propone. No crea vínculos, no marca cobros/pagos y no usa tolerancias. Desde Finanzas → Conciliación, «Buscar propuesta» ejecuta una lectura GET del movimiento SIN_DOCUMENTO abierto. Una propuesta exacta puede preparar un borrador local B4; después sigue siendo obligatorio revisar y confirmar expresamente en B4, que bloquea y revalida fuente, versión, cierre y capacidad.

La prioridad de referencia literal no elimina la comprobación de tercero, importe firmado, fecha y capacidad. Sin referencia se exige una candidata única con importe, tercero y fecha exactos. Los grupos no se completan por similitud. Confirming conserva sus facturas DRAX y una diferencia de intereses únicamente cuando hay evidencia explícita; un desfase no se transforma en comisión/intereses/redondeo inventados. Los traspasos pareados siguen requiriendo revisión, nunca «No requiere» automático.

## Remesas

El apartado Remesas existente consume ahora la relación aditiva `Factura.remesaId`. Seleccionar una remesa sólo lee la membresía ya existente. El usuario elige facturas adicionales, revisa el cierre firmado y confirma. Se comprueban la huella completa de remesa (ID externo, fecha y total) y la huella de las facturas. No se pueden omitir miembros previos ni reasignarlos a otra remesa. La selección no interpreta el estado de cobro ISP ni modifica sus fechas, importes o estados.

La búsqueda paginada admite todo el catálogo, no sólo las primeras 2.000 facturas. La captura de miembros se lee independientemente del catálogo general; no es necesario descargar todas las candidatas para confirmar dos facturas. Los documentos sin fuente válida permanecen visibles pero no se pueden asociar.

Una devolución se atribuye explícitamente a una factura ya miembro de la remesa. Debe corresponder a una línea REMESA negativa B4 completa, vigente y con una única línea documental. La suma de las líneas actuales debe cerrar exactamente el banco; las diferencias explícitas se mantienen separadas. No se prorratea una devolución entre varias facturas. La capacidad individual se controla en céntimos y cada vínculo sólo puede atribuirse una vez. Deshacer B4 conserva el hecho y la auditoría B6, pero la atribución deja de contar mientras su evidencia esté revertida.

## Seguridad y conservación

Sólo BD/rol `io_staging_finanzas` con `FINANCE_STAGING_SANDBOX=1`. Lectura privada sin caché, permisos activos de Conciliación, origen verificado y JSON limitado en las mutaciones. Transacciones SERIALIZABLE, autorización viva, bloqueo, idempotencia por actor/clave, conflicto si se reutiliza la clave con otro payload y auditorías append-only. Se rechaza la financiación directa/remesa mezclada sin reparto documental verificable.

La migración añade una FK nullable y nuevas tablas/enums/índices con RESTRICT. Su prueba y aplicación comprobaron hashes canónicos de las tablas originales y B4/B5; no se modificaron registros existentes. No se inicializó automáticamente ninguna membresía ni devolución nueva.

## Cómo probar

1. En Conciliación, abrir un movimiento sin documento y pulsar «Buscar propuesta»: sólo lectura. «Preparar borrador B4» no guarda nada; comprobar líneas y cierre antes de la confirmación B4.
2. En Remesas, seleccionar una remesa, buscar y elegir facturas, revisar su suma y la huella antes de confirmar. Una fuente cambiada o una membresía incompleta debe devolver conflicto, no éxito.
3. Tras una devolución B4 confirmada, elegir una factura miembro y revisar principal/banco por separado. La atribución no crea otro vínculo. Deshacer B4 conserva la auditoría y retira su efecto vigente.
4. Las pruebas visuales usan fixtures y bloquean todas las mutaciones reales. Las pruebas PostgreSQL crean fixtures exclusivamente dentro de una transacción que termina en rollback.

## Comprobaciones ejecutadas

- Núcleo puro de propuestas, parser de propuesta B6 y parser de remesas/miembros/devoluciones.
- Servicio y guardas PostgreSQL: 14 invariantes con rollback íntegro, incluida comisión separada, sobrecapacidad, idempotencia, financiación mixta, auditoría inmutable y reversión B4.
- Cuatro recursos reales y parsers de UI; catálogo posterior a 2.000; sin escrituras.
- `prisma validate`, diff aditivo, rollback y conservación de hashes; build y validación visual de la versión publicada se registran al cerrar la entrega.

Sin push a main/producción, sin sincronizaciones externas, sin correos ni notificaciones reales. B7 consumirá esta evidencia para calcular cobro/pendiente documental; la asociación de membresía por sí sola no acredita cobro.
