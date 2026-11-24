# Contratos E y compatibilidad Área 4 · 24/11/2026

Fuente: aviso20:14CET de WEB INTERNET OPERADORES (IPQGwqQItUem8dIplGzXYS). **Solo coordinación, NO petición de integrar Área4.** Base staging33ef7235164d0f9fd60e7f8efeabbca098606102, con pipelines Área1 e794b32.

## Contratos propietarios conservados

Impuestos `/admin/finanzas/impuestos`: SUPER_ADMIN y GERENTE editan; CONTABILIDAD principal o en roles[] solo consulta. APIs GET `/api/admin/finanzas/impuestos`; GET/POST/DELETE `/api/admin/finanzas/impuestos/presentados`.

Presupuesto `/admin/finanzas/presupuesto`: SUPER_ADMIN y GERENTE; aprobar solo SUPER_ADMIN real. APIs GET/POST `/api/admin/finanzas/presupuesto/versiones`; GET/PATCH `versiones/[id]`; PATCH/POST/DELETE `versiones/[id]/lineas`; POST `versiones/[id]/aprobar` con `{confirmo:true}`; GET `versiones/[id]/seguimiento`.

Dos hijos Finanzas: secciones `finanzas.impuestos` y `finanzas.presupuesto`, sin actuación/simulación. Grant general Finanzas no elimina la restricción de rol. No códigos ACL nuevos en BD; `admin.finanzas.impuestos` y `admin.finanzas.presupuesto` identifican registro, no son delegación por sí solos. Guardia real viva `lib/impuestos/auth.ts`; primitiva pura reutilizada `auth-permisos.ts`.

Migración propietaria `20261128_area3_impuestos_presupuesto`, tablas `area3_imp_*` y `area3_pre_*`; down manual NO ejecutado. Área4 no modifica módulos, cálculos ni migraciones propietarios, no aplica SQL ni cambia usuarios/producción.

## Actualización del candidato

Merge sobre33ef resuelto preservando guardias de Subida/Sistemas/Rentabilidad, banda/salida y Conciliar/Para pedir. Registro423 superficies (116 páginas/307 APIs),79 secciones. Incluye página/cinco APIs CRM pipelines bajo admin.crm, sin elemento redundante de menú.

Middleware, política y cliente intersectan permisos personales con permisosFin: Conta solo V en Impuestos incluso con finanzas E/C/X; Conta no Presupuesto; Gerente no aprobación aunque tenga C; propietario canónico, sin actuación. Negativa hija conservada. ACL adoptada vacía también deniega Gerente, marcador SSR actualizado sin rebajarlo si falta y fallback P2022 exacto, no substring.

Pruebas locales verdes:639 middleware real con sesión/BD sintéticas;56 componentes cliente/SSR, incluido rerender;14 CRM y16 E; compatibilidad Conciliar/actuación y alto riesgo;59 migraciones lexicales sin SQL. Build final verde; recibo en el informe de estado. **No equivalen a páginas cargadas/aceptación HTTP.** Runner sin fixtures autorizados devuelve exit2; no se inventan sesiones.

Rama exclusiva `area4-usuarios-permisos`; SHA final comunicado en entrega después de verificación remota. Staging/main/producción no escritos por esta tarea. **NO READY / NO INTEGRAR.** Siguen pendientes equivalencia real, dependencias técnicas/CX, transición Lorena, auditoría de éxito, HTTP/pantalla400px y foto productiva para bajas separadas. Objetivo2 no iniciado.
