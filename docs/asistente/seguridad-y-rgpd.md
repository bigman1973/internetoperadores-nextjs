# Seguridad y RGPD — borrador para aprobación jurídica

**Estado:** documento técnico-organizativo, no dictamen jurídico. Víctor, asesoría y DPO deben aprobar textos, base jurídica, contratos y evaluación antes de cualquier activación pública o de producción.

## Diseño de seguridad

- **Datos y modelos en la UE:** objetivo de operación sobre infraestructura europea contratada y controlada por Internet Operadores. Antes de compra se valida región efectiva, DPA, subencargados, soporte, borrado de discos y transferencias internacionales. No afirmar residencia absoluta sin contrato.
- **Sin terceros de IA ni telemetría:** pesos abiertos locales, modelo y dependencias predescargados; `HF_HUB_OFFLINE=1`, `TRANSFORMERS_OFFLINE=1`, `DO_NOT_TRACK=1`, `VLLM_NO_USAGE_STATS=1`, `VLLM_DO_NOT_TRACK=1`, `OTEL_SDK_DISABLED=true`, `TELEMETRY_ENABLED=false` y `LANGFUSE_TRACING_ENABLED=false`.
- **Red:** los servicios de cálculo residen en `interna: internal: true`; el firewall del host deniega salida por defecto. Caddy es el único borde, con TLS mediante PEM local, mTLS, token de relay, cuerpo máximo 128 KiB y sin logs de solicitudes. No hay ACME ni DNS externo.
- **Cifrado:** TLS 1.2+ en tránsito entre relay y Caddy; mTLS para el relay. Los volúmenes y copias deben alojarse sobre almacenamiento cifrado en reposo gestionado o cifrado local documentado. Las copias se cifran y se verifican con checksum.
- **Secretos:** únicamente variables de entorno o gestor de secretos aprobado; `.env` con permisos 600. Nunca commits, imágenes, logs, prompts, capturas o tickets. Rotación tras incidente y antes de cambios de proveedor.
- **Minimización:** límites de tamaño, autenticación del microservicio, sin persistencia de chat en el navegador y redacción de PII antes de analítica. IP y *user-agent* no se guardan en claro; sólo HMAC con secreto.
- **Acceso:** el navegador nunca alcanza GPU/RAG. La aplicación conserva autorización por espacio/rol/tenant en SQL. El servicio RAG sólo es accesible en la red interna; Caddy no reenvía rutas distintas de inferencia y RAG permitidas.

La red sin salida no es una garantía única: debe verificarse con `probar-sin-salida.sh`, inspección de firewall, `ss`/`conntrack` y prueba de host. Cualquier excepción (NTP interno, actualización o soporte) requiere aprobación, ventana, CIDR/destino mínimo, registro y reversión.

## Finalidades, base jurídica y retención propuesta

| Tratamiento | Finalidad | Base jurídica a validar | Datos/minimización | Retención propuesta |
|---|---|---|---|---|
| Conversación informativa | Responder sobre servicios con fuentes aprobadas, seguridad y mejora controlada | Interés legítimo tras ponderación y/o medidas precontractuales según contexto | Texto redactado/seudonimizado, fuentes e indicadores técnicos mínimos | 12 meses, configurable |
| Lead/contacto comercial | Contactar a quien lo solicita | Consentimiento granular, inequívoco, no preseleccionado y revocable; validar si aplica art. 6.1.b en solicitud concreta | Datos de contacto sólo tras consentimiento, versión y fecha | 12 meses, configurable o plazo legal validado |
| Seguridad/abuso | Límites, prevención de fraude e incidentes | Interés legítimo con ponderación | HMAC en vez de IP en claro; métricas agregadas | mínimo necesario, por definir legalmente |
| Observabilidad local opcional | Diagnóstico con información ya redactada | Interés legítimo/seguridad, sujeto a minimización | sin trazas por defecto; si se activa, sólo campos anonimizados | mínimo necesario, por definir |

El valor inicial técnico es `ASSISTANT_RETENTION_MONTHS=12`. Debe existir borrado o anonimización al vencimiento y procedimiento para solicitud de supresión, acceso, rectificación, oposición, limitación y portabilidad donde proceda. No se toman decisiones automatizadas con efecto jurídico ni se hace biometría o reconocimiento de emociones.

