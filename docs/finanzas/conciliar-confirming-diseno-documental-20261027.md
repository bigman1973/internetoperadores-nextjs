# Confirming: ampliación documental propuesta

Fecha: 27/10/2026. Ámbito exclusivo: staging. Este documento es un diseño; no acredita integración ni aplicación de migraciones.

## Regla aprobada por Víctor

El abono bancario debe ser igual al nominal completo de las facturas menos intereses, comisión e IVA de la comisión. Cada componente debe estar expresamente declarado en la liquidación; un dato ausente no equivale a cero. No se obtiene ningún concepto como residuo ni aplicando un porcentaje.

La confirmación cobra cada factura por su nominal y registra tres deducciones independientes. Una diferencia de un céntimo, falta de detalle, factura posterior al abono, fuente no verificable o ambigüedad impide presentar el conjunto como listo para confirmar. La fecha de liquidación, la fecha de emisión y el vencimiento se conservan con significados distintos.

Los avisos de cesión de créditos no son liquidaciones. En las parejas Caixa, el PDF acredita el neto bancario y los componentes; el XLS acredita el detalle de facturas. El neto XLS no sustituye al PDF. Los PDF sueltos de la raíz deben clasificarse por su contenido y validarse con su formato específico, no por el nombre del archivo.

## Inconsistencia identificada en la integración actual

El parser preparado ya puede conservar el IVA explícito. Sin embargo, `conciliar-confirming-core.ts` calcula actualmente el neto de las líneas restando sólo interés y comisión. El adaptador y el soporte documental de intereses tampoco transportan el resumen íntegro de liquidación. El enum monetario `MotivoDiferencia` sólo admite COMISION, INTERESES y REDONDEO. No existe todavía un motivo separado para IVA de comisión.

Por tanto, mejorar el parser no demuestra que los abonos estén conciliados ni que el IVA esté integrado. No se utilizará REDONDEO o COMISION para disfrazar IVA.

## Persistencia aditiva propuesta

Se propone una evidencia versionada y de sólo adición por liquidación, sin sobrescribir los campos económicos legados:

- Documento principal y, cuando exista, detalle asociado: procedencia controlada de los archivos, hash binario, versión/fecha de revisión y relación documental única. No asociar una pareja sólo por una fecha o un nombre semejante.
- Tipo documental declarado y banco emisor; cuenta depositaria y fecha de liquidación explícitas. Se admite Caixa liquidando en Santander: no se exige emisor igual a depositario.
- Importes enteros en céntimos: nominal, intereses, comisión, IVA de comisión, deducción total si está declarada y neto bancario. Los importes ausentes permanecen ausentes.
- Identidades completas de las facturas, nominales y fechas del detalle; comprobación de sus sumas contra el resumen. Un IVA sólo declarado globalmente permanece global: no repartirlo artificialmente por factura.
- Estado de cuadre documental y motivos de revisión, separados del cuadre con un movimiento bancario real y de la capacidad disponible de las facturas.
- Actor real y usuario efectivo, origen de la revisión, idempotencia, hash de la decisión y auditoría inmutable.

El nuevo motivo `IVA_COMISION` deberá añadirse mediante migración aditiva y comprobarse en los validadores, DTO, motor monetario y pruebas. La evidencia y las tres deducciones deben quedar vinculadas en la misma confirmación y revertirse con el recibo original.

## Matching y confirmación

Primero se acredita el documento y su detalle. Después se propone un abono existente por cuenta depositaria documentada, neto exacto y fechas coherentes, revalidando las facturas y la capacidad disponible. No se crea un movimiento bancario ni se modifica su importe. Una coincidencia de importe aislada no acredita por sí sola la liquidación.

Al confirmar se vuelven a comprobar permisos, actuación como otro usuario, fuente/hash vigente, fechas, importes y cierre completo bajo la transacción existente. Las propuestas no reducen Emitidas: sólo lo hace una confirmación humana vigente. Los resúmenes se recalculan desde esa evidencia monetaria, sin usar el estado de cobro de ISP.

La factura bancaria posterior se relaciona documentalmente con la liquidación y el componente que factura, evitando una segunda justificación o un cargo ficticio. La relación debe acreditar referencia, emisor, fecha e importe; no se deduce del banco depositario. Si la factura agrupa conceptos distintos, su desglose explícito también deberá verificarse antes de vincularla.

## Aplicación y pruebas pendientes

Antes de una eventual carga se requiere inventario íntegro, clasificación y comprobación de los formatos reales de ambas subcarpetas y la raíz. La carga sólo reutilizará fuentes autorizadas ya existentes; no reactivará el POST histórico que auto-vinculaba y marcaba cobros.

La migración se ensayará sobre una restauración local. Antes de staging se preparará una copia y restauración comprobada. Las evidencias se incorporarán de forma aditiva, con recibo y reversión. Se probarán cuadre exacto, falta de IVA, descuadre de un céntimo, aviso de cesión, pareja PDF/XLS, fuente cambiada, factura posterior al cobro, ambigüedad, idempotencia y deshacer. Nada de este diseño autoriza publicación en producción.
