# Área 1 — Carga de clientes de ISP Gestión en el CRM

Encargo del 24/11/2026 (Víctor, vía Claude). Rama `area1-crm`, rebasada sobre `origin/staging`. **No se ha desplegado ni escrito nada en staging**: la tarea integradora «WEB INTERNET OPERADORES» aplica las migraciones y publica.

## Qué hace

ISP Gestión manda en clientes, contratos y facturación; el panel manda en lo comercial. Mientras la API avanzada de ISP siga devolviendo 403, la actualización se hace con el mismo fichero `CRM_IO_datos_ISP_AAAA-MM-DD.xlsx` (hojas `Clientes`, `Contratos` y `Facturacion_2026`) desde **/admin/crm/isp**, que solo ve el `SUPER_ADMIN`. Hay una tarjeta en /admin/crm.

1. **Simular**: lee el fichero, calcula una huella por fila y muestra qué hay de nuevo, qué ha cambiado, qué no ha cambiado y qué ha desaparecido; también el estado de marketing y las propuestas de vínculo. No escribe nada.
2. **Aplicar**: exige el `hashEsperado` del fichero simulado y escribir `APLICAR`. Todo va en una transacción.
3. **Revisar propuestas**: una persona confirma o descarta cada vínculo. Nada se vincula solo.

Las tablas son propias del área (`area1_isp_*`):

- `area1_isp_importaciones`: auditoría de cada carga, con la huella del fichero, el actor y un resumen agregado.
- `area1_isp_clientes`: una fila por cliente ISP. La clave es «ID CLIENTES» y se guarda también el CODIGO. Tiene enlaces opcionales a `clientes_web`, `crm_registros_hubspot` y `crm_empresas`.
- `area1_isp_contratos`: una fila por «Nº CONTRATO». Se asigna al cliente por NIF, o por NIF y nombre si el NIF es de varias cuentas. Tiene el puente `contrato_servicio_id` y `codigo_contrato_isp`, que es la clave de `rentabilidad_lineas`.
- `area1_isp_facturacion_mensual`: base imponible por código de cliente, año y mes.
- `area1_isp_vinculos`: propuestas en estado PENDIENTE, CONFIRMADO, DESCARTADO u OBSOLETO.

La ficha de empresa y la de contacto muestran el bloque «ISP Gestión» con los contratos, la facturación de 2026 por mes y el margen. El margen queda como `PENDIENTE_INTEGRACION_RENTABILIDAD`, enlazado por `codigo_contrato_isp`, hasta que el Área 3 exponga Rentabilidad.

## Reglas

- **Idempotente**: si se reimporta el mismo fichero, todo sale «sin cambios». Si un cliente o contrato ya no está en el fichero, se marca con `presente_en_ultimo_fichero=false`. **Nunca se borra nada.**
- **Identidad automática**: solo cuando coinciden el ID ISP y el código con `clientes_web`, o cuando el vínculo ya existía en el CRM (un contacto ya ligado a esa ficha o una empresa ya ligada a ese cliente). Todo lo demás se queda en propuesta.
- **No se propone**:
  - una ficha de cliente que ya es la identidad de otra cuenta ISP;
  - un contacto que ya pertenece a otra ficha de cliente.

  Si un particular tiene un email de un contacto ajeno, se propone crear un contacto nuevo con confianza MEDIA.
- **Decisiones humanas**: una vez confirmada una categoría (ficha, contacto o empresa), las siguientes importaciones no la vuelven a abrir. Lo descartado no reaparece.
- **Segmentos**:

  | Cliente ISP | Segmento en el CRM |
  |---|---|
  | Persona jurídica con CIF de sociedad | EMPRESA (SOCIEDAD) |
  | Persona jurídica con DNI o NIE | EMPRESA (AUTONOMO); al confirmar se crea también su titular como contacto |
  | Resto | PARTICULAR |

  PARTNER no viene de ISP: se marca en el CRM.
