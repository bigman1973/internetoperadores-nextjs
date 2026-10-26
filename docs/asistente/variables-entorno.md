# Variables de entorno del asistente

Las variables se inyectan por entorno o gestor de secretos. No incluir secretos reales en Git, logs, capturas ni tickets. Los valores de esta tabla reflejan el contrato; los campos editables del panel nunca pueden relajar una variable de entorno: el modo efectivo es el más restrictivo y `ASSISTANT_MODE=desactivado` siempre gana.

## Aplicación Next.js

| Variable | Predeterminado | Staging | Producción | Efecto |
|---|---|---|---|---|
| `FINANCE_STAGING_SANDBOX` | ausente | `1` | ausente | Señala staging para la regla única de activación. |
| `ASSISTANT_PUBLIC_ENABLED` | ausente | si falta, visible por regla de staging; ejemplo `false` | `false`/ausente | Sólo `true` activa explícitamente; `false` apaga siempre. Producción apagada sin `true`. |
| `ASSISTANT_CLIENT_ENABLED` | `false` | `false` | `false` | Sólo `true` lo activa; hoy debe permanecer apagado. |
| `ASSISTANT_MODE` | si falta: `extractivo` en staging, `desactivado` fuera | `extractivo` | `desactivado` | `extractivo`, `local` o `desactivado`; valor inválido o apagado efectivo impide generación. |
| `ASSISTANT_LOCAL_BASE_URL` | vacía | vacía | URL OpenAI interna aprobada | Endpoint privado de vLLM, p. ej. relay/Caddy; no proveedor público. |
| `ASSISTANT_LOCAL_MODEL` | vacía | vacía | `io-qwen3-32b-awq` tras validación | Nombre servido por vLLM. |
| `ASSISTANT_LOCAL_API_KEY` | vacía | secreto si existe relay | secreto rotatorio | Token del upstream interno; nunca `OPENAI_API_KEY`. |
| `ASSISTANT_EMBEDDINGS_URL` | vacía | vacía = sólo FTS | URL RAG interna aprobada | Base de `/health`, `/v1/embeddings`, `/v1/rerank`, `/v1/redact`. |
| `ASSISTANT_EMBEDDINGS_API_KEY` | vacía | secreto si hay RAG | secreto rotatorio | Bearer del microservicio RAG. |
| `ASSISTANT_RERANK_ENABLED` | `false` | `false` hasta medir | `false` hasta P95 ≤600 ms | Habilita reranking opcional; no es dependencia de disponibilidad. |
| `ASSISTANT_MAX_MESSAGE_CHARS` | `1500` | `1500` | `1500` | Máximo de mensaje de chat público. |
| `ASSISTANT_PUBLIC_RATE_LIMIT_PER_10M` | `20` | `20` | `20` | Peticiones públicas por 10 minutos para clave HMAC. |
| `ASSISTANT_HASH_SECRET` | derivar de `NEXTAUTH_SECRET` si falta | secreto | secreto independiente recomendado | HMAC de IP/visitante; nunca persistir IP en claro. |
| `ASSISTANT_RETENTION_MONTHS` | `12` | `12` | `12` | Retención configurable pendiente de aprobación jurídica. |
| `ASSISTANT_CONSENT_VERSION` | `2026-10-borrador` | igual | versión aprobada al publicar | Versión de información/consentimiento conservada. |
| `ASSISTANT_EMAIL_ENABLED` | `false` | `false` | `false` hasta aprobación | Prohíbe envío de correos del asistente. |
| `ASSISTANT_CRON_ENABLED` | `false` | `false` | `false` hasta aprobación | Activa endpoint de cron sólo tras controles. |
| `ASSISTANT_DAILY_REPORT_HOUR` | `8` | `8` | `8` | Hora local Europe/Madrid del informe, sólo panel. |

### Regla única de activación

`esStaging = FINANCE_STAGING_SANDBOX === '1'`.

- Widget público visible si `ASSISTANT_PUBLIC_ENABLED === 'true'` o si no está definida y `esStaging` es verdadero.
- `ASSISTANT_PUBLIC_ENABLED='false'` apaga siempre.
- Si `ASSISTANT_MODE` falta, el modo es `extractivo` en staging y `desactivado` fuera; sólo se aceptan `extractivo`, `local`, `desactivado`.
- `ASSISTANT_CLIENT_ENABLED` se activa sólo con la cadena exacta `true`.
- El proveedor local sólo puede usar `localhost`, `*.internal`, `*.railway.internal`, rangos 10/8, 172.16/12 o 192.168/16, o una allowlist explícita de entorno; nunca un dominio público de IA.

## Host GPU / microservicio

| Variable | Valor seguro inicial | Efecto |
|---|---|---|
| `ASSISTANT_RAG_API_KEY` | sin valor; secreto obligatorio | Bearer de FastAPI. El proceso no inicia con marcador/ausente. |
| `ASSISTANT_RAG_BACKEND` | `real` en host, `fake` sólo tests | Selecciona pesos locales o sustituto determinista. |
| `ASSISTANT_MODELS_DIR` | `/models` | Raíz única de pesos locales de sólo lectura. |
| `ASSISTANT_EMBEDDINGS_MODEL` | `bge-m3` | Subdirectorio local de embeddings. |
| `ASSISTANT_RERANK_MODEL` | `bge-reranker-v2-m3` | Subdirectorio local de reranker. |
| `ASSISTANT_SPACY_MODEL` | `es_core_news_lg` | Subdirectorio local spaCy. |
| `VLLM_MODEL_PATH` | `/models/Qwen3-32B-AWQ` | Checkpoint AWQ local exacto. |
| `VLLM_SERVED_MODEL_NAME` | `io-qwen3-32b-awq` | Nombre que expone vLLM. |
| `VLLM_INTERNAL_API_KEY` | sin valor; secreto obligatorio | Token vLLM sólo tras Caddy/relay. |
| `CADDY_GATEWAY_TOKEN` | sin valor; secreto obligatorio | Segundo factor de acceso del relay a Caddy. |
| `CADDY_TLS_CERT_FILE`, `CADDY_TLS_KEY_FILE`, `CADDY_CLIENT_CA_FILE` | rutas `/run/certs/*` | PEM locales y CA de mTLS; no ACME. |
| `ASSISTANT_ALLOWED_INGRESS_CIDRS` | sin valor | CIDR exacto de relay/VPN para firewall; no `0.0.0.0/0`. |
| `ASSISTANT_ADMIN_SSH_CIDR` | sin valor | CIDR de SSH de administración. |
| `LANGFUSE_*`, `MINIO_*` | sin valor; secretos obligatorios al habilitar perfil | Sólo necesarios con `observabilidad`; tracing y telemetría apagados por defecto. |

Estas variables se complementan con valores forzados en Compose: `HF_HUB_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`, `HF_HUB_DISABLE_UPDATE_CHECK=1`, `TRANSFORMERS_OFFLINE=1`, `DO_NOT_TRACK=1`, `VLLM_NO_USAGE_STATS=1`, `VLLM_DO_NOT_TRACK=1`, `TELEMETRY_ENABLED=false`, `LANGFUSE_TRACING_ENABLED=false` y `OTEL_SDK_DISABLED=true`.
