# Área 4 · Usuarios y permisos · entrega de la maqueta

**25/11/2026 · candidato en rama propia `area4-usuarios-permisos`, sobre staging `269584a6`. No publicado en producción.**

## Implementado

Se sustituye `/admin/usuarios` por la estructura aprobada: cabecera, seis indicadores, cuatro pestañas, buscador y filtros, lista/ficha lateral, seis plantillas, extras y pérdidas/ganancias V/E/C/X. Desactivar, nunca eliminar. Actuación y auditoría reutilizan los contratos reales; Invitar prepara texto, no envía comunicaciones. Nuevo usuario está cerrado mientras la aplicación no esté autorizada. El interruptor reversible mantiene Apagado / Solo yo / Todos.

Las propuestas se calculan en el servidor, con revisión concurrente y confirmación explícita. La sustitución de ACL y el registro íntegro antes/después son atómicos. El propietario canónico, Iván y Tutorial Bot están protegidos. Solo se conserva un rol/extras confirmado si la evidencia procede del propietario activo y coincide exactamente con roles y grants derivados del catálogo completo. Ambos modos de solo lectura impiden aplicar o cambiar el interruptor antes de cualquier transacción.

`components/io-ui` conserva intactos sus cuatro hashes; los estilos nuevos están acotados a `.io-ui.area4-usuarios`. URLs y archivos de las otras áreas no cambian.

## Evidencia

- `pnpm build`: PASS, 01:01–01:02 CET; fuentes de aplicación congeladas antes de comenzar. Destino aislado `io_staging_finanzas` en READ ONLY, credenciales externas retiradas, sin migraciones.
- `pnpm test:area4`: PASS. 649 comprobaciones de middleware sobre 112 páginas, 56 comprobaciones cliente/SSR y 32 pruebas nuevas (12 UI, 17 propuestas, 3 handler menú); inventario exacto de rutas y demás subbaterías verdes.
- Área 5: 10 pruebas sintéticas PASS, sin editar su código.
- TypeScript propio: cero diagnósticos. **TypeScript global no está verde:** quedan 48 diagnósticos de otras fuentes y uno generado. El build mantiene `ignoreBuildErrors` heredado; no se ha cambiado para ocultar errores nuevos.
- Revisión independiente: sin hallazgo nuevo alto/crítico; dos hallazgos medios corregidos y comprobados con negativos.
- Comparativas 1360/400: maqueta original a la izquierda, componente real con datos ficticios a la derecha. Fuentes autoalojadas del kit en el render aislado; seis indicadores, cuatro pestañas, sin desbordamiento ni errores JS. **No son capturas del staging autenticado.**
- Informe real: nueve personas de la copia aislada en READ ONLY, ninguna cuenta modificada. Distingue intención de plantilla de detalle ACL; no certifica HTTP de cada módulo ni consulta producción.

## Límites y pendientes

La aplicación de roles sigue deshabilitada. No se ha aplicado ninguna asignación, desactivación ni cambio de menú en BD. Personal sin Nóminas, el aislamiento de Gastos, la contradicción Comercial/Subida y los códigos pendientes requieren resolución con los dueños; Jordi no recibe una promesa de aprobación de gastos que su módulo deniega. No se inventan permisos ni se debilitan guardias para conseguir una batería verde.

La integradora es la única que integra en staging y registra los desarrollos preparados, comprobando antes el historial automático para no duplicar. La aceptación visual y HTTP con sesiones reales queda pendiente después de la integración: las pruebas actuales son sintéticas y no simulan una sesión real en staging. Nada de producción, emails, notificaciones, Azure ni sincronizaciones se ha ejecutado.

**Orden siguiente:** registro único real para menú, matriz, acciones y etiquetas; cierre de apartados nuevos por defecto y asignación confirmada/auditada. La guía `docs/area4-registro-apartados.md` es preparación, no implementación completa. Peticiones/Historial quedan después. Coordinación de excepciones POST CRM se entrega por separado; M365 no integrado ni autorizado.
