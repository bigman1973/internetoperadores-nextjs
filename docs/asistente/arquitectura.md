# Arquitectura del asistente IA privado

**Estado:** diseño e implementación de infraestructura para `staging`; no autoriza ni ejecuta despliegues. La producción permanece apagada hasta aprobación expresa.

## Principios no negociables

- Inferencia, embeddings, reranking y redacción con pesos abiertos locales; sin API externa de IA, búsqueda en tiempo de ejecución ni *tool calling*.
- Sin telemetría: Hugging Face, Transformers, vLLM, OpenTelemetry y Langfuse se arrancan con sus interruptores de telemetría desactivados. El host también impone denegación de salida.
- Los pesos, ruedas e imágenes se preparan con revisión de hash en una estación conectada y se trasladan al host aislado. El host nunca ejecuta `docker pull`, `pip install` ni descargas de modelos.
- La aplicación Next.js conserva autorización, límites, anonimización antes de persistir y el filtro ACL en SQL. El navegador no accede a GPU, RAG ni Redis.
- Caddy es el único borde del host GPU. Exige certificado de cliente (mTLS) y token de relay; no usa ACME ni registra solicitudes. vLLM, RAG, Redis y Langfuse no publican puertos.

## Recuperación por fases

| Entorno | Recuperación inicial | Vectorial | Generación |
|---|---|---|---|
| Staging | FTS español sobre `asistente_*`, máximo 50 candidatos | columna `embedding real[]` opcional; coseno en servidor cuando exista microservicio | `extractivo`; `ASSISTANT_EMBEDDINGS_URL` vacío implica sólo FTS |
| Producción futura | Híbrida, tras pruebas de ACL y calidad | pgvector en **base separada** y aislada, nunca en `io_staging_finanzas` | `local` sólo tras aprobación, benchmark y servidor GPU |

En staging no se instala `pgvector`: el rol no tiene permisos para extensiones. La búsqueda usa `tsvector('spanish', contenido_norm)` con texto normalizado sin tildes, índices GIN y filtros de espacio, rol, tenant, documento publicado y fragmento activo dentro de la misma consulta SQL. Los candidatos FTS pueden reordenarse por coseno con el vector opcional y, si se habilita, por el reranker. Nunca se recupera material para filtrarlo después en JavaScript.

La base pgvector de producción será independiente, con copias y restauración propias, red privada y sin proxy TCP público salvo revisión explícita. Antes de usarla se debe comprobar restauración, filtros ACL y uso de `vector(1024)`/HNSW junto a índices de los filtros.

## Topología objetivo de GPU

```text
Relay privado/VPN autorizado
       │ mTLS + Bearer de gateway, TCP/443
       ▼
 Caddy (red borde + red interna; único puerto publicado)
       ├──── /v1/chat/completions ──► vLLM / Qwen3-32B AWQ
       └──── /health,/v1/* ─────────► asistente-rag
                                         ├ bge-m3 (1.024 dimensiones)
                                         ├ bge-reranker-v2-m3 (opcional)
                                         └ Presidio + spaCy ES

 Redis (perfil `estado`, opcional) y Langfuse OSS (perfil `observabilidad`, opcional)
 sólo residen en red `interna: internal: true`.
```

El relay es una dependencia pendiente: Vercel no ofrece una IP de egreso fija ni conectividad privada genérica hasta este host. No se abre una excepción por comodidad. Debe existir relay/BFF autenticado en infraestructura aprobada o VPN/conectividad privada equivalente; el navegador nunca se conecta a Caddy.

## Microservicio RAG

`services/asistente-rag` implementa exactamente:

- `GET /health` con estado, modelos y `offline: true`.
- `POST /v1/embeddings`: 1–64 textos de hasta 8.000 caracteres; 1.024 dimensiones L2 normalizadas.
- `POST /v1/rerank`: consulta y hasta 50 documentos.
- `POST /v1/redact`: hasta 20.000 caracteres en español, con tipos EMAIL, TELÉFONO, DNI/NIE, IBAN, tarjeta, persona, dirección u otro.

Todas las rutas de datos requieren `Authorization: Bearer` y comparación en tiempo constante. En pruebas usa un backend fake determinista, sin pesos: SHA-256 a vector 1.024, solapamiento léxico y expresiones regulares. El backend real carga exclusivamente rutas dentro de `/models`; no descarga nada. Si falla, el consumidor conserva FTS/redacción regex; no hay fallback a Internet.

## Modelo, dimensionado y aceptación

La referencia es Qwen3-32B Instruct cuantizado AWQ/GPTQ INT4 servido por vLLM, con nombre expuesto `io-qwen3-32b-awq`. La primera opción de hardware es Hetzner GEX63 (RTX PRO 6000 Blackwell Max-Q 96 GB, 128 GB RAM, Helsinki) por su margen para pesos, caché KV y concurrencia. Mistral Small 3.1 24B INT4 en una L40S 48 GB es alternativa a medir, no sustitución automática.

Parámetros iniciales conservadores: entrada máxima 6.000 tokens dentro de `--max-model-len=8192`, 350 tokens de respuesta en el proveedor de aplicación, `--gpu-memory-utilization=0.85` y máximo 16 secuencias. No son una garantía. Sólo se permite `local` si la batería ciega de 100 preguntas en español alcanza los umbrales acordados —incluido cero fuga ACL— y el P95 de primer token es inferior a 3 s con carga definida y VRAM P95 por debajo del 85 %.

## Observabilidad y datos

Redis está apagado por defecto (perfil `estado`). Langfuse OSS también (perfil `observabilidad`), sin puertos publicados y con `TELEMETRY_ENABLED=false`, `LANGFUSE_TRACING_ENABLED=false` y trazas sólo ya anonimizadas. No se habilita observabilidad hasta revisar qué campos llegan y la necesidad operativa.

Las conversaciones y leads se seudonimizan o redactan antes de analítica. No se guarda IP ni *user-agent* en claro: sólo HMAC con secreto de entorno. La retención inicial es 12 meses, configurable y pendiente de validación legal.

## Evidencias requeridas antes de activación

1. Bundle offline con revisiones/digests concretos, hash SHA-256 y revisión de licencias.
2. `validar_compose.py`, `docker compose config -q` en el host y revisión de firewall.
3. `probar-sin-salida.sh`: DNS externo y TCP a `1.1.1.1:443` fallan desde cada contenedor, sin puertos de cálculo publicados.
4. Backup local cifrado a destinatarios públicos y restauración en volúmenes nuevos con identidad privada custodiada fuera del host, documentados.
5. Medición `verificar-latencia.sh`, pruebas de ACL, inyección y evaluación de calidad.
6. Aprobación de conectividad privada, DPA/región, aviso de privacidad y checklist de producción.
