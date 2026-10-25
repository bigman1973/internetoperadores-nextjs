# Planificador de informes del asistente — plantilla para staging

## Estado de esta entrega

Este directorio contiene **sólo plantillas** para un host persistente autorizado. No se ha instalado, habilitado ni ejecutado una unidad systemd. Vercel Preview no ejecuta cron y no hay un host autorizado en esta entrega; por tanto **la programación efectiva de staging está bloqueada**. No se ha usado `vercel.json`, ScheduleTask, Trigger, daemon de sandbox, correo ni ningún servicio externo.

El ejecutor nativo es `scripts/asistente/ejecutar-informes.ts`. Genera el diario si procede y, el mismo tick de las 08:00, el semanal los lunes y el mensual el día 1. Las restricciones son deliberadas:

- `--target=staging` sólo acepta una `DATABASE_URL` cuyo nombre de BD sea `io_staging_finanzas` y `ASSISTANT_MODE=extractivo`.
- No hay destino de producción.
- `--target=local-test` requiere tanto `ASSISTANT_REPORT_ALLOW_LOCAL_TEST=true` como la BD loopback exclusiva `asistente_fases_informes`; es sólo para pruebas automatizadas.
- El resultado no contiene conversaciones, contacto ni PII de leads; sólo estado por tipo y si se generó.

## Instalación futura en un host autorizado

Una persona responsable del host, tras revisión de staging y fuera de este cambio, deberá:

1. Materializar el checkout verificado en `/opt/internetoperadores/current`, con el usuario local `internetoperadores` y sus dependencias ya preparadas.
2. Crear `/etc/internetoperadores/asistente-informes.env` con permiso `0600`, propietario `root:internetoperadores`, e incluir como mínimo `DATABASE_URL` de staging. No guardar secretos en las unidades ni en el repositorio.
3. Copiar las dos plantillas a `/etc/systemd/system/` y revisar las rutas/usuario para ese host.
4. Validar sin activar: `systemd-analyze verify /etc/systemd/system/asistente-informes.service /etc/systemd/system/asistente-informes.timer` y `systemd-analyze calendar '*-*-* 08:00:00 Europe/Madrid'`.
5. Tras aprobación explícita, ejecutar `systemctl daemon-reload` y `systemctl enable --now asistente-informes.timer` en **staging**. Comprobar con `systemctl list-timers asistente-informes.timer` y los logs del servicio, sin incluir URL de BD ni secretos.

`OnCalendar=*-*-* 08:00:00 Europe/Madrid` es compatible con systemd 255 y conserva la hora civil: en 2026 equivale a 06:00 UTC el 29 de marzo (CEST) y a 07:00 UTC el 25 de octubre (CET). `Persistent=true` recupera una ejecución perdida al arrancar el host; la restricción única `(tipo, fecha_local)` impide duplicados concurrentes.

No activar este timer en producción. La revisión de permisos de ruta, allowlist de cron y despliegue corresponde al integrador padre.
