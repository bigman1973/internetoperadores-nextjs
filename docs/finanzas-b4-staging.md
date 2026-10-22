# B4 — Conciliación bancaria v2 (guía de staging)

> Esta guía describe la UI entregada para **staging**. No presupone que la ruta, el esquema o la migración estén publicados ni que la base de datos financiera aislada esté verificada.

## Alcance de la interfaz

La pantalla está en `/admin/finanzas/conciliacion-v2` y utiliza exclusivamente:

- `GET /api/admin/finanzas/conciliacion-v2` para listas, filtros, paginación, búsqueda y detalle.
- `POST /api/admin/finanzas/conciliacion-v2` con `action: "confirmar"` para un borrador explícito.
- `POST /api/admin/finanzas/conciliacion-v2` con `action: "deshacer"` para una reversión total auditada.

No registra envoltorios documentales, no ofrece sugerencias automáticas y no actualiza la interfaz de manera optimista después de mutar.

## Prueba manual previa

1. Iniciar sesión con un administrador con permiso de lectura en `admin.finanzas.conciliacion`.
2. Abrir la pantalla y comprobar que se muestra una lista de movimientos, el selector de cuenta y el buscador.
3. Con un usuario que tenga sólo lectura, verificar que el contenido es visible pero que **Revisar y confirmar** y **Deshacer operación completa** están deshabilitados.
4. Buscar por un texto de hasta 120 caracteres y cambiar de cuenta. Confirmar que se solicita la lista paginada sin alterar el borrador hasta seleccionar otro movimiento.
5. Abrir un movimiento de importe conocido y no cero. Al seleccionar otro movimiento, comprobar que se vacían las líneas, importes y motivo del borrador anterior.

## Prueba de borrador JUSTIFICADO

1. Seleccionar **Justificado**.
2. Buscar y seleccionar un documento no `stale`, con objetivo firmado no cero y capacidad neta conocida. Un documento totalmente pagado puede admitir una devolución que reduzca la capacidad consumida.
3. Añadir una línea firmada de pago, cobro o devolución. El neto resultante debe mantenerse entre cero y el objetivo firmado del documento. La UI rechaza cero, formato decimal no exacto, exceso de capacidad y duplicar el mismo documento.
4. Añadir, si procede, diferencias sólo de **COMISION**, **INTERESES** o **REDONDEO**. No existe `OTRO`.
5. Validar en el resumen:

   | Dato | Regla |
   |---|---|
   | Banco | Importe firmado suministrado por el banco |
   | Documentos | Suma firmada de líneas documentales |
   | Diferencias | Suma firmada de comisión/intereses/redondeo |
   | Total líneas | Documentos + diferencias |
   | Resto | Banco − total líneas |

6. La revisión sólo se habilita si hay al menos una línea documental y **Resto = 0,00 € exactos**. No se usan `abs()`, tolerancias ni redondeos.
7. Pulsar **Revisar y confirmar**. En el diálogo confirmar de forma explícita. El único botón final envía una sola petición con las claves exactas del contrato.
8. Forzar una pérdida de red, si es posible. El diálogo conserva el mismo payload y la misma `idempotencyKey`; **Reintentar confirmación** vuelve a enviar el cuerpo idéntico. No se genera una clave nueva durante ese reintento.
9. Ante `400` o `409`, comprobar que se muestra el mensaje seguro del backend y se relee la lista; no se conserva como confirmado un cambio local.

## Prueba NO_REQUIERE

1. Seleccionar un movimiento con importe bancario conocido; se admiten movimientos técnicos cero sin líneas.
2. Elegir **No requiere documento** y seleccionar uno de los motivos cerrados:
   - `COMISION_BANCARIA`
   - `INTERES_BANCARIO`
   - `REDONDEO_BANCARIO`
   - `TRASPASO_INTERNO_SIN_DOCUMENTO`
   - `MOVIMIENTO_TECNICO_BANCO`
   - `CORRECCION_BANCARIA`
3. Comprobar que no se muestran líneas y que no existe un motivo libre u `OTRO`.
4. Revisar y confirmar. El payload contiene `lineas: []` y `motivoNoRequiere`; no contiene ese motivo para `JUSTIFICADO`.

## Casos bloqueados deliberadamente

- Movimiento con importe `null`: no se confirma ni se fabrica un cero. Banco cero sólo permite SIN_DOCUMENTO o NO_REQUIERE sin líneas, nunca JUSTIFICADO.
- Documento `stale`, con objetivo desconocido o capacidad neta desconocida: no es seleccionable. Saldo disponible cero no impide una devolución documentada.
- JUSTIFICADO sin documento, con cierre distinto de cero o con una diferencia sin documento: no puede revisarse.
- Movimiento que ya tiene `operacionAplicada`: no puede cambiarse. Primero requiere reversión total.

## Reversión funcional

1. Abrir un movimiento con `operacionAplicada`.
2. El banner de auditoría indica que el cambio exige **Deshacer operación completa**.
3. Pulsar el botón. La UI envía exactamente `action`, `confirmacion`, `idempotencyKey`, `version`, `operacionId` y la lista completa de líneas activas `{ id, importeCentimos }`.
4. Confirmar tras la recarga que la interfaz muestra el estado recién leído y el aviso de que la operación y sus líneas se conservan como auditoría.
5. No se usa `DELETE`; una reversión no borra documentos, líneas ni operaciones.

Si la reversión falla con `400` o `409`, revisar el mensaje recibido y volver a abrir el movimiento tras la lectura. No intente sustituir una reversión total con una edición parcial.

## Trazabilidad de UI

Los selectores para prueba disponibles son:

| Selector | Elemento |
|---|---|
| `b4-movement` | Fila de movimiento |
| `b4-state` | Estado del borrador |
| `b4-add-document` | Añadir línea documental |
| `b4-add-difference` | Añadir diferencia |
| `b4-bank-cents` | Importe bancario mostrado |
| `b4-lines-cents` | Total de líneas mostrado |
| `b4-remaining-cents` | Resto exacto mostrado |
| `b4-review` | Abrir revisión |
| `b4-confirm` | Confirmación final |
| `b4-undo` | Reversión total |
| `b4-reason` | Motivo NO_REQUIERE |

El diálogo final tiene el título accesible **«Confirmar conciliación B4»**.

## Inicialización y pruebas técnicas

La migración es aditiva y sólo se aplica en la BD aislada. `init-finance-b4-documents.ts` añade el catálogo de documentos, nunca vínculos. `init-finance-b4.ts` requiere un actor real y simula por defecto; proyecta sólo vínculos históricos directos inequívocos, con capacidad acumulada y cantidades exactas. Las ambigüedades conservan SIN_DOCUMENTO y su auditoría. Repetir `--apply` no duplica filas ni eventos. Los importes, estados y relaciones legacy se conservan.

Las pruebas puras se ejecutan con `tsx --test scripts/test-finance-b4-{core,initialization,ui}.ts`. La integración PostgreSQL requiere `B4_ROLLBACK_TEST=1` y fuerza rollback total de todas las fixtures. No ejecutar contra producción.
