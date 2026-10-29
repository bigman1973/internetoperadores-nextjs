# Hook de coordinación padre — lectura confirming P2/C11

**Estado:** módulo C11 entregado, hook **no aplicado** en `provider.ts`, `assembly.ts` ni `worker.ts` (reservados al integrador). La migración que debe estar aplicada antes del hook es [`20261029_confirming_reading_attempts/migration.sql`](../../prisma/migrations/20261029_confirming_reading_attempts/migration.sql). No usar ni ejecutar el antiguo DDL staging.

## Punto de enganche obligatorio

El propietario del proveedor integra **ambas** llamadas en el flujo P2 de OneDrive sólo para un soporte financiero confirming ya registrado:

1. **Prepare, con bytes efímeros ya descargados por el puerto P2 autorizado.** Construir `source` con hash de esos bytes y el `parejaCaixaDeclaradaId` que llegue de una vinculación documental existente/validada (nunca por fecha, banco, importe o nombre). Llamar `prepareOneDriveConfirmingReading`.
2. **Apply, dentro de la misma transacción fenced del worker y sólo después de archivar el snapshot lifecycle de esos mismos bytes.** Llamar `applyOneDriveConfirmingReadingAfterLifecycleTx` con el `tx` vivo, actor de servidor revalidado y la identidad `FacturaRecibida`/DriveItem ya registrada.

La bridge verifica de nuevo: snapshot CAPTURED + hash + versión, fuente FI del mismo DriveItem sin B4 activo, actor/fence vivo, pareja Caixa PDF/XLS declarada y actual, IBAN literal exacto con titularidad declarada vigente, FI Draxton única por número normalizado + nominal y evidencia C11. El resultado sólo puede ser `SIN_CAMBIOS`, `REVISAR` o `PROPUESTA_CONFIRMACION_HUMANA`; nunca confirma B4.

```ts
import {
  applyOneDriveConfirmingReadingAfterLifecycleTx,
  prepareOneDriveConfirmingReading,
} from '@/lib/finanzas/sync-jobs/providers/onedrive/confirming-reading'
import { detectarTipoConfirming } from '@/lib/finanzas/confirming-parser'

function tipoConfirmingP2(originalName: string) {
  const tipo = detectarTipoConfirming(originalName)
  return tipo === 'bbva_pdf' ? 'BBVA_PDF'
    : tipo === 'caixa_pdf' ? 'CAIXA_PDF'
      : tipo === 'caixa_xls' ? 'CAIXA_XLS'
        : 'OTRO'
}

// prepare: bytes proceden del puerto P2 y no se conservan en source_data/logs.
const confirmingPrepared = await prepareOneDriveConfirmingReading({
  source: {
    archivoPrivadoId: lifecycleItemKey,
    versionContenido: upstreamVersion,
    hashBinario: sha256(bytes),
    tipoDetectado: tipoConfirmingP2(originalName),
    hashProcesadoAnterior: previousContentSha256 ?? null,
    parejaCaixaDeclaradaId: declaredCaixaPairId ?? null,
  },
  bytes,
  originalName,
})

// apply: después de archive lifecycle; MISMA tx con lease/cancel/access fence.
const confirming = await applyOneDriveConfirmingReadingAfterLifecycleTx({
  tx,
  actorId: requiredServerActorId,
  snapshot: {
    lifecycleId: archived.lifecycleId,
    snapshotId: archived.snapshotId,
    versionDocumento: archived.versionNumber,
  },
  prepared: confirmingPrepared,
  registeredSource: {
    facturaRecibidaId: registeredFinancialSupport.facturaRecibidaId,
    archivoControladoId: registeredFinancialSupport.archivoControladoId,
    oneDriveDriveId: driveId,
    oneDriveItemId: itemId,
  },
  // Debe usar el guard runtime ya existente del worker, no actor de UI ni
  // impersonación de navegador, y ejecutarse en la misma transacción.
  assertLiveFinanceWriteAccess: async (sameTx, actorId) =>
    workerFenceAllowsWrite(sameTx, actorId),
})
```

## Invariantes no negociables del integrador

- No llame a la bridge antes de que lifecycle archive el snapshot, ni en una TX nueva.
- El `registeredSource` sólo procede del registro de soporte financiero existente. El hook no crea `FacturaRecibida`, no la convierte en factura fiscal/IVA/PORPAGAR y no inventa importes.
- Caixa exige PDF+XLS con **la misma** pareja documental declarada y ambos snapshots actuales; sin pareja válida, `REVISAR`. No hay pairing heurístico.
- BBVA exacto no equivale a B4 confirmado: la salida verde es únicamente `PROPUESTA_CONFIRMACION_HUMANA` para Conciliar.
- No escribir `movimientos_bancarios`, vínculos B4, estado de cobro, cuentas, bancos ni documentos legacy. Una fuente con B4 activo se bloquea.
- No emitir logs con bytes, PDF/XLS parseado, IBAN, nombres, rutas, URLs, hashes o IDs de fuente. La proyección de cola no expone esos campos.
- `assertLiveFinanceWriteAccess` se invoca antes del persist de fuente y antes del persist C11; no basta con un permiso capturado fuera de la TX.
