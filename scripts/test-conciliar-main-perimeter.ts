/* Contorno de candidato: no sustituye el SSR real; evita que un test de rendimiento
 * convierta el alcance Conciliar en una eliminación del loading compartido de main. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

const MAIN_LOADING_SHA256 = '6fcb5e7f3d3d6163d726b3cfa273a04c4afdf31377e9fbed16294866d412ef2f'

function main() {
  const loading = readFileSync(resolve('app/admin/loading.tsx'))
  assert.equal(createHash('sha256').update(loading).digest('hex'), MAIN_LOADING_SHA256, 'loading global debe quedar exactamente como main')
  const page = readFileSync(resolve('app/admin/finanzas/conciliar/page.tsx'), 'utf8')
  const workspace = readFileSync(resolve('components/finanzas/conciliar/ConciliarWorkspace.tsx'), 'utf8')
  assert.match(page, /const initialData = await readConciliarProjection\(input\)/)
  assert(page.indexOf('const initialData = await readConciliarProjection(input)') < page.indexOf('return <><link'), 'la proyección SSR debe leerse antes de emitir el workspace')
  assert.match(page, /initialData=\{initialData\}/)
  assert.match(workspace, /parseConciliarReadResponse\(initialData\)/)
  assert.equal(page.includes('useEffect('), false, 'la página server no debe delegar la primera lectura a hidratación')
  console.log('OK: loading global de main intacto y Conciliar entrega initialData SSR antes de hidratación.')
}
main()
