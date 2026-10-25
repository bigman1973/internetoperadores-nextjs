# Instalación del servidor GPU sin salida a Internet

Este procedimiento es para un host dedicado de la UE, nuevo o desechable, con consola fuera de banda. No debe ejecutarse desde este repositorio ni convierte el diseño en un despliegue aprobado.

## 1. Precondiciones y responsables

Antes de tocar el host, deben estar aprobados: proveedor/región/DPA, relay privado o VPN, CIDR de entrada y de administración, certificados internos, clave de rotación, licencias de modelo, mantenimiento y responsable de restauración. Mantener acceso de consola fuera de banda: aplicar un firewall de denegación puede cortar SSH si el CIDR es erróneo.

El host necesita previamente Docker Engine/Compose v2, driver NVIDIA compatible, `nvidia-smi`, `nft`, `rsync`, Python 3 y `sha256sum`. Se instalan por imagen base o soporte offline aprobado; `instalar-offline.sh` **no instala software** ni descarga paquetes.

## 2. Preparar el bundle en una estación conectada

En una estación temporalmente conectada y separada del host final:

1. Copiar `images.lock.example` a `images.lock` y sustituir cada marcador por el digest completo `sha256:` revisado de una imagen concreta. No usar `latest`, `main` ni tags móviles.
2. Copiar `models.lock.example` a `models.lock`, registrar revisión Git completa (40 hexadecimales) para modelos de Hugging Face, o SHA-256 (64 hexadecimales) y URL HTTPS para la rueda de spaCy; anotar licencia y responsable de revisión. Evaluar el checkpoint AWQ exacto de Qwen antes de congelarlo.
3. Construir `io-assistant-rag:1.0.0` con ruedas, modelos y spaCy ya obtenidos en una fase controlada. Inspeccionar SBOM, vulnerabilidades y licencia. Guardar su digest en `images.lock`.
4. Ejecutar `./preparar-artefactos.sh /ruta/offline-bundle`. El script guarda imágenes OCI, modelos, manifest de modelo, `IMAGES.resolved` y `ARTIFACTS.sha256`.
5. Dos personas revisan `ARTIFACTS.sha256`, revisiones, digests, modelos y licencias. Transferir bundle y este directorio por soporte cifrado. Conservar el soporte como evidencia de cadena de suministro.

## 3. Preparar la configuración del host

En el directorio `infra/asistente-gpu` del host:

```bash
cp .env.example .env
chmod 600 .env
mkdir -p certs recibos
chmod 750 certs recibos
```

Asignar secretos aleatorios distintos por variable a través del canal de secretos aprobado. No guardar `.env`, claves ni certificados en Git. Instalar únicamente certificados PEM locales:

- `certs/fullchain.pem` y `certs/privkey.pem` para Caddy.
- `certs/clients-ca.pem` para validar el certificado del relay.

La interfaz de Caddy exige **mTLS** y `CADDY_GATEWAY_TOKEN`. No se usa ACME, por lo que la renovación de certificados debe tener procedimiento offline. Definir `ASSISTANT_ALLOWED_INGRESS_CIDRS` y `ASSISTANT_ADMIN_SSH_CIDR` como CIDR concretos, nunca `0.0.0.0/0`.

## 4. Preflight offline y firewall

Copiar `backup.env.example` a `backup.env`, establecer un destino local cifrado/montado y el fichero de destinatarios públicos de `age`. La identidad privada de restauración se custodia fuera del host y sólo se monta temporalmente en una restauración autorizada. Verificar permisos 600.

Primero ejecutar sin aplicar firewall:

```bash
sudo ./instalar-offline.sh /ruta/offline-bundle
```

El preflight verifica hashes, carga tar OCI con `docker load`, deja los modelos de sólo lectura, valida el Compose de forma estática y con `docker compose config -q`, pero no inicia servicios.

Revisar desde consola el fichero generado a partir de `nftables.io-asistente.conf.template`. Sólo con CIDR aprobados y consola disponible:

```bash
sudo ASSISTANT_ALLOWED_INGRESS_CIDRS='203.0.113.0/28' \
  ASSISTANT_ADMIN_SSH_CIDR='198.51.100.16/28' \
  APPLY_FIREWALL=1 ./instalar-offline.sh /ruta/offline-bundle
```

El firewall tiene políticas `drop` de entrada, reenvío y salida; permite únicamente administración desde CIDR aprobado, relay/VPN a Caddy y comunicación de las subredes Docker necesarias. Si se requiere hora, NTP debe ser un servicio interno aprobado y una excepción explícita; no abrir DNS/HTTP/HTTPS a Internet.

## 5. Arranque controlado y evidencias

Tras la revisión de hashes, reglas y espacio de disco:

```bash
# Redis sólo si se necesita estado local.
docker compose --env-file .env --profile estado up -d

# Langfuse sólo si existe aprobación para trazas ya anonimizadas.
docker compose --env-file .env --profile estado --profile observabilidad up -d

./probar-sin-salida.sh
./verificar-latencia.sh
```

Archivar los recibos de `recibos/`, el manifiesto SHA-256, versión de driver/GPU y resultado de `docker compose ps`. Si `probar-sin-salida.sh` permite DNS o TCP externo desde cualquier servicio, detener el proceso y corregir la red/firewall antes de procesar datos.

## 6. Operación, copias y actualización

- Copia: ejecutar `backup.sh`; crea una copia local cifrada de los volúmenes existentes, con contenedor `--network none`. Definir retención y conservar la clave fuera de Git.
- Restauración: ejecutar `restaurar.sh /ruta/backup.tar.age`; verifica hash, solicita confirmación y crea volúmenes nuevos sin sobrescribir los actuales. Probarlos en un proyecto aislado antes de conmutar manualmente.
- Actualización: repetir preparación offline en una estación conectada, revisar hashes/digests, probar en host desechable y documentar el cambio. No usar `docker pull` en el host.
- Incidente: detener `docker compose down`, preservar recibos/logs mínimos sin textos de usuarios y desactivar `ASSISTANT_MODE`/acceso en la aplicación. Investigar antes de reiniciar.

## Límites conocidos

Este repositorio sólo valida YAML, Python y scripts. No sustituye prueba de driver/CUDA, compatibilidad exacta AWQ/vLLM, mTLS, nftables, Docker, restauración o primer token en GPU real. Esas pruebas son bloqueantes antes de producción.
