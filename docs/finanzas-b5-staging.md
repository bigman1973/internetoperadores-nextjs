# B5 · Bandeja Pendientes — staging

## Alcance

Sólo la copia `io_staging_finanzas`, con usuario homónimo y `FINANCE_STAGING_SANDBOX=1`. No cambia producción/main, no sincroniza fuentes externas y no envía correos ni notificaciones. El aviso de tickets es un banner dentro del portal.

Ruta: `/admin/finanzas/pendientes`. Cuatro vistas: cargos y cobros bancarios sin documento; facturas recibidas sin pago y emitidas sin cobro. Las dos vistas documentales calculan objetivo firmado menos líneas B4 activas, cuyo movimiento está JUSTIFICADO y cuya operación de creación sigue APLICADA. Se comprueba que el importe actual de la fuente coincide con el wrapper B4. Las copias, cuarentenas e identidades conflictivas B2 no se incorporan a los importes económicos.

La relación completa de remesas con facturas y devoluciones se incorpora en B6. B5 no prorratea un abono de remesa ni marca por sí misma sus facturas como cobradas. Una factura sin cuenta bancaria autoritativa no recibe una cuenta supuesta; el filtro por cuenta sólo se aplica a movimientos y contadores.

## Gestión humana y autoridad del banco

Responsable: ID de UsuarioAdmin activo elegido explícitamente. Estado editable: Pendiente, Pedido, Recibido. Vinculado y No requiere se proyectan exclusivamente desde B4 y no son escribibles por PATCH B5. Cada cambio incrementa versión y deja auditoría append-only en la misma transacción serializable. Una versión antigua o estado B4 ya cerrado devuelve conflicto; no cambia importes, relaciones ni estados legacy/ISP.

Los movimientos se agrupan por tercero conservado por el banco y se ordenan por importe. Las pistas de referencia no son emparejamientos; el motor B6 sólo propone. Conciliar abre el ID bancario exacto en B4, sin introducir líneas ni confirmar. No requiere exige un motivo cerrado, revisión y confirmación explícita por la API B4.

## Tarjetas y aviso al entrar

Catálogo cerrado: *9029 Víctor, *6440 David, *2390 y *8964 sin asignar. Los dos titulares se verificaron por la sesión corporativa activa y el correo corporativo único antes de registrar IDs explícitos en la tabla nueva. No se deducen usuarios durante GET. La inicialización es idempotente, staging-gated y no sobrescribe registros existentes. Una terminación dentro de una referencia de factura no identifica una tarjeta: se exige marca enmascarada o etiqueta literal de tarjeta.

El filtro se aplica en SQL antes de contar/paginar. El banner consulta sólo las tarjetas registradas a nombre del usuario autenticado con permiso financiero de lectura; no envía nada fuera de la aplicación.

## Documentos

Guardar un soporte no crea factura recibida, factura emitida, gasto ni vínculo bancario. La fecha e importe desconocidos pueden permanecer NULL: no se rellenan con el banco ni se convierten en cero. Se conserva el archivo, tercero, concepto y datos humanos conocidos como evidencia.

Crear un **nuevo ticket de gasto validado** requiere selección explícita de TICKET, fecha y coste positivo revisados y un movimiento bancario negativo. Sólo entonces crea Gasto aprobado y wrapper TICKET B4 con signo negativo. No vincula el banco automáticamente; el importe del ticket puede diferir del movimiento y exige posterior cierre explícito B4.

La subida admite un único PDF/JPEG/PNG no vacío de hasta 3 MiB, con firma y MIME coincidentes, dentro de un multipart leído por streaming de hasta 4 MiB. Exige Content-Length, confirmación humana, origen exacto y permisos activos de lectura/escritura. No ejecuta OCR.

Destino exclusivo: carpeta `STAGING_FINANZAS_NO_CONTABILIZAR` en el sitio/biblioteca fijados por B1. Nunca usa el circuito de tickets o facturas de producción. El nombre es UUID determinista por actor/solicitud/archivo; no sobrescribe ni renombra un archivo existente. No conserva enlaces downloadUrl preautorizados. Los enlaces webUrl se verifican contra el host del sitio SharePoint y requieren autenticación corporativa.

La clave idempotente se conserva en el formulario cuando se reintenta el mismo contenido. Repetir una solicitud completada devuelve su resultado sin otro gasto/subida. Si un PUT externo queda incierto o el archivo ya existe, se conserva la reserva y se pide revisión: no se afirma una recuperación sin prueba ni se crea un ajuste ficticio. Documentos permite leer adjuntos y reservas conservadas.

## Cobertura y porcentajes

Un corte B3 ausente se muestra como cobertura no verificable. Todas mantiene visible el histórico; Cubierta sólo muestra movimientos hasta el corte real. La cobertura no avanza desde B5.

El porcentaje representa importe de movimientos **JUSTIFICADO con documento** dividido por importe evaluable, excluyendo traspasos con evidencia explícita. No confunde NO_REQUIERE con una línea documental. Los importes se conservan en céntimos y el porcentaje en puntos básicos con aritmética entera; denominador vacío, importes no exactos o agregados no representables quedan no calculables/parciales, no 100 %. Es un porcentaje del extracto disponible, no una certificación de cierre mensual.

## Validación y prueba manual

- `prisma validate`, cliente generado, migración consolidada aditiva revisada y ejecutada primero dentro de BEGIN/ROLLBACK. Hashes y conteos de fuentes originales/B4 íntegros tras su aplicación aislada.
- Pruebas puras: `scripts/test-finance-b5-core.ts`, `test-finance-b5-upload.ts`, `test-finance-b5-cards.ts`.
- Lecturas reales privadas sin DML: `scripts/test-finance-b5-readonly.ts`; verifica las cuatro vistas con los parseadores UI, configuración, contadores y tarjetas.
- PostgreSQL: `B5_ROLLBACK_TEST=1 tsx scripts/test-finance-b5-postgres.ts`; todas las fixtures terminan en rollback obligatorio, sin llamadas a Graph.
- Build obligatorio y validación visual con APIs sintéticas y mutaciones interceptadas antes de navegar.

En staging, abrir Finanzas → Pendientes, seleccionar mes/vista, verificar corte, responsable y signo. Preparar seguimiento o un motivo No requiere antes de confirmar. Para documentos, utilizar primero un soporte de prueba: revisar fecha/importe conocidos y comprobar que el banco sigue sin vínculo. Ninguna prueba de desarrollo transmite documentos reales a SharePoint ni confirma operaciones bancarias reales.

## Reversión funcional

Desactivar la nueva navegación/banner o volver al código anterior conserva tablas y evidencias nuevas. No se borran fuentes, adjuntos, auditorías ni vínculos. Las conciliaciones se deshacen exclusivamente mediante la reversión auditada completa de B4.
