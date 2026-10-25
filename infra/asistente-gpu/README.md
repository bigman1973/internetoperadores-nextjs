# Infraestructura GPU aislada

Este directorio contiene plantillas y procedimientos para el host GPU europeo del asistente. No inicia servicios ni permite descargas desde este sandbox. La topología expone exclusivamente Caddy en TCP/443; los servicios de cálculo, estado y observabilidad quedan en la red Docker `interna` con `internal: true`.

## Flujo permitido

1. En una estación conectada y aprobada, fijar `images.lock` y `models.lock` con digest, revisión Git o SHA-256 de rueda inmutables, crear el bundle mediante `preparar-artefactos.sh` y revisar los hashes.
2. Transferir el bundle con un medio cifrado. En el host GPU, configurar `.env` y PEM/mTLS locales, comprobar los permisos y ejecutar `instalar-offline.sh`.
3. Con consola fuera de banda, aplicar el firewall con CIDR concretos mediante `APPLY_FIREWALL=1`.
4. Arrancar sólo los perfiles requeridos, comprobar `probar-sin-salida.sh`, `verificar-latencia.sh`, backup y restauración antes de aceptar tráfico.

`validar_compose.py` puede ejecutarse sin Docker y comprueba red interna, puertos, límites, reinicio, telemetría apagada, modelos de sólo lectura y endurecimiento. En este repositorio se valida con:

```bash
/home/ubuntu/asistente-ia-20261025/infra-venv/bin/python validar_compose.py
```

La validación estática no sustituye `docker compose config -q`, la prueba en GPU, nftables, mTLS, copias ni benchmark. `images.lock.example` y `models.lock.example` contienen marcadores intencionados: se rechazan hasta que una estación conectada los complete y revise.

## Prueba parcial de semántica Docker

`probar-red-interna-parcial.sh` usa una sonda efímera `busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662` y comprueba que una red Docker `internal=true` bloquea DNS y TCP externo. Es el digest de la única imagen CPU ligera materializada para esta prueba; no es una entrada de `images.lock` ni un lock final. La sonda no descarga modelos, limpia contenedor/red al terminar y guarda el recibo fuera de Git en `recibos/`.

Su resultado es **parcial**: no demuestra vLLM, RAG, Caddy, mTLS, GPU, firewall `nftables`, copias ni el Compose completo. La evidencia bloqueante del host futuro sigue siendo `probar-sin-salida.sh`, ejecutada después del arranque controlado y del firewall de salida denegada.
