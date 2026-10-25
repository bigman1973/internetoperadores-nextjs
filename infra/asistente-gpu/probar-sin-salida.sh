#!/usr/bin/env bash
# Prueba de aceptación tras docker compose up -d. Debe fallar DNS y TCP externos
# desde el espacio de red de CADA contenedor en ejecución. Genera un recibo.
set -Eeuo pipefail
IFS=$'\n\t'

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
RECEIPTS="$ROOT/recibos"
mkdir -p "$RECEIPTS"
RECEIPT="$RECEIPTS/sin-salida-$(date -u +%Y%m%dT%H%M%SZ).txt"
exec > >(tee "$RECEIPT") 2>&1

fail() { printf 'FALLO: %s\n' "$*"; exit 1; }
pass() { printf 'OK: %s\n' "$*"; }
run() { docker compose --env-file .env "$@"; }

[[ $EUID -eq 0 ]] || fail "Ejecutar como root: nsenter necesita acceder a los espacios de red Docker."
[[ -f .env ]] || fail "Falta .env"
command -v nsenter >/dev/null || fail "Falta nsenter (util-linux)"
command -v python3 >/dev/null || fail "Falta Python 3 en el host"
docker compose version >/dev/null || fail "Docker Compose v2 no disponible"

printf 'Recibo de aislamiento sin salida\nUTC: %s\nHost: %s\n\n' "$(date -u +%FT%TZ)" "$(hostname -f 2>/dev/null || hostname)"
python3 validar_compose.py

mapfile -t services < <(run ps --services --status running)
((${#services[@]} > 0)) || fail "No hay servicios de Compose en ejecución"

for service in "${services[@]}"; do
  cid="$(run ps -q "$service")"
  [[ -n "$cid" ]] || fail "$service no tiene contenedor"
  ports="$(docker inspect -f '{{json .NetworkSettings.Ports}}' "$cid")"
  if [[ "$service" == "caddy" ]]; then
    [[ "$ports" == *'8443'* ]] || fail "Caddy no publica el puerto TLS esperado"
  else
    [[ "$ports" == "{}" || "$ports" == "null" ]] || fail "$service publica puertos: $ports"
  fi
  pass "$service cumple la política de publicación de puertos"
done

network="$(docker network ls --format '{{.Name}}' | grep -E '_interna$' | head -n1 || true)"
[[ -n "$network" ]] || fail "No se localizó red interna"
[[ "$(docker network inspect -f '{{.Internal}}' "$network")" == "true" ]] || fail "La red $network no es interna"
pass "red $network marcada Internal=true"

# Se usa Python del host dentro del namespace de red del contenedor: así se prueba cada
# contenedor aunque la imagen no incluya shell, DNS, curl o cliente TCP. El segundo
# intento usa un nombre externo; ambos deben fallar. No se imprime contenido de datos.
probe='import socket, sys
socket.setdefaulttimeout(3)
def rejected(label, operation):
    try:
        operation()
    except OSError:
        print("bloqueado=" + label)
        return
    raise SystemExit("permitido=" + label)
rejected("tcp-1.1.1.1:443", lambda: socket.create_connection(("1.1.1.1", 443), 3))
rejected("dns-y-tcp-example.com:443", lambda: socket.create_connection(("example.com", 443), 3))'

for service in "${services[@]}"; do
  cid="$(run ps -q "$service")"
  pid="$(docker inspect -f '{{.State.Pid}}' "$cid")"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] || fail "$service no tiene PID de red válido"
  output="$(nsenter -t "$pid" -n python3 -c "$probe" 2>&1)" || fail "$service tiene salida externa o el probe falló: $output"
  [[ "$output" == *'bloqueado=tcp-1.1.1.1:443'* && "$output" == *'bloqueado=dns-y-tcp-example.com:443'* ]] || fail "$service no produjo ambas evidencias: $output"
  pass "$service no resuelve/conecta a destinos externos desde su namespace de red"
done

printf '\nPuertos en escucha del host (revisión manual):\n'
ss -lntup || true
printf '\nConntrack para destinos de prueba (debe estar vacío):\n'
if command -v conntrack >/dev/null 2>&1; then
  conntrack -L 2>/dev/null | grep -E 'dst=(1\.1\.1\.1|93\.184\.216\.34)' || true
else
  printf 'conntrack no disponible: instalarlo previamente desde el bundle de sistema si se exige esta evidencia.\n'
fi
pass "aislamiento comprobado; recibo: $RECEIPT"
