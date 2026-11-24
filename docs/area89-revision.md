# Revisión de Áreas 8/9 — 24/11/2026

La revisión independiente se realizó únicamente por código y con dobles de prueba, sin BD ni navegador. No acredita aceptación visual ni integración.

Se corrigieron la normalización de estados frente a `constructor`, `toString` y `__proto__`; el PUT ahora guarda tipo y sección con validación, como su formulario permite. La retirada de una petición está condicionada tanto en servidor como en UI a que sea nueva y no haya sido intervenida por administración. La columna aditiva `area8_tramitada_at` conserva esa intervención aunque después se retire el responsable; el predicado atómico contempla también eventos, responsable, notas y mensajes administrativos del legado. Las notas vigentes vuelven a ser visibles aunque ya exista conversación. Se corrigió la fecha inicial del historial manual para que represente hora local y se reforzó el ajuste de cadenas largas a 400 px.

## Hallazgo descartado por contrato aprobado

La revisión propuso que una fila ACL negativa pudiera limitar al propietario. No se adopta: la decisión explícita de Víctor es «Super Admin = solo Víctor, con acceso a todo». El candidato Área 4 ya lo define en `evaluateArea4Capability`: una cuenta activa SUPER_ADMIN cuyo ID coincide con el propietario configurado dispone de acceso universal. Área 8 conserva ese contrato; no concede el atajo a otros SUPER_ADMIN, al Tutorial Bot ni a una identidad en actuación. Las denegaciones explícitas más concretas siguen prevaleciendo para el resto. No se cambia la pieza común de permisos.

## Publicaciones: contraste real, no activación

La tarea principal inspeccionó en solo lectura diez deployments recientes de `bigman1973/internetoperadores-nextjs`: todos tienen environment Preview y production_environment false. Esa muestra no es la totalidad de la historia productiva y no demuestra ausencia de producción. Se comprobó también en el proyecto Vercel autorizado un registro productivo READY y su forma real (`project.id`, `target`, `ready`, `readyState`, `meta.githubCommitSha`), sin peticiones HTTP a producción y sin modificarlo. El capturador acepta esa estructura además de la normalizada, rechaza proyectos discrepantes y nunca transforma preview en publicación productiva.

No existe todavía el verificador autenticado que firme entradas para el capturador ni un hook activo. La inspección de metadatos no activa el contrato ni constituye un permiso de publicación. El futuro registrador reutiliza exclusivamente la identidad del staging aislado ya existente `io_staging_finanzas`, con variable específica y doble comprobación de identidad, sin fallback a producción. No se ha conectado ni ejecutado esa rama de escritura.

Las dos migraciones siguen preparadas, no aplicadas. La comprobación léxica no sustituye el ensayo de SQL ni la aceptación en staging. No READY de integración.

## Compatibilidad tras el rebase sobre c4c24973

Se reutilizan `isArea4Owner`, `evaluateArea4Capability` y `readLiveArea4Adoption` sin editar archivos comunes. Se evita que permisos ajenos a Peticiones limiten al Gerente de forma distinta al contrato central; una ACL adoptada vacía sigue denegando y las revocaciones específicas prevalecen. Se comprueba que la sección ACL esté presente y activa antes de conceder gestión a no propietarios. Siete nuevos casos API y cuatro reglas sintéticas cubren esos contratos. El fixture de UI que aceptaba cualquier SUPER_ADMIN se adapta al ID de propietario ficticio configurado, e incorpora un negativo para otro SUPER_ADMIN.
