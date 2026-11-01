# Fase 0 — áreas, previews y turnos de publicación

Autorización: Claude con Víctor, 30/10/2026. Esta fase añade infraestructura de trabajo y pruebas, no funcionalidades. `main` conserva producción. `staging` es la integración de lo terminado y validado, no una rama para desarrollar simultáneamente todas las áreas. Un preview no constituye autorización de publicación.

## Ramas activas

| Área | Rama | Preview estable de Vercel | Alcance actual |
|---|---|---|---|
| 3 — Finanzas | `area3-documentos` | https://internetoperadores-nextjs-git-area3-fda836-internet-operadores.vercel.app | Borrados y rectificativas primero; después confirming y delta. |
| 4 — Usuarios/permisos y marco común | `area4-usuarios-permisos` | https://internetoperadores-nextjs-git-area4-ddc321-internet-operadores.vercel.app | Infraestructura de la Fase 0, sin cambios funcionales. |
| 1 — CRM/ventas/leads | `area1-crm` | https://internetoperadores-nextjs-git-area1-crm-internet-operadores.vercel.app | Sólo diagnóstico; no cambios de CRM. |

Los alias anteriores son los asignados por Vercel, que acorta ramas largas y añade un sufijo. No se han inventado dominios ni modificado DNS o Azure. Las variables de estas ramas apuntan exclusivamente al rol y base aislados de staging; los opt-in productivos, delta y nuevas sincronizaciones están apagados. Las credenciales y documentos de prueba permanecen fuera del repositorio.

## Nueve áreas y convención de migraciones

El registro ejecutable es `config/areas.json`: area1 CRM-ventas-leads; area2 tarifas-contratos-subidas; area3 finanzas —facturación, conciliación, documentos, impuestos, tickets, analítica, estadísticas, AAPP y presupuestos—; area4 usuarios-permisos y marco del panel; area5 personal-portal-empleado; area6 proyectos-internos; area7 certificaciones; area8 peticiones; area9 historial-configuracion. Conciliar y documentos pertenecen al área 3.

**Toda migración nueva** debe llamarse `AAAAMMDD[_HHMMSS]_areaN_descripcion`, por ejemplo `20261030_area3_revision_documental`. El prefijo de área es obligatorio tras la fecha. La SQL sólo añade: tablas/columnas/índices/constraints compatibles; no elimina, renombra, trunca, resetea ni cambia importes o estados históricos. No se renombra ninguna migración ya aplicada. `config/migration-baseline.json` conserva los nombres y huellas heredados; el comprobador detecta modificaciones de esos archivos y nombres nuevos sin prefijo. Una comprobación lexical no sustituye el ensayo SQL y la revisión humana.

Todas las ramas comparten la misma BD staging. Las DDL se aplican una detrás de otra, tras copia restaurada y ensayo reversible; no se crean BD por área ni se lanza `prisma migrate`, `db push` o `reset`. Los nuevos objetos pueden usar también `areaN_` en su nombre cuando no afecte a contratos ya existentes. No se aplicó DDL en esta Fase 0.

## Un único comando de baterías

```bash
pnpm test:areas
```

Ejecuta todas las baterías habilitadas del registro, secuencialmente. Hoy sólo está habilitada la de Conciliar: suites puras y comparación de **API real ↔ proyección persistida**, 30 casos y 6 suplementos. Una batería que falle, datos privados ausentes, fotografía caducada, cobertura incompleta o diferencias con la pantalla devuelven un código distinto de cero y `publishAllowed:false`. No hay excepciones silenciosas ni aprobado basado sólo en una copia SQL.

La configuración privada se proporciona mediante `AREAS_BATTERY_CONFIG` o `pnpm test:areas --config /ruta/privada/baterias.json`:

```json
{
  "batteries": {
    "area3-conciliar": {
      "snapshotFile": "/ruta/privada/api-staging.json",
      "caseFile": "/ruta/privada/casos.json",
      "envFile": "/ruta/privada/staging.env"
    }
  }
}
```

