# `asistente-rag`

Microservicio FastAPI local para el asistente de Internet Operadores. Implementa exclusivamente `GET /health`, `POST /v1/embeddings`, `POST /v1/rerank` y `POST /v1/redact` del contrato común. No expone documentación interactiva y no registra textos de usuario: sólo contadores agregados en memoria.

## Garantías de ejecución

- Fuerza `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`, `HF_HUB_DISABLE_UPDATE_CHECK=1`, `DO_NOT_TRACK=1` y `OTEL_SDK_DISABLED=true` antes de cargar modelos.
- La autenticación `Authorization: Bearer …` usa `hmac.compare_digest`. `ASSISTANT_RAG_API_KEY` es obligatoria: no existe una clave por defecto.
- El backend `real` acepta sólo subdirectorios de `ASSISTANT_MODELS_DIR` (por defecto `/models`) y carga `bge-m3`, `bge-reranker-v2-m3` y `es_core_news_lg` con ficheros locales.
- El backend `fake` es determinista y sólo está destinado a pruebas: hash SHA-256 a vector L2 de 1.024 dimensiones, solapamiento léxico para rerank y expresiones regulares españolas para PII.
- Ningún modelo se descarga al arrancar. Los pesos, la imagen y las ruedas se preparan en una estación conectada y se verifican antes de pasar al host aislado.

## Desarrollo y pruebas locales

Se admite Python 3.11 o posterior. En una estación de desarrollo, no en el host aislado:

```bash
python3 -m venv /ruta/venv
. /ruta/venv/bin/activate
pip install -r requirements-dev.txt
export ASSISTANT_RAG_API_KEY='clave-local-larga-y-aleatoria'
export ASSISTANT_RAG_BACKEND=fake
pytest -q
uvicorn asistente_rag.asgi:app --host 127.0.0.1 --port 8080
```

Las pruebas parchean `socket.socket.connect` para que falle cualquier destino no loopback y verifican el arranque y las respuestas fake sin red.

## Backend real

Para iniciar el backend real, monte los artefactos ya comprobados en sólo lectura y configure:

```bash
export ASSISTANT_RAG_BACKEND=real
export ASSISTANT_MODELS_DIR=/models
export ASSISTANT_RAG_API_KEY='secreto-inyectado-por-entorno'
```

Debe existir `/models/bge-m3`, `/models/bge-reranker-v2-m3` y `/models/es_core_news_lg`; cualquier falta produce error de arranque. La imagen de producción se construye offline con `wheelhouse/` y no ejecuta `pip` contra Internet.

## Límites API

| Ruta | Límite |
|---|---|
| `/v1/embeddings` | 1–64 textos, cada uno hasta 8.000 caracteres; dimensión 1.024 |
| `/v1/rerank` | consulta hasta 8.000 caracteres y 1–50 documentos, cada uno hasta 8.000 caracteres |
| `/v1/redact` | texto de hasta 20.000 caracteres, `language: "es"` |
| Cuerpo HTTP | 1 MiB |

Ante fallo del servicio, el consumidor debe degradar a FTS/redacción regex local conforme al contrato; no debe usar proveedores externos.
