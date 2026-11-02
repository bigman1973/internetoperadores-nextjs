import assert from 'node:assert/strict'
import test from 'node:test'
import { AREA4_MENU_CONFIGURATION_ID, readArea4MenuConfiguration, resolveArea4MenuPresentation } from '../lib/area4/menu-presentation'

const owner = { id: 3, activo: true, rol: 'SUPER_ADMIN' }
const manager = { id: 8, activo: true, rol: 'GERENTE' }
process.env.AREA4_OWNER_USER_ID = '3'

test('el menú histórico es el valor seguro por defecto', () => {
  assert.equal(resolveArea4MenuPresentation(null, owner), 'historico')
  assert.equal(resolveArea4MenuPresentation({ menuAgrupadoParaPropietario: false, menuAgrupadoParaTodos: false }, owner), 'historico')
})

test('la prueba inicial del menú agrupado se limita al propietario canónico', () => {
  const config = { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: false }
  assert.equal(resolveArea4MenuPresentation(config, owner), 'agrupado')
  assert.equal(resolveArea4MenuPresentation(config, manager), 'historico')
})

test('la activación global extiende solo la presentación, no la autorización', () => {
  const config = { menuAgrupadoParaPropietario: true, menuAgrupadoParaTodos: true }
  assert.equal(resolveArea4MenuPresentation(config, owner), 'agrupado')
  assert.equal(resolveArea4MenuPresentation(config, manager), 'agrupado')
})

test('la lectura falla cerrada al menú histórico si la migración aún no está aplicada', async () => {
  const config = await readArea4MenuConfiguration({
    configuracionPanelArea4: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        assert.equal(where.id, AREA4_MENU_CONFIGURATION_ID)
        throw new Error('tabla todavía no aplicada')
      },
    },
  } as never)
  assert.deepEqual(config, { menuAgrupadoParaPropietario: false, menuAgrupadoParaTodos: false })
})
