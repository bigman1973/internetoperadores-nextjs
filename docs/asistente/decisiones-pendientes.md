# Decisiones pendientes de Víctor

**Fecha de actualización:** 25 de octubre de 2026. Los valores son prudentes para staging y no autorizan producción.

| Decisión | Valor prudente / estado | Condición de cambio |
|---|---|---|
| Público | `ASSISTANT_PUBLIC_ENABLED=false` en producción; en staging rige la regla única | Pruebas funcionales, ACL, legal y Lighthouse aprobados. |
| Modo | `extractivo` en staging; `desactivado` en producción si falta variable | Activar `local` sólo tras servidor, evaluación, seguridad y aprobación. |
| Vectorial en staging | FTS `tsvector` sobre tablas `asistente_*`; `embedding real[]` opcional | No instalar pgvector en `io_staging_finanzas`; el rol no puede hacerlo. |
| pgvector | Base PostgreSQL separada para producción, con red/backup propios | Resolver proveedor Railway/equivalente, conectividad privada y restauración. |
| Microservicio | FastAPI local con bge-m3, reranker y Presidio/spaCy | En staging puede permanecer sin URL: fallback FTS/redacción regex. |
| Servidor GPU | Candidato dedicado UE de 96 GB VRAM ECC; referencia de catálogo LeaderGPU Países Bajos desde 1.190 €/mes sin IVA | Confirmar stock, precio, DPA, SLA, soporte, región efectiva, borrado y custodia. No es compra ni proveedor aprobado. |
| Proveedor europeo / red | Host UE dedicado con relay privado o VPN a Caddy | Resolver que Vercel no tiene egreso fijo ni llega a red privada por defecto; no abrir servicio por comodidad. |
| Modelo | Mistral Small 3.1 24B Instruct como primer candidato; Qwen3 Apache-2.0 como alternativa | Congelar sólo checkpoint/revisión/quantización revisados, probar compatibilidad vLLM y superar batería de 100 preguntas. No hay lock final ni pesos descargados. |
| Canal humano | L–V 09:00–18:00 Europe/Madrid, devolución de llamada | Aprobar responsable, canal, proceso y texto fuera de horario. |
| Leads | Tabla propia `asistente_leads`; no CRM externo | Aprobar ciclo de atención y consentimiento; no hay emails. |
| Privacidad | Aviso de IA, privacidad, consentimiento y RAT son BORRADOR | Aprobación de Víctor, DPO/asesoría y DPA antes de publicar. |
| Retención | 12 meses configurable | Validar necesidad, matriz de borrado/anonimización y derechos. |
| Email | `ASSISTANT_EMAIL_ENABLED=false` | Permanece apagado; ninguna implementación de envío real en esta fase. |
| Cron / informes | Informe sólo panel; generación perezosa, `ASSISTANT_CRON_ENABLED=false` | Si se aprueba cron, documentar `vercel.json` sin cambiarlo aquí, conversión Europe/Madrid y lock idempotente. |
| Cliente | `ASSISTANT_CLIENT_ENABLED=false` | Auditoría de aislamiento por tenant y pruebas de fuga cruzada. |
| Reranker | `false` inicialmente | Activar sólo si aporta calidad y P95 adicional ≤600 ms con 20 candidatos. |
| Observabilidad | Langfuse local opcional, apagado por perfil, `TELEMETRY_ENABLED=false` | Aprobación del esquema anonimizado, retención y necesidad; sin SaaS. |
| Copias/operación | Backup cifrado y restauración en volumen nuevo | Ejecutar y archivar prueba en hardware real; custodiar clave y soporte offline. |
| Prueba de red Docker | Sonda CPU `internal=true` superada sólo en sandbox | La evidencia es parcial; faltan Compose completo, GPU, Caddy, mTLS, nftables, backup y latencia en host real. |

## Aprobaciones prioritarias antes de producción

1. Aprobación jurídica de aviso, privacidad, base jurídica, consentimiento, RAT, EIPD/decisión y contratos de encargado.
2. Confirmación de infraestructura propia/europea, proveedor, región, DPA, relay/VPN y que el tránsito desde la aplicación no contradice el requisito de no usar terceros de IA.
3. Selección de modelo y checkpoint tras evaluación ciega: fidelidad/citas ≥95 %, cero fugas ACL, abstención y TTFT P95 <3 s.
4. Evidencia de bundle offline, firewall de salida denegada, mTLS, pruebas negativas de DNS/TCP, copias/restauración y rotación de secretos.
5. Definición de horario, canal y responsables de atención humana, sin correo ni notificaciones automáticas.
6. Decisión explícita sobre Cookiebot y el `sessionStorage` de la pestaña, así como retención/borrado y flujo de derechos.

Hasta completar estos puntos, el asistente queda `extractivo` en staging o `desactivado` fuera de staging, sin correo, cron, endpoints públicos de IA ni despliegue GPU.
