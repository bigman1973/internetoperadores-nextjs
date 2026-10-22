# Finanzas: publicación autorizada en producción — 22/10/2026

Víctor autoriza desplegar B1–B8 y las correcciones de confirming Draxton, nóminas con archivo y resúmenes de facturación/previsión fiscal. La prueba rápida sólo consulta datos. No se migran vínculos bancarios ni se ejecutan sincronizaciones; ninguna lectura inicializa conciliaciones.

## Runtime

Producción exige `FINANCE_MODEL_PRODUCTION_ENABLED=1` y `FINANCE_AUTOMATIC_LINKS_DISABLED=1`, `VERCEL_ENV=production` y la identidad efectiva de la BD original. Staging conserva su conexión y su guarda estricta: un error de sandbox nunca puede habilitar producción.

`FINANCE_DEPLOYMENT_READ_ONLY=0` permite la confirmación manual normal. `FINANCE_EXTERNAL_ACTIONS_DISABLED=1` bloquea los crons, rutas de sync/sincronización y de comunicaciones del lanzamiento sin deshabilitar el acceso a archivos documentales. No se modifica Azure. Las rutas heredadas de autoconciliación, importación heurística de remesas y enlaces que eluden B4 están bloqueadas. Los flujos vigentes son B4/B6, con propuesta y confirmación humana separadas.

No se configura WAF. El retorno aprobado combina el deployment anterior y la restauración íntegra del respaldo nuevo, aceptando perder escrituras posteriores a ese respaldo. El retorno sólo de código no es suficiente.

## Validaciones previas

Se requiere copia completa reciente, restauración aislada verificada, ensayo de las nueve migraciones del manifiesto, `pnpm build` correcto, guardas de entorno, pruebas de bloqueo del middleware y conservación de columnas originales. El DDL se aplica en una única transacción y no ejecuta backfills, seeds ni vínculos. No se usa `prisma migrate reset` ni se ejecuta el historial completo de migraciones.

El procedimiento operativo exacto y los comprobantes se conservan fuera de Git, en un directorio privado de esta tarea. No se incluyen dump, credenciales, SQL con datos ni manifiestos de registros privados en el repositorio.

## Retorno

1. Detener el despliegue y no promover otros commits.
2. Abrir una sesión dedicada de restauración, bloquear nuevas conexiones a `railway` y terminar las demás conexiones.
3. Sustituir `public` por el SQL del respaldo dentro de una transacción. Verificar conteos/hashes, columnas lógicas, restricciones y secuencias antes del commit.
4. Mantener la BD cerrada mientras Vercel vuelve al deployment congelado anterior.
5. Comprobar los aliases del deployment anterior y sólo entonces reabrir la BD. Probar login y páginas mediante GET, sin sincronizaciones.

Si restaura pero falla Vercel, la BD continúa cerrada: no servir código nuevo contra esquema antiguo. Si falla la restauración, la transacción se revierte y no se reabre la BD sin revisar el error. Un rollback Vercel no mueve `main`: evitar pushes que republíquen el release fallido hasta investigar y preparar un revert revisado.

## Pruebas disponibles

- `lib/finanzas/test-finance-environment.ts`: aislamiento y habilitación explícita.
- `lib/finanzas/test-finance-sync-environment.ts`: no habilitar proveedores por defecto.
- `scripts/test-finance-production-boundaries.ts`: guardas estáticas sin conexión de datos.
- `scripts/test-finance-production-middleware.cjs`: ejecución del borde en VM sin red ni BD, con sólo lectura a cero, bloqueo externo, auto-rutas retiradas y paso a autorización de las rutas B4/B6 manuales.

La prueba rápida de producción cubre sesión/login, Pendientes, Conciliación, Facturación, Facturas recibidas y Movimientos y sus APIs de lectura. Las escrituras se interceptan antes de navegar; no se crea ninguna conciliación de prueba real.
