# Conciliar · batería activa y perfiles Golden (2026-11-01)

## Límite de ejecución

La puerta activa de Conciliar es `scripts/areas/run-batteries.mjs` y sólo usa suites declaradas en `config/areas.json`. Incluye explícitamente las reglas financieras globales **G1–G6** y el preflight financiero **G7**. No se presenta una ejecución parcial como si cubriera todas las suites históricas.

Las pruebas standalone de lifecycle/documentos siguen **archivadas y protegidas**: no son una suite activa de producto ni se reetiquetan como evidencia de la batería Conciliar. Los archivos listados por `conservacion-antes.json` se conservan byte a byte; su ausencia de la batería activa no excluye G1–G7, que se prueban por sus contratos financieros vigentes.

## Golden de producción y STAGE

El Golden original de producción `CONCILIAR_RELEASE_REGRESSION_V1` se conserva como copia privada fechada e inmutable con su SHA-256 sellado. La nueva producción puede ser únicamente su derivado exacto autorizado:

- **C1 Arrow** y **P1 Xfera** pasan de verde/pendiente a `ABSENT_CONFIRMED` en todas las pestañas, con confirmación humana de Víctor el 30/10/2026 durante prueba real y motivo documentado.
- **C4** deja de afirmar una cuenta congelada o un verde forzado. Su regla compuesta admite sólo:
  - `VERDE` cuando la composición exacta y el preflight actual FI→ISP→remesa/B7 están completos; o
  - `ÁMBAR` cuando ese mismo preflight actual devuelve un `missingReceiptCount > 0` y el motivo es exactamente `Falta enlazar N recibos.`.

C4 no utiliza `allowedColors: ['VERDE', 'AMBAR']`; esa lista sería una exención ámbar general y está rechazada por el contrato. `N` procede del lector servidor `readCurrentArea3RemittanceMapPreflightsTx`, no de SQL ad hoc, importes, inferencias o un valor hard-coded.

STAGE es un derivado del nuevo Golden de producción con exactamente ocho overrides documentados: los seis anteriores (`C2`, `C3`, `C7`, `C8`, `P7`, `P31`) y los dos nuevos (`C1`, `P1`). En STAGE, C1/P1 permanecen `PENDING_VISIBLE`: exigen fuente B4 pendiente y exactamente una fila visible, pero no fuerzan una ausencia ni afirman color. Esto conserva honestamente la divergencia operacional mientras las fuentes de STAGE sigan pendientes.

## Aplicación privada pendiente

El ejecutable externo `../pruebas/migrar-golden-stage-20261101.mjs` se entrega en `--check` por defecto y no modifica JSON privados sin `--apply`, autorización de Claude verificable y manifest STAGE previo disponible. Antes de escribir, valida la derivación, registra hashes antes/después, fecha, motivo, confirmación humana y autorización. Crea la copia original inmutable antes de los nuevos derivados y no sobrescribe archivos existentes.
