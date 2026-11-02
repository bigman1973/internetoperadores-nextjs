# Área 1 — Captación web en ficha CRM única

Encargo aprobado por Claude/Víctor el 02/11/2026. Rama `area1-crm`, excepción autorizada; límite 2 horas. Sin producción ni prueba en pantalla fuera de staging coordinado por Claude.

- [x] Las 15 rutas de formularios (contacto, demo, guías, newsletter, soporte, partners, ocho contrataciones y altas) guardan primero en el CRM local; retiradas todas sus llamadas a HubSpot y la del carrito abandonado.
- [x] La ficha CRM se reutiliza desde Leads; los IDs, cuestionarios, notas, estados, PDFs y fechas de los detalles anteriores se conservan. Los nuevos detalles llevan un FK a la ficha CRM; los antiguos solo se vinculan mediante un clic explícito. Sin migración masiva ni fusiones por email/NIF/teléfono.
- [x] Registro de cada envío dentro de la ficha: formulario, dominio y página sin parámetros, fecha del servidor, PARTICULAR/EMPRESA/PARTNER, privacidad nullable, newsletter explícita y versión. Reintentos con clave estable; protección transaccional para concurrencia. Los datos privados del alta solo intervienen en la huella de reintento y permanecen en el detalle original.
- [x] Brevo conserva las suscripciones explícitas y la operativa de correo transaccional anterior. Marketing no es obligatorio ni se deduce de aceptar privacidad; no se activan secuencias nuevas. Un reintento local no repite suscripciones, emails ni pagos. Una entrega fallida no borra la captación; los resultados del proveedor no se reproducen en el reintento.
- [x] Migración `20261102_area1_captacion_web` preparada: tabla de evidencias `area1_crm_captaciones_web`, enlaces opcionales `area1_crm_contacto_id`, identidad HubSpot opcional y restricciones/índices del área. Sin borrados, sin cambios de tarifas/contratos/operadores/Azure ni piezas comunes.
- [x] Pruebas del servicio puro: atomicidad, rollback, concurrencia, procedencia saneada, consentimiento, reintentos, ausencia de vinculación automática y conservación del detalle legado.
- [x] Batería aislada de ocho contrataciones y altas: 533 comprobaciones, 19 comprobaciones sintácticas, persistencia previa a comunicaciones, fallo de BD, opt-in estricto, reintentos, datos privados y operativa de pago original. Sin servicios reales.
- [x] Sintaxis dirigida: las otras seis rutas y sus formularios, y los cambios de ficha/directorio CRM, sin errores. Búsqueda estática: cero referencias HubSpot en las 15 rutas y carrito abandonado.
- [x] `pnpm build` pasa usando la conexión exclusiva de la preview de `area1-crm` a staging `io_staging_finanzas`, con `default_transaction_read_only=on` verificado también por el motor Prisma. No se usa producción.
- [ ] El arnés general de rutas falla al cargar el compilador (`createRequire(...).require is not a function`). Conservado sin reparar fuera del repositorio en el expediente de diagnóstico. Las seis rutas generales aún requieren su comprobación de ejecución con el arnés coordinado por Claude. No presentar la batería global como verde.
- [ ] TypeScript global conserva errores preexistentes de otras áreas y del mapeo de tarifas de alta; no se reparan. La configuración existente de Next omite comprobación de tipos durante build; por tanto build verde no significa `tsc` global verde.
- [ ] Migración no aplicada a la BD compartida. El nuevo formulario no funcionará sobre una BD sin esta migración. Antes de habilitarlo, Claude debe coordinar la aplicación solo de este SQL y las pruebas sintéticas pendientes.
- [ ] Validación en pantalla en el staging único con Claude después de batería completa verde. Sin merge a staging ni producción en este encargo.

## Ejecución reproducible

`pnpm exec tsx scripts/test-area1-captacion-web.ts` y `node scripts/test-area1-contrataciones.cjs` no necesitan credenciales. La segunda batería compara la conservación de campos y operativa con la base `7b3e70a`; puede fijarse otra revisión con `AREA1_BASE_COMMIT` cuando sea necesario.

Para compilar hace falta una conexión exclusiva de staging: la web prerenderiza tarifas leyendo la BD. No usar una URL de producción ni modificar `/internet` o la configuración común para eludirlo.

La preview es solo para comprobaciones automáticas. No ejecutar POST contra la preview con claves reales de Brevo: enviarían los correos transaccionales ya existentes. Las pruebas de esta tanda son simuladas. La prueba en pantalla solo corresponde al staging único.

## Vuelta atrás

Revertir el commit de código, conservar las columnas y los envíos ya capturados y deshabilitar/hacer reversible cualquier habilitación de captación nueva. No borrar evidencias ni contactos. No ejecutar `migrate deploy` indiscriminadamente sobre migraciones antiguas: aplicar exclusivamente la migración `area1_` coordinada y registrar su aplicación.

Fuera de este encargo: datos y migración histórica de HubSpot, notas/actividades históricas, pipelines, otras webs del grupo, baja de HubSpot, sincronizaciones nuevas y producción.
