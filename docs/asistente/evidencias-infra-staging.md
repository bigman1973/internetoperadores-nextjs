# Evidencias de infraestructura — staging

**Fecha:** 25 de octubre de 2026.
**Estado:** preparativo para staging; no autoriza producción, compra ni despliegue.

## Ejecutado en sandbox

| Evidencia | Resultado | Alcance y límite |
|---|---|---|
| `sudo -n unshare -n true` | Superado | Namespace de red disponible en sandbox. |
| Docker Engine 29.1.3 y Docker Compose 2.40.3 | Operativos | Instalados localmente en sandbox para una prueba temporal; no son un servidor GPU ni un servicio desplegado. |
| `services/asistente-rag`: `pytest -q tests/test_api.py` | 10 superadas | Backend fake, autenticación, límites, redacción, salida bloqueada en tests y reranking fail-closed. No usa pesos reales. |
| `py_compile`, `bash -n`, `validar_compose.py` | Superados | Comprueba sintaxis e invariantes declaradas; no inicia el Compose. |
| `docker compose --env-file .env config -q` | Superado | Se resolvió con `.env.example` temporal y eliminado; no arrancó ni descargó servicios del paquete GPU. |
| `probar-red-interna-parcial.sh` | Parcial superado | Sonda BusyBox CPU efímera en `internal=true`: DNS externo y TCP a 1.1.1.1:443 fueron bloqueados. Recibo local ignorado por Git: `infra/asistente-gpu/recibos/red-interna-parcial-20261025T195036Z.txt`. |

La sonda parcial utilizó el artefacto realmente materializado `busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662`. Ese digest se fija sólo en el script de prueba parcial; no es una entrada de `images.lock`, no acredita una imagen del paquete GPU y no es una aprobación de producción.

## No ejecutado y bloqueante

No hay GPU ni `nvidia-smi` en sandbox. No se han materializado pesos, imágenes OCI del paquete, `images.lock`, `models.lock` ni `ARTIFACTS.sha256` finales. Tampoco se han probado Docker Compose completo, vLLM, FastAPI con pesos reales, Caddy/mTLS, firewall nftables, backup/restauración, TTFT, carga ni evaluación de 100 preguntas en el host futuro.

La única evidencia de salida existente es explícitamente parcial. Antes de procesar datos, el host autorizado debe ejecutar `probar-sin-salida.sh` tras aplicar un firewall de egress denegado y archivar sus recibos.
