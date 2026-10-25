#!/usr/bin/env bash
# Host GPU dedicado y aislado: no descarga, no instala paquetes y no inicia servicios.
# Carga exclusivamente artefactos cuya integridad se verifica mediante SHA-256.
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE="${1:-$ROOT/offline-bundle}"
MANIFEST="${2:-$BUNDLE/ARTIFACTS.sha256}"
APPLY_FIREWALL="${APPLY_FIREWALL:-0}"

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
info() { printf '==> %s\n' "$*"; }
require() { command -v "$1" >/dev/null 2>&1 || fail "Falta: $1"; }

[[ $EUID -eq 0 ]] || fail "Ejecutar mediante sudo en el host GPU dedicado."
for bin in docker python3 sha256sum rsync nft nvidia-smi; do require "$bin"; done
docker compose version >/dev/null || fail "Se requiere Docker Compose v2."
[[ -d "$BUNDLE" && -f "$MANIFEST" ]] || fail "No existe bundle o manifiesto: $BUNDLE"
[[ -f "$ROOT/.env" ]] || fail "Crear .env desde .env.example y usar chmod 600."
[[ -f "$ROOT/certs/fullchain.pem" && -f "$ROOT/certs/privkey.pem" && -f "$ROOT/certs/clients-ca.pem" ]] || fail "Faltan certificados PEM locales o CA de clientes."
grep -Eq 'CAMBIAR_|REEMPLAZAR_' "$ROOT/.env" && fail ".env contiene marcadores de ejemplo"
[[ "$(stat -c %a "$ROOT/.env")" == "600" ]] || fail ".env debe tener permisos 600"
[[ "$(stat -c %a "$ROOT/certs/privkey.pem")" == "600" ]] || fail "privkey.pem debe tener permisos 600"
grep -Eq 'REEMPLAZAR' "$MANIFEST" && fail "El manifiesto contiene marcadores"

info "GPU detectada"
nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader

info "Comprobando integridad del bundle"
(
  cd "$BUNDLE"
  sha256sum -c "$MANIFEST"
)

info "Creando grupo de operación sin privilegios y permisos mínimos"
getent group io-asistente >/dev/null || groupadd --system io-asistente
install -d -m 0750 -o root -g io-asistente "$ROOT/models" "$ROOT/recibos" "$ROOT/restauracion"
rsync -a --safe-links --delete "$BUNDLE/models/" "$ROOT/models/"
chown -R root:io-asistente "$ROOT/models"
chmod -R a-w "$ROOT/models"
chmod 0750 "$ROOT" "$ROOT/certs"

info "Cargando imágenes OCI verificadas (sin contacto con registro)"
shopt -s nullglob
images=("$BUNDLE"/images/*.tar "$BUNDLE"/images/*.oci.tar)
((${#images[@]} > 0)) || fail "No hay archivos OCI tar en $BUNDLE/images"
for image in "${images[@]}"; do
  docker load --input "$image"
done

info "Validación estática del Compose"
python3 "$ROOT/validar_compose.py"
info "Validación nativa de Docker Compose, sin iniciar servicios"
(
  cd "$ROOT"
  docker compose --env-file .env config -q
)

if [[ "$APPLY_FIREWALL" == "1" ]]; then
  [[ -n "${ASSISTANT_ALLOWED_INGRESS_CIDRS:-}" && -n "${ASSISTANT_ADMIN_SSH_CIDR:-}" ]] || fail "Exportar CIDR de relay y administración antes de APPLY_FIREWALL=1"
  [[ "$ASSISTANT_ALLOWED_INGRESS_CIDRS" != *"0.0.0.0/0"* ]] || fail "No se permite 0.0.0.0/0 como entrada"
  template="$ROOT/nftables.io-asistente.conf.template"
  target="/etc/nftables.d/io-asistente.conf"
  install -d -m 0755 /etc/nftables.d
  sed -e "s|__INGRESS_CIDRS__|$ASSISTANT_ALLOWED_INGRESS_CIDRS|" -e "s|__ADMIN_SSH_CIDR__|$ASSISTANT_ADMIN_SSH_CIDR|" "$template" >"$target"
  nft -c -f "$target"
  nft -f "$target"
  info "Firewall nftables aplicado con salida denegada por defecto. Verificar acceso SSH por consola fuera de banda."
else
  info "Firewall no aplicado (seguro por defecto). Revisar y ejecutar con APPLY_FIREWALL=1 y CIDR aprobados."
fi

cat <<'NEXT'

Preflight offline completado. No se han descargado paquetes ni arrancado contenedores.
Siguiente paso, tras revisión de consola, firewall y digests:
  docker compose --env-file .env --profile estado up -d
  # Añadir --profile observabilidad sólo si se ha aprobado Langfuse local anonimizado.
  ./probar-sin-salida.sh
  ./verificar-latencia.sh
Conservar los recibos generados en ./recibos junto con la revisión de ARTIFACTS.sha256.
NEXT
