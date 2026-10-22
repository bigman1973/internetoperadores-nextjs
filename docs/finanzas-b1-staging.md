# Finanzas B1 — staging aislado (22/10/2026)

## Límites de esta entrega

Sólo rama `staging`. No promover a `main` ni producción sin aprobación expresa de Víctor. B2–B8 quedan fuera de esta entrega. No ejecutar correos, notificaciones, movimientos de archivos en SharePoint ni sincronizaciones ajenas a B1.

La configuración original de Vercel compartía `DATABASE_URL` entre preview y producción. Se creó una copia consistente en la base `io_staging_finanzas`, en el mismo servidor Railway, con rol exclusivo `io_staging_finanzas`. El snapshot de las 133 tablas originales coincidió en conteos con la copia. No se efectuó DML sobre las tablas de producción. El rol nuevo no tiene permisos de lectura/escritura sobre sus tablas. La separación es de base y permisos, no de capacidad del servidor.

Vercel tiene overrides `DATABASE_URL` y `FINANCE_STAGING_SANDBOX=1` exclusivos de preview y de la rama `staging`. La conexión original de producción no se reemplazó. No incluir URLs, contraseñas, dumps ni copias privadas en Git.

## Seguridad de pruebas

- `lib/prisma.ts` rechaza un destino distinto si se activa el sandbox.
- La API B1 verifica también `current_database()` y `current_user` antes de consultar Graph o escribir.
- Middleware bloquea cron y mutaciones de APIs ajenas a B1 (salvo autenticación) en el sandbox; las lecturas administrativas mantienen sus autorizaciones propias.
- Graph impide mover PDFs en el sandbox. Inventario y relectura de ubicación son lecturas de SharePoint; las actualizaciones de metadatos sólo se guardan en staging.
- El historial automático de un push a staging nunca reutiliza los secretos de producción. Requiere `STAGING_DATABASE_URL` exclusivo; si no está disponible se omite sin conectar y se registra el desarrollo manualmente en staging.

## Semántica documental B1

La lista incluye las siete carpetas conocidas y los archivos sueltos de raíz 2026, sin duplicar el recorrido de las carpetas. Cada colección de Graph agota `@odata.nextLink`, también en subcarpetas. Un error, una continuación inválida o una subcarpeta ilegible nunca se convierte en vacío ni en un total completo.

`total` cuenta archivos; `admitidos` cuenta PDFs e imágenes compatibles. `yaImportados` sólo cuenta IDs de archivos admitidos ya registrados. Un inventario parcial expone sus errores y deja los totales agregados no disponibles.

`carpetaOrigen`/`archivoOneDrive` conservan la ubicación documental actual, junto con `oneDriveDriveId` y `oneDriveRutaActual`. `estadoCarpeta` indica el circuito de gestoría, independiente de `estado` de la factura. `etiquetaMateriales` es una etiqueta, no una imputación de centro de coste. Reencontrar un ID no altera importes, fecha de factura, OCR, validación, pagos ni vínculos. Las nuevas altas permanecen pendientes de revisión; carpeta de trimestre no demuestra pago ni validación OCR.

Cada cambio queda en `historial_ubicaciones_facturas_recibidas`, con autor, fecha, motivo y valores anterior/actual. La normalización de T1–T4 y otras etiquetas históricas no inventa un traslado de archivos no encontrados. Los registros históricos sin Drive ID no se reatribuyen automáticamente: la primera relectura exige confirmar expresamente su procedencia de la biblioteca mostrada. Cancelar no escribe nada; confirmar conserva la decisión del usuario en el historial. Un reintento sin cambios no agrega historial. Los originales duplicados y OCR fallidos existentes no se borran; su tratamiento corresponde a B2.

## Prueba en staging

1. Abrir Finanzas → Facturas recibidas; comprobar aviso de sandbox, ocho tarjetas y ruta resuelta por IDs.
2. Actualizar inventario: comprobar los contadores y que Confirming y raíz participan del total.
3. Usar **Releer ubicación**: actualiza ubicaciones existentes y normaliza alias, sin OCR ni descarga de nuevos PDFs.
4. En una fila con origen OneDrive, abrir **Ver historial de ubicación**. Repetir la relectura: ningún historial nuevo si la ubicación es idéntica.
5. Probar errores con mocks o una configuración de prueba, no moviendo ni quitando permisos de documentos reales. Las pruebas sintéticas validan carpetas de más de 200 elementos y fallos de subcarpetas.

## Pruebas de código

```bash
pnpm exec tsx scripts/test-finanzas-graph-b1.ts
pnpm exec tsx scripts/test-finanzas-onedrive-inventory-b1.ts
pnpm exec tsx scripts/test-finanzas-onedrive-api-b1.ts
pnpm exec tsx scripts/test-finanzas-onedrive-ui-b1.ts
B1_STAGING_ROLLBACK_TEST=1 pnpm exec tsx scripts/test-finanzas-onedrive-postgres-b1.ts
pnpm exec prisma validate
pnpm build
```

La prueba PostgreSQL exige la base y el rol aislados, usa rollback obligatorio y no conserva facturas ni movimientos de prueba. No ejecutar esta prueba contra producción.

## Reversión sin pérdida de datos

La migración `20261022_b1_onedrive_inventory` sólo añade cuatro columnas anulables, una tabla e índices. La reversión funcional consiste en volver a un despliegue anterior de staging manteniendo la conexión dedicada y las medidas de seguridad, o inhabilitar el flujo B1. Las columnas y el historial se conservan; no ejecutar `DROP`, borrados o restauraciones sobre producción. Si se necesita deshacer una actualización concreta de ubicación, preparar un cambio auditado desde el valor anterior, validar que sigue vigente y aplicarlo sólo a staging. La historia no se borra.
