# B7 — Facturación calculada desde el banco, sólo staging

## Regla y población

La población canónica de cálculo es `FacturaEmitida`. `Factura` sigue siendo el espejo documental de ISP Gestión: su situación, fecha de cobro y pendiente no acreditan pagos y no intervienen en el cálculo B7. No se suman los dos modelos.

`COBRADA_CALCULADA` exige deuda documental completamente cerrada mediante evidencia B4 vigente. Se comprueban líneas activas, operación aplicada y no revertida, estado `JUSTIFICADO`, cierre firmado exacto contra el importe bancario actual y objetivo del documento vigente. Los importes desconocidos o no representables en céntimos exactos se mantienen como `null`/revisión, nunca se sustituyen por cero.

Las remesas requieren relación B6 humana y auditada, miembros completos, puente FI–ISP explícito y fuente actual íntegra. Sólo una remesa financiada documentalmente de forma exacta permite atribuir el cobro a sus miembros; una financiación parcial sin atribución individual no se prorratea. Las devoluciones B4 se restan a la factura elegida en B6 mientras la evidencia siga activa. Una fuente o fecha cambiada provoca revisión, no un cobro supuesto.

## Deuda y caja no son el mismo indicador

El cobro documental liquida deuda. La caja conserva el signo y las diferencias explícitas de comisión/intereses/redondeo. Un confirming con varias facturas no reparte automáticamente su caja ni sus intereses entre ellas. Las diferencias no atribuibles se muestran por separado; un filtro de facturas no inventa que la diferencia global corresponde a ese subconjunto.

La cobertura procede del corte de extracto B3. Sin corte verificable de todas las cuentas no se declara una fecha global de cobertura ni que el banco esté actualizado a hoy.

## Identidad FI–ISP: primer paso de unificación

La migración B7 añade únicamente una bitácora inmutable `IdentidadFacturaISPEventoB7`, con FK restrictivas. El enlace nullable `FacturaEmitida.facturaISPId` ya existía desde B4.

La inicialización compara `FacturaEmitida.origenSistema=ISPGestion` e `idExterno=Factura.ispGestionId`, además de número, serie, cliente/CIF, fecha y total exacto. Sólo esos casos inequívocos reciben la FK y auditoría del actor activo. No usa similitud de nombres ni estados de cobro. No modifica totales, fechas, marcas antiguas de cobro, vínculos bancarios ni `updatedAt`. Una segunda ejecución no vuelve a escribir.

### Plan para completar la unificación

1. Mantener `FacturaEmitida` como único ID económico del panel y `Factura` como adaptador de origen ISP enlazado por FK auditada.
2. En la futura sincronización autorizada, actualizar metadatos documentales por identidad externa, sin importar el estado de cobro como autoridad. En staging no se ejecuta esta sincronización.
3. Consumir un solo lector B7 en Facturación, facturas emitidas y la bandeja de pendientes; mantener trazabilidad de remesas B6, devoluciones y reversión B4.
4. Auditar cualquier identidad nueva o discrepante antes de enlazarla. No completar por número/nombre aproximado.
5. Sólo tras validación de Víctor, planificar la sustitución de consumidores legacy. No borrar modelos ni datos antiguos, no retirar relaciones y no migrar producción con este bloque.

## Interfaz y API

`/admin/facturacion` muestra facturado, cobro documental confirmado, pendiente no confirmado y diferencias de caja; permite buscar, filtrar mes/estado y revisar fechas/vencimiento/metadatos. No ofrece «Marcar cobradas» ni sincronización. Su GET `/api/admin/facturacion-banco` exige permiso de Facturación, actor activo, aislamiento de staging y snapshot de lectura repetible, con `private, no-store`.

El listado financiero de facturas emitidas mantiene sus metadatos y «Relacionar compras»; los estados y KPI de cobro proceden de B7. La vista de facturas emitidas pendientes B5 comparte el mismo cálculo y no atribuye una cuenta a una factura sin evidencia.

El dashboard de Finanzas usa el mismo cálculo y el porcentaje B5 de importe justificado, no el porcentaje legacy por número de movimientos. El endpoint antiguo «marcar cobradas» está expresamente desactivado: no ejecuta DML ni marca toda una serie/mes como cobrada.

## Comprobación y prueba

Ejecutar las pruebas puras del núcleo y parser, `scripts/test-finance-b7-readonly.ts` y la prueba PostgreSQL B7 de rollback. La migración se valida primero dentro de rollback y se aplica únicamente a la BD aislada. La inicialización admite dry-run y requiere actor verificado para `--apply`.

La prueba PostgreSQL verifica 13 invariantes B4/B6/B7 y conserva los hashes y recuentos de 28 tablas tras rollback. Cubre una devolución revertida: la historia y la auditoría B6 permanecen, pero sólo los vínculos B4 activos cuentan; la devolución anulada no invalida el abono original vigente. Las guardas se validan entre fases para emular commits separados dentro del rollback exterior. Hay regresiones puras para reversiones directas y de remesa, además de los contratos UI de importes desconocidos.

En staging, abrir **Facturación**, elegir el mes y revisar la advertencia de cobertura. Comparar una factura vinculada manualmente en B4 con una sin evidencia bancaria: una marca antigua de ISP no debe convertir la segunda en cobrada. Revisar remesas/devoluciones desde Finanzas → Remesas. Para la validación automática visual se interceptan las mutaciones y se utilizan datos de prueba; no se guarda una conciliación real.

La publicación requiere `pnpm build`, push exclusivo a `staging`, despliegue preview READY, comprobación visual y registro en el historial aislado. No hay correos, notificaciones, envío a gestoría ni promoción a `main`.