## Aviso de privacidad del widget — BORRADOR

> **Estás hablando con un asistente de IA de Internet Operadores.** Utilizamos tu consulta para responder sobre nuestros servicios a partir de información aprobada y para mejorar el servicio bajo supervisión humana. El asistente puede equivocarse; no introduce cambios en contratos ni toma decisiones con efectos jurídicos. Puedes pedir hablar con una persona en cualquier momento.
>
> Trataremos los datos que facilites para atender tu consulta y, si lo autorizas de forma separada, para contactar contigo sobre tu solicitud. El sistema usa modelos locales y medidas de seguridad; no enviamos el contenido a proveedores externos de IA. Conservaremos la información durante el plazo aplicable, inicialmente hasta 12 meses, salvo que solicites antes su supresión o exista una obligación legal.
>
> Consulta la política de privacidad para conocer responsable, finalidades, base jurídica, destinatarios/encargados, derechos, contacto y cómo retirar el consentimiento. No incluyas datos sensibles innecesarios.

Este texto es un borrador. Debe completarse con identidad y contacto del responsable/DPO, destinatarios y encargados reales, transferencias, bases jurídicas definitivas, canal de derechos y enlaces aprobados. La transparencia del artículo 50 del Reglamento de IA se muestra antes de la primera interacción.

## Consentimiento de lead — BORRADOR

> He leído la información de privacidad y autorizo a Internet Operadores a usar mis datos de contacto para atender mi solicitud y contactarme sobre ella. Puedo retirar mi consentimiento en cualquier momento.

Casilla vacía por defecto, registro de versión de aviso, fecha/hora, canal y prueba de consentimiento. La respuesta informativa no depende de marcarla.

## Entrada propuesta para el Registro de Actividades de Tratamiento (RAT/ROPA)

| Campo | Borrador |
|---|---|
| Responsable | Internet Operadores — completar razón social y contacto |
| Actividad | Asistente de IA privado: atención informativa, conocimiento, conversaciones, escalados y leads |
| Interesados | Visitantes, contactos de empresas/hogares, usuarios autorizados internos |
| Finalidades | Atención de consultas, medida precontractual, seguridad, mejora supervisada y gestión de contactos con consentimiento |
| Categorías de datos | Mensajes, identificadores seudonimizados, fuentes, valoraciones; contacto sólo con consentimiento; evitar categorías especiales |
| Destinatarios | Personal autorizado y encargados contratados/validados en la UE; detallar proveedor, DPA y subencargados |
| Transferencias | Ninguna prevista fuera del EEE; confirmar contractual y técnicamente antes de afirmar |
| Conservación | 12 meses configurable y matriz específica de borrado/anonimización, pendiente de aprobación |
| Medidas | ACL SQL, cifrado, mTLS, secretos en entorno, PII redactada, red aislada, sin egress ni telemetría, copias verificadas |
| EIPD | Evaluar necesidad con DPO antes de producción; documentar decisión y medidas |

## Cookiebot y almacenamiento de cliente

El widget no establece cookies propias ni usa `localStorage`; el estado de sesión de interfaz reside únicamente en `sessionStorage` de la pestaña mientras esté abierto. Debe valorarse con asesoría y Cookiebot si ese uso de almacenamiento de sesión requiere declaración o información adicional, aunque no persista entre pestañas/cierre. Si se añade cualquier cookie, localStorage, identificador persistente o analítica, deberá clasificarse, declararse y sujetarse al consentimiento aplicable antes de activarse. No etiquetar analítica como técnica.

## Pendientes jurídicos y de seguridad

1. Aprobar aviso, privacidad, base jurídica, consentimiento y procedimiento de derechos.
2. Confirmar DPA, región, subencargados y transferencias de GPU, relay, almacenamiento y cualquier plataforma existente.
3. Realizar análisis de necesidad/EIPD y completar RAT antes de producción.
4. Aprobar el plazo efectivo y el job verificable de borrado/anonimización.
5. Revisar texto y comportamiento de Cookiebot, incluido `sessionStorage`.
6. Validar mTLS, relay privado, firewall, pruebas de salida, backup/restauración y rotación de secretos en host real.
