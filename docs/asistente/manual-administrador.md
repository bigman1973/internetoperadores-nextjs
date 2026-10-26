# Manual de administrador del asistente — borrador

**Estado:** estructura inicial para completar cuando exista el panel `/admin/asistente`. No sustituye los controles de permisos ni habilita funciones todavía no implementadas.

## Acceso y principios

El panel debe requerir sesión de servidor, usuario administrador activo y área específica. Durante «Actuar como» todas las rutas del asistente deben permanecer denegadas. Cada listado se pagina en servidor y muestra únicamente datos ya redactados/seudonimizados según permiso. No se permite exportar conversaciones o textos para eludir las reglas de minimización.

Los permisos previstos son `admin.asistente.chat`, `conocimiento`, `conversaciones`, `leads`, `aprendizaje`, `analitica`, `propuestas` y `configuracion`; `SUPER_ADMIN` conserva la autorización global según la política existente. La pantalla debe explicar que el modo de entorno prevalece sobre cualquier ajuste de panel: si `ASSISTANT_MODE=desactivado`, no se puede activar desde UI.

## Conocimiento

El área de conocimiento gestionará documentos de origen WEB, FAQ, TARIFA, PDF, DOCX, XLSX, TXT, MD o APRENDIZAJE. Todo material debe indicar espacio (`PUBLICO`, `CLIENTE` o `INTERNO`), roles, tenant cuando corresponda, origen, checksum y estado. La carga verificará tamaño, firma mágica, antivirus/extracción local y límites; un fichero no se indexa ni publica antes de su revisión.

La publicación creará una nueva versión, conservará auditoría de autor/aprobador y generará fragmentos deterministas. La web pública se incorpora desde lista blanca, FAQ existente y tarifas expresamente publicables: nunca se ingieren CRM, buzones, páginas externas, coste de operador o datos internos por defecto. El administrador debe comprobar citas, espacio y ACL antes de publicar; un error se corrige publicando/archivando una versión, no sobrescribiendo la evidencia.

## Aprendizaje supervisado

Las preguntas sin fuente y valoraciones negativas crean huecos anonimizado. El panel puede agruparlos y proponer una respuesta basada únicamente en documentos existentes. El estado inicial es `PROPUESTA`; ningún texto generado se incorpora solo al conocimiento. Un revisor autorizado puede editar, aprobar o descartar. Aprobar crea documento `APRENDIZAJE` publicado y solicita indexado; el objetivo previsto es disponibilidad en búsqueda en menos de cinco minutos, con evidencia de versión y fuentes.

No se entrenan modelos ni se sube información a proveedores. Si la propuesta contiene PII, una afirmación sin fuente, precio/cobertura/plazo no sustentado o contenido fuera de dominio, debe descartarse y documentarse el motivo.

## Conversaciones

El explorador mostrará sólo conversaciones seudonimizadas, con filtros y paginación. Debe permitir identificar el canal, estado, fuentes, mensajes anonimizados, ausencia de fuente, escalado y valoración sin revelar IP, *user-agent*, prompt de sistema, secretos ni texto original que hubiera sido redactado. Las consultas de derechos y supresión siguen el procedimiento aprobado; no se resuelven mediante borrado manual ad hoc.

Un administrador puede clasificar un caso como escalado, revisar si se atendió y comprobar que el horario humano se aplicó correctamente. El contenido no se utiliza como conocimiento sin pasar por el flujo de propuesta/revisión.

## Leads

La bandeja de leads distingue empresa/hogar, prioridad (`CALIENTE`, `TEMPLADO`, `FRÍO`), estado, necesidad y consentimiento/version/fecha. Sólo se muestran datos de contacto cuando se han entregado con consentimiento válido. No se envían correos, SMS, webhooks ni se sincroniza CRM desde esta entrega; la atención humana procede por el canal y procedimiento aprobados.

El administrador puede actualizar el estado operativo (`NUEVO`, `CONTACTADO`, `CERRADO`, `DESCARTADO`) con trazabilidad. Una retirada de consentimiento o solicitud de supresión debe activar el proceso de derechos, no limitarse a ocultar una fila.

## Informes y propuestas

El panel prevé informes diarios, semanales y mensuales de volumen, resolución, escalados, huecos, satisfacción, conversión y tendencias. Los informes son visibles sólo dentro del panel y con datos anonimizados. Por ahora el informe diario se genera de manera perezosa e idempotente a partir de las 08:00 Europe/Madrid o con «Generar ahora»; Vercel Cron está documentado, no activado.

Las propuestas de mejora indican huella, impacto, esfuerzo y estado. Una propuesta descartada no debe reaparecer automáticamente. Antes de tomar decisiones, el administrador revisa tamaño de muestra, fuentes, sesgo y anonimización.

## Configuración e incidencias

La configuración prevista incluye tono, bienvenida, horario humano, temas prohibidos, modelo, modo y retención. Todo cambio pide motivo; cambiar a `local` exige doble confirmación y validación técnica. El panel registra antes/después, actor y momento, pero no secretos. El modelo efectivo nunca puede ser menos restrictivo que el entorno.

Para una incidencia, apagar primero con `ASSISTANT_PUBLIC_ENABLED=false` y `ASSISTANT_MODE=desactivado`; después desplegar la versión anterior validada. No borrar tablas `asistente_*` como rollback. Preservar evidencia mínima sin datos personales en claro, aplicar el runbook y escalar a seguridad/DPO cuando corresponda.
