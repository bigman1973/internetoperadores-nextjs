#!/usr/bin/env bash
# Ejecutar SÓLO en estación de preparación aprobada con Internet, nunca en el host GPU aislado.
# Descarga pesos/versiones inmutables, imágenes con digest y genera el manifiesto SHA-256.
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT="${1:-$ROOT/offline-bundle}"
IMAGES_LOCK="${IMAGES_LOCK:-$ROOT/images.lock}"
MODELS_LOCK="${MODELS_LOCK:-$ROOT/models.lock}"
PYTHON_BIN="${PYTHON_BIN:-python3}"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Falta el comando requerido: $1"; }

[[ -f "$IMAGES_LOCK" ]] || fail "Falta $IMAGES_LOCK; copiar y completar images.lock.example con digests reales."
[[ -f "$MODELS_LOCK" ]] || fail "Falta $MODELS_LOCK; copiar y completar models.lock.example con revisiones inmutables."
grep -Eq 'REEMPLAZAR|latest|:main|:stable' "$IMAGES_LOCK" && fail "images.lock contiene marcadores o tags móviles"
grep -Eq 'REEMPLAZAR' "$MODELS_LOCK" && fail "models.lock contiene marcadores"
require docker
require sha256sum
require hf
require curl
require "$PYTHON_BIN"

mkdir -p "$OUTPUT/images" "$OUTPUT/models"
: >"$OUTPUT/IMAGES.resolved"

info "Descargando imágenes fijadas por digest y exportándolas como OCI tar"
while IFS='=' read -r name reference; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ "$reference" == *@sha256:* ]] || fail "$name no está fijada por digest: $reference"
  info "Imagen $name"
  docker pull "$reference"
  digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "$reference")"
  [[ "$digest" == "$reference" ]] || fail "El digest descargado no coincide para $name"
  file_name="$(printf '%s' "$name" | tr '/:' '__').oci.tar"
  docker save --output "$OUTPUT/images/$file_name" "$reference"
  printf '%s=%s\n' "$name" "$digest" >>"$OUTPUT/IMAGES.resolved"
done <"$IMAGES_LOCK"

info "Descargando modelos y ruedas con revisiones inmutables"
while IFS='|' read -r kind local_name source immutable; do
  [[ -z "$kind" || "$kind" == \#* ]] && continue
  [[ -n "$local_name" && -n "$source" && -n "$immutable" ]] || fail "Línea de modelo incompleta: $kind|$local_name"
  target="$OUTPUT/models/$local_name"
  rm -rf "$target"
  case "$kind" in
    hf)
      [[ "$immutable" =~ ^[0-9a-f]{40}$ ]] || fail "$local_name no tiene revisión Git SHA-1 completa"
      hf download "$source" --revision "$immutable" --local-dir "$target"
      printf '{"source_type":"hf","repository":"%s","revision":"%s"}\n' "$source" "$immutable" >"$target/MODEL_MANIFEST.json"
      ;;
    spacy-wheel)
      [[ "$source" =~ ^https:// ]] || fail "$local_name debe provenir de URL HTTPS"
      [[ "$immutable" =~ ^[0-9a-f]{64}$ ]] || fail "$local_name no tiene SHA-256 de rueda válido"
      tmp="$(mktemp -d)"
      trap 'rm -rf "$tmp"' RETURN
      wheel="$tmp/$local_name.whl"
      curl --fail --location --proto '=https' --tlsv1.2 --output "$wheel" "$source"
      printf '%s  %s\n' "$immutable" "$wheel" | sha256sum -c -
      site="$tmp/site"
      "$PYTHON_BIN" -m pip install --no-deps --no-index --target "$site" "$wheel"
      [[ -d "$site/$local_name" ]] || fail "La rueda spaCy no contiene paquete $local_name"
      mv "$site/$local_name" "$target"
      printf '{"source_type":"spacy-wheel","url":"%s","sha256":"%s"}\n' "$source" "$immutable" >"$target/MODEL_MANIFEST.json"
      rm -rf "$tmp"
      trap - RETURN
      ;;
    *) fail "Tipo de modelo no permitido: $kind (usar hf o spacy-wheel)" ;;
  esac
done <"$MODELS_LOCK"

info "Generando hashes de cada artefacto"
(
  cd "$OUTPUT"
  find images models -type f -print0 | sort -z | xargs -0 sha256sum > ARTIFACTS.sha256
)
chmod -R a-w "$OUTPUT/models"
info "Bundle creado: $OUTPUT"
info "Revisión requerida: verificar IMAGES.resolved, ARTIFACTS.sha256, licencias y firmas antes de transferir por soporte cifrado."
