# Sincronizaciones y corte bancario — 23/10/2026

## ISP

El trabajo reportado se detuvo conservando sus resultados. Las 401 fuentes procesadas eran revisiones de identidad, no 401 escrituras fallidas de factura. Existía el espejo histórico exacto por ID externo, pero no la FK de identidad B7; el proveedor exigía esa FK incluso con la creación automática de identidades desactivada. Ahora acepta la identidad histórica sólo cuando ID externo, número, fecha e importes coinciden exactamente. No crea vínculos bancarios ni cambia estados de cobro.

Se contrastaron las 401 fuentes con persistencia simulada en una transacción de sólo lectura. El recuento y SHA-256 completo de las facturas emitidas se comparó con el snapshot anterior: sin altas ni modificaciones incorrectas.

El contrato de outcomes conserva códigos seguros en el elemento y en el trabajo. Antes, REVISAR se incluía en errores sin conservar su motivo y un éxito posterior borraba lastError. La cancelación reintenta únicamente el conflicto serializable P2034, con tres intentos y reautorización en cada uno. No se reintenta DML de dominio. La cancelación original no dejó diagnóstico que permita atribuir con certeza su fallo a un conflicto; la API idempotente del trabajo detenido se comprobó con HTTP 200.

El ISP cancelado no se relanza durante las pruebas. Las futuras sincronizaciones usarán el proveedor corregido, manteniendo la ejecución diaria existente.

## OneDrive

El trabajo original terminó por su cron existente: 892 archivos, 50 nuevas, 819 actualizadas, 23 incidencias. De las incidencias, 22 se conservaron en Revisar lectura (20 por línea sin importe neto, una por proveedor no leído y una por total que no cuadra); otra agotó el tiempo de preparación. No se inventan importes ni se transforma una lectura inválida en factura válida. Las nuevas aparecieron al final: los archivos ya conocidos se procesaron antes. Los soportes confirming tampoco equivalen a facturas de compra.

## Corte manual y saltos Santander

En Finanzas → Estado de extractos por cuenta, quien tenga escritura de importación puede introducir fecha, saldo exacto y nota, y marcar la confirmación explícita. Una tabla nueva append-only registra actor, fecha de confirmación, versión y huellas. Los cortes importados explícitos siguen siendo válidos; no se deduce un corte de la fecha máxima de movimientos. La declaración manual complementa la cobertura de Facturación, Pendientes y el dashboard.

La lista Santander muestra fecha, importe, saldo esperado, leído y diferencia. El orden técnico fecha/creación/ID no demuestra orden bancario intradía: los casos ambiguos se rotulan como candidatos, no como descuadres confirmados. Lectura limitada a 5.000 movimientos con aviso de truncación.

Ninguna confirmación de corte actualiza cuentas, movimientos, saldos originales o conciliaciones. La API exige origen, JSON limitado, autorización viva dentro de la transacción, idempotencia y versión de fuente. Nunca se confirma un corte durante las pruebas de producción.

## Verificación y retorno

Pruebas puras del proveedor ISP y de errores/cancelación; pruebas de céntimos, cobertura y saltos; confirmación real sólo en rollback; DDL aditivo con hashes de conservación de todas las tablas existentes; build obligatorio antes de cada push; prueba visual sintética y mutaciones interceptadas. Producción se verifica con lecturas, sin crear trabajos ni conciliaciones.

El despliegue anterior queda congelado como punto de retorno. La tabla nueva puede permanecer vacía al volver al código anterior: no altera columnas existentes. Si hay que desactivar temporalmente las sincronizaciones, poner FINANCE_SYNC_JOBS_ENABLED=0 en producción y volver al deployment anterior; no restaurar una BD antigua para un problema exclusivamente de código. Se conserva además un respaldo actual privado. Nunca eliminar auditorías o registros para revertir la interfaz.
