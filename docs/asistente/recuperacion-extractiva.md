# Recuperación extractiva en staging

## Alcance

En staging, el asistente recupera exclusivamente fragmentos publicados mediante FTS de PostgreSQL en español. No llama a modelos externos, no usa Internet en tiempo de ejecución y, mientras `ASSISTANT_EMBEDDINGS_URL` esté vacío, no realiza recuperación semántica.

Cada consulta mantiene en la misma sentencia SQL parametrizada los filtros de fragmento activo, documento `PUBLICADO`, espacio permitido, roles y `tenant_cliente_id`. Los candidatos no se recuperan para filtrarlos posteriormente en JavaScript. La respuesta extractiva contiene únicamente frases literales de los fragmentos recuperados y sus citas numeradas. Si no existe una fuente con coincidencia suficiente, responde que no dispone de esa información y ofrece atención humana.

## Preparación de consultas con datos personales

Antes de persistir y antes de recuperar, `redactarPII` sustituye identificadores personales por marcadores. Para no convertir una declaración de privacidad en ruido de búsqueda, `consultaParaRecuperacion` elimina los marcadores y, cuando el texto contiene una cláusula interrogativa explícita, usa esa última cláusula como consulta FTS.

Ejemplo genérico: una persona puede introducir una declaración con un identificador redactado seguida de `; ¿qué opciones hay?`. La recuperación recibe `¿qué opciones hay?`; el texto completo ya anonimizado se conserva para persistencia. Esta regla depende de puntuación, no de un dominio, una fuente o un alias de fixture. No incorpora sinónimos de negocio, no reduce el mínimo de cobertura y no permite que el marcador PII influya en FTS o embeddings.

Si no hay cláusula interrogativa, la consulta conserva sus términos no sensibles sin marcadores. Por ello una declaración PII sin una pregunta no se convierte en una consulta nueva ni en una respuesta cierta.

## Confianza y fallos seguros

La recuperación prueba primero FTS web, después FTS plano y finalmente una consulta léxica OR con cobertura mínima de términos. El fallback de cobertura exige al menos la mitad de los lexemas de consulta (dos cuando hay tres o más); por tanto no basta una coincidencia aislada para presentar una fuente. `responderMensaje` exige además que el primer resultado tenga puntuación positiva. No se ha bajado ningún umbral para este ajuste.

La batería offline verifica fuentes/citas literales, cero cifras inventadas, aislamiento de los canarios `INTERNO` y `CLIENTE`, PII anonimizada, bloqueo de inyección y preguntas sin fuente. Las preguntas PII sin fuente y las ambiguas continúan debiendo acabar en `SIN_RESPUESTA`, sin obtener una cita por la mera existencia de un marcador.

## Límite conocido: paráfrasis sin solapamiento

Cuatro casos de la batería son paráfrasis que no comparten lexemas con sus fuentes. FTS y normalización determinista no pueden demostrar de manera fiable que se refieran al mismo concepto sin ampliar la recuperación hacia falsos positivos. No se han añadido alias específicos ni heurísticas por fixture para convertirlas en aciertos.

La resolución apropiada requiere embeddings y/o reranking locales en el servidor GPU privado, todavía no disponible para staging. Hasta que exista ese entorno y supere las pruebas de ACL, citas y seguridad, esos casos deben permanecer como `SIN_RESPUESTA` con escalado a una persona.
