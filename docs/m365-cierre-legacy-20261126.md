# Cierre M365 legacy — decisión de Víctor 26/11/2026

Implementación sólo en staging. Cinco puertas independientes cerradas por defecto: únicamente el literal `1` permite continuar por esa puerta. Ninguna variable se activa en esta entrega. El cierre devuelve HTTP 503, `code` y `codigo` `M365_LEGACY_PENDING`, `success:false` y `Cache-Control: private, no-store`.

Mensaje literal de la UI: **Envio pendiente de activar (se hara desde Mi Outlook)**. Se muestra como aviso informativo, se conserva el borrador y se permite reintentar; no se anuncia éxito ni se refresca la ficha como si se hubiera enviado. Un fallo de autenticación/permisos sigue siendo su error original, no un éxito ni un aviso de envío.

## Interruptores por ruta

1. `M365_LEGACY_LEADS_EMAIL_ENABLED`: POST `/api/admin/leads/[id]/enviar-email`.
2. `M365_LEGACY_MANTENIMIENTO_EMAIL_ENABLED`: POST `/api/admin/leads-mantenimiento/[id]/enviar-email`.
3. `M365_LEGACY_ALTAS_CONTRATO_ENABLED`: POST `/api/altas/[id]/enviar-contrato`.
4. `M365_LEGACY_CRM_EXTERNAL_ENABLED`: POST `/api/admin/crm/contactos/[id]/actividades`, sólo CORREO corporativo/delegado y REUNION con `syncOutlook=true`.
5. `M365_LEGACY_MAGIC_LINK_ENABLED`: POST `/api/auth/magic-link`.

Ausente, vacío, `0`, `true`, espacios o cualquier valor distinto de `1` significan cerrado. Activar un interruptor **no salta** autenticación, permisos, actuación, las puertas M365 previas, aislamiento, readonly ni los bloqueos globales de sandbox o `FINANCE_EXTERNAL_ACTIONS_DISABLED`. La reapertura efectiva se decidirá después de la prueba guiada, con revisión de esos controles; no basta activar un flag si otra guarda sigue cerrada. No se amplía ahora ninguna excepción para enviar correos o crear eventos.

## Efectos preservados y bloqueados

Leads y altas conservan fichas, documentos, firma y validaciones. El cierre sucede antes de enviar o marcar envío/éxito. Magic-link conserva sus validaciones y privacidad, pero cerrado no genera, invalida ni guarda tokens y no envía correo. No se ha inventado un botón de magic-link: el login actual no lo llama.

CRM conserva autenticación, escritura y actuación antes del cierre. CORREO y cualquier petición REUNION+`syncOutlook=true` se rechazan antes de consultar conexión, obtener/renovar token, reservar actividad o llamar a Graph. La puerta de cierre prevalece aunque la opción C impida ya crear calendario; no convierte esa petición en éxito local. Las actividades realmente locales conservan su comportamiento.

El sandbox de staging bloqueaba antes todo el POST de actividades. Se añade sólo un escape local acotado para NOTA, LLAMADA, TAREA y REUNION sin Outlook, y para los registros manuales de WHATSAPP, LINKEDIN, SMS y CORREO_POSTAL sin preparación de canal externo. Exige preview de la rama staging, sandbox1, identidad de BD `io_staging_finanzas` y ambas guardas readonly apagadas. Sólo JSON leído de clon de hasta16KiB, tipos estrictos y valores ausentes o booleano false en `syncOutlook`/`viaOutlook`/`prepareExternalChannel`; no abre rutas vecinas. Después se mantienen los permisos vivos, perfiles, actuación y controles del handler. Los cambios de proxy restantes sólo ajustan el mensaje del bloqueo existente, sin conceder salida a proveedores.

Peticiones `action=enviar_validacion` se deja intacta. No se modifican Mi Día, lecturas de calendario/Mi Outlook, lectura de respuestas, helpers de correo/Graph, kit io-ui, autenticación, datos de negocio, permisos o registro. No hay migraciones, envíos, invitaciones, OAuth, cambios de variables ni llamadas reales a proveedores.

## Pruebas

Los seis scripts `scripts/test-m365-legacy-{policy,leads,mantenimiento,altas,crm,magicLink}.ts` ejecutan los helpers, handlers y callbacks UI originales con dobles explícitos, en memoria y sin red/Prisma/proveedor reales. Cubren cierre por defecto, flags inválidos, independencia, reapertura1 simulada, ausencia de sesión/permisos, cero envíos/tokens/marcas, reuniones locales, opción C y UI sin falso éxito. El script policy ejecuta el proxy completo con registro y decisiones ACL reales; la sesión y BD son sintéticas.

Se corrige además una referencia heredada fuera de alcance en ActivityCard, pasando explícitamente el booleano M365 del padre, sin cambiar su condición de permisos. `scripts/test-m365-legacy-activity-card.ts` renderiza la función JSX productiva: 12 combinaciones de tipo, escritura y puerta, sin ReferenceError ni acciones M365 si la puerta o escritura están cerradas. TypeScript global sigue con 49 diagnósticos heredados ajenos; ninguno en archivos modificados. No se cambia la configuración de build ni se presenta el typecheck global como verde.

Se mantiene la batería M365 existente y `pnpm test:area4`. Sus fixtures sólo se adaptan al import nuevo y al 503 informativo de rutas antes denegadas; no se eliminan negativas. La comparación legacy del proxy permite únicamente los nuevos bloques literales autorizados y sigue comparando exactas las guardas previas. Las comprobaciones no son HTTP autenticado ni envíos de prueba a Microsoft.

## Preparación de tanda 3, sin release ni Production

Se proponen el SHA de este cierre y Rentabilidad `ce39fd531314720595154103e552cfe47b9b21a1`, sin cargar datos ni recalcular fotos. La candidata futura debe partir de main y seleccionar sólo lo autorizado; no arrastrar todo staging. Este parche modifica `proxy.js`, mientras main1171 conserva `middleware.js`: habrá que coordinar el rename Node/proxy ya entregado en staging o adaptar el cierre al entrypoint de la candidata y volver a probarla.

Área1 comunicó `origin/area1-crm` rebasada sobre main, HEAD `7c0840f9`, con una puerta adicional `AREA1_ENVIOS_CRM_PRODUCCION`. No se integra por esa comunicación ni se abren POST de vínculos ISP. Si Claude ordena integrarla después, la nueva puerta de Área1 y las cinco puertas de esta decisión se conservarán conjuntamente; ninguna debe reabrirse accidentalmente al resolver conflictos.
