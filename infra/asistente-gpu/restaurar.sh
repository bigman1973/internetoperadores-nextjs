#!/usr/bin/env bash
# Restaura un backup cifrado en volúmenes nuevos; no sobrescribe el estado actual.
set -Eeuo pipefail
IFS=$'\n\t'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
archive="${1:?Uso: ./restaurar.sh /ruta/backup.tar.age}"
[[ -f backup.env ]] || { echo 'FALLO: falta backup.env' >&2; exit 1; }
source backup.env
[[ -f "$archive" && -f "$archive.sha256" ]] || { echo 'FALLO: faltan backup o checksum' >&2; exit 1; }
sha256sum -c "$archive.sha256"
: "${BACKUP_AGE_IDENTITY_FILE:?}"
[[ -f "$BACKUP_AGE_IDENTITY_FILE" ]] || { echo 'FALLO: montar la identidad age custodiada para restaurar' >&2; exit 1; }
command -v age >/dev/null || { echo 'FALLO: age no está disponible' >&2; exit 1; }
read -r -p 'Escriba RESTAURAR para crear volúmenes restaurados sin tocar los actuales: ' confirmation
[[ "$confirmation" == "RESTAURAR" ]] || { echo 'Cancelado.'; exit 0; }
stamp="restored-$(date -u +%Y%m%dT%H%M%SZ)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
age -d -i "$BACKUP_AGE_IDENTITY_FILE" "$archive" | tar -C "$work" -xf -
for source in "$work"/*; do
  [[ -d "$source" ]] || continue
  base="$(basename "$source")"
  target="${base}-${stamp}"
  docker volume create "$target" >/dev/null
  docker run --rm --network none -v "$target:/target" -v "$source:/source:ro" busybox:1.36.1 sh -c 'cp -a /source/. /target/ && ls -la /target >/dev/null'
  printf 'OK: restaurado %s en volumen %s\n' "$base" "$target"
done
printf 'Verificar con docker compose en un proyecto de restauración aislado antes de conmutar manualmente.\n'
