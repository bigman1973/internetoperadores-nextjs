# TANDA 3 — ficha nueva preparada para Superadmin/Gerente

Orden de Claude/Víctor de 26/11/2026 18:25: objetivo de publicación viernes 27/11 por la tarde, sólo tras nueva orden con el adelante de Víctor. Esta preparación sustituye la indicación anterior de mantener la ficha nueva apagada en la candidata.

La apertura prevista requiere `AREA1_FICHA_NUEVA_PRODUCCION=1` en Vercel Production cuando se autorice publicar. **No se crea ni modifica esa variable desde esta tarea.** El interruptor sigue cerrado por defecto; subir código a staging no abre Production.

Además de los permisos existentes de Empresas, la página comprueba en la BD los roles vivos y cuenta activa antes de cargar la ficha nueva: `SUPER_ADMIN` o `GERENTE`, principal o secundario. Los demás roles conservan el editor anterior. `?editar=1` conserva ese editor también para los dos roles habilitados. La API de resumen repite la restricción antes de caché, datos o IA y mantiene el rechazo de actuación.

Las gestiones de la ficha reutilizan el handler de actividades CRM y sus permisos: nota, llamada, tarea y reunión explícitamente sólo en la ficha. No se abre el correo ni se crea una reunión Outlook. `M365_LEGACY_CRM_EXTERNAL_ENABLED` sigue siendo la única puerta de salida CRM y permanece cerrada; las otras cuatro salidas legacy también. Mi día conserva la lectura del calendario propio. Importaciones ISP/HubSpot y vínculos siguen cerrados en Production.

Staging mantiene la disponibilidad anterior de la ficha para sus usuarios autorizados; la nueva restricción de presentación afecta sólo a Production. No se aplican perfiles, roles, consentimientos ni concesiones de usuarios.

Pruebas: 48 casos ejecutan funciones, página y handler reales en VM, con proveedores y escrituras prohibidos. Incluyen rol revocado pese a sesión antigua Superadmin, roles secundarios, usuario inactivo, actuación, puerta apagada, fallback y `editar=1`. No sustituyen la aceptación con sesión de Víctor. Antes de cualquier push se exige batería y build limpio del SHA exacto.