- **Contactos creados**: usan `hubspot_id = 'local:<uuid>'`, la convención ya existente.
- **Marketing**:
  - Las bajas prevalecen siempre: opt-out y rebotes duros del CRM, listas de baja o rebote (no la lista técnica «HubSpot Partner - Invalid Data») y, si existe `BREVO_API_KEY`, los bloqueados de Brevo (solo GET a `/v3/contacts` y `/v3/smtp/blockedContacts`).
  - Una baja anterior no la reactiva ningún fichero posterior. Si se retira RECIBEPUBLICIDAD en ISP, cuenta como baja.
  - Sin email → SIN_EMAIL; sin RECIBEPUBLICIDAD → SIN_CONSENTIMIENTO.
  - No se sincroniza nada con Brevo ni se envía ningún correo.

## Aplicación (para la integradora)

Hay que aplicar, en este orden y **solo** estos ficheros. No hay que lanzar `migrate deploy` indiscriminado.

1. `prisma/migrations/20261102_area1_captacion_web/migration.sql`: captación web del commit `feat` anterior, corregida en el commit `fix`. Ya no hace `DROP NOT NULL` ni usa `ON UPDATE`.
2. `prisma/migrations/20261125_area1_isp_carga/migration.sql`: carga ISP.

Las dos son solo aditivas y re-ejecutables (`IF NOT EXISTS`, y las FK dentro de bloques `DO` que comprueban `pg_constraint`). Pasan `node scripts/areas/check-migrations.mjs`. Se han ensayado dos veces seguidas sobre un PostgreSQL 16 efímero con el esquema de `origin/staging`, y después `prisma migrate diff` contra `schema.prisma` no muestra diferencias propias. Solo aparece la previa y ajena de `asistente_fragmentos.embedding`, porque en local no hay pgvector.

Después de aplicarlas en staging, la primera carga la hace el superadmin desde /admin/crm/isp: primero simula, revisa y luego aplica.

**Vuelta atrás**: revertir el código. Las tablas `area1_isp_*` pueden quedarse sin uso. No hay que borrar contactos ni empresas creados por confirmación humana.

## Baterías

- `pnpm exec tsx scripts/test-area1-isp-import.ts`: 10 pruebas sintéticas, sin BD ni red y sin datos personales.
- `pnpm exec tsx scripts/test-area1-captacion-web.ts` y `node scripts/test-area1-contrataciones.cjs`: en verde.
- Ensayo de extremo a extremo, fuera del repositorio, en una BD local efímera con una copia en solo lectura de las tablas CRM de staging y el fichero real:

  | Pasada | Resultado |
  |---|---|
  | 1ª | 1030 clientes, 1342 contratos y 3806 meses de facturación nuevos (636.262,89 € en 2026) |
  | 2ª | 100 % sin cambios, 0 propuestas nuevas |

  Además se confirmó una propuesta de cada tipo, y repetir una confirmación devuelve `YA_RESUELTA`. Una 3ª pasada conserva las decisiones. La BD local se destruye al terminar.
- `pnpm build` en verde. `tsc` no da errores en los ficheros del área; los errores globales que quedan vienen de staging (por ejemplo, `alta-servicio`, línea 158, y `api/admin/crm/empresas/[id]/contactos`).

## Decisiones pendientes de Víctor

1. ¿Vale RECIBEPUBLICIDAD de ISP como consentimiento para la newsletter de Brevo? Afecta a 811 clientes aptos. Mientras no lo confirme, solo queda marcado y no se sincroniza.
2. ¿Es correcta la regla de autónomos (persona jurídica con DNI o NIE → empresa AUTONOMO con titular como contacto)?
3. 36 fichas tienen el mismo ID ISP con un código distinto, y 9 clientes no coinciden por ID: se revisan una a una en las propuestas CLIENTE_WEB.
4. Hay 9 contratos ambiguos (un NIF compartido por varias cuentas con nombre distinto) y un CODIGO duplicado en ISP. ¿Se corrigen en ISP o se asignan a mano?
5. 46 empresas casan solo por nombre (confianza BAJA). ¿Se revisan una a una?
6. ¿Se permite la confirmación masiva de propuestas CREAR_EMPRESA y CREAR_CONTACTO de confianza ALTA, o van una a una?
