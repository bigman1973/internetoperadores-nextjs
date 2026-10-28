# Declaración de titularidad de cuentas

La declaración expresa de Víctor del 25/10/2026 se registra en `declaraciones_titularidad_modo_facil`: cuenta, titular, fecha de declaración, confirmación explícita, actor, fuente y recibo. Es un registro aditivo y append-only; para revocar se añade otra versión, nunca se edita la declaración original.

Esta declaración es **informativa y auditable**. No se consume desde «Quién es», cobros, conciliación ni `accountAttestations` del motor automático. No activa una política, no desbloquea candidatos y no cambia saldos, cuentas, documentos, importes o vínculos.

En producción no había una política automática activa al preparar esta publicación. El mecanismo anterior de atestación depende de una política activa y de un traspaso bloqueado concreto. No se activa esa política como efecto secundario de guardar la declaración.

Si se desea utilizar una declaración para autorizar traspasos en el futuro, debe diseñarse y aprobarse una adopción humana separada: política explícita, candidato vigente, vínculo de la adopción a la política y nueva revalidación serializable de ambos importes, fechas y cadenas de saldo. La declaración general no sustituye esos controles.

El lector `easy-account-ownership.ts` es sólo informativo y se usa en las pruebas del registro. No debe conectarse a rutas de mutación ni a motores de conciliación sin una autorización y revisión separadas.
