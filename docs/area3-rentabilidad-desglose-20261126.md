# Rentabilidad: completar el desglose — sólo staging

El desglose de Facturado, Coste asignado y Contratos ya existía. Esta entrega completa su coherencia temporal, la accesibilidad móvil y la exportación; no duplica el módulo ni modifica el motor.

El informe identifica su `snapshot` seleccionado con el selector existente. El panel solicita `snapshot=<UUID>` en el GET ya registrado de `/api/admin/rentabilidad`. El servidor exige id y mes coincidentes; una foto inexistente devuelve 404 controlado, nunca una foto más reciente. El navegador verifica el id de respuesta y compara con la cifra que se pulsó en la tabla.

No se crean rutas, apartados, permisos ni migraciones. Se conserva autenticación y el lector aislado de staging. Cuota, alta, baja y estado usan la última versión contractual importada hasta la fecha de la foto. Si no existe esa información, queda `null` y se muestra «sin dato». No se consulta ISP en vivo.

Las facturas y líneas documentales no son una reconstrucción histórica transaccional. Se leen en su estado actual y se declara esa limitación junto al detalle. Si difieren de la foto, el panel muestra la diferencia; el endpoint no añade ajustes de cuadre ni recalcula. Los constructores y motores anteriores siguen intactos.

El panel conserva las tres vistas tanto por cliente como por producto, incluso cero contratos. Todas las columnas son accesibles mediante desplazamiento local en móvil; la cifra desglosada queda visible. Tab se mantiene dentro del diálogo, Escape cierra y el foco vuelve al botón de origen.

Excel mantiene las celdas numéricas y los textos de origen protegidos frente a fórmulas. Lo ausente dice «sin dato». Incluye la hoja «Foto y notas», comentarios de fuente y mes en los valores y color azul para entradas exportadas, conservando los formatos numéricos de la plantilla existente. El error de generación se muestra y permite reintentar sin modificar datos. Las exportaciones anteriores sin opciones conservan su contrato.

Pruebas reproducibles:

```sh
DATABASE_URL=postgresql://io_staging_finanzas@127.0.0.1:1/io_staging_finanzas FINANCE_STAGING_SANDBOX=1 VERCEL_ENV=preview pnpm exec tsx --test scripts/test-rentabilidad-desglose-foto.ts scripts/test-rentabilidad-desglose.ts scripts/test-rentabilidad-report.ts scripts/test-rentabilidad-presentation.ts
pnpm exec tsx --test scripts/test-rentabilidad-desglose-excel.ts
```

Las pruebas de foto bloquean red y escrituras y ejercitan SQL parametrizado en memoria. Las capturas de 1360 y 400 px corresponden al componente real con datos ficticios y GET simulado; no son una sesión autenticada de Víctor. La comprobación nativa de staging se hace aparte en transacción Repeatable Read / Read Only. Aceptación de uso con sesión pendiente de Víctor.

No se cambia M365, el kit compartido io-ui, importaciones, recálculos, programaciones ni Production. El inventario M365 es una propuesta separada que requiere validación antes de cerrar nada.
