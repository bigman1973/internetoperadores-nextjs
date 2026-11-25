import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'
import { loadUsersSnapshot } from '../lib/area4/users-proposals'
import { configuredArea4OwnerId } from '../lib/area4/policy'

async function main() {
  const destination = resolve(process.argv[2] || '/home/ubuntu/entregas-area4-maqueta-20261125')
  const dbUrl = new URL(process.env.DATABASE_URL || '')
  if (dbUrl.username !== 'io_staging_finanzas' || dbUrl.pathname !== '/io_staging_finanzas') {
    throw new Error('El informe solo puede leer la copia aislada de staging')
  }
  const ownerId = configuredArea4OwnerId()
  if (!ownerId) throw new Error('Falta propietario configurado')
  const db = new PrismaClient({ log: [] })
  try {
    const state = await db.$transaction(async tx => {
      const check = await tx.$queryRaw<{ readonly: string }[]>`SELECT current_setting('transaction_read_only') AS readonly LIMIT 1`
      if (check[0]?.readonly !== 'on') throw new Error('El informe requiere READ ONLY')
      return loadUsersSnapshot(tx, ownerId)
    })
    const at = new Date().toISOString()
    const roleName = (key: string) => state.roles.find(role => role.key === key)?.name || key
    const report = {
      generatedAt: at, source: 'io_staging_finanzas; transacción READ ONLY',
      productionRead: false, accountsChanged: false, emailsIncluded: false,
      proposedSectionsAreIntent: true, applicationEnabled: state.applyingAllowed,
      currentAccessIsCommonPolicy: true, realModuleHttpChecked: false,
      warnings: state.warnings,
      users: state.users.map(user => ({
        id: user.id, name: user.name, activeInStagingCopy: user.active,
        currentRole: user.currentRoleLabel, proposedRole: roleName(user.role),
        extras: user.extras, protected: user.protected, protectionReason: user.protectionReason,
        proposal: state.proposal.rows.find(row => row.userId === user.id),
        granularAclDifferences: state.proposal.rows.find(row => row.userId === user.id)?.differences.filter(difference => /^(admin(?:\.|$)|empleado\.)/.test(difference.section)) || [],
        current: user.current, proposed: user.next,
      })),
    }
    await mkdir(destination, { recursive: true })
    await writeFile(resolve(destination, 'diferencias-usuarios.json'), JSON.stringify(report, null, 2) + '\n')
    const lines = [
      '# Diferencias de acceso por persona · Usuarios y permisos', '',
      `Generado: ${at}. Fuente: copia aislada **io_staging_finanzas**, transacción **READ ONLY**.`, '',
      'Este informe compara la foto real de staging con la propuesta, no con producción. No se han aplicado roles ni activaciones. Las diferencias se calculan por acción: **V** ver, **E** editar, **C** confirmar y **X** exportar. No se incluyen correos, contraseñas, sesiones ni datos de empleados.', '',
      '«Hoy» se calcula con la política común sobre las cuentas, roles y permisos vivos de la copia. No es una apertura HTTP autenticada de cada módulo: sus guardias particulares, perfiles especiales y alcance sobre datos propios pueden añadir restricciones. Esa aceptación real permanece pendiente.', '',
      '«Quedaría» por apartado muestra la intención de la maqueta, no una garantía de acceso de módulos incompatibles. El detalle por código refleja la ACL que se reemplazaría en el catálogo actual. Los bloqueos impiden aplicar un lote parcial o afirmar acceso sin las guardias del dueño.', '',
      'Iván y Tutorial Bot están excluidos de cualquier aplicación. Víctor confirmó que ya están inactivos en producción; la copia de staging puede conservar un estado anterior. No se ha consultado ni modificado producción para verificarlo.', '',
      '## Resumen', '',
      '| Persona | Hoy en staging | Propuesta | Resultado |',
      '|---|---|---|---|',
    ]
    for (const user of state.users) {
      const row = state.proposal.rows.find(item => item.userId === user.id)
      lines.push(`| ${user.name} | ${user.currentRoleLabel} | ${roleName(user.role)} | ${user.protected ? user.protectionReason || 'Protegido: sin cambios' : row?.blockedReason || (row?.changes ? 'Propuesta pendiente de confirmación' : 'Sin diferencias')} |`)
    }
    lines.push('', '## Límites de aplicación', '')
    for (const warning of state.warnings) lines.push(`${warning}\n`)
    for (const user of state.users) {
      const row = state.proposal.rows.find(item => item.userId === user.id)
      lines.push('', `## ${user.name}`, '', `**Hoy:** ${user.currentRoleLabel}. **Propuesta:** ${roleName(user.role)}. **Activo en copia de staging:** ${user.active ? 'sí' : 'no'}.`, '')
      if (user.protected) {
        lines.push(`**Sin cambios:** ${user.protectionReason || 'Cuenta protegida'}.`)
        continue
      }
      if (row?.blockedReason) lines.push(`**Aplicación bloqueada:** ${row.blockedReason}`, '')
      lines.push('| Apartado | Hoy | Quedaría | Pierde acciones | Gana acciones |', '|---|---|---|---|---|')
      for (const section of state.sections) {
        const current = user.current[section.key] || ''
        const next = user.next[section.key] || ''
        const lost = [...current].filter(action => !next.includes(action)).join('')
        const gained = [...next].filter(action => !current.includes(action)).join('')
        if (current || next) {
          lines.push(`| ${section.label} | ${current || '—'} | ${next || '—'} | ${lost || '—'} | ${gained || '—'} |`)
        }
      }
      lines.push('', 'El resumen agrupa subapartados; no sustituye el detalle siguiente. Una pérdida en un hijo puede no alterar las letras agregadas de su apartado.', '')
      const aclDifferences = row?.differences.filter(difference => /^(admin(?:\.|$)|empleado\.)/.test(difference.section)) || []
      if (aclDifferences.length) {
        lines.push('### Diferencias por permiso concreto', '', '| Código del permiso | Apartado | Pierde | Gana |', '|---|---|---|---|')
        for (const difference of aclDifferences) {
          lines.push(`| \`${difference.section}\` | ${difference.label} | ${difference.lost || '—'} | ${difference.gained || '—'} |`)
        }
      }
      if (!row?.differences.length) lines.push('', 'Sin diferencias de acciones en los apartados comparados.')
    }
    lines.push('', '## Publicación y vuelta atrás', '',
      'La aplicación productiva no está habilitada en esta tanda. Antes de una futura publicación: copia de BD verificada, nueva foto de producción de solo lectura, revisión de las diferencias, resolución de bloqueos entre módulos y confirmación explícita de Víctor. La auditoría conserva el antes y después de cada aplicación; no sustituye una copia de seguridad.', '',
      'La presentación del menú en siete grupos no cambia rutas ni concede permisos. Los ajustes específicos prevalecen sobre los padres y una ACL adoptada no recupera capacidades por roles antiguos. Las pruebas automáticas de esta entrega usan identidades sintéticas; la foto real se usa únicamente para este informe solicitado.', '')
    await writeFile(resolve(destination, 'diferencias-usuarios.md'), lines.join('\n') + '\n')
    console.log(JSON.stringify({ generatedAt: at, people: state.users.length, readOnly: true, accountsChanged: false, destination }))
  } finally {
    await db.$disconnect()
  }
}

main().catch(() => { console.error('No se pudo generar el informe de solo lectura; no se ha escrito en BD.'); process.exitCode = 1 })
