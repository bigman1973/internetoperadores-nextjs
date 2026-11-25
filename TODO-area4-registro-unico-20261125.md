# Área 4 · Registro único real · entrega

Inicio: 25/11/2026 01:12 CET, después de entregar UI `4d03c9a3` con batería y `pnpm build` verdes. Rama propia `area4-usuarios-permisos`; solo integradora integra en staging. Nada a producción ni escrituras reales en cuentas, BD compartida, migraciones, correos, Azure o sincronizaciones. Un objetivo por entrega; informar en máximo dos horas.

## Diseño aprobado y límites

El registro canónico contiene ruta/patrón, código real, nombre, grupo, acciones V/E/C/X y metadatos de presentación. Ambas presentaciones del menú, las filas de Usuarios/Roles y la clasificación de solicitudes se derivan de él, sin listas duplicadas en sus consumidores. Se conserva el aspecto `.io-ui`, sus cuatro archivos intactos, las URLs y los contratos reales de los módulos.

Se distingue la superficie histórica aprobada de una nueva sin revisar. Añadir una ruta a un apartado ya existente no equivale a concederla por el permiso padre. Todo lo nuevo o no asignado queda cerrado, incluso ante herencia granular o rol heredado, salvo el propietario real. La asignación humana configura una plantilla; no cambia cuentas ni elimina la intersección con su ACL viva y las guardias del módulo. No se ofrece aislamiento de Personal/Gastos que el servidor actual no posee.

La asignación tiene preview, detalle de acciones/roles, confirmación, revisión/CAS y registro append-only atómico. Reutiliza la auditoría existente con procedencia y descriptor completo; no requiere migración. Los GET, builds, previews y despliegues no asignan por sí mismos.

## Estructura y responsabilidades

- `lib/area4/section-registry.ts`: metadatos canónicos, definición de acciones, resolutores y proyecciones.
- `components/admin/sidebar-navigation.ts`: adapta la presentación/evaluación existentes; no mantiene otro inventario.
- `lib/area4/approved-roles.ts`, `request-policy.ts`, `policy.ts`: plantillas, acciones y permisos que consumen el registro; guardias de negocio intactas.
- `section-assignments.ts` / API existente `usuarios/propuestas`: persistencia audit-only, revisión/CAS y seguridad; no adopta cuentas.
- Usuarios: aviso, seis roles vacíos, revisión y confirmación de apartados nuevos; textos llanos y estilo existente.
- `surface-access.ts` / contrato puro: consentimiento exacto servidor, SSR y cliente; no sustituye guardias de negocio ni autoridad de API.

## Resultados exigidos

- [x] Un solo registry para menú lateral histórico/agrupado, `USERS_SECTIONS`, matriz de Roles, acciones y etiquetas; ningún inventario paralelo en consumidores, sin cambiar URLs ni ampliar accesos al volver al menú anterior.
- [x] Todo lo no asignado cerrado por defecto excepto Superadmin canónico, también con permiso padre o fallback Gerente; una ruta nueva dentro de un apartado existente no se abre automáticamente. Identidad, adopción, descriptor, consentimiento individual, asignación última y grant exacto intersectados; actuación y preview sin autoridad del actor original.
- [x] Fallo automático por cualquier página `/admin` o API `/api/admin` real sin registrar, duplicada o sobrante; inventario obligatorio en `pnpm build`. Se reutiliza la API real de propuestas, sin crear una ficticia.
- [x] Usuarios muestra «Apartados nuevos sin asignar» y botón «Asignar a roles», con diferencias, confirmación humana, revisión vigente y auditoría append-only. Persistencia real implementada y probada en memoria; no basta un aviso ni se cambian cuentas al asignar plantilla.
- [ ] Guía del registro actualizada con la implementación real; aviso final a integradora para exigirlo a Áreas 1 y 5, batería/build final y registros de historial preparados cuando la inserción compartida está reservada.

## Evidencia y aceptación separadas

Batería 01:48: `pnpm test:area4` EXIT 0; 659 middleware, 68 cliente, 32 Usuarios, 48 registro y UI de seis roles. Área 5 10 y actuación 11 PASS. Revisión independiente: sin defectos medios/altos verificados; no certifica HTTP, build ni producción. Se corrige el tipo de sesión propio y se repite la batería tras incorporar `64367a5f`; el resultado definitivo, typecheck y build se adjuntarán a la entrega. Typecheck global no se declara verde: existen diagnósticos ajenos heredados y `ignoreBuildErrors` no se modifica.

Informe real nuevo: nueve personas de la copia aislada en transacción READ ONLY; sin correos ni cuentas modificadas. Aceptación HTTP/visual con sesión real queda pendiente en el staging único. Ninguna escritura compartida de historial se realiza: los registros se entregan preparados, no insertados.

## Coordinación separada CRM

Base actual incorporada: staging `64367a5fc9ce0220cf9da31374e40c9912810d98`, opción C del Área 1. Las dos superficies M365 reales están inventariadas, nuevas y pendientes en `crm.contactos`, sin rebaselinar las 439 antiguas. El borrador GET requiere V+E desde metadata.

**Ambos POST CRM siguen cerrados en el sandbox en esta entrega.** La apertura se evalúa en un commit separado sobre C y su evidencia. `M365_STAGING_CALENDARIO` no se activa aquí; solo Víctor lo hará durante su prueba. M365 es sensible durante actuación. Peticiones/Historial continúa pausado hasta entregar el registro.
