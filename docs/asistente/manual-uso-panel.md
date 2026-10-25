<style>
@page { size: A4; margin: 2.5cm 2cm 3cm 2cm; @bottom-center { content: counter(page) " / " counter(pages); font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 10pt; color: #666; } }
@page :first { margin-top: 0; @bottom-center { content: none; } }
body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 11pt; line-height: 1.6; color: #333; }
.cover { text-align: center; padding-top: 80px; page-break-after: always; }
.cover img { width: 280px; margin-bottom: 48px; }.cover h1 { font-size: 30pt; color: #F97316; margin: 0 0 15px; line-height: 1.2; }.cover h2 { font-size: 13pt; color: #555; font-weight: 400; font-style: italic; margin: 0 50px 35px; border: 0; }.edition { color: #F97316; font-size: 16pt; font-weight: 600; }
.page-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 0; border-bottom: 2px solid #F97316; margin-bottom: 25px; }.page-header img { height: 42px; }.page-header-right { text-align: right; font-size: 9pt; color: #555; line-height: 1.4; }
h1 { color: #F97316; font-size: 22pt; border-bottom: 3px solid #F97316; padding-bottom: 10px; margin-top: 35px; margin-bottom: 20px; page-break-after: avoid; } h2 { color: #1F2937; font-size: 14pt; border-left: 4px solid #F97316; padding-left: 12px; margin-top: 25px; margin-bottom: 15px; page-break-after: avoid; } h3 { color: #374151; font-size: 12pt; margin-top: 18px; page-break-after: avoid; }
p { text-align: justify; margin-bottom: 12px; } code { font-size: 9.5pt; background: #F3F4F6; padding: 1px 3px; } table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 9.5pt; } th { background: linear-gradient(135deg,#F97316,#EA580C); color: white; padding: 10px 12px; text-align: left; } td { padding: 8px 12px; border-bottom: 1px solid #E5E7EB; vertical-align: top; } tr:nth-child(even) { background: #FFF7ED; }
.highlight-box { background: linear-gradient(135deg,#FFF7ED,#FFEDD5); border-left: 4px solid #F97316; padding: 15px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }.warning-box { background: #FEF2F2; border-left: 4px solid #EF4444; padding: 12px 18px; margin: 18px 0; border-radius: 0 8px 8px 0; }.tip-box { background: #ECFDF5; border-left: 4px solid #10B981; padding: 12px 18px; margin: 18px 0; border-radius: 0 8px 8px 0; }
.checklist-box { background: #F9FAFB; padding: 15px 20px; border-radius: 8px; margin: 15px 0; }.checklist-box ul { list-style: none; margin: 0; padding: 0; }.checklist-box li { padding-left: 25px; position: relative; margin-bottom: 8px; }.checklist-box li:before { content: "☐"; position: absolute; left: 0; color: #F97316; font-size: 12pt; }.toc-page { page-break-after: always; }.toc-title { font-size: 24pt; color: #F97316; text-align: center; margin-bottom: 40px; border-bottom: 3px solid #F97316; }.toc-list { list-style: none; padding: 0; margin: 0; }.toc-item { padding: 12px 0; border-bottom: 1px dotted #ccc; font-size: 12pt; }.page-break { page-break-before: always; }.status { font-weight: 700; color: #B91C1C; }
</style>

<div class="cover">
  <img src="../../public/guias/logo-internetoperadores.png" alt="Internet Operadores">
  <h1>Manual de uso y revisión<br>del asistente IA privado</h1>
  <h2>Guía operativa del widget y del panel administrativo en staging, con revisión humana y minimización de datos</h2>
  <p class="edition">Borrador operativo · 25 de octubre de 2026</p>
  <div class="warning-box"><strong>Estado:</strong> este documento orienta la revisión en staging tras la integración autorizada. No acredita que las fases estén completas, no habilita producción y no sustituye los permisos, las pruebas ni el OK expreso de Víctor.</div>
</div>

<div class="toc-page">

# Índice

<ul class="toc-list">
<li class="toc-item">1. Propósito, alcance y reglas de uso</li>
<li class="toc-item">2. Antes de empezar: acceso, roles y datos minimizados</li>
<li class="toc-item">3. Widget público: conversación, cualificación, consentimiento y atención humana</li>
<li class="toc-item">4. Leads: origen ASISTENTE, proyección en Leads y contacto cifrado</li>
<li class="toc-item">5. Chat interno con citas y límites de respuesta</li>
<li class="toc-item">6. Conocimiento: versión, borrador, revisión, publicación y archivo</li>
<li class="toc-item">7. Conversaciones y aprendizaje: sólo revisión humana</li>
<li class="toc-item">8. Analítica, informes y propuestas: 24 h, 7 días y 30 días</li>
<li class="toc-item">9. Configuración, retención y derechos</li>
<li class="toc-item">10. Incidencias, corte y decisiones pendientes</li>
</ul>

</div>

<div class="page-header"><img src="../../public/guias/logo-internetoperadores.png" alt="Internet Operadores"><div class="page-header-right"><strong>Internet Operadores</strong><br>Manual interno · borrador operativo<br>Asistente IA privado</div></div>

# 1. Propósito, alcance y reglas de uso

Este manual explica cómo revisar y operar las capacidades previstas del asistente privado cuando el integrador las haya unido en el entorno autorizado. Describe el widget público, las áreas administrativas y los controles que no deben omitirse. No debe interpretarse como una confirmación de disponibilidad de todas las pantallas ni como autorización para abrir tráfico, mover el modo a `local`, enviar avisos o tratar datos reales fuera de los procedimientos aprobados.

<div class="highlight-box"><strong>Regla principal:</strong> el asistente no aprende, publica, contacta ni activa un servicio por sí mismo. Las respuestas extractivas sólo usan fuentes permitidas; una ausencia de fuente debe acabar en una respuesta honesta y la opción de atención humana.</div>

El estado de referencia es `ASSISTANT_MODE=extractivo` en staging y `ASSISTANT_MODE=desactivado` fuera de staging hasta que se cumplan los controles técnicos, jurídicos y de aprobación. El espacio Cliente permanece desactivado. No hay envío de correos, SMS, webhooks ni sincronización externa del asistente.

## Cómo interpretar las instrucciones

| Marca de este manual | Significado operativo |
|---|---|
| **Revisar en panel** | Acción prevista para una persona autorizada cuando la ruta/pantalla esté integrada y disponible. |
| **Revisión humana obligatoria** | No debe sustituirse por automatización, texto generado ni una aceptación implícita. |
| **Técnico — sin UI declarada** | Existe o se prepara una operación de servidor/API; este manual no inventa botones ni asegura una pantalla. Requiere el procedimiento autorizado. |
| **Pendiente de integración o validación** | No usar como evidencia de extremo a extremo. El padre debe verificarlo tras los merges. |

## Checklist de inicio de turno

<div class="checklist-box"><ul>
<li>Confirmar que se está en el entorno autorizado y no en producción.</li>
<li>Comprobar que el usuario tiene el permiso específico del área; durante «Actuar como» el asistente debe seguir denegado.</li>
<li>Verificar que el modo efectivo y los flags son los esperados; el entorno siempre prevalece sobre la configuración del panel.</li>
<li>Usar únicamente datos de prueba sintéticos para la validación. No copiar conversaciones ni contactos a tickets, capturas o hojas externas.</li>
<li>Si falta una fuente, un permiso, un consentimiento o una clave de cifrado, detener el flujo y registrar la incidencia sin inventar un resultado correcto.</li>
</ul></div>

# 2. Antes de empezar: acceso, roles y datos minimizados

El panel debe aplicar sesión de servidor, rol activo y autorización granular por área. Las áreas previstas abarcan chat, conocimiento, conversaciones, leads, aprendizaje, analítica, propuestas y configuración. La autorización no se deduce del enlace ni de una identificación enviada por el navegador. Los listados deben paginarse en servidor y mostrar datos previamente redactados o seudonimizados según el permiso.

La conversación, la analítica y los informes no son un repositorio libre de datos personales. No se debe persistir IP ni `user-agent` en claro, ni exponer prompts de sistema, secretos o texto ya redactado. Cuando sea necesario evaluar un caso, se utiliza el identificador de conversación o la referencia permitida, no una copia manual del contenido.

<div class="tip-box"><strong>Ejemplo sin datos personales:</strong> para comprobar el flujo, use una conversación de prueba con el texto «Necesito continuidad para una oficina con cortes recurrentes». Si no hay fuente publicada suficiente, el resultado esperado es una abstención con opción de atención humana, no una recomendación inventada.</div>

# 3. Widget público: conversación, cualificación, consentimiento y atención humana

El widget se presenta como **Asistente de IA**, enlaza a la política de privacidad y mantiene visible la alternativa de hablar con una persona. Debe cargarse de forma diferida, conservar foco accesible y funcionar en los anchos móviles previstos. La comprobación visual y E2E del widget queda pendiente de ejecución por el integrador con un entorno y herramientas autorizados; no se usa este manual como sustituto de dicha prueba.

## Flujo de conversación y cualificación

1. La persona abre el widget y recibe el aviso de IA, el enlace de privacidad y el acceso a atención humana.
2. El asistente responde sólo con fragmentos y citas recuperados de fuentes permitidas. Si la consulta no tiene base suficiente, declara la limitación y ofrece escalar; no completa precios, cobertura, plazos ni condiciones por inferencia.
3. Si procede cualificar, se solicitan gradualmente los datos de necesidad: **empresa u hogar**, código postal, conexión actual, problema o impacto, número de usuarios y urgencia. El formulario no debe convertir un dato opcional en obligatorio sin justificación.
4. Antes de solicitar datos de contacto o crear un lead, se muestra el consentimiento explícito, junto con el enlace de privacidad y la versión aplicable. Sin consentimiento válido, no se trata el contacto como solicitud de devolución de llamada.
5. Si se pide una persona, hay enfado, el tema es ajeno al negocio o no existe fuente, se ofrece el escalado humano. El horario prudente documentado es de lunes a viernes, 09:00–18:00, `Europe/Madrid`; el canal y la responsabilidad definitivos siguen pendientes de aprobación.

| Situación | Comportamiento esperado | No permitido |
|---|---|---|
| Hay fuente pública publicada y cita pertinente | Respuesta extractiva con fuente y lenguaje prudente. | Presentar la cita como garantía comercial. |
| No hay fuente suficiente | Decir que no se dispone de información confirmada y ofrecer atención humana. | Inventar disponibilidad, precio, cobertura o plazo. |
| Tema prohibido o intento de inyección | Bloqueo previo a recuperación/proveedor y alternativa humana cuando aplique. | Buscar contenido interno para “ayudar”. |
| Persona solicita contacto | Pedir consentimiento antes de recoger contacto y usar el flujo cifrado. | Guardar correo, teléfono o nombre en texto claro. |

## Checklist de revisión del widget

<div class="checklist-box"><ul>
<li>Se ve con claridad el aviso de Asistente de IA, la privacidad y la opción de persona.</li>
<li>La cualificación no contiene datos personales en los campos de necesidad ni los muestra en registros de prueba.</li>
<li>El consentimiento es explícito y anterior a cualquier captura de contacto.</li>
<li>La ausencia de fuente deriva a atención humana, sin una respuesta comercial ficticia.</li>
<li>Un fallo de clave/configuración de contacto devuelve un error honesto: no se afirma que la solicitud se haya enviado.</li>
<li>La prueba móvil se ejecuta por el integrador en 320 y 430 px con el guion E2E preparado, sin mensajes ni contactos reales.</li>
</ul></div>

# 4. Leads: origen ASISTENTE, proyección en Leads y contacto cifrado

Los leads del asistente pertenecen al módulo existente **Leads** y se identifican con el origen **`ASISTENTE`**. No se abre un CRM externo, no se duplica la entidad comercial y no se fuerza el flujo especializado de captaciones web. El adaptador/proyección final en `/admin/leads` forma parte de la integración del padre: hasta que se compruebe allí, una bandeja aislada no acredita la integración de Leads.

El resumen de necesidad, la prioridad (`CALIENTE`, `TEMPLADO` o `FRÍO`) y el estado operativo se muestran sin convertirlos en datos de contacto. La atención puede utilizar los estados `NUEVO`, `CONTACTADO`, `CERRADO` y `DESCARTADO` dentro del procedimiento aprobado, manteniendo trazabilidad. No se envían correos, SMS ni notificaciones externas desde este flujo.

## Contacto autorizado y cifrado

El contacto solicitado con consentimiento se almacena separado y cifrado, ligado a su referencia y conversación mediante contexto autenticado. Las proyecciones nuevas de lead/escalado conservan los campos de contacto heredados como marcadores o `null`; no contienen PII en claro. El detalle sólo se descifra tras autorización granular activa y nunca durante «Actuar como».

| Control | Regla |
|---|---|
| Consentimiento | Debe ser explícito, con versión y fecha aplicables antes de capturar contacto. |
| Clave | Usar `ASSISTANT_CONTACT_ENCRYPTION_KEY` dedicada cuando esté configurada. El fallback servidor basado en `NEXTAUTH_SECRET` es una contingencia técnica documentada, no una invitación a omitir la clave dedicada. |
| Cifrado | AES-256-GCM con AAD ligada a referencia y conversación, según el contrato de captación. |
| Falta de secreto | Rechazar la captura; no guardar ni comunicar éxito ficticio. |
| Acceso | Sólo atención autorizada; no se devuelve la clave, identificador de lead ni el contacto al cliente público. |

<div class="warning-box"><strong>No probar con PII:</strong> para verificar la pantalla de Leads, utilice fixtures sintéticas aprobadas. La retirada de consentimiento o la supresión no se resuelve ocultando una fila: debe activar el procedimiento de derechos aplicable.</div>

# 5. Chat interno con citas y límites de respuesta

El chat interno actualmente es **extractivo**: consulta conocimiento autorizado y devuelve fragmentos con sus citas; no redacta texto nuevo ni genera propuestas, respuestas o resúmenes autónomos. Una persona puede preparar su propio borrador a partir de fuentes revisadas, pero el texto final y su envío siguen siendo responsabilidad humana. No es una vía para eludir la ACL: cada búsqueda debe filtrar espacio, rol y tenant en servidor antes de devolver un fragmento. El contenido interno no puede aparecer en el widget público, y el espacio Cliente sigue apagado.

## Procedimiento de revisión de una respuesta

1. Confirmar el área/rol y que no existe suplantación activa.
2. Formular una consulta de negocio sin copiar datos personales. Por ejemplo: «¿Qué respaldo de conectividad figura en la documentación pública aprobada?».
3. Revisar cada cita: documento, versión y fragmento deben sostener la afirmación. Si una cita no es pertinente, no reutilizar la respuesta.
4. Si no hay cita suficiente, convertir la necesidad en un hueco o derivar a una persona; no completar un texto humano con conocimiento informal.
5. Cualquier redacción posterior se realiza y revisa fuera de este chat, contrastándola con las citas. La responsabilidad de enviar una respuesta comercial sigue siendo humana.

<div class="highlight-box"><strong>Límite conocido de recuperación:</strong> la recuperación extractiva puede abstenerse ante paráfrasis sin solapamiento léxico. Ese comportamiento es preferible a una cita débil. La mejora con embeddings/reranking locales depende del host privado y de sus pruebas; no está autorizada por este manual.</div>

# 6. Conocimiento: versión, borrador, revisión, publicación y archivo

El conocimiento admite fuentes corporativas permitidas —por ejemplo, web propia incluida en lista blanca, FAQ aprobada y tarifas públicas— y formatos documentales que superen las validaciones aplicables. No se ingieren por defecto CRM, buzones, datos internos no aprobados, costes de operador ni páginas externas. Cada pieza debe mantener espacio, roles, origen, checksum y estado.

## Ciclo de vida que debe seguirse

| Estado / acción | Qué hace el revisor | Resultado permitido |
|---|---|---|
| **Borrador** | Comprueba origen, espacio, roles, contenido y ausencia de datos no autorizados. | Aún no se usa como fuente publicada. |
| **Nueva versión** | Corrige o actualiza mediante una versión trazable; no sobrescribe la evidencia anterior. | Se conserva autoría, revisión y trazabilidad. |
| **Publicar** | Revisión humana de citas, ACL y afirmaciones sensibles antes de publicar. | La versión publicada puede indexarse como fuente conforme al flujo aprobado. |
| **Archivar** | Retira una versión que ya no debe usarse, manteniendo la auditoría requerida. | No borra evidencia ni equivale a limpiar datos de forma ad hoc. |

Las propuestas de aprendizaje aprobadas siguen el mismo criterio: han de estar fundamentadas en fuentes permitidas y pasar edición/revisión humana. Si incluyen PII, precios, cobertura, plazo o una afirmación no sustentada, se descartan y se deja el motivo. Aprobar no es entrenar un modelo ni permite publicar un texto sin fuente.

## Checklist antes de publicar conocimiento

<div class="checklist-box"><ul>
<li>El documento pertenece al espacio correcto y los roles/tenant son coherentes.</li>
<li>La fuente es corporativa autorizada y no incorpora CRM, buzón ni contenido externo no permitido.</li>
<li>El revisor ha contrastado las afirmaciones sensibles con su fuente.</li>
<li>La versión conserva origen, checksum, estado y trazabilidad de revisión.</li>
<li>La publicación tiene aprobación humana; ningún borrador se publica por una tarea automática.</li>
<li>Si se trata de aprendizaje, la propuesta tiene fundamento y no contiene PII ni información comercial sin respaldo.</li>
</ul></div>

# 7. Conversaciones y aprendizaje: sólo revisión humana

El explorador de conversaciones debe trabajar con registros seudonimizados y paginados, incluyendo canal, estado, fuentes, mensajes ya redactados, ausencia de fuente, escalado y valoración. No debe revelar IP, `user-agent`, secretos, instrucciones internas ni el contenido original que se hubiera redactado. No se exportan conversaciones para eludir la minimización.

Los huecos de conocimiento y las valoraciones negativas sirven para preparar una revisión, no para cambiar el comportamiento automáticamente. El flujo correcto es: detectar un hueco anonimizado, agruparlo cuando sea útil, preparar un borrador sustentado, revisar/editar por una persona autorizada y aprobar o descartar. Toda aprobación se registra; los descartes no deben reaparecer sin un nuevo fundamento revisable.

<div class="tip-box"><strong>Ejemplo sin PII:</strong> una tendencia de consultas sobre «continuidad de conexión para teletrabajo» puede generar un borrador de FAQ si hay fuentes públicas suficientes. Si no las hay, se mantiene como hueco y se pide revisión de negocio; no se declara que la empresa no ofrezca el servicio.</div>

# 8. Analítica, informes y propuestas: 24 h, 7 días y 30 días

Los informes se consultan dentro del panel y con información agregada/anonimizada. El alcance informado incluye una instantánea diaria de las 24 horas locales completas anteriores y comparativas de 7 y 30 días en `Europe/Madrid`, además de vistas semanal y mensual. Las métricas pueden abarcar volumen, resolución sin humano, escalados, huecos, satisfacción, conversión a lead, temas, objeciones y propuestas de impacto/esfuerzo.

Los ejemplos deben permanecer anonimizados. Los leads calientes se agregan por estado/recuento; no se usan nombre, correo, teléfono, empresa, resumen ni necesidades para elaborar el informe. «Sin oferta pública documentada» significa que no existe base pública aprobada suficiente para una propuesta: no demuestra que el servicio no exista.

## Estado de programación y decisiones de propuestas

- No hay correo de informes: `ASSISTANT_EMAIL_ENABLED=false`.
- La programación efectiva de staging está **bloqueada**: Vercel Preview no ejecuta cron y no existe host persistente autorizado.
- Se ha preparado un ejecutor CLI protegido y plantillas systemd con calendario `08:00 Europe/Madrid`, pero **no hay servicio/timer instalado, habilitado ni activo**. El CLI usa `DATABASE_URL` y exige el objetivo de ejecución controlado `ASSISTANT_EXECUTION_TARGET`; no admite producción. Abrir el panel no es una programación.
- Los endpoints de informe y retención, cuando se habiliten expresamente, se protegen con `CRON_SECRET`; no existe `ASSISTANT_CRON_SECRET` ni se debe crear una variable alternativa para este flujo.
- La generación manual autorizada no equivale a una tarea diaria activa.
- Una propuesta puede registrarse como aceptada, descartada o hecha por una persona autorizada; no debe repetirse después de un descarte. Estas acciones no autorizan cambios automáticos en conocimiento ni en producción.

<div class="warning-box"><strong>Comprobación pendiente:</strong> antes de usar una cadencia real debe verificarse un host autorizado, el calendario efectivo con cambio CET/CEST, el lock/idempotencia, los permisos, el secreto del endpoint y el recibo de ejecución sin PII. No crear un sustituto en el sandbox ni afirmar cron activo.</div>

# 9. Configuración, retención y derechos

La configuración prevista cubre tono, bienvenida, horario humano, temas prohibidos, modo, modelo y retención. Modelo y tono se entregan al proveedor mediante un transporte fijado a IP/DNS privado permitido, sin redirecciones ni destinos públicos; la comprobación de loopback del integrador ha superado esta restricción de transporte. Esto no implica que exista GPU, generación local ni autorización de producción. Toda modificación debe quedar trazada con actor, momento y motivo, sin registrar secretos. Los controles de entorno prevalecen: el panel no puede relajar `ASSISTANT_MODE=desactivado`, activar Cliente, habilitar email o convertir un endpoint público en proveedor IA.

| Control | Estado prudente / regla |
|---|---|
| `ASSISTANT_PUBLIC_ENABLED` | `false` es el corte inmediato; producción permanece apagada hasta aceptación. |
| `ASSISTANT_MODE` | `extractivo` en staging; `desactivado` fuera de staging. `local` requiere host, evaluación, seguridad y aprobación. |
| Proveedor/transportes | Modelo y tono sólo viajan a un destino privado permitido, sin redirecciones ni DNS/IP públicos. Si el servidor local falla, el comportamiento vuelve a `extractivo`; no hay fallback a proveedor externo. |
| `ASSISTANT_CLIENT_ENABLED` | `false`; no activar login o espacio Cliente. |
| `ASSISTANT_EMAIL_ENABLED` / `ASSISTANT_CRON_ENABLED` | `false`; no enviar emails ni tratar un endpoint preparado como cron activo. Los endpoints protegidos usan `CRON_SECRET` cuando se autoricen. |
| Retención | Valor inicial documentado: 12 meses, pendiente de validación jurídica y operativa. |
| Telemetría | Desactivada; observabilidad local sólo si se aprueba su necesidad, esquema anonimizado y retención. |

## Derechos y retención — Técnico, sin UI declarada

Las operaciones de retención, supresión y revocación están planteadas como procedimientos técnicos protegidos. **Este manual no declara que exista una interfaz ni botones administrativos para ellas.** No se debe describir ni simular una pantalla inexistente.

El patrón técnico es: (1) solicitar una **previsualización** no destructiva, (2) revisar el alcance y su token firmado, (3) aportar confirmación explícita e idempotencia, y (4) revalidar el conjunto antes de ejecutar. Se limita a datos `asistente_*` y a los contactos seguros asociados: no debe borrar datos de Leads web, CRM, clientes, finanzas u otros registros de negocio. La auditoría conserva sólo hash de objetivo, actor opcional, ejecutor y recuentos sin PII.

<div class="checklist-box"><ul>
<li>La solicitud proviene de una persona con permiso de configuración aplicable y no hay suplantación activa.</li>
<li>Existe preview firmado vigente, con alcance revisado y sin PII expuesta.</li>
<li>La confirmación es explícita y lleva UUID de idempotencia; no se confirma por una URL o recarga.</li>
<li>La operación se revalida de forma serializable antes de cambiar datos.</li>
<li>La auditoría resultante no contiene datos personales en claro.</li>
<li>Si el caso afecta un lead, se conserva el negocio fuera del asistente; se elimina/anomina únicamente el ámbito permitido y el contacto seguro cuando corresponda.</li>
</ul></div>

# 10. Incidencias, corte y decisiones pendientes

Ante una incidencia, primero se corta la exposición mediante `ASSISTANT_PUBLIC_ENABLED=false` y `ASSISTANT_MODE=desactivado` en el entorno afectado. Después se redespliega la versión anterior conocida y validada. No se ejecutan `DROP` ni borrados masivos de tablas aditivas para volver atrás, y no se eliminan leads de negocio como parte del rollback.

La evaluación offline actual del asistente registra **77/100 casos (77 %) y resultado NO APTO**. Los problemas de recuperación/cita siguen pendientes de corrección e integración; no se anticipa el resultado de la siguiente ejecución. El modo local también sigue bloqueado por ausencia de host GPU, pesos fijados, pruebas completas de red/ACL/latencia y aprobaciones UE/jurídicas.

<div class="warning-box"><strong>Escalar antes de continuar:</strong> falta de fuente, fuga de permisos, PII visible, consentimiento inválido, ausencia de clave de contacto, cron no verificado, telemetría activada o cualquier intento de activar producción son motivos de parada y revisión con el responsable técnico, seguridad y, cuando corresponda, DPO/asesoría.</div>

## Documentación relacionada

- [Arquitectura y límites de recuperación](arquitectura.md)
- [Recuperación extractiva y límites conocidos](recuperacion-extractiva.md)
- [Variables de entorno y flags](variables-entorno.md)
- [Servidor GPU recomendado y criterios de aceptación](servidor-gpu.md)
- [Checklist técnico de producción existente](checklist-produccion.md)
- [Decisiones pendientes de Víctor](decisiones-pendientes.md)
- [Checklist conjunta de paso a producción](checklist-paso-produccion-conjunta.md)
