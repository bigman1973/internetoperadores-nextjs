# Servidor GPU recomendado y dimensionado

**Estado:** recomendación de infraestructura, no orden de compra. Precios, stock, DPA, región y subencargados deben reconfirmarse antes de contratar.

## Recomendación inicial

La opción principal es **Hetzner GEX63 en HEL1 (Helsinki)**: NVIDIA RTX PRO 6000 Blackwell Max-Q con 96 GB GDDR7 ECC, 128 GB RAM y 2 × 1,92 TB NVMe. Según el análisis de Fase 0, la referencia era 999 €/mes más 999 € de alta sin IVA a 25 de octubre de 2026. Se recomienda por el margen que deja para Qwen3-32B INT4, caché KV, crecimiento de concurrencia y servicios locales sin *offload* de CPU. El coste no incluye copias, operación, certificados ni soporte.

El modelo base a evaluar es **Qwen3-32B Instruct** con licencia Apache-2.0 y cuantización AWQ/GPTQ INT4, servido por vLLM. El Compose utiliza inicialmente `/models/Qwen3-32B-AWQ`, `--served-model-name=io-qwen3-32b-awq`, `--max-model-len=8192`, `--gpu-memory-utilization=0.85` y `--max-num-seqs=16`. La aplicación debe limitar la entrada RAG a 6.000 tokens y la salida a 350. La cuantización y revisión exacta deben congelarse por commit/hash tras prueba; no se deben inferir de un nombre de repositorio mutable.

La alternativa pragmática es **Mistral Small 3.1 24B Instruct INT4/INT8** en L40S 48 GB de Scaleway PAR-2 o hardware europeo equivalente. Reduce compromiso inicial y puede rendir mejor en latencia, pero ofrece menos margen de KV y concurrencia. GEX45 de 24 GB sólo es apropiado para 7–14B o pruebas de contexto muy limitado: no se recomienda como destino estable de Qwen3-32B.

## Dimensionado de memoria y disco

| Recurso | GEX63 recomendado | Punto de partida operativo | Justificación |
|---|---:|---:|---|
| VRAM | 96 GB | ≤85 % P95 | INT4 de 32B requiere margen para runtime, escalas AWQ/GPTQ, CUDA y caché KV. No activar si deja menos de 15–20 % libre. |
| RAM | 128 GB | vLLM 72 GiB máximo; RAG 12 GiB; resto para host/caché | Evita presión de memoria/OOM y permite spaCy, embeddings y procesos de operación. |
| CPU | CPU del dedicado | vLLM 12 vCPU; RAG 6 vCPU; servicios auxiliares limitados | El reranker CPU se mantiene apagado salvo que el P95 adicional sea ≤600 ms. |
| NVMe | 3,84 TB brutos | separar SO, `models`, volúmenes y copias temporales | Pesos, imágenes OCI, bundle, logs mínimos y restauraciones necesitan margen. Definir cifrado del disco. |
| Red | 1 Gb/s o superior | sólo relay/VPN en 443 | No hay navegación/egress; el ancho de banda se dimensiona para usuarios autorizados y copia offline. |

Un vector float32 de 1.024 dimensiones ocupa 4 KiB bruto; 100.000 fragmentos implican alrededor de 0,4 GB sólo en vectores. En staging se usan `real[]` opcionales y FTS; en producción pgvector vive en una base separada, cuya capacidad se presupuestará con WAL, HNSW, metadatos y restauraciones, no en el NVMe de vLLM por defecto.

## Servicios y presupuestos

| Servicio | Estado inicial | Límite Compose | Notas |
|---|---|---:|---|
| vLLM | activo | 72 GiB, 12 CPU, 2.048 PID | GPU; pesos de sólo lectura; sin logs de solicitudes. |
| `asistente-rag` | activo | 12 GiB, 6 CPU, 512 PID | bge-m3, reranker opcional y spaCy español desde `/models`. |
| Caddy | activo | 4 GiB, 2 CPU, 256 PID | único borde; mTLS, token y PEM local. |
| Redis | perfil `estado` | 2 GiB, 1 CPU | sólo si se necesita estado interno. |
| Langfuse + datos | perfil `observabilidad` | 4–8 GiB por servicio | apagado por defecto; sólo trazas ya anonimizadas y telemetría desactivada. |

Los límites son guardarraíles iniciales, no garantía de compatibilidad de runtime. Deben revisarse en el host real con `nvidia-smi`, OOM, caché KV, P95 y concurrencia acordada.

## Criterios de selección y aceptación

Antes de fijar proveedor, modelo y cuantización se ejecutará una batería ciega de 100 preguntas españolas: tarifas públicas, respaldo de conexión, Informe Cero Riesgos, cobertura, objeciones, negativas fuera de dominio, seguridad y tono. Se mide fidelidad a fuentes, citas correctas, abstención, fuga ACL, utilidad, TTFT, tokens/s, memoria y error.

Sólo se habilita modo `local` si el candidato logra como mínimo 95 % de fidelidad/citas, cero fugas de ACL, 90 % de respuesta apropiada fuera de dominio, P95 de primer token inferior a 3 s bajo carga acordada, uso VRAM P95 inferior a 85 % y tasa de error menor del 1 %. Si no se cumplen, el modo se conserva `extractivo`.

## Validaciones de compra y operación

Antes de contratar se deben validar disponibilidad física, ubicación exacta, DPA/subencargados, soporte, procedimientos de borrado, acceso de consola, posibilidad de VPN/relay, firewall, custodia de backups, cifrado de discos, drivers/CUDA y SLA. La residencia europea es una condición contractual y técnica, no una afirmación que pueda derivarse sólo de una página comercial.
