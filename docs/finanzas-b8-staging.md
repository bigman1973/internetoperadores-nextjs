# B8 — Centros de coste y borrador A3 paralelo, sólo staging

## Alcance

Se corrige el apartado existente `/admin/finanzas/exportar-a3` y su misma API. Ya no se ofrece la descarga heredada que declaraba compatibilidad A3 sin revisión. La salida es un **borrador para prueba externa**, no un asiento presentado, un envío a gestoría ni una importación validada en A3. No se crea ni marca una exportación en BD.

`/admin/finanzas/centros-coste` contiene un catálogo explícito, inicialmente vacío: sólo un SUPER_ADMIN activo puede crear, editar o desactivar centros. No se crean centros a partir de categorías, proveedores ni grupos de Costes de operadora. La asignación a una línea documental requiere permiso financiero de escritura, una elección humana y evidencia B4 actualmente válida.

## Elección de centro dentro de B4

Cada línea DOCUMENTO puede conservar `centroCosteFinanzasId`, nullable. La selección vacía no inventa un centro y no bloquea una conciliación válida sin imputación analítica. Las líneas de diferencia no admiten centro.

Al confirmar se revisan los centros elegidos y la operación B4 económica; se aplican juntos dentro de la misma transacción serializable. B8 conserva un recibo independiente, con hash de metadatos y elección por línea. No cambia el hash, snapshot ni importe económicos B4. El replay de la misma clave y elecciones conserva la operación; cambiar elecciones con la misma clave provoca conflicto, incluso si sólo cambian los metadatos. Las confirmaciones sin centro dejan constancia explícita de no selección.

En líneas ya confirmadas se permite asignar o desasignar mediante PATCH explícito, con versión y clave idempotente propias. No cambia documento, importe, estado ni vínculo económico. Las fuentes cambiadas, operaciones revertidas, cierres bancarios inexactos y centros desactivados no son asignables. Cada cambio deja auditoría append-only. Deshacer B4 anula el vínculo completo pero conserva recibo, centro e historial; la línea anulada deja de sumar en la analítica.

La lectura B4 devuelve la identidad y etiqueta reales del centro confirmado. La analítica muestra **importe documental confirmado por centro**, firmado y en EUR: no es caja, rentabilidad ni un reparto automático de costes. No aplica `abs`, tolerancias o prorrateos. Las fuentes desconocidas se excluyen con un hueco de evidencia, no con un cero ficticio. Los lectores utilizan comprobaciones B4 por lotes dentro de su mismo snapshot; las mutaciones conservan los bloqueos y validación individual de fuente.

## Revisión A3

El usuario elige mes, fuente y perfil actual a revisar o configuración manual. Ningún perfil aparece aceptado por defecto; no se presenta un código como contablemente aprobado. La cuenta de retención de proveedor, contrapartidas de gastos y banco, identidad humana de contraparte y fecha de nómina desconocidas deben revisarse explícitamente.

Las fuentes se leen con paginación completa y límite por origen. No se presenta una lectura truncada como completa. Las copias/quarentena B2 quedan excluidas y señaladas. Se preservan céntimos y signos exactos, abonos, tipos de IVA desglosados y retenciones con identidad contable separada. La fecha de contabilización bancaria es la de operación; no se reutiliza la de importación. Un traspaso sin evidencia de sus dos patas no genera un asiento supuesto. Los importes de banco B4 requieren cierre y operación actuales.

La previsualización contiene incidencias bloqueantes/de revisión, cuenta Debe/Haber y páginas de fuentes y líneas. La descarga requiere permiso de escritura del área Exportar A3, una segunda confirmación y coincidencia del hash de datos y configuración releídos. No se permite descargar si hay incidencias bloqueantes, si cambió la fuente o si se editó el formulario desde la revisión. Las respuestas malformadas y errores no habilitan descargas ni ceros. Las fórmulas en documento/concepto CSV se neutralizan; la aceptación del fichero corresponde a una prueba externa en A3.

## Migración y seguridad

La migración B8 añade dos metadatos a vínculos B4 y crea catálogo, auditorías y recibos con FK RESTRICT. No borra ni cambia importes, fuentes o relaciones antiguas. Se validó primero en BEGIN/ROLLBACK y luego se aplicó exclusivamente en la BD aislada, comprobando los hashes canónicos de los registros originales y B4–B7.

Las rutas exigen actor activo y permiso actual, guardas de staging, origen idéntico para mutaciones y lectura real de JSON con límite 64 KiB. Los GET y la revisión/descarga A3 no escriben. Sólo se amplían en middleware los POST/PATCH exactos B8. Cron, sincronizaciones no autorizadas y comunicaciones siguen bloqueados. Los datos de producción y main no forman parte de este bloque.

## Pruebas y cómo revisar staging

Se ejecutan los tests puros B8 de centro, recibos, selector, acoplamiento y A3; la regresión B4; y la prueba PostgreSQL B8 de ocho casos en una única transacción serializable con rollback exterior. Comprueba centro activo, VISOR rechazado, asignación atómica, replay/colisión, no seleccionado, NO_REQUIERE, versión conflictiva, fuente cambiada y conservación al deshacer. Se emulan commits mediante validación de constraints entre fases. No queda ningún usuario, cuenta, factura o vínculo sintético persistido.

`scripts/test-finance-b8-readonly.ts` prueba catálogo, líneas, analítica y A3 con configuración sin seleccionar; compara hashes y recuentos de doce tablas antes/después. El runner adapta sólo el marcador de bundling `server-only` al cargar el lector real fuera de Next. No sustituye ningún lector ni verificador de producción.

En staging: abrir **Finanzas → Centros de coste** para revisar catálogo/analítica; en **Conciliación**, añadir un documento, elegir opcionalmente un centro y revisar el cierre antes de confirmar. Para una línea existente, la asignación posterior tiene una confirmación separada. No realizar estas acciones sobre datos reales para probar por curiosidad.

En **Finanzas → Exportar a A3**, elegir mes/fuente/configuración, generar vista previa y revisar incidencias. El archivo será un borrador para pruebas; no debe importarse en una contabilidad real sin la validación correspondiente. La prueba visual automatizada usa exclusivamente datos sintéticos y APIs interceptadas, en escritorio y móvil; no crea centros, asignaciones ni exportaciones reales.

La publicación requiere build correcto, commit convencional exclusivo de staging, preview READY, validación visual y registro idempotente del desarrollo en el historial aislado. No hay promoción a main ni autorización implícita para producción.
