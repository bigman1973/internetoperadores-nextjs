# Áreas 8 y 9 — primera versión, 24/11/2026

Rama `area8-peticiones-area9-historial`, rebasada sobre staging `c4c2497345ccab4dac81e324f12464032d77638b` por petición del integrador. Se preservan su migración Área 4 corregida, down.sql y registro común, sin diferencias en esos archivos. WEB INTERNET OPERADORES es el único integrador. Nada a producción; no SQL compartido, emails, notificaciones salientes, sincronizaciones ni Azure durante esta tanda.

## Reutilización y estructura
Se mantienen `/peticiones`, `/admin/peticiones`, `/admin/historial`, las APIs y la conversación existentes. `lib/peticiones-flujo.ts` normaliza estados históricos en lectura, sin modificar registros antiguos. APIs propias comprueban cuenta administrativa activa e identidad viva: empleados usan userType admin/VISOR, no existe un tipo empleado separado. El solicitante conserva la confirmación humana de la entrega. `lib/area8/` alberga validación, autorización local y eventos, y reutiliza el propietario, evaluador y marcador vivo de adopción de Área 4; no se modifica el marco común ni empleados. Una ACL adoptada vacía deniega también a Gerente; un permiso específico denegado prevalece sobre su padre. Gerente conserva el contrato central cuando solo hay permisos ajenos a esta sección.

Los nuevos campos del modelo PeticionInterna llevan columnas area8_: paginaUrl, urgencia, responsableId y relación responsable, tramitadaAt y eventos. Captura PNG/JPEG/WebP de hasta 5 MiB, nunca SVG/HTML. Prioridad interna distinta de urgencia, solo Víctor puede cambiarla. Eventos de cambio de estado persistidos en la misma transacción, visibles en la petición al solicitante; ningún transporte saliente se ejecuta.

Los estados de respuesta son nueva, en_analisis, aprobada, en_desarrollo, en_pruebas, hecha y descartada. Alias de lectura: pendiente→nueva, pendiente_validacion→en_pruebas, ajustes_solicitados→en_desarrollo, resuelta→hecha. Se conserva el tipo de mensaje ajustes como información. El administrador entrega a pruebas con explicación; solo el solicitante confirma hecha. Cambios de estado con comparación del estado previo dentro de transacción. Sin reescritura masiva del legado.

Área 9 conserva los registros de desarrollo; un ledger separado area9_ para publicaciones y migraciones no deduce publicación de un push ni de un build. El capturador verifica entorno, estado exitoso y SHA y se entrega desactivado para producción, pendiente de su contrato de despliegue validado y autorización de integración. Vínculos con peticiones requieren confirmación humana y peticiones ya cerradas; el ledger no cierra ninguna. Registro automático de migraciones toma solo entradas realmente aplicadas de _prisma_migrations y diferencia de SQL preparado.

## Diseño
Reutilizar componentes y superficies actuales, textos claros en español, Roboto heredada, #FF5300 y #2D2A26. Formularios etiquetados, detalles en columna y tabla con desplazamiento acotado o tarjetas para móvil 400 px. Sin nuevas ilustraciones decorativas.

## Límites de entrega
Migraciones aditivas area8_/area9_, evitar area9_sis_. SQL se entrega preparado, no aplicado a BD compartida. Pruebas ligeras sin datos personales, build aislado read-only antes del push. Preview de rama comprobada por SHA; aceptación visual solo en staging tras integración. No afirmar READY si faltan esquema aplicado, contrato de publicación o sesión de aceptación.
