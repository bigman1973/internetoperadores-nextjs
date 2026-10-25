#!/usr/bin/env python3
"""Valida invariantes de aislamiento del Compose del asistente sin ejecutar Docker."""
from __future__ import annotations

import re
import sys
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as error:
    raise SystemExit("Falta PyYAML: instalarlo sólo en el venv de validación.") from error

ROOT = Path(__file__).resolve().parent
COMPOSE = ROOT / "docker-compose.yml"


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def main() -> int:
    payload = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        print("FALLO: docker-compose.yml no es un objeto YAML", file=sys.stderr)
        return 1
    errors: list[str] = []
    services = payload.get("services")
    networks = payload.get("networks")
    if not isinstance(services, dict) or not services:
        fail(errors, "No hay servicios definidos")
        services = {}
    if not isinstance(networks, dict):
        fail(errors, "No hay redes definidas")
        networks = {}

    interna = networks.get("interna")
    borde = networks.get("borde")
    if not isinstance(interna, dict) or interna.get("internal") is not True:
        fail(errors, "La red interna debe declarar internal: true")
    if not isinstance(borde, dict) or borde.get("internal") is True:
        fail(errors, "La red borde debe existir y no puede ser internal")

    telemetry = {
        "HF_HUB_OFFLINE": "1",
        "HF_HUB_DISABLE_TELEMETRY": "1",
        "HF_HUB_DISABLE_UPDATE_CHECK": "1",
        "HF_HUB_DISABLE_IMPLICIT_TOKEN": "1",
        "HF_DATASETS_OFFLINE": "1",
        "TRANSFORMERS_OFFLINE": "1",
        "DO_NOT_TRACK": "1",
        "OTEL_SDK_DISABLED": "true",
    }
    forbidden_floating = re.compile(r"(?:^|:)(?:latest|main|stable)$", re.IGNORECASE)
    for name, spec in services.items():
        if not isinstance(spec, dict):
            fail(errors, f"{name}: definición inválida")
            continue
        image = spec.get("image", "")
        if not isinstance(image, str) or ("@sha256:" not in image and ":" not in image):
            fail(errors, f"{name}: la imagen debe fijarse por digest o versión exacta")
        elif forbidden_floating.search(image):
            fail(errors, f"{name}: tag móvil prohibido ({image})")
        if spec.get("pull_policy") != "never":
            fail(errors, f"{name}: pull_policy debe ser never")
        if spec.get("restart") != "unless-stopped":
            fail(errors, f"{name}: restart debe ser unless-stopped")
        if not spec.get("mem_limit") or not spec.get("cpus") or not spec.get("pids_limit"):
            fail(errors, f"{name}: debe declarar mem_limit, cpus y pids_limit")
        if name != "caddy" and "ports" in spec:
            fail(errors, f"{name}: no puede publicar puertos del host")
        if name == "caddy" and spec.get("ports") != ["443:8443"]:
            fail(errors, "caddy: sólo puede publicar 443:8443")
        service_networks = set(as_list(spec.get("networks")))
        if name == "caddy":
            if service_networks != {"borde", "interna"}:
                fail(errors, "caddy: debe estar sólo en borde e interna")
        elif service_networks != {"interna"}:
            fail(errors, f"{name}: debe estar únicamente en la red interna")
        if spec.get("security_opt") is None or "no-new-privileges:true" not in as_list(spec.get("security_opt")):
            fail(errors, f"{name}: falta no-new-privileges")
        if "ALL" not in as_list(spec.get("cap_drop")):
            fail(errors, f"{name}: debe retirar todas las capabilities")
        environment = spec.get("environment") or {}
        if not isinstance(environment, dict):
            fail(errors, f"{name}: environment debe ser un mapa")
            environment = {}
        if name in {"asistente-rag", "vllm"}:
            for key, expected in telemetry.items():
                if str(environment.get(key)).lower() != expected:
                    fail(errors, f"{name}: {key} debe ser {expected}")
        if name == "vllm":
            for key, expected in {"VLLM_NO_USAGE_STATS": "1", "VLLM_DO_NOT_TRACK": "1"}.items():
                if str(environment.get(key)).lower() != expected:
                    fail(errors, f"vllm: {key} debe ser {expected}")
        if name in {"langfuse-web", "langfuse-worker"}:
            for key, expected in {"TELEMETRY_ENABLED": "false", "LANGFUSE_TRACING_ENABLED": "false"}.items():
                if str(environment.get(key)).lower() != expected:
                    fail(errors, f"{name}: {key} debe ser {expected}")
        if name in {"asistente-rag", "vllm"}:
            volumes = as_list(spec.get("volumes"))
            if "./models:/models:ro" not in volumes:
                fail(errors, f"{name}: los modelos deben montarse ./models:/models:ro")
        if name == "asistente-rag" and spec.get("read_only") is not True:
            fail(errors, "asistente-rag: root filesystem debe ser de sólo lectura")

    if services.get("redis", {}).get("profiles") != ["estado"]:
        fail(errors, "redis: debe quedar apagado por defecto en el perfil estado")
    for name in ("langfuse-web", "langfuse-worker", "langfuse-db", "clickhouse", "minio"):
        if services.get(name, {}).get("profiles") != ["observabilidad"]:
            fail(errors, f"{name}: debe quedar apagado por defecto en el perfil observabilidad")

    caddyfile = (ROOT / "Caddyfile").read_text(encoding="utf-8")
    for required in ("auto_https off", "admin off", "require_and_verify", "CADDY_GATEWAY_TOKEN"):
        if required not in caddyfile:
            fail(errors, f"Caddyfile: falta control {required}")

    if errors:
        print("FALLO: validación de Compose")
        for message in errors:
            print(f" - {message}")
        return 1
    print("OK: Compose validado: red interna aislada, Caddy único borde, límites, telemetría apagada y modelos RO.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
