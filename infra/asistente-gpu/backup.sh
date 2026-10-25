#!/usr/bin/env bash
# Copia local cifrada de los volúmenes con estado; no sube datos a ningún servicio.
set -Eeuo pipefail
IFS=$'\n\t'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
[[ -f backup.env ]] || { echo 'FALLO: crear backup.env desde backup.env.example (chmod 600)' >&2; exit 1; }
# shellcheck disable=SC1091
source backup.env
: "${BACKUP_DESTINATION:?}"
: "${BACKUP_RETENTION_DAYS:?}"
 : "${BACKUP_AGE_RECIPIENTS_FILE:?}"
[[ -f "$BACKUP_AGE_RECIPIENTS_FILE" ]] || { echo 'FALLO: falta el fichero de destinatarios age' >&2; exit 1; }
command -v age >/dev/null || { echo 'FALLO: age debe preinstalarse desde el bundle del sistema' >&2; exit 1; }
mkdir -p "$BACKUP_DESTINATION"
name="io-asistente-volumes-$(date -u +%Y%m%dT%H%M%SZ).tar.age"
target="$BACKUP_DESTINATION/$name"
volumes=(io-asistente_redis-data io-asistente_langfuse-postgres io-asistente_clickhouse-data io-asistente_minio-data)
existing=()
for volume in "${volumes[@]}"; do
  docker volume inspect "$volume" >/dev/null 2>&1 && existing+=("$volume")
done
((${#existing[@]} > 0)) || { echo 'FALLO: no hay volúmenes de estado existentes' >&2; exit 1; }
# Contenedor busybox ya viene en el bundle; --network none impide salida durante el backup.
docker run --rm --network none -v "${existing[0]}:/volumes/${existing[0]}:ro" busybox:1.36.1 sh -c true >/dev/null
args=()
for volume in "${existing[@]}"; do args+=(-v "$volume:/volumes/$volume:ro"); done
docker run --rm --network none "${args[@]}" busybox:1.36.1 tar -C /volumes -cf - . | age -R "$BACKUP_AGE_RECIPIENTS_FILE" -o "$target"
sha256sum "$target" >"$target.sha256"
find "$BACKUP_DESTINATION" -type f -name 'io-asistente-volumes-*.tar.age' -mtime "+$BACKUP_RETENTION_DAYS" -delete
printf 'OK: backup local cifrado: %s\n' "$target"
