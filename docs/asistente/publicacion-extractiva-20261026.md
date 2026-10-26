# Publicación autorizada de rendimiento y asistente extractivo — 26/10/2026

## Alcance

Víctor autoriza todas las mejoras de rendimiento y móvil validadas, el panel completo del asistente extractivo, la proyección de solicitudes en el módulo Leads y el informe diario en el panel a las 08:00, Europe/Madrid. Esta autorización no permite activar el widget público: permanece apagado hasta aprobar los textos de privacidad y consentimiento. No se habilita el espacio Cliente, un servidor GPU, aprendizaje automático, correos ni APIs externas de IA.

El código se prepara y verifica en staging. La rama de publicación se compone sobre la última revisión de main, no mediante un merge ciego, para preservar las correcciones de cobros y la declaración de titularidad existentes. La optimización de pantallas financieras no modifica documentos, importes, propuestas o confirmaciones bancarias.

## Configuración de producción

```text
ASSISTANT_MODE=extractivo
ASSISTANT_PUBLIC_ENABLED=false
ASSISTANT_CLIENT_ENABLED=false
ASSISTANT_EMAIL_ENABLED=false
ASSISTANT_CRON_ENABLED=true
ASSISTANT_DAILY_REPORT_HOUR=8
ASSISTANT_RETENTION_CRON_ENABLED=false
```

`CRON_SECRET` utiliza el secreto existente de Vercel; no se cambia ni se publica su valor. No se relajan los interruptores financieros de comunicaciones o vinculación automática. La visibilidad pública se comprueba tanto en servidor como en el montaje del widget y sus APIs.

## Vercel Cron y Madrid

Se añade exclusivamente `/api/cron/asistente-informe` con `0 6,7 * * *` UTC. El handler sólo ejecuta a las 08:xx de Europe/Madrid: a las 06:00 UTC durante CEST y a las 07:00 UTC durante CET. La segunda invocación no genera datos. No cambia ninguna programación financiera preexistente.

La ruta requiere Production, modo extractivo, el interruptor explícito y Bearer `CRON_SECRET` válido. Preview, staging, desarrollo y la ventana de sólo lectura quedan cerrados. El middleware admite únicamente esta excepción exacta al bloqueo general de cron. Se utiliza un lock transaccional y la clave única de fecha/tipo para impedir informes duplicados. El informe se guarda sólo en el panel; nunca se envía ni aprueba contenido automáticamente.

## Migraciones y conocimiento

La copia completa debe ser nueva y verificarse mediante restauración local antes de cualquier DDL de producción. Las dos migraciones contienen sólo objetos nuevos del asistente. Se aplican mediante el ejecutor de publicación auditado, explícitamente en este orden:

1. `20261025_asistente_ia` — crea el núcleo.
2. `20261025_asistente_fases25` — crea contactos seguros y gestión de privacidad con sus dependencias.

No ejecutar `prisma migrate deploy`, `db push` o `reset` como sustitución: el orden lexicográfico de las dos carpetas no expresa sus dependencias. La aplicación y sus huellas se registran en la tabla de recibos de publicación existente. El build ejecuta únicamente `prisma generate` y Next.js, no migraciones.

El corpus se reconstruye de los archivos locales propios y de las tarifas elegibles de producción, nunca copiando documentos, conversaciones, contactos, propuestas o aprendizaje de staging. La ingesta inicial es atómica, sólo crea conocimiento en tablas nuevas y comprueba política de fuentes públicas, versiones, fragmentos y cobertura de rutas.

## Puerta de verificación

Antes de publicar: núcleo, ataques, política/ingesta, ACL del panel, informes locales, cron CET/CEST, preservación de guardias financieras, matriz pública de 37 preguntas y matriz histórica de 100; comprobar los resultados, tipos del alcance y `pnpm build` exclusivo. Un resultado APTO no sustituye el número real de aciertos ni acredita INP de campo.

Después de Vercel READY: páginas públicas y móviles, panel con una consulta interna y cita, módulos del asistente/Leads, widget ausente y API pública apagada, cron sin Bearer rechazado. No crear leads ni operaciones financieras durante el smoke. La primera ejecución programada real debe identificarse separadamente de la configuración y de un ensayo con reloj controlado.

## Vuelta atrás

1. Mantener `ASSISTANT_PUBLIC_ENABLED=false`.
2. Desactivar respuestas con `ASSISTANT_MODE=desactivado` y programación con `ASSISTANT_CRON_ENABLED=false`; las variables requieren un nuevo despliegue para afectar a un runtime existente.
3. En Vercel, volver al despliegue anterior a esta publicación, conservado en el recibo privado. Esta reversión de tráfico no recompila y restituye inmediatamente las pantallas anteriores.
4. Las tablas aditivas pueden conservarse: el despliegue anterior no las utiliza. No borrar contactos, conversaciones o nuevas actividades de negocio para revertir la interfaz. La restauración completa de BD es recuperación excepcional, no el rollback normal, y exige revisar la pérdida de escrituras posteriores.

El recibo final de copia, DDL, conocimiento, despliegue y smoke se entrega fuera del repositorio cuando estén realmente completados. No activar el público con esta autorización ni modificar la política de privacidad sin aprobar los textos finales.
