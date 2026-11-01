# Conciliar G3 · evidencia histórica separada (2026-11-01)

## Aprobación y motivo

El **01/11/2026 a las 12:58:32 (Madrid)**, Claude aprobó expresamente un caso histórico B4 de proveedor como **evidencia histórica separada para G3**. El propósito es comprobar el clasificador real de proveedor y referencias con un concepto y una factura reales, sin usar una base de datos durante las pruebas puras ni modificar el Golden, estados B4 o la proyección de Conciliar.

El caso aprobado se conserva en un selector privado y opaco. Los identificadores de movimiento, factura y almacenamiento no se incluyen en este repositorio, documentación ni salida de runners.

## Contrato implementado

- `lib/finanzas/conciliar-g3-historical-evidence.ts` reejecuta el parser original de referencias y `assignConciliarProviderPayments` con el texto bancario, referencia, factura, fecha e importes que entrega el lector.
- El alias de proveedor delimitado usa el helper existente `conciliarAliasesContainDocumentaryAlias`. Su resultado se exige como `DOCUMENTARY_REVIEW_ONLY`; nunca se transforma en alias exacto, `MATCH`, verde ni reserva.
- `scripts/areas/conciliar/g3-historical-reader.ts` usa un único `SELECT` limitado a dos filas, con selector privado de movimiento/factura. Comprueba vínculo `DOCUMENTO` activo, wrapper de factura recibida activo, operación B4 `APLICADA` no revertida, estado `JUSTIFICADO` versión 2+, igualdad de céntimos, fecha documental no posterior, archivo controlado y ausencia de la proyección actual.
- La evidencia se guarda exclusivamente como `globalDataset.historicalG3Evidence`. No se inserta una fila sintética en `rows`; por tanto no puede cambiar G2, sumas o grupos G4, cobertura API, reservas G1, colas ni acciones.
- Si el selector se aporta y no hay exactamente una prueba completa y válida, G3 falla cerrado con un código estático. La omisión se conserva sólo para fixtures puros históricos que no ejecutan un lector.

## Fixture privado requerido por el padre

Los runners de regresión que evalúan G3 requieren el argumento:

```text
--g3-historical-selector-file /ruta/privada/g3-historical-selector.json
```

El fichero debe pertenecer al usuario ejecutor, tener permisos `0600`, estar fuera del repositorio y contener sólo:

```json
{
  "schema": "CONCILIAR_G3_HISTORICAL_PROVIDER_SELECTOR_V1",
  "movementId": "<id opaco del caso aprobado>",
  "invoiceId": "<id opaco de su factura aprobada>"
}
```

El padre debe construirlo a partir de la evidencia privada ya aprobada, con los IDs exactos del caso preferido. No debe copiarse al árbol Git ni a golden/manifest.

Para `scripts/areas/run-batteries.mjs`, la configuración privada debe declarar el mismo campo `g3HistoricalSelectorFile` tanto en `productionRestore` como en `batteries.area3-conciliar`; el orquestador lo reenvía al gate de restauración y al validador API sin imprimir su contenido.

## Pruebas puras

`scripts/test-conciliar-g3-historical-evidence.ts` usa el concepto y la factura aprobados para comprobar:

1. referencia y céntimos positivos con el clasificador original;
2. proveedor delimitado en `REVIEW` / `PROVEEDOR_SOLO_DOCUMENTAL`, no `EXACT`;
3. rechazo de número, proveedor e importe alterados;
4. rechazo de prueba histórica sin archivo, vínculo inactivo, operación revertida o presencia en la proyección;
5. lector `SELECT … LIMIT 2`, sin DML/bloqueo, duplicados o redondeo de importes.