Son rutas, no valores ni secretos. Los archivos privados deben ser propiedad del operador, modo 0600 y estar fuera del repo. La fotografía se toma antes con el arnés auditado de API/pantalla: todas las páginas, todas las pestañas, P9/P10 y los dos signos de traspasos, bloqueando acciones financieras y cerrando la actuación propia. El comando no inventa ni reutiliza indefinidamente esa fotografía.

`pnpm test:areas --local-only` sirve para diagnóstico; **nunca habilita una publicación**. La batería de staging heredada conserva seis diferencias financieras de estado frente a la copia: no se alteran datos ni expectativas para fabricarle un 30/30. Antes de cualquier publicación debe existir un juego de aceptación aprobado explícitamente para ese entorno. Una eventual exclusión requiere decisión de Claude y prueba separada, nunca un bypass genérico.

## Ventanas y bloqueo

Sólo orden expresa de Claude para un commit y alcance concretos; turnos de arranque a las 13:00 y 19:00, Europe/Madrid. La puerta admite el arranque durante la hora del turno y exige además una fecha de caducidad explícita de la orden. No hay cron ni publicación automática. El lock global se mantiene durante copia, migración aditiva, build, despliegue y smoke; un trabajo posterior espera, no cancela el que está en marcha. El build/TypeScript usa además el lock existente de compilación.

`pnpm release:guard --config /ruta/privada/publicacion.json` verifica: origen staging, orden y vigencia, todas las baterías reales del commit, copia productiva nueva restaurada y plan de vuelta atrás ensayado. La CLI reejecuta las baterías reales usando `batteryConfigFile`; no acepta un informe simulado como reemplazo. La puerta **no ejecuta un deploy** ni emite por sí sola una autorización de Claude. `scripts/areas/with-publication-lock.sh` mantiene la exclusión entre los worktrees; `.github/workflows/areas-publication-gate.yml` usa la misma cola global sin cancelar la activa.

GitHub recibe sólo recibos agregados mediante `workflow_dispatch`: no se suben cookies, credenciales, filas bancarias ni documentos a este repositorio público. La puerta remota verifica esos recibos; la CLI local vuelve a ejecutar la batería real antes de operar bajo lock. `issuer: Claude` y la referencia de mensaje son trazabilidad del protocolo, no una firma criptográfica ni verificación automática de su identidad. El workflow se entrega en la rama del área 4; debe integrarse y estar disponible antes de utilizarlo. Hasta entonces el check obligatorio ausente mantiene main bloqueado.

El origen publicado debe ser `staging` validado; `main` sigue siendo la rama que Vercel sirve como producción. No se cambia la Production Branch a staging, pues eso publicaría cada integración sin autorización. La protección nativa de main está habilitada y exige PR y el estado `areas/publicacion`; no se presenta una barrera local como protección frente a propietarios que puedan modificar los controles de GitHub/Vercel.

## Normas en diez líneas

1. Cada área trabaja en su rama y preview; sólo estas tres están activas.
2. CRM sólo diagnóstico; area2-tarifas se abre cuando termine el área 4.
3. Staging integra únicamente trabajo terminado y validado; main conserva producción.
4. Todas las ramas usan la BD staging compartida y aislada de producción.
5. Migraciones nuevas aditivas y con prefijo area1_…area9_; las aplicadas no se renombran.
6. Máximo tres tareas de área simultáneas y una sola publicación en ejecución.
7. Turnos manuales de 13:00 y 19:00, hora de Madrid; nunca cron de publicación.
8. Sólo orden de Claude para commit/alcance/turno; el reloj no es autorización.
9. Antes: todas las baterías reales, pnpm build, copia restaurada y vuelta atrás lista.
10. Sin correos, notificaciones, sincronizaciones nuevas ni confirmaciones automáticas productivas.

## Referencias de plataforma

- [Variables de entorno por rama en Vercel](https://vercel.com/docs/environment-variables).
- [Concurrencia y cola de GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).
