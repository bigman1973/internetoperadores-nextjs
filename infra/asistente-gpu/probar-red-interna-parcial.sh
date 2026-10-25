#!/usr/bin/env bash
# Prueba parcial de aceptación para la semántica Docker de `internal: true`.
# No arranca el Compose del asistente, no usa modelos, ni acredita GPU/vLLM/Caddy.
# Sólo está permitida en una estación de desarrollo temporal con Docker y root.
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECEIPTS="$ROOT/recibos"
mkdir -p "$RECEIPTS"
RECEIPT="$RECEIPTS/red-interna-parcial-$(date -u +%Y%m%dT%H%M%SZ).txt"
PROJECT="io-asistente-prueba-$RANDOM-$$"
NETWORK="${PROJECT}-interna"
CONTAINER="${PROJECT}-sonda"
WORK="$(mktemp -d)"
# Digest real materializado el 25/10/2026 sólo para esta sonda CPU parcial.
# No sustituye images.lock ni es una aprobación de un artefacto de producción.
PROBE_IMAGE="busybox@sha256:73aaf090f3d85aa34ee199857f03fa3a95c8ede2ffd4cc2cdb5b94e566b11662"

fail() { printf 'FALLO: %s\n' "$*" >&2; exit 1; }
pass() { printf 'OK: %s\n' "$*"; }
cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

[[ $EUID -eq 0 ]] || fail "Ejecutar como root; la sonda entra en el namespace de red del contenedor."
command -v docker >/dev/null || fail "Docker no está disponible"
command -v nsenter >/dev/null || fail "nsenter no está disponible"
command -v python3 >/dev/null || fail "Python 3 no está disponible"
docker info >/dev/null 2>&1 || fail "El daemon Docker no está operativo"

exec > >(tee "$RECEIPT") 2>&1
printf 'Recibo real de prueba PARCIAL de red Docker\n'
printf 'UTC: %s\n' "$(date -u +%FT%TZ)"
printf 'Alcance: busybox ligero en una red bridge internal=true; sin modelos, GPU, Caddy, vLLM, RAG, Redis ni Langfuse.\n\n'

# Docker puede descargar sólo esta imagen CPU ligera y fijada en la estación de pruebas.
docker network create --internal "$NETWORK" >/dev/null
docker run -d --name "$CONTAINER" --network "$NETWORK" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL --security-opt no-new-privileges:true \
  "$PROBE_IMAGE" sleep 120 >/dev/null

[[ "$(docker network inspect -f '{{.Internal}}' "$NETWORK")" == "true" ]] || fail "La red de prueba no quedó marcada Internal=true"
ports="$(docker inspect -f '{{json .NetworkSettings.Ports}}' "$CONTAINER")"
[[ "$ports" == "{}" || "$ports" == "null" ]] || fail "La sonda publicó puertos del host"
pass "red internal=true y contenedor sin puertos publicados"

pid="$(docker inspect -f '{{.State.Pid}}' "$CONTAINER")"
[[ "$pid" =~ ^[1-9][0-9]*$ ]] || fail "La sonda no tiene PID de namespace de red"
cat >"$WORK/probe.py" <<'PY'
import socket
import sys

socket.setdefaulttimeout(3)

def must_fail(label, operation):
    try:
        operation()
    except OSError:
        print(f"bloqueado={label}")
        return
    raise SystemExit(f"permitido={label}")

must_fail("tcp-1.1.1.1:443", lambda: socket.create_connection(("1.1.1.1", 443), 3))
must_fail("dns-example.com", lambda: socket.getaddrinfo("example.com", 443, type=socket.SOCK_STREAM))
PY

output="$(nsenter -t "$pid" -n python3 "$WORK/probe.py" 2>&1)" || fail "La sonda permitió salida o la comprobación falló: $output"
[[ "$output" == *'bloqueado=tcp-1.1.1.1:443'* ]] || fail "No se acreditó el bloqueo TCP"
[[ "$output" == *'bloqueado=dns-example.com'* ]] || fail "No se acreditó el bloqueo DNS"
printf '%s\n' "$output"
pass "DNS y TCP externo bloqueados desde el namespace de la sonda"
printf '\nRESULTADO: PARCIAL SUPERADO. No es evidencia de la pila GPU completa ni sustituye probar-sin-salida.sh en el host final.\n'
printf 'Recibo: %s\n' "$RECEIPT"
