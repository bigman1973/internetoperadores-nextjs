# Iván y Tutorial Bot · Acción aparte pendiente

**Estado: NO EJECUTADA. No es una orden de cambio ni confirma su estado productivo.**

La lectura mínima de esta tarea y la de WEB INTERNET OPERADORES coinciden: en la copia aislada de staging Iván Pérez Solís y Tutorial Bot aparecen activos. Ninguna de las dos tareas dispone de una conexión autorizada de producción. Por tanto, su estado actual en producción es **desconocido**. Los identificadores de staging no se utilizarán como identificadores productivos.

## Verificación previa

Víctor, o la tarea que tenga una conexión productiva autorizada, debe consultar únicamente las dos identidades en Usuarios Admin, comprobar que son las cuentas correctas y anotar su identificador productivo y actividad. Sin correos, datos de clientes ni cambios de Azure.

Si una cuenta ya está inactiva, no se repetirá su baja. Se conservará esa evidencia. Si sigue activa, queda preparado el siguiente cambio para el OK de Víctor:

| Identidad que debe confirmarse en producción | Único cambio preparado | Lo que no se cambia |
|---|---|---|
| Iván Pérez Solís | `activo = false` | Sin borrar la cuenta, relaciones, permisos históricos ni auditoría |
| Tutorial Bot | `activo = false` | Sin borrar el historial ni crear otro bot |

## Condiciones del OK y ejecución posterior

La autorización deberá nombrar las identidades e identificadores productivos verificados y autorizar expresamente su baja lógica. La implementación debe volver a comprobar su estado vivo antes del cambio, registrar quién/cuándo/qué en la misma transacción y verificar después que una sesión administrativa antigua de la cuenta ya no concede acceso. Una cuenta inactiva no debe reactivarse por iniciar sesión con Microsoft.

No se enviarán emails ni avisos, no se borrarán usuarios o empleados, no se tocará Azure y no se activarán sincronizaciones. Si existen otras identidades o accesos asociados que no estén cubiertos por la baja de Usuarios Admin, se informará sin modificarlos por extensión.

Este documento no aplica ningún cambio. La urgencia de seguridad no se usa para eludir el OK productivo solicitado por Víctor.
