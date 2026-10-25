#!/usr/bin/env bash
# Mide TTFT contra vLLM desde Caddy/mTLS o, por defecto, desde la red interna.
# Objetivo de aceptación: primer token < 3 s; registrar también el valor medido.
set -Eeuo pipefail
IFS=$'\n\t'
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
[[ -f .env ]] || { echo 'FALLO: falta .env' >&2; exit 1; }
set -a; source .env; set +a
mkdir -p recibos
receipt="recibos/latencia-$(date -u +%Y%m%dT%H%M%SZ).json"

# La ejecución ocurre dentro de Caddy (contiene Python) para medir la ruta autorizada
# entre servicios. No se imprime prompt ni respuesta, sólo métricas agregadas.
cid="$(docker compose --env-file .env ps -q caddy)"
[[ -n "$cid" ]] || { echo 'FALLO: Caddy no está en ejecución' >&2; exit 1; }

docker exec -e VLLM_INTERNAL_API_KEY="$VLLM_INTERNAL_API_KEY" -e VLLM_SERVED_MODEL_NAME="$VLLM_SERVED_MODEL_NAME" "$cid" python3 - <<'PY' | tee "$receipt"
import json, os, time, urllib.request
payload = json.dumps({
    "model": os.environ["VLLM_SERVED_MODEL_NAME"],
    "messages": [{"role": "user", "content": "Resume en una frase: conexión de respaldo."}],
    "max_tokens": 16,
    "temperature": 0,
    "stream": True,
}).encode()
request = urllib.request.Request(
    "http://vllm:8000/v1/chat/completions", data=payload,
    headers={"Content-Type": "application/json", "Authorization": "Bearer " + os.environ["VLLM_INTERNAL_API_KEY"]},
)
started = time.monotonic()
first = None
with urllib.request.urlopen(request, timeout=30) as response:
    for raw in response:
        if raw.startswith(b"data: ") and raw.strip() != b"data: [DONE]":
            event = json.loads(raw[6:])
            choices = event.get("choices", [])
            if choices and choices[0].get("delta", {}).get("content"):
                first = time.monotonic() - started
                break
if first is None:
    raise SystemExit("FALLO: no se recibió token de streaming")
result = {"ttft_seconds": round(first, 4), "objective_seconds": 3.0, "passes": first < 3.0}
print(json.dumps(result, ensure_ascii=False))
if not result["passes"]:
    raise SystemExit("FALLO: TTFT no alcanza el objetivo de 3 segundos")
PY

echo "OK: recibo de latencia: $receipt"
