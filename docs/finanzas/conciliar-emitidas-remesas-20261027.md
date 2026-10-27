# Conciliar: Emitidas y recibos por abono de remesa

Fecha: 27/10/2026. Ámbito exclusivo: staging. Producción no autorizada ni modificada.

## Qué se ha cambiado

La ficha de la cuenta BBVA se ha corregido por instrucción explícita de Dirección, con copia completa restaurada antes de actuar, registro inmutable de antes/después y actor/ejecutor. No cambian su identidad, sus saldos ni movimientos. El cruce documental vuelve a localizar al céntimo las doce liquidaciones que bloqueaba la ficha: el inventario completo localiza 14/14 BBVA y 6/6 Caixa, abonadas estas últimas en Santander. Esta coincidencia documental no es una confirmación bancaria ni resuelve el modelo pendiente del IVA explícito del confirming.

Emitidas separa **Con propuesta**, **Para revisar** y **Sin propuesta**, con agregados y paginación de servidor. Se conserva el total **sin cobro confirmado** y el histórico anterior al corte configurable. No se utiliza el estado de cobro de ISP Gestión. Sobre la foto contrastada antes del despliegue: 2.383 / 299.962,66 € con propuesta, 432 / 257.274,35 € para revisar y 817 / 586.955,33 € sin propuesta; total 3.632 / 1.144.192,34 €. No son deuda ni impago acreditados. Las 817 se explicaron a Dirección antes de aplicar: 96 Draxton, 406 con remesa registrada pero sin la factura en la composición de propuesta guardada y 315 de otras formas de cobro o sin forma explícita. No se ha inferido transferencia por ausencia de datos.

Cada nueva confirmación humana de un abono de remesa puede crear un recibo documental versionado con su subconjunto explícito de facturas. Una asociación completa B6, si falta, se registra en la misma transacción; nunca convierte todos los miembros de una remesa en cobrados por un abono parcial. Se revalidan la generación, huella íntegra, importes, fechas, mapa emitida–ISP, capacidad disponible y ausencia de solapamiento con cobros directos. La interfaz muestra el conjunto completo, paginado, antes del segundo clic. Las remesas se confirman individualmente, no mezcladas con un lote rápido. Si falta el conjunto exacto o su mapa, se rechaza sin pagos parciales.

El cobro calculado exige el vínculo bancario B4 vivo y su recibo. Deshacer desactiva la prueba bancaria y reabre sólo las facturas de ese recibo; conserva auditoría, composición y asociación documental. No se escriben los campos antiguos de cobro ni se importa nada. Una devolución bancaria real posterior no se confunde con Deshacer: las remesas con este recibo requieren tratamiento versionado y el flujo antiguo se bloquea conservadoramente, sin fabricar un reparto.

## Garantías verificadas antes de publicar

- Dos copias completas de staging con restauración local comprobada, antes de la corrección y antes del DDL de recibos.
- Migraciones exclusivamente aditivas, ensayadas de principio a fin en la restauración local; no se usan `migrate reset`, `db push` ni borrados de negocio.
- Esquema Prisma validado y cliente generado.
- Ensayo PostgreSQL local real con dos abonos parciales disjuntos: primera factura cobrada y segunda pendiente, segundo abono, repetición idempotente, Deshacer selectivo y reconfirmación. Todo termina en rollback y cero fixtures retenidos.
- Rechazo SQL de alteración/borrado del recibo y sus líneas; cierre diferido que rechaza un céntimo extra; bloqueo simétrico de solapamiento directo/remesa y bloqueo de fuentes para capacidad concurrente.
- Lectura real, repetible y de sólo lectura de los tres bloques: suman exactamente el total, sus filtros de servidor no cambian otros saldos y conservan el histórico.
- Baterías puras de Conciliar, confirming, cobros y B7 correctas. Tipos sin errores nuevos del alcance; se conservan los seis diagnósticos previos ajenos. `pnpm build` correcto antes del push.

La comprobación externa del alias desplegado y el ensayo reversible de interfaz se documentan en el recibo de entrega de esta tarea; no se dan por realizados por el mero build.

## Límites de velocidad y confirming

Últimas mediciones externas anteriores a este despliegue: apertura con tres contextos nuevos sin caché de navegador, **3,912 / 3,919 / 3,791 s**; no se garantiza arranque frío del servidor. Deshacer una comisión: POST **1,427 s**, restitución después de la respuesta **1,304 s**, total desde el clic **2,732 s**. No se acredita apertura ni experiencia completa de Deshacer por debajo de 2 s. La mejora incremental sólo cubre comisiones, no las dependencias de una remesa.

El IVA de comisión de confirming sigue necesitando persistencia y líneas contables separadas. El parser y el cruce documental exacto no autorizan cobrar ni permiten omitir ese IVA. Ningún confirming se confirma por este cambio.

## Vuelta atrás de staging

Volver al despliegue anterior de staging conserva las nuevas tablas aditivas. No borrar ni truncar auditorías o recibos. Si se ha confirmado una prueba propia, deshacerla con su recibo mientras la versión nueva sigue disponible y comprobar la reversión antes de cambiar el alias. Para recuperar el estado completo anterior, usar la copia privada de staging posterior a la corrección de cuenta, previa a recibos, restaurada y verificada; nunca apuntar estos comandos a producción. El despliegue anterior no entiende recibos nuevos, por lo que no debe usarse para registrar nuevos cobros de remesa sin revisar el cálculo.
