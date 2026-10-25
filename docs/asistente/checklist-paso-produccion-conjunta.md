<style>
@page { size: A4; margin: 2.5cm 2cm 3cm 2cm; @bottom-center { content: counter(page) " / " counter(pages); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; color: #666; } }
@page :first { margin-top: 0; @bottom-center { content: none; } }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; }
.cover { text-align: center; padding-top: 80px; page-break-after: always; }.cover img { width: 280px; margin-bottom: 48px; }.cover h1 { font-size: 30pt; color: #F97316; margin: 0 0 15px; line-height: 1.2; }.cover h2 { font-size: 13pt; color: #555; font-weight: 400; font-style: italic; margin: 0 50px 35px; border: 0; }.edition { color: #F97316; font-size: 16pt; font-weight: 600; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 2px solid #F97316; margin-bottom: 25px; }.page-header img { height: 42px; }.page-header-right { text-align: right; font-size: 9pt; color: #555; line-height: 1.4; }
h1 { color:#F97316; font-size:22pt; border-bottom:3px solid #F97316; padding-bottom:10px; margin-top:35px; margin-bottom:20px; page-break-after:avoid; } h2 { color:#1F2937; font-size:14pt; border-left:4px solid #F97316; padding-left:12px; margin-top:25px; margin-bottom:15px; page-break-after:avoid; } h3 { color:#374151; font-size:12pt; margin-top:18px; page-break-after:avoid; }
p { text-align: justify; margin-bottom: 12px; } code { font-size:9.5pt; background:#F3F4F6; padding:1px 3px; } table { width:100%; border-collapse:collapse; margin:20px 0; font-size:9.5pt; } th { background:linear-gradient(135deg,#F97316,#EA580C); color:#fff; padding:10px 12px; text-align:left; } td { padding:8px 12px; border-bottom:1px solid #E5E7EB; vertical-align:top; } tr:nth-child(even) { background:#FFF7ED; }
.highlight-box { background:linear-gradient(135deg,#FFF7ED,#FFEDD5); border-left:4px solid #F97316; padding:15px 20px; margin:20px 0; border-radius:0 8px 8px 0; }.warning-box { background:#FEF2F2; border-left:4px solid #EF4444; padding:12px 18px; margin:18px 0; border-radius:0 8px 8px 0; }.tip-box { background:#ECFDF5; border-left:4px solid #10B981; padding:12px 18px; margin:18px 0; border-radius:0 8px 8px 0; }
.checklist-box { background:#F9FAFB; padding:15px 20px; border-radius:8px; margin:15px 0; }.checklist-box ul { list-style:none; margin:0; padding:0; }.checklist-box li { padding-left:25px; position:relative; margin-bottom:8px; }.checklist-box li:before { content:"☐"; position:absolute; left:0; color:#F97316; font-size:12pt; }.toc-page { page-break-after:always; }.toc-title { font-size:24pt; color:#F97316; text-align:center; margin-bottom:40px; border-bottom:3px solid #F97316; }.toc-list { list-style:none; padding:0; margin:0; }.toc-item { padding:12px 0; border-bottom:1px dotted #ccc; font-size:12pt; }.page-break { page-break-before:always; }.status { font-weight:700; color:#B91C1C; }.ok { font-weight:700; color:#047857; }
</style>

<div class="cover">
  <img src="../../public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <h1>Checklist conjunta de paso<br>a producción</h1>
  <h2>Puertas separadas de rendimiento e IA para la revisión y autorización exclusiva de Víctor</h2>
  <p class="edition">Borrador de control · 25 de octubre de 2026</p>
  <div class="warning-box"><strong>No es una autorización:</strong> esta lista registra evidencias y bloqueos actuales. No confirma que las fases hayan terminado, no activa producción y no sustituye el OK expreso de Víctor, la validación del equipo de desarrollo ni las aprobaciones técnicas y jurídicas.</div>
</div>

<div class="toc-page">

# Índice

<ul class="toc-list">
<li class="toc-item">1. Cómo usar esta checklist y regla de decisión</li>
<li class="toc-item">2. Foto de estado: rendimiento e IA no son la misma puerta</li>
<li class="toc-item">3. Gate A — rendimiento, recuperación y despliegue</li>
<li class="toc-item">4. Gate IA — datos, infraestructura, seguridad y evaluación</li>
<li class="toc-item">5. Secuencia de decisión, rollback y evidencias</li>
<li class="toc-item">6. Pendientes que no se pueden dar por cerrados</li>
</ul>

</div>

<div class="page-header"><img src="../../public/guias/logo-internetoperadores.png" alt="Internet Operadores"><div class="page-header-right"><strong>Internet Operadores</strong><br>Checklist interna · borrador de control<br>Rendimiento y asistente IA</div></div>

# 1. Cómo usar esta checklist y regla de decisión

Esta lista debe completarse con evidencia fechada, responsable, entorno, revisión de código y enlace/ubicación del recibo. Una casilla sin recibo verificable permanece sin marcar. La aceptación de una puerta no compensa el bloqueo de otra: **Gate A (rendimiento y despliegue) y Gate IA (asistente privado) se aprueban por separado**.

<div class="highlight-box"><strong>Regla de decisión:</strong> cualquier fallo, valor no medido, aprobación pendiente, evidencia incompleta o discrepancia entre entorno y documentación mantiene la activación en pausa. No se sustituye una prueba por una promesa, un mock, una captura sin contexto ni un resultado de laboratorio presentado como métrica de campo.</div>

El equipo responsable actualizará cifras, revisiones y enlaces de evidencia después de sus integraciones/validaciones. Los números de este borrador son la última evidencia aportada a fecha de redacción; deben reemplazarse por el recibo final que Víctor vaya a aprobar, sin ocultar sus límites.

| Campo que debe acompañar cada decisión | Registrar |
|---|---|
| Entorno y alcance | Staging / preproducción / producción, URLs y servicios afectados. |
| Revisión | SHA exacto y, si hay series mezcladas, la revisión por página o componente. |
| Evidencia | Comando, fecha/hora, configuración de prueba, salida/recibo y responsable. |
| Resultado | Valor observado, cobertura (`n`), umbral y limitaciones. |
| Aprobación | Responsable técnico, seguridad/DPO cuando proceda y OK explícito de Víctor. |
| Reversión | Flags, versión anterior, propietario y prueba posterior de corte. |

# 2. Foto de estado: rendimiento e IA no son la misma puerta

## Rendimiento — evidencia válida de laboratorio, no de campo

La comparativa vigente reúne 14 páginas y perfiles móviles/escritorio. La serie válida de laboratorio indica **LCP móvil máximo de 2.308,18 ms** y **INP móvil máximo de 192 ms**, con objetivos observados en las dos muestras de las 14/14 rutas móviles descritas. Los valores provienen de dos muestras frías por página/perfil y los INP se observaron en los guiones móviles definidos, no como medición integral de una visita ni como analítica real de usuarios.

| Dato | Evidencia disponible | Límite que no debe ocultarse |
|---|---|---|
| LCP móvil | Máximo observado: **2.308,18 ms** en 14 rutas de la batería. | Laboratorio, dos muestras por página; la tabla agrupa revisiones distintas por ruta. |
| INP móvil | Máximo observado: **192 ms** en los 14 guiones móviles medidos. | Laboratorio mediante `web-vitals`/EventTiming de un guion; no p75 de usuarios reales. |
| LCP escritorio | Máximo observado: **2.143,93 ms**. | Sólo laboratorio y tampoco acredita p75 de campo. |
| INP escritorio | **No medido** en esta batería. | No extrapolar el INP móvil al escritorio. |
| Campo | `p75_campo = null`. | No hay evidencia de p75 real para prometer LCP <2,5 s o INP <200 ms a visitantes reales. |

<div class="warning-box"><strong>Interpretación correcta:</strong> los resultados de laboratorio son válidos para detectar regresiones en los guiones medidos; no son una certificación de Core Web Vitals de campo, no cubren todas las acciones y no autorizan publicación. Mantener explícitos «sin p75 de campo» y «sin INP de escritorio» en cualquier informe de aprobación.</div>

<div class="tip-box"><strong>Ensayo adicional del widget:</strong> ON 49d12b8 / OFF 65f5904; copias locales, 412 px, CPU ×4, red 150 ms/1,6 Mbit/s, 3 muestras frías por variante. INP de apertura/cierre: 56, 64 y 80 ms. Mediana LCP ON/OFF: 1.244/1.240 ms (+0,32 %), sin llamadas del asistente antes de interactuar. Se conserva el fallo inicial de 368–408 ms y su corrección. Es evidencia local, no Vercel ni p75; no acredita envío de chat ni TTFT GPU.</div>

## Asistente IA — controles y entregas parciales, no apto para activación

La revisión pública del **26/10** registra **23/23** sobre la extracción real, repetición histórica **100/100**, regresiones **26/26** y smoke desplegado **10/10**; no autoriza producción. Se obtuvieron citas 100 %, cero cifras inventadas, cero fugas/canarios y cero PII de prueba persistida en la batería histórica. Las tres preguntas de Claude son revisión real; las veinte adicionales son sintéticas, no tráfico de clientes. La referencia anterior 478a84b es histórica y no acreditaba los fallos públicos detectados después. La nueva ingesta representa las 64 rutas editoriales con 611 fuentes y 105 tarifas aptas, sin rutas pendientes. El entorno GPU definitivo no existe: la sonda Docker sigue siendo **CPU parcial**. Faltan host UE, DPA, locks/artefactos y programación efectiva.

| Aspecto IA | Estado actual documentado | Qué falta para una puerta aprobable |
|---|---|---|
| Evaluación | 23/23 pública, 100/100 histórica, 26/26 relevancia y 10/10 smoke de staging. | Revisión de negocio de Claude/Víctor; repetir con el modelo real antes de activar `local`. |
| GPU / host | No hay GPU ni `nvidia-smi` en sandbox. | Host UE autorizado, hardware real, red privada, soporte y pruebas completas. |
| Egress | Sonda CPU parcial bloqueó DNS externo/TCP a un destino externo de control en red Docker `internal=true`. | Probar cada contenedor de la pila completa, Caddy, mTLS, nftables y recibos en host real. |
| Cadencia diaria | Preview sin Vercel Cron; generación perezosa/manual idempotente. **Ningún timer/servicio activo**. | Futuro ejecutor autorizado: Vercel Cron en producción o host propio, con horario/flags/secreto/protección probados. |
| Supply chain | Plantillas con marcadores; no hay pesos, imágenes ni digests finales. | Bundle offline revisado por dos personas, licencia, revisión, hashes y locks reales. |
| Legal / residencia | Pendientes DPA, región efectiva UE, subencargados y aprobación de tratamiento. | Contratos, confirmaciones y aprobación jurídica documentada. |

# 3. Gate A — rendimiento, recuperación y despliegue

Este gate no se marca por una mejora aislada de Lighthouse ni por una ruta suelta. Requiere una preparación recuperable y evidencia suficiente para no degradar el servicio al introducir el asistente o los cambios asociados.

## A.1 Respaldo, restauración y alcance de rama

<div class="checklist-box"><ul>
<li>Existe copia de la base/sistemas afectados antes del cambio y se ha restaurado correctamente en entorno aislado, con fecha, responsable y recibo.</li>
<li>Se ha revisado que el cambio de esquema aplicable es estrictamente aditivo; no incluye <code>DROP</code>, <code>TRUNCATE</code>, <code>DELETE</code> masivo ni extensiones no aprobadas.</li>
<li>La rama/PR contiene exclusivamente el alcance autorizado. Se han revisado diff, dependencias, configuración y archivos de infraestructura para evitar cambios colaterales.</li>
<li>El SHA de despliegue propuesto coincide con el SHA medido o se han repetido las mediciones sobre el SHA final.</li>
<li>Se identifica qué evidencia procede de revisiones mezcladas por página y no se presenta como una sola batería sobre un único commit.</li>
</ul></div>

## A.2 Flags, despliegue y rollback verificable

<div class="checklist-box"><ul>
<li>Los flags seguros están definidos antes de desplegar: <code>ASSISTANT_PUBLIC_ENABLED=false</code>, <code>ASSISTANT_MODE=desactivado</code>, <code>ASSISTANT_CLIENT_ENABLED=false</code>, <code>ASSISTANT_EMAIL_ENABLED=false</code> y <code>ASSISTANT_CRON_ENABLED=false</code> hasta la aprobación aplicable.</li>
<li>Se ha verificado que ningún ajuste de panel puede relajar el valor restrictivo del entorno.</li>
<li>Si se configura modelo o tono, el proveedor se alcanza sólo a través de IP/DNS privado permitido, sin redirecciones ni destinos públicos; la prueba de loopback del integrador está superada. Un fallo del servidor local debe volver a <code>extractivo</code>, sin proveedor externo.</li>
<li>Existe una versión anterior conocida, responsable de despliegue y procedimiento para redeplegarla sin borrar tablas aditivas ni datos de negocio.</li>
<li>Se ha ensayado el corte: tras fijar flags de apagado, la configuración confirma que el widget no se expone y que no se inicia generación.</li>
<li>El rollback documenta qué secretos/certificados deben rotarse si hay sospecha de exposición y dónde se preserva evidencia mínima sin PII.</li>
<li>No se despliega ni se activa producción mientras una casilla de Gate A o Gate IA permanezca abierta.</li>
</ul></div>

## A.3 Medición: laboratorio, campo y criterios honestos

<div class="checklist-box"><ul>
<li>Se archiva la comparativa de laboratorio con URL/ruta, perfil móvil/escritorio, red/CPU, versión y guion por acción; no se presentan acciones de menú como búsquedas o guardados.</li>
<li>Para las 14 rutas cubiertas, se conservan la mediana, rango y cobertura real de cada subconjunto. Una medición ausente no se sustituye por cero.</li>
<li>Se declara que la evidencia actual es laboratorio: LCP móvil máximo 2.308,18 ms; INP móvil máximo 192 ms; sin INP de escritorio y sin p75 de campo.</li>
<li>Antes de prometer métricas de usuarios reales, existe instrumentación/captura de campo autorizada, privacidad revisada y una ventana suficiente para medir percentil 75. Hasta entonces, no afirmar cumplimiento de p75.</li>
<li>La integración del widget se mide por su propio guion funcional y de rendimiento; abrir/cerrar el widget no acredita chat, formulario, escalado ni contacto.</li>
<li>Cualquier regresión del SHA final obliga a investigar/repetir; no se selecciona la observación más favorable.</li>
</ul></div>

# 4. Gate IA — datos, infraestructura, seguridad y evaluación

Gate IA exige una cadena completa de controles. Ninguna prueba local parcial ni un endpoint preparado sustituye un host aislado, una validación legal o una evaluación de calidad aprobada.

## IA.1 Datos, residencia, privacidad y controles de producto

<div class="checklist-box"><ul>
<li>Se ha confirmado contractualmente el host dentro de la UE, región efectiva, DPA, subencargados, proceso de borrado/destrucción y responsable operativo. Sin ello no llegan datos al host.</li>
<li>Cliente permanece desactivado: <code>ASSISTANT_CLIENT_ENABLED=false</code>. No se habilita login/tenant desde el cuerpo del cliente ni se acepta un tenant no confiable.</li>
<li>El consentimiento, aviso de IA, política de privacidad, base legal, RAT/ROPA y, si aplica, EIPD/decisión y Cookiebot están revisados y aprobados antes de abrir tráfico.</li>
<li>Los leads usan el módulo existente Leads con origen <code>ASISTENTE</code>. La proyección/adaptador final en Leads se ha comprobado tras la integración; no se duplica CRM ni se altera el flujo de captación web.</li>
<li>El contacto consentido usa clave dedicada <code>ASSISTANT_CONTACT_ENCRYPTION_KEY</code>, cifrado AES-256-GCM con AAD de referencia/conversación y autorización granular para descifrar. Sin secreto válido, se rechaza la captura.</li>
<li>Las conversaciones, analítica e informes se redactan/anonimizan; no se persisten IP ni <code>user-agent</code> en claro. No se introducen PII en recibos, capturas o tickets.</li>
<li>Retención, supresión y revocación se ejecutan únicamente sobre datos del asistente con preview firmado, confirmación humana, idempotencia y revalidación; nunca se borran datos de negocio de Leads/CRM/finanzas.</li>
</ul></div>

## IA.2 Base de datos, índices y recuperación

<div class="checklist-box"><ul>
<li>Las migraciones aplicables son aditivas y han sido ensayadas/restauradas; no se modifica producción durante esta validación.</li>
<li>Staging conserva FTS español y filtros ACL en la misma consulta SQL. Los filtros de espacio, rol, tenant, documento publicado y fragmento activo no se aplican después en JavaScript.</li>
<li>Los índices de recuperación se comprueban con plan/tiempo acordado y sin degradar el servicio: índice FTS/GIN y filtros necesarios; no se declara una mejora sin medición.</li>
<li><code>pgvector</code>, si se autoriza para el futuro, está en una base PostgreSQL separada, con red privada, backup/restauración y filtros ACL validados. No se instala como extensión en la base de negocio actual.</li>
<li>La falta de fuente devuelve abstención y atención humana; no se baja el umbral ni se añaden alias por fixture para maquillar la evaluación.</li>
</ul></div>

## IA.3 Host GPU, mTLS, salida de red y telemetría

<div class="checklist-box"><ul>
<li>Existe host UE autorizado con GPU, driver/CUDA compatibles, <code>nvidia-smi</code>, disco cifrado, consola fuera de banda y relay/VPN privado aprobado.</li>
<li>Caddy es el único borde publicado; exige mTLS y token de relay. vLLM, RAG, Redis y Langfuse no publican puertos de cálculo/almacenamiento.</li>
<li>El firewall del host deniega entrada, reenvío y salida por defecto, con excepciones mínimas aprobadas para relay/VPN y SSH. No se usa <code>0.0.0.0/0</code> por comodidad.</li>
<li>Se ejecuta y archiva una prueba negativa DNS/TCP desde <strong>cada contenedor</strong> de la pila real. La sonda CPU parcial existente no cierra esta casilla.</li>
<li>Se han comprobado Caddy/mTLS, token de gateway, ACL, límites, inyección, ausencia de fuga entre espacios/tenants y denegación durante «Actuar como».</li>
<li>La telemetría está desactivada: sin APIs externas de IA, búsquedas web en runtime, estadísticas de vLLM, Hugging Face/Transformers u OpenTelemetry. Langfuse local queda apagado hasta aprobación expresa y esquema anonimizado.</li>
<li>La prueba de carga registra TTFT P95, uso de VRAM, error y concurrencia sin guardar prompts ni respuestas. No activar <code>local</code> si no se cumplen los umbrales aprobados.</li>
</ul></div>

## IA.4 Pesos, licencias y cadena de suministro offline

<div class="checklist-box"><ul>
<li>Se ha elegido el modelo/checkpoint/cuantización tras revisión de licencia comercial, idioma, VRAM, compatibilidad y batería ciega; el candidato no equivale a una selección final.</li>
<li>El bundle offline fue preparado y revisado por dos personas en estación autorizada. No se descarga nada desde el host final mediante <code>docker pull</code>, <code>pip install</code> o hub de modelos.</li>
<li><code>images.lock</code>, <code>models.lock</code> y <code>ARTIFACTS.sha256</code> contienen digests/hashes reales de artefactos materializados y revisados; no quedan marcadores ni plantillas presentadas como locks.</li>
<li>Se archivan revisión/digest, licencia, tokenizer/formato, SBOM/vulnerabilidades aplicables y manifiesto de transferencia, sin secretos.</li>
<li>El reranker comienza apagado y sólo se habilita tras demostrar calidad y P95 adicional dentro del límite aprobado; no carga pesos por demanda ni usa fallback externo.</li>
</ul></div>

## IA.5 Evaluación, informes, copias y reversión

<div class="checklist-box"><ul>
<li>La evaluación integrada se ejecuta tras los merges con 100 casos documentados, indicando qué casos son fuente propia, revisión de negocio pendiente o sintéticos. No se presenta como tráfico real ni revisión humana si no lo es.</li>
<li>Conservar la repetición del 26/10: histórica 100/100 y pública 23/23, con tres preguntas de Claude y veinte sintéticas, sin bajar expectativas. La referencia 478a84b queda histórica. Repetir ante cambios de código/corpus/modelo.</li>
<li>Para el modo local, la batería supera los umbrales acordados: fidelidad/citas ≥95 %, cero fuga ACL, respuesta fuera de dominio apropiada ≥90 %, TTFT P95 <3 s bajo carga definida, VRAM P95 <85 % y error <1 %.</li>
<li>Existe ejecutor CLI protegido para informes y retención: usa <code>DATABASE_URL</code> y exige <code>ASSISTANT_EXECUTION_TARGET</code> controlado; no tiene destino de producción. Los endpoints, si se habilitan expresamente, usan <code>CRON_SECRET</code> (no <code>ASSISTANT_CRON_SECRET</code>). No se usa un scheduler de sandbox ni se afirma que Vercel Preview programe cron.</li>
<li>El ejecutor futuro aprobado —Vercel Cron en producción o systemd/cron de un host autorizado— se configura y verifica a las <strong>08:00 Europe/Madrid</strong>, incluidos CET/CEST, permisos, secreto, lock e idempotencia. Hasta autorización y prueba, cron queda inactivo; el panel perezoso no cierra esta casilla.</li>
<li>La copia cifrada y la restauración se han ejecutado de verdad sobre volúmenes nuevos, con claves/identidad custodiadas fuera del host. Un script existente no sustituye esa prueba.</li>
<li>El plan de rollback corta flags, detiene el host si estaba activo, rota claves/certificados si procede y conserva evidencia mínima. No borra lead de negocio ni tablas aditivas como método de reversión.</li>
</ul></div>

# 5. Secuencia de decisión, rollback y evidencias

## Orden propuesto para Víctor y responsables

1. **Congelar alcance y revisión.** Confirmar PR/SHA, entorno, propietario y que se dispone de copia/restauración probada.
2. **Cerrar Gate A.** Repetir laboratorio si el SHA cambia, declarar límites de campo, comprobar flags y ensayar rollback.
3. **Cerrar Gate IA de forma independiente.** Revisar evaluación extractiva 100/100 y resolver legal, host UE, supply chain, red, mTLS, copias y cadencia real antes de valorar `local` o exposición pública.
4. **Autorizar una prueba limitada sólo si ambos gates aplicables tienen evidencia.** Mantener email, Cliente y cron apagados si no se han aprobado específicamente.
5. **Observar y documentar.** Medir lo que realmente se ha activado y usar los derechos/retención con el procedimiento técnico, sin ocultar incidencias ni ampliar alcance.

## Rollback mínimo que debe poder ejecutarse

| Paso | Acción | Resultado que hay que verificar |
|---|---|---|
| 1 | Establecer `ASSISTANT_PUBLIC_ENABLED=false` y `ASSISTANT_MODE=desactivado`. | Configuración confirma apagado y el widget deja de exponerse. |
| 2 | Redesplegar la versión anterior validada. | Salud de aplicación comprobada, sin introducir esquema destructivo. |
| 3 | Si había host GPU activo, detener la pila y revisar/rotar tokens, claves y certificados si hay sospecha. | Sin tráfico hacia el host; evidencia mínima preservada. |
| 4 | Mantener tablas/índices aditivos y leads de negocio. | No hay `DROP`, limpieza masiva ni pérdida de registros comerciales. |
| 5 | Restaurar sólo desde copia verificada y en entorno aislado cuando proceda. | Restauración comprobada antes de cualquier conmutación. |

# 6. Pendientes que no se pueden dar por cerrados

<div class="warning-box"><strong>Bloqueos vigentes al redactar:</strong> no hay p75 de campo, no hay INP de escritorio en la batería, la comparación de laboratorio usa revisiones mezcladas por página; la evaluación extractiva ha pasado 100/100 pero no acredita el modo local ni tráfico real; no hay host GPU UE ni DPA verificados; la prueba Docker es sólo CPU parcial; no hay locks/pesos finales; y no existe cron/systemd activo. Ningún punto debe marcarse sin evidencia nueva validada.</div>

## Referencias internas de verificación

- Fuente verificada de rendimiento: `/home/ubuntu/rendimiento-fases-20261025/comparativa_final.md` y `/home/ubuntu/rendimiento-fases-20261025/cierre_A.json` (se citan como rutas de evidencia externa; no se replica ni altera esa evidencia en este worktree).
- [Estado de servidor GPU, fuentes ya verificadas y criterios](servidor-gpu.md).
- [Arquitectura y aislamiento de la IA](arquitectura.md).
- [Checklist técnico de producción existente](checklist-produccion.md).
- [Decisiones pendientes de Víctor](decisiones-pendientes.md).
- [Manual de uso y revisión del panel](manual-uso-panel.md).
