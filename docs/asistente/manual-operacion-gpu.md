<style>
@page { size: A4; margin: 2.5cm 2cm 3cm 2cm; @bottom-center { content: counter(page) " / " counter(pages); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; color: #666; } }
@page :first { margin-top: 0; @bottom-center { content: none; } }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; }
.cover { text-align: center; padding-top: 80px; page-break-after: always; }
.cover img { width: 280px; margin-bottom: 48px; }
.cover h1 { font-size: 30pt; color: #F97316; margin: 0 0 15px; font-weight: 700; line-height: 1.2; }
.cover h2 { font-size: 13pt; color: #555; font-weight: 400; font-style: italic; margin: 0 50px 35px; border: 0; }
.cover .edition { color: #F97316; font-size: 16pt; font-weight: 600; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 2px solid #F97316; margin-bottom: 25px; }
.page-header img { height: 42px; }.page-header-right { text-align:right; font-size:9pt; color:#555; line-height:1.4; }
h1 { color:#F97316; font-size:22pt; border-bottom:3px solid #F97316; padding-bottom:10px; margin-top:35px; margin-bottom:20px; page-break-after:avoid; }
h2 { color:#1F2937; font-size:14pt; border-left:4px solid #F97316; padding-left:12px; margin-top:25px; margin-bottom:15px; page-break-after:avoid; }
h3 { color:#374151; font-size:12pt; margin-top:18px; page-break-after:avoid; } p { text-align:justify; margin-bottom:12px; }
table { width:100%; border-collapse:collapse; margin:20px 0; font-size:9.5pt; } th { background:linear-gradient(135deg,#F97316 0%,#EA580C 100%); color:#fff; padding:10px 12px; text-align:left; } td { padding:8px 12px; border-bottom:1px solid #E5E7EB; vertical-align:top; } tr:nth-child(even) { background:#FFF7ED; }
.highlight-box { background:linear-gradient(135deg,#FFF7ED 0%,#FFEDD5 100%); border-left:4px solid #F97316; padding:15px 20px; margin:20px 0; border-radius:0 8px 8px 0; }.warning-box { background:#FEF2F2; border-left:4px solid #EF4444; padding:12px 18px; margin:18px 0; border-radius:0 8px 8px 0; }.tip-box { background:#ECFDF5; border-left:4px solid #10B981; padding:12px 18px; margin:18px 0; border-radius:0 8px 8px 0; }
.checklist-box { background:#F9FAFB; padding:15px 20px; border-radius:8px; margin:15px 0; }.checklist-box ul { list-style:none; margin:0; padding:0; }.checklist-box li { padding-left:25px; position:relative; margin-bottom:8px; }.checklist-box li:before { content:"☐"; position:absolute; left:0; color:#F97316; font-size:12pt; }.toc-page { page-break-after:always; }.toc-title { font-size:24pt; color:#F97316; text-align:center; margin-bottom:40px; border-bottom:3px solid #F97316; }.toc-list { list-style:none; padding:0; margin:0; }.toc-item { padding:12px 0; border-bottom:1px dotted #ccc; font-size:12pt; }.page-break { page-break-before:always; }.small { color:#555; font-size:9pt; }.status { font-weight:700; color:#B91C1C; }
</style>

<div class="cover">
  <img src="../../public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <h1>Manual de operación<br>del asistente IA privado</h1>
  <h2>Paquete GPU aislado, recuperación local y controles previos a cualquier activación</h2>
  <p class="edition">Borrador técnico · 25 de octubre de 2026</p>
  <div class="warning-box"><strong>Estado de seguridad:</strong> este manual no autoriza compras, despliegue, tráfico de producción ni cambio de <code>ASSISTANT_MODE</code>. Staging continúa en modo extractivo.</div>
</div>

<div class="toc-page">
<h1 class="toc-title">Índice de contenidos</h1>
<ul class="toc-list">
<li class="toc-item">1. Propósito, alcance y estado</li>
<li class="toc-item">2. Arquitectura y aislamiento de red</li>
<li class="toc-item">3. Selección acotada de modelo y hardware UE</li>
<li class="toc-item">4. Preparación verificable del suministro offline</li>
<li class="toc-item">5. Instalación controlada, arranque y pruebas</li>
<li class="toc-item">6. Copias, restauración e incidente</li>
<li class="toc-item">7. Checklist de paso controlado</li>
<li class="toc-item">8. Decisiones jurídicas y de operación pendientes</li>
</ul>
</div>

<div class="page-header"><img src="../../public/guias/logo-internetoperadores.png" alt="Internet Operadores"><div class="page-header-right"><strong>Internet Operadores</strong><br>Manual interno · borrador técnico<br>Asistente IA privado</div></div>

# 1. Propósito, alcance y estado

Este manual describe el paquete que se ha preparado para un futuro host GPU dedicado dentro de la UE. Se limita a inferencia local mediante vLLM, el microservicio FastAPI de embeddings, reranking opcional y redacción, Redis opcional, Langfuse local opcional y Caddy como único borde. No crea servidores, no descarga pesos en el host, no usa APIs externas de IA ni activa producción.

<div class="highlight-box"><strong>Principio de operación:</strong> los pesos, ruedas e imágenes se descargan y revisan en una estación de preparación separada; el host final recibe un soporte cifrado y sólo ejecuta <code>docker load</code>, comprobación de hashes y arranque controlado. Una imagen o un modelo no entra al host por <code>docker pull</code>, <code>pip install</code> ni acceso a un hub.</div>

El estado actual es <span class="status">NO APTO PARA PRODUCCIÓN</span>. El sandbox ha demostrado sólo una prueba parcial de red Docker con una sonda CPU ligera. No existe evidencia de GPU, vLLM, Caddy, mTLS, firewall del host, backup/restauración ni latencia con un modelo real. La prueba de aceptación completa deberá ejecutarse en el host autorizado y conservar sus recibos sin textos de usuarios ni secretos.

## Interruptores obligatorios

| Control | Estado seguro actual | Regla operativa |
|---|---|---|
| `ASSISTANT_MODE` | `extractivo` en staging; `desactivado` fuera | Nunca cambiar a `local` sin aprobación, evaluación y host verificado. |
| `ASSISTANT_PUBLIC_ENABLED` | `false` para apagar; producción apagada | Es el corte inmediato de tráfico público. |
| `ASSISTANT_RERANK_ENABLED` | `false` | FastAPI devuelve 503 para rerank; no carga pesos por demanda ni recurre a red. |
| Perfil `estado` | apagado | Redis sólo si se justifica estado local. |
| Perfil `observabilidad` | apagado | Langfuse local requiere aprobación de esquema anonimizado y retención. |
| Email/sync/telemetría | apagados | No se habilitan en este paquete. |

## DDL, datos UE y rollback

Este paquete de infraestructura no ejecuta DDL ni accede a la base de staging o producción. Cualquier cambio de esquema sigue siendo aditivo, propiedad del equipo de captación y se ensaya sólo en la base local vacía asignada. Antes de aplicar en staging, el padre debe revisar el SQL definitivo, la copia restaurable y el rollback. No se permiten `DROP`, `TRUNCATE`, `DELETE` masivo, `prisma migrate deploy`, `db push` ni extensiones en la base de negocio desde este alcance.

Los datos de conversación y el conocimiento no viajan al host GPU hasta que se aprueben contrato de encargado, región efectiva dentro de la UE, subencargados y conectividad privada. En tránsito, el borde usa TLS con mTLS; en reposo, los discos/volúmenes y las copias deben estar cifrados con controles documentados. El rollback consiste en desactivar tráfico y generación, detener la pila local y rotar credenciales si existe sospecha; las tablas aditivas permanecen y no se borran para «volver atrás».

# 2. Arquitectura y aislamiento de red

La aplicación conserva permisos, filtros ACL y minimización. El navegador no alcanza la GPU ni FastAPI. Un relay o VPN aprobado —todavía pendiente— es el único origen que puede llegar a Caddy. Caddy exige mTLS y un token de gateway, no usa ACME, no mantiene panel de administración y descarta logs de solicitud.

```text
Aplicación autorizada ─ relay/VPN aprobado ─ mTLS + token ─ Caddy:443
                                                      │
                            ┌─────────────────────────┴───────────────────────┐
                            │ red Docker interna: internal=true, sin puertos   │
                            │ vLLM · FastAPI RAG · Redis opcional · Langfuse   │
                            └─────────────────────────────────────────────────┘
```

Una red bridge Docker ordinaria aplica enmascaramiento y puede dar acceso externo a contenedores; el aislamiento no se infiere de que no haya puertos publicados. Por ello `interna` declara `internal: true` y el firewall del host añade política `drop` de salida. Ambos controles, más una prueba negativa dentro de cada namespace, son necesarios [4].

<div class="warning-box"><strong>No sustituir controles:</strong> <code>internal: true</code> no acredita por sí solo el aislamiento de Caddy, porque Caddy se une deliberadamente también a la red de borde. La denegación de egress de host, el CIDR exacto de relay y la prueba <code>probar-sin-salida.sh</code> son bloqueantes antes de procesar datos.</div>

## Telemetría y salida de red

FastAPI y vLLM reciben `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `HF_HUB_DISABLE_TELEMETRY=1`, `HF_HUB_DISABLE_UPDATE_CHECK=1`, `HF_HUB_DISABLE_IMPLICIT_TOKEN=1`, `HF_DATASETS_OFFLINE=1`, `DO_NOT_TRACK=1` y `OTEL_SDK_DISABLED=true`. vLLM incorpora además `VLLM_NO_USAGE_STATS=1` y `VLLM_DO_NOT_TRACK=1`, variables reconocidas por vLLM para desactivar sus estadísticas [5]. Los modelos se montan en `/models` de sólo lectura.

# 3. Selección acotada de modelo y hardware UE

La recomendación inicial para evaluación es **Mistral Small 3.1 24B Instruct**, no una selección final. La ficha oficial declara licencia Apache-2.0 apta para uso y modificación comercial, soporte explícito de español, vLLM recomendado y aproximadamente 55 GB de VRAM para BF16/FP16 [1]. La publicación de Mistral indica que el modelo puede ejecutarse cuantizado en una RTX 4090, pero esa afirmación no sustituye una medición de calidad, contexto y concurrencia del caso de uso [2].

| Opción a validar | VRAM | Coste orientativo publicado | Uso recomendado | Límite |
|---|---:|---:|---|---|
| Dedicado UE RTX PRO 6000 Max-Q | 96 GB ECC | desde 1.190 €/mes sin IVA en Países Bajos | Candidato principal: margen para Mistral 24B BF16, KV cache y servicios locales | Confirmar stock, DPA, borrado, soporte y cifrado antes de comprar. [3] |
| Cloud UE L40S | 48 GB | 1,80 USD/h; ≈1.314 USD/mes a 730 h, sin impuestos ni almacenamiento | Piloto INT4/latencia, sólo si la cuantización exacta supera evaluación | La capacidad no garantiza contexto/concurrencia ni residencia contractual. [6] |
| Cloud UE H100 | 80 GB | 2,99 USD/h; ≈2.182,70 USD/mes a 730 h, sin impuestos ni almacenamiento | Alternativa de alto margen para BF16/evaluación | Mayor coste; validar región, conexión privada y egress. [6] |

Estos importes son referencias de catálogo consultadas el 25 de octubre de 2026; no son presupuesto, compromiso ni recomendación de compra. La residencia de datos dentro de la UE, DPA, subencargados, soporte y destrucción de medios requieren confirmación contractual. Una segunda alternativa de pesos abiertos es Qwen3, cuya ficha oficial declara Apache-2.0 y soporte de más de 100 idiomas y dialectos [7]; no se congela ningún checkpoint Qwen ni Mistral hasta revisión de licencia, formato, cuantización, compatibilidad vLLM y evaluación ciega.

<div class="tip-box"><strong>Decisión técnica:</strong> no se crea un lock de modelo en esta entrega. Los ficheros <code>models.lock.example</code> e <code>ARTIFACTS.sha256.example</code> mantienen marcadores expresos. El instalador rechaza marcadores: no confundir una plantilla de cadena de suministro con un artefacto aprobado.</div>

# 4. Preparación verificable del suministro offline

La estación de preparación debe estar separada del host final y registrada en el expediente de cambio. El script `preparar-artefactos.sh` sólo se ejecuta allí. Exige referencias de imágenes con digest y revisiones Git completas o SHA-256 de ruedas; descarga a un bundle, crea `MODEL_MANIFEST.json`, calcula `ARTIFACTS.sha256` y deja modelos de sólo lectura. Los hashes se calculan sobre archivos presentes, no sobre nombres previstos.

<div class="checklist-box">
<ul>
<li>Revisar licencia comercial, revisión exacta, formato, tokenizer y soporte vLLM del modelo elegido.</li>
<li>Fijar las imágenes en `images.lock` con `@sha256:` completo; no aceptar tags móviles.</li>
<li>Fijar cada modelo Hugging Face por commit de 40 hexadecimales y cada rueda spaCy por SHA-256 de 64 hexadecimales.</li>
<li>Construir y revisar la imagen RAG con `wheelhouse/` offline: SBOM, vulnerabilidades, usuario no root y dependencias.</li>
<li>Ejecutar `preparar-artefactos.sh`, revisar por dos personas el manifiesto y transferir por soporte cifrado.</li>
<li>Conservar el manifiesto, revisiones y firmas en el expediente de cambio; nunca en un ticket público con secretos.</li>
</ul>
</div>

# 5. Instalación controlada, arranque y pruebas

El host futuro necesita Docker Engine/Compose v2, driver NVIDIA compatible, `nvidia-smi`, `nft`, `rsync`, Python 3, `sha256sum`, `age` y consola fuera de banda ya instalados mediante imagen o soporte offline. El instalador no instala paquetes y no permite descarga. Copiar `infra/asistente-gpu/.env.example` a `.env`, completar secretos diferentes en el gestor aprobado, aplicar permiso 600 y montar certificados locales en `certs/`.

## Secuencia obligatoria

1. Ejecutar `sudo ./instalar-offline.sh /ruta/offline-bundle` sin `APPLY_FIREWALL`. Comprueba requisitos, permisos, marcadores, hash del bundle, carga OCI y resuelve Compose sin iniciar servicios.
2. Desde consola fuera de banda, revisar CIDR de relay/VPN y SSH. Aplicar firewall sólo con `APPLY_FIREWALL=1`; nunca usar `0.0.0.0/0`.
3. Arrancar primero los perfiles mínimos aprobados. Redis y Langfuse siguen apagados salvo necesidad aceptada.
4. Ejecutar `./probar-sin-salida.sh`. Cada contenedor debe fallar al resolver un destino externo y al abrir TCP a `1.1.1.1:443`; el script crea un recibo local.
5. Ejecutar `./verificar-latencia.sh` contra pesos reales. Registrar TTFT, P95, memoria, tokens/s y concurrencia sin incluir prompts ni respuestas.
6. Probar backup y restauración en volúmenes nuevos. Sólo después, realizar evaluación ciega, ACL e inyección desde la aplicación de staging.

<div class="warning-box"><strong>Resultado parcial ya disponible:</strong> el 25/10/2026 una sonda Docker CPU ligera en una red <code>internal=true</code> no pudo resolver un nombre externo ni conectar a <code>1.1.1.1:443</code>. Es una evidencia parcial del comportamiento de Docker en sandbox. No es una validación de la pila GPU ni permite activar modo local.</div>

# 6. Copias, restauración e incidente

Los volúmenes de Redis y observabilidad sólo se copian con `backup.sh` a destino local montado/cifrado. El archivo se cifra con destinatarios públicos de `age`, se acompaña de SHA-256 y se retiene según el valor aprobado. La identidad privada se conserva fuera del host y se monta temporalmente únicamente para una restauración autorizada.

`restaurar.sh` solicita la palabra `RESTAURAR`, comprueba integridad y crea volúmenes con un sufijo temporal: no sobrescribe el estado existente. Antes de una conmutación manual se prueba el resultado en un proyecto aislado. Copia y restauración son requisitos de aceptación; el guion no equivale a una restauración demostrada.

Ante incidente, cortar primero `ASSISTANT_PUBLIC_ENABLED=false` y `ASSISTANT_MODE=desactivado`, detener los contenedores, rotar tokens y certificados si existe sospecha, y preservar sólo evidencia mínima ya redactada. No hacer `DROP` de tablas aditivas como rollback. La reactivación requiere repetir las pruebas y la aprobación correspondiente.

# 7. Checklist de paso controlado

<div class="checklist-box">
<ul>
<li>Existe aprobación de proveedor, región efectiva UE, DPA, subencargados, relay/VPN y responsable de operación.</li>
<li>Hay consola fuera de banda y CIDR exactos de SSH y relay antes de aplicar nftables.</li>
<li>El bundle fue revisado por dos personas, con hashes verificables y ningún marcador.</li>
<li>`.env` tiene permiso 600, no se versiona y cada secreto es distinto.</li>
<li>Certificado, clave y CA de cliente locales tienen permisos restrictivos; Caddy exige mTLS más token.</li>
<li>El firewall niega entrada, reenvío y salida por defecto; cualquier excepción está aprobada y tiene reversión.</li>
<li>`probar-sin-salida.sh` supera DNS y TCP negativo por contenedor y el recibo está archivado.</li>
<li>No hay puertos publicados salvo Caddy 443; Redis, RAG, vLLM y Langfuse permanecen internos.</li>
<li>Backup cifrado y restauración a volúmenes nuevos están probados y documentados.</li>
<li>Evaluación de 100 casos en español, ACL, inyección, abstención, TTFT P95 y VRAM P95 cumplen umbrales.</li>
<li>Jurídico aprueba aviso, privacidad, consentimiento, RAT/ROPA, EIPD/decisión, retención y Cookiebot.</li>
<li>Víctor aprueba de forma expresa cualquier activación. Hasta entonces, producción sigue desactivada.</li>
</ul>
</div>

# 8. Decisiones jurídicas y de operación pendientes

Quedan pendientes la elección contractual de proveedor/host, DPA y subencargados; el relay privado o VPN; el modelo, checkpoint, cuantización y licencia concreta; la aprobación del tratamiento y la conservación; y responsables de mantenimiento, incidentes y restauración. También está bloqueada la programación efectiva del informe: Vercel Preview no ejecuta cron y este paquete no instala un scheduler ni abre un servicio persistente. Los informes permanecen en panel y los cron de aplicación continúan desactivados hasta que exista un ejecutor real autorizado.

## Referencias

[1]: https://huggingface.co/mistralai/Mistral-Small-3.1-24B-Instruct-2503 "Model card Mistral Small 3.1 24B Instruct"
[2]: https://mistral.ai/news/mistral-small-3-1/ "Mistral Small 3.1 announcement"
[3]: https://www.leadergpu.com/ "LeaderGPU bare-metal GPU servers in Europe"
[4]: https://docs.docker.com/engine/network/drivers/bridge/ "Docker bridge network driver"
[5]: https://docs.vllm.ai/en/latest/configuration/env_vars/ "vLLM environment variables"
[6]: https://www.ovhcloud.com/en/public-cloud/gpu/ "OVHcloud GPU instances"
[7]: https://huggingface.co/Qwen/Qwen3-4B "Qwen3 4B model card"
