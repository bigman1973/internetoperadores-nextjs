# Cómo registrar apartados del panel · Área 4

## Requisito aprobado por Víctor (25/11/2026)

Debe existir una única fuente de apartados con ruta, grupo del menú, nombre y acciones V/E/C/X, de la que se deriven el menú, la matriz de Roles y las guardas de API. No se admitirán listas duplicadas por Área. Un apartado nuevo quedará cerrado a todos salvo el propietario canónico hasta que se asigne explícitamente. Usuarios mostrará «Apartados nuevos sin asignar» y permitirá una asignación humana confirmada y auditada.

**Estado de esta entrega:** el registro de rutas/códigos/grupos y la prueba exhaustiva de inventario ya existen. El menú agrupado y el middleware lo consumen. La unificación de nombres/acciones, el menú histórico, la matriz de presentación, el cierre universal de apartados nuevos y el aviso/asignación auditada **siguen pendientes**. Este documento no declara terminada esa ampliación ni habilita permisos automáticamente.

## Procedimiento vigente para todas las Áreas

1. Antes de añadir una página `/admin` o un handler `/api/admin`, comunicar a Área 4 y a la integradora: nombre visible, ruta exacta, grupo, código de permiso existente o nuevo, métodos, capacidades V/E/C/X, alcance sobre datos propios/ajenos y si exige propietario real sin actuación. Incluir también rutas auxiliares, dinámicas, exportaciones y confirmaciones.
2. Área 4 incorpora cada superficie exactamente una vez en `lib/area4/section-registry.ts`. El propietario de otra Área no cambia por su cuenta las piezas comunes. Una ficha dinámica se registra con su patrón real, por ejemplo `[id]`; una acción literal se registra como ruta propia. No inventar códigos que ningún servidor comprueba.
3. Declarar cómo se traduce cada operación a una capacidad: V para consultar; E para modificar sin confirmar; C para aprobar/confirmar; X para exportar. Los selectores por acción en cuerpos JSON deben estar revisados en `lib/area4/request-policy.ts`. Un único POST con varias acciones no puede asumir que todas necesitan solo E.
4. Mantener la comprobación viva de sesión, actividad y permisos en el servidor del módulo. El menú es presentación, no autorización. Aplicar las restricciones propias adicionales (identidad, datos propios, propietario, ausencia de actuación). Si varios datos sensibles comparten ruta/permiso, separarlos con el dueño antes de anunciar permisos independientes.
5. Si requiere catálogo nuevo en BD, preparar migración **aditiva** con prefijo de Área; no asignar usuarios/roles ni activar el menú al migrar. La aplicación de una migración compartida la coordina la integradora. Un desarrollo o un GET nunca adopta permisos por sí mismo.
6. Ejecutar `pnpm exec tsx --test scripts/test-area4-surface-registry.ts` y la batería `pnpm test:area4`; después `pnpm build` antes del push. La prueba inventaría todas las páginas/APIs reales y falla por ausencia, duplicación o ruta sobrante. No quitarla, relajarla ni añadir una excepción para pasar una ruta sin registrar.
7. Entregar a la integradora el SHA propio, contratos y evidencia. Solo ella integra en staging. Ningún cambio se publica en producción desde una tarea de Área. Registrar el desarrollo en el historial o entregar el registro pendiente si la escritura compartida está reservada.

Áreas **1 y 5** deben cumplir este procedimiento también para las nuevas pantallas de CRM y empleados. La integradora ha sido avisada expresamente de que lo exija. Los endpoints `/api/empleado` no quedan cubiertos por la frontera administrativa solo por estar inventariados: su servidor debe comprobar identidad y alcance propios.

## Fuentes actuales que deben consolidarse

| Fuente | Situación actual | Destino requerido |
|---|---|---|
| `lib/area4/section-registry.ts` | Rutas, códigos, grupos, menú agrupado | Registro canónico ampliado con nombres y acciones |
| `components/admin/sidebar-navigation.ts` | Menú histórico y adaptación del agrupado | Derivación del mismo registro, conservando presentación reversible |
| `lib/area4/approved-roles.ts` | Seis plantillas y filas de presentación `USERS_SECTIONS` | Plantillas sobre identificadores del registro, sin otra lista de apartados |
| `lib/area4/request-policy.ts` | Capacidades por método y comandos JSON | Contratos de acciones ligados al registro canónico |
| `lib/area4/policy.ts` | Permisos vivos y compatibilidad heredada | Nuevos apartados denegados sin asignación explícita, incluso con permiso padre |

## Pendientes para una entrega independiente

- Consolidar los metadatos y derivar menú histórico, agrupado, matriz y guardas sin duplicar apartados ni cambiar URL.
- Definir una revisión/fecha de alta por apartado para distinguir «nuevo sin asignar» de un apartado existente deliberadamente restringido. No inferir autorización del mero hecho de existir en `permiso_areas`.
- Cerrar por defecto los nuevos códigos también frente a la herencia de permisos padre y roles heredados; propietario canónico como única excepción. Añadir negativos para ambos casos.
- Mostrar aviso y botón de asignación: propuesta por roles, diferencias visibles, confirmación, control de concurrencia y auditoría atómica. Nunca asignar al abrir la pantalla.
- Exigir la batería de inventario en la integración de cada Área y comprobar la acción real del handler, no solo la presencia de su ruta.

Sin cambios en cuentas, permisos, migraciones aplicadas ni producción en este documento.
