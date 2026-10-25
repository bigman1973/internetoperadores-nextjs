import assert from 'node:assert/strict'
import {
  coincideTarifaEmpresa,
  normalizaBusquedaTarifaEmpresa,
  ordenaResultadosTarifaEmpresa,
  type TarifaEmpresaBusqueda,
} from '../app/tarifas/empresa/tarifasEmpresaFilter'

const tarifa: TarifaEmpresaBusqueda = {
  nombre: 'fibra oficina pro',
  descripcion: 'conectividad simétrica para sedes',
  velocidad: '1000 mbps',
  categoria: 'internet',
}

function run() {
  assert.equal(normalizaBusquedaTarifaEmpresa('  FIBRA  '), 'fibra', 'Normaliza una vez el término introducido.')
  assert.equal(coincideTarifaEmpresa(tarifa, ''), true, 'Sin término conserva toda la oferta.')
  assert.equal(coincideTarifaEmpresa(tarifa, 'oficina'), true, 'Busca por nombre.')
  assert.equal(coincideTarifaEmpresa(tarifa, 'sedes'), true, 'Busca por descripción.')
  assert.equal(coincideTarifaEmpresa(tarifa, '1000'), true, 'Busca por velocidad.')
  assert.equal(coincideTarifaEmpresa(tarifa, 'internet'), true, 'Busca por categoría.')
  assert.equal(coincideTarifaEmpresa(tarifa, 'móvil'), false, 'No incluye una tarifa sin coincidencia.')
  assert.equal(coincideTarifaEmpresa({ ...tarifa, descripcion: '', velocidad: '' }, 'fibra'), true, 'Tolera atributos de búsqueda vacíos.')

  const ordenadas = ordenaResultadosTarifaEmpresa([
    { elemento: 'ultima', visibles: 1, primerIndice: 9 },
    { elemento: 'primera', visibles: 3, primerIndice: 6 },
    { elemento: 'empate-antes', visibles: 1, primerIndice: 2 },
    { elemento: 'empate-despues', visibles: 1, primerIndice: 7 },
    { elemento: 'sin-resultados', visibles: 0, primerIndice: Number.POSITIVE_INFINITY },
  ])
  assert.deepEqual(
    ordenadas.map(({ elemento }) => elemento),
    ['primera', 'empate-antes', 'empate-despues', 'ultima', 'sin-resultados'],
    'Preserva la ordenación funcional por coincidencias y primer índice.',
  )

  console.log(JSON.stringify({ ok: true, fixture: 'synthetic', cases: 9 }))
}

run()
