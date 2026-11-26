# TANDA 3 — integración Área 1 en staging, 26/11/2026

Integración selectiva sobre staging `6028c758`, no mezcla completa de ramas. Fuentes de `origin/area1-crm` rebasada sobre main:

- `7714755664ea8ae5c1d9404aa8fbab03711bbeea`: correos recibidos de Outlook, sólo lectura.
- `2db06677e72df155453f48db72e9865432af7b30`: asignación de la superficie real al registro.
- `eabb97b8623755d769543a26d0d4b50ac5bf7153`: simulación y confirmación en bloque de vínculos ISP a empresas.
- `7c0840f93ace11e8edd3e159d6df101b0df62d21`: puertas de lectores e importaciones, adaptadas al cierre M365 ya validado.

## Una única puerta de salida CRM

`M365_LEGACY_CRM_EXTERNAL_ENABLED` es el único interruptor que controla el correo corporativo/delegado y la creación de reuniones Outlook del CRM. Sólo el valor exacto `1` lo abre; permanece cerrado por defecto en todos los entornos. Se conserva el handler de actividades y la corrección de alcance del ActivityCard de staging `6028c758`.

El estado de conexión y los dos compositores usan esa misma puerta. El mensaje informativo es: «Envio pendiente de activar (se hara desde Mi Outlook)». No se registra éxito local por una acción solicitada a Outlook bloqueada; se preservan borrador y posibilidad de reintento.

Notas, llamadas, tareas y reuniones elegidas explícitamente sólo para la ficha siguen siendo actividades locales. Mi día conserva la lectura del calendario propio. Peticiones no cambia.

## Superficies nuevas y alcance

Corresponden a handlers reales: GET de correos recibidos (180 días, máximo 25, extracto 300 caracteres, sin escritura ni marcar leído) y GET/POST de vínculos en bloque. El catálogo mantiene descriptores e identidades históricas; las altas no adoptan permisos de usuarios automáticamente.

Este commit no abre por sí mismo las excepciones de escritura del sandbox. La apertura de los dos POST de vínculos en staging, sus lectores JSON cerrados y la auditoría quedan en otro commit específico. No se ha simulado ni confirmado ninguna empresa desde esta tarea.

## Validación y publicación

Las pruebas se ejecutan en memoria con entorno ficticio, sin SQL real ni llamadas a Azure, Graph, correo o IA. La batería conjunta incluye lectores Área 1, cierres M365, actividad local, puerta única y regresiones del Área 4, bancos, Node/proxy y Rentabilidad. El build limpio del SHA final es obligatorio antes del push sólo a staging.

Nueva prioridad de Claude/Víctor: la futura candidata debe preparar la ficha nueva para Superadmin/Gerente en producción y gestiones locales; esto sustituye la propuesta anterior de mantenerla apagada. No se activa ninguna variable de Production ni se publica sin nueva orden.
