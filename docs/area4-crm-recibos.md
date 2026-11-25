# Contrato confirmado · recibos de importación CRM

25/11/2026. Confirmado directamente al Área 1 (tarea `263J6qkud3QGVe9Xz25pmP`) y copiado a la integradora. Este contrato no abre rutas ni ejecuta importaciones.

## Helper y propiedad

Reusar `appendArea4Audit(tx, input)` de `@/lib/area4/audit`. Área 4 añade `CRM_IMPORTACION_ISP` y `CRM_IMPORTACION_HUBSPOT` al tipo `Area4AuditOperation` en un commit pequeño separado del registro `239590c`; Área 1 no modifica ese fichero común. La tabla acepta strings: sin migración nueva.

## Forma del recibo

```ts
{
  actorId: propietarioVivo.id,
  objetivoUsuarioId: null,
  operacion: 'CRM_IMPORTACION_ISP', // o CRM_IMPORTACION_HUBSPOT
  areaCodigo: 'admin.crm',
  origen: 'crm.isp.aplicar', // o crm.hubspot.historial
  antes: null,
  despues: {
    resultado: 'EXITO', // EXITO | DUPLICADO | ERROR | PARCIAL
    hash: sha256DelXlsx, // opcional si hay journalId
    journalId: identificadorServidor, // opcional si hay hash
    conteos: {
      objeto: { creados: 0, actualizados: 0, omitidos: 0, errores: 0 }
    },
    duracionMs: duracionReal
  }
}
```

Debe existir hash o journalId; ambos cuando estén disponibles. `conteos` representa resultados confirmados por objeto, nunca una previsión. Sin nombres, emails, CIF, nombre de fichero, payloads ni mensajes crudos de errores; usar códigos/conteos minimizados.

Exigir propietario canónico vivo y rechazar `session.impersonation` antes de despachar: reusar `requireArea4Owner(prisma)`. `actorId` viene de su principal comprobado, nunca del body, un JWT no revalidado ni la autoridad original de actuación. La frontera común añadirá la misma barrera; el helper genérico de INSERT no sustituye autorización ni sanitización del módulo.

## Resultados y transacciones

ISP: EXITO/DUPLICADO dentro de la misma transacción de negocio; si falla el recibo, rollback de toda la importación. ERROR tras rollback en transacción aparte, con conteos comprometidos cero. Si falla también ese recibo se devuelve error y se señala que no se pudo auditar: no se silencia ni se registra un éxito.

HubSpot: un recibo por ejecución con resultados reales de lotes. PARCIAL si hubo cambios comprometidos y algún fallo; ERROR si no hubo negocio comprometido; no EXITO con lotes fallidos. Conservar `confirmar:true` y ON CONFLICT: no se exige un hash nuevo o una transacción gigante.

DUPLICADO solo si se verifica que no cambió negocio. Un upsert que vuelve a afectar consentimientos no se anuncia como no-op: resultado EXITO con contadores reales, u omitidos si está demostrado.

## Bloqueo vigente

POST `/api/admin/crm/isp/importar` (aplicar) y POST `/api/admin/crm/hubspot/historial` siguen cerrados hasta el SHA del Área 1 con recibo probado y la confirmación directa de Claude a la integradora. No abrir `/api/admin/crm/isp/vinculos`, vecinos, otros verbos ni producción mediante esta excepción. Ninguna importación, variable, cuenta, migración o comunicación se ejecuta por confirmar este contrato.
