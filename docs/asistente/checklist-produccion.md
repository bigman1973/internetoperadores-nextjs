# Checklist de producción — asistente IA

**Estado:** lista de bloqueo. No autoriza producción sin revisión, pruebas y aprobación explícita de Víctor.

## Base de datos y recuperación

- [ ] Existe copia completa de la base correspondiente y se ha restaurado con éxito en un entorno aislado, con fecha, responsable y evidencia.
- [ ] La migración aditiva `20261025_asistente_ia` ha sido revisada: sólo crea tablas/índices/tipos `asistente_*`; no hay `DROP`, `ALTER` destructivo, `DELETE`, `TRUNCATE` ni extensiones en la BD de staging/producción.
- [ ] Se han probado ACL público/interno/cliente, tenant cruzado, límites y ausencia de fuentes antes de abrir tráfico.
- [ ] Staging usa FTS `tsvector` y `embedding real[]` opcional. pgvector se aprovisiona únicamente en una **base separada** para producción, con backup/restauración y red privada verificados.

## Configuración, interruptores y aplicación

- [ ] Secretos cargados desde gestor de secretos; no existen en repositorio, logs ni imágenes.
- [ ] `ASSISTANT_PUBLIC_ENABLED` es `false` hasta la aceptación final.
- [ ] `ASSISTANT_MODE=desactivado` en producción hasta completar validación de modelo, seguridad y legal.
- [ ] `ASSISTANT_CLIENT_ENABLED=false`, `ASSISTANT_EMAIL_ENABLED=false` y `ASSISTANT_CRON_ENABLED=false` inicialmente.
- [ ] Límites: `ASSISTANT_MAX_MESSAGE_CHARS=1500`, cuerpo HTTP ≤8 KiB en rutas de aplicación y rate limit público 20/10 min.
- [ ] `ASSISTANT_HASH_SECRET` es secreto independiente y no se persiste IP/user-agent en claro.
- [ ] Validada allowlist de endpoints locales; no se usan `OPENAI_API_KEY` ni `OPENAI_BASE_URL` y no hay URLs públicas de proveedores IA.
- [ ] El widget no se monta en `/admin`, `/empleado`, `/cliente`, `/login`, `/api`, `/checkout`, `/carrito`, `/pago` ni subrutas.

## Servidor GPU y red

- [ ] Hardware/modelo seleccionados mediante batería de 100 preguntas españolas; licencia, revisión, hash y cuantización del checkpoint están documentados.
- [ ] Bundle offline revisado por dos personas: `ARTIFACTS.sha256`, digests de imágenes y revisiones inmutables de modelos.
- [ ] Validadores superados: `validar_compose.py`, `docker compose config -q`, arranque controlado y `probar-sin-salida.sh` con recibo.
- [ ] Sólo Caddy publica TCP/443; vLLM, RAG, Redis, Langfuse y almacenes no publican puertos.
- [ ] Caddy usa PEM local, mTLS y token de relay. No hay ACME ni DNS/egress externo.
- [ ] Firewall de host con entrada/salida denegadas por defecto; CIDR relay/VPN y SSH revisados desde consola fuera de banda.
- [ ] `verificar-latencia.sh` acredita P95/objetivo de primer token <3 s bajo carga acordada; VRAM P95 <85 %.
- [ ] Backup cifrado local a destinatarios públicos y restauración en volumen nuevo con identidad privada custodiada externamente, superados y archivados.

## Privacidad, seguridad y operación

- [ ] Aviso de IA, política de privacidad, consentimiento lead, RAT/ROPA, EIPD/decisión y contratos DPA aprobados.
- [ ] Cookiebot y el uso de `sessionStorage` del widget revisados; no hay cookies/localStorage propios no declarados.
- [ ] Retención 12 meses (o valor aprobado), borrado/anonimización y atención de derechos operativos y probados.
- [ ] Tracing/observabilidad sólo con texto anonimizado; Langfuse queda apagado salvo aprobación expresa.
- [ ] No hay email, SMS, webhooks ni notificación externa del asistente.
- [ ] Runbook de incidente, rotación de secretos, responsable 24/7 y ventana de actualización offline aprobados.

## Informes y cron

El endpoint `/api/cron/asistente-informe` queda preparado, pero en staging está bloqueado y no hay `vercel.json` modificado. Si se aprueba más adelante, la línea de cron debe documentarse/revisarse de forma separada: Vercel cron usa UTC; el handler convierte a `Europe/Madrid`, toma lock idempotente y ejecuta sólo a las 08:00 locales. Mientras tanto el informe se genera de forma perezosa e idempotente al abrir panel, con botón «Generar ahora». `ASSISTANT_CRON_ENABLED=false` hasta aprobación.

## Plan de vuelta atrás exacto

1. **Apagar tráfico y generación inmediatamente:** establecer `ASSISTANT_PUBLIC_ENABLED=false` y `ASSISTANT_MODE=desactivado` en el entorno correspondiente.
2. Redesplegar la versión anterior conocida y validada de la aplicación; comprobar `GET /api/asistente/config` devuelve `{enabled:false}` y que el widget no está en el DOM.
3. Si estaba activo el host GPU, detenerlo con `docker compose down` y revocar/rotar `CADDY_GATEWAY_TOKEN`, claves RAG/vLLM y certificados si existe sospecha de exposición. Conservar recibos y evidencias mínimas sin texto personal.
4. Las tablas y columnas aditivas `asistente_*` pueden quedarse: no ejecutar `DROP` como rollback. Deshabilitar sus jobs/rutas mediante flags y analizar incidencia antes de cualquier limpieza autorizada.
5. Si hubo datos afectados, aplicar el procedimiento de incidente, evaluar obligaciones de notificación con DPO/asesoría y restaurar sólo copias verificadas en entorno aislado.
6. Para reactivar, repetir checklist y pruebas: un redeploy no sustituye la validación de red, ACL, legal ni latencia.
