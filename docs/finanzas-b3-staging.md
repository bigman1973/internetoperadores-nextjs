# Finanzas B3 — extractos y clasificación bancaria

Implementado exclusivamente en la rama y base aislada de staging. No autoriza publicar en main ni ejecutar sincronizaciones o comunicaciones ajenas.

## Cambios

La fecha de cobertura por cuenta indica el último movimiento importado, no un cierre contable ni una comprobación de saldo. Los saldos sólo avanzan cuando existe una cadena exacta verificable; los huecos, saldos ausentes y órdenes diarios ambiguos son visibles. Los apuntes válidos se conservan aunque su tramo necesite revisión. Un fallo parcial se identifica expresamente y no avanza el saldo ni el corte.

La importación exige una cuenta inequívoca; Norma 43 y bancos con varias cuentas tienen selección explícita. Los hashes nuevos incluyen la cuenta y reconocen los hashes anteriores sólo en esa misma cuenta, sin modificar originales ni el índice histórico.

El catálogo cerrado conserva los históricos fuera de catálogo y presenta los alias autorizados sólo en lectura. `COMISION 0,00`, cifras no positivas y texto de comisión sin cifra no activan reglas financieras. Una pista `TRASSPAS` sólo propone investigar una contraparte propia; nunca concilia ni marca cobros automáticamente.

## Cómo probar en staging

1. En Finanzas → Importar, elegir banco y cuenta y usar un extracto de prueba. Verificar el aviso exacto de diferencia y la fecha de cobertura. No confundir un estado de orden ambiguo con saldo cuadrado.
2. En Estado de extractos por cuenta, comprobar por separado corte importado, fecha del saldo conocido y advertencias.
3. En Movimientos, filtrar por cuenta y observar el catálogo: `Impuestos` incluye el alias `IMPUESTOS`; las categorías libres anteriores se identifican como históricas sin reescritura.
4. No hay acción de conciliación automática en B3. La edición PATCH sólo acepta categoría, tipo y método de pago de catálogo.

## Verificaciones

Pruebas sintéticas de núcleo, importador/API e interfaz; límite real de cuerpos multipart/JSON; autenticación, permisos y mismo origen; prueba PostgreSQL con rollback obligatorio en staging. El rollback comprueba hueco, corte independiente del saldo, reintento y ausencia de vínculos o fixtures persistentes. Build `pnpm build` previo al push.

## Reversión

Revertir únicamente el código de este bloque en staging, conservando la columna nullable `fecha_corte_extracto` y todos los datos. No ejecutar DROP ni restablecer saldos/hashes originales. La protección de entorno aislado de B1 permanece activa. El historial registra B3 sólo en la copia staging.
