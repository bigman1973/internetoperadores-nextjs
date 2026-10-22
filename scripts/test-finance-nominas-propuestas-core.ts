import assert from 'node:assert/strict';
import {
  centimosExactosDesdeDecimalSql,
  evaluarSeleccionNominas,
  filtrarPorNombreLiteral,
  normalizarNombreLiteralNomina,
  periodosPermitidosPorFechaBanco,
  type CandidataNomina,
} from '../lib/finanzas/nominas-propuestas-core';

function candidata(id: string, nombre: string, neto: number, archivo = true): CandidataNomina {
  return {
    sourceNominaId: id,
    empleadoId: `empleado-${id}`,
    empleadoNombreCompleto: nombre,
    periodo: { anio: 2026, mes: 10 },
    netoPercibirCentimos: neto as any,
    archivo: archivo ? {
      archivoId: `NOMINA_ARCHIVO_URL_RELATIVA:${id}`,
      downloadHref: `/api/admin/nominas/download/item-${id}`,
      nombre: `${nombre}.pdf`,
      tipo: 'RESUMEN_MENSUAL_LEGADO',
    } : null,
    wrapperB4: null,
  };
}

const ana = candidata('ana', 'Ana Gómez Pérez', 100025);
const luis = candidata('luis', 'Luis Martín', 40010);

assert.equal(centimosExactosDesdeDecimalSql('1000.25'), 100025);
assert.equal(centimosExactosDesdeDecimalSql('-0.01'), -1);
assert.equal(centimosExactosDesdeDecimalSql('1000.256'), null);
assert.equal(centimosExactosDesdeDecimalSql('01.00'), null);
assert.deepEqual(periodosPermitidosPorFechaBanco('2026-01-03'), [{ anio: 2026, mes: 1 }, { anio: 2025, mes: 12 }]);
assert.equal(normalizarNombreLiteralNomina(' Ana\u00a0Gómez Pérez '), 'ANA GOMEZ PEREZ');
assert.deepEqual(filtrarPorNombreLiteral([ana, luis], 'ANA GOMEZ PEREZ').map((item) => item.sourceNominaId), ['ana']);
assert.deepEqual(filtrarPorNombreLiteral([ana, luis], 'ANA GOMEZ').map((item) => item.sourceNominaId), []);

// Individual: únicamente el neto de la nómina real, con afirmación humana.
{
  const result = evaluarSeleccionNominas({
    importeMovimientoCentimos: -100025,
    periodo: { anio: 2026, mes: 10 },
    candidatas: [ana],
    sourceNominaIds: ['ana'],
    afirmacion: { netoVerificado: true, periodoVerificado: true, evidenciaHumanaDisponible: true },
  });
  assert.equal(result.estado, 'LISTA_PARA_PREPARAR_B4');
  assert.equal(result.clase, 'NOMINA_NETA_SELECCIONADA_EXACTA');
  assert.equal(result.totalCentimos, -100025);
}

// Sin afirmación no se fabrica evidencia persistida ni se habilita preparación.
{
  const result = evaluarSeleccionNominas({
    importeMovimientoCentimos: -100025,
    periodo: { anio: 2026, mes: 10 },
    candidatas: [ana],
    sourceNominaIds: ['ana'],
    afirmacion: { netoVerificado: true, periodoVerificado: false, evidenciaHumanaDisponible: true },
  });
  assert.equal(result.clase, 'AFIRMACION_HUMANA_INCOMPLETA');
}

// Grupo: sólo los IDs seleccionados; el motor no busca el subconjunto {ana,luis}.
{
  const result = evaluarSeleccionNominas({
    importeMovimientoCentimos: -140035,
    periodo: { anio: 2026, mes: 10 },
    candidatas: [ana, luis],
    sourceNominaIds: ['ana', 'luis'],
    afirmacion: { netoVerificado: true, periodoVerificado: true, evidenciaHumanaDisponible: true },
  });
  assert.equal(result.estado, 'LISTA_PARA_PREPARAR_B4');
  assert.equal(result.clase, 'GRUPO_NOMINAS_SELECCIONADO_EXACTO');
  assert.equal(result.totalCentimos, -140035);
}
{
  const result = evaluarSeleccionNominas({
    importeMovimientoCentimos: -140035,
    periodo: { anio: 2026, mes: 10 },
    candidatas: [ana, luis],
    sourceNominaIds: ['ana'],
    afirmacion: { netoVerificado: true, periodoVerificado: true, evidenciaHumanaDisponible: true },
  });
  assert.equal(result.clase, 'NETO_O_PERIODO_NO_CIERRA');
  assert.equal(result.diferenciaPendienteCentimos, -40010);
}

// Una selección sin soporte se muestra como incidencia, no se reconduce a una URL.
{
  const result = evaluarSeleccionNominas({
    importeMovimientoCentimos: -100025,
    periodo: { anio: 2026, mes: 10 },
    candidatas: [candidata('sin-archivo', 'Sin Archivo', 100025, false)],
    sourceNominaIds: ['sin-archivo'],
    afirmacion: { netoVerificado: true, periodoVerificado: true, evidenciaHumanaDisponible: true },
  });
  assert.equal(result.clase, 'ARCHIVO_FALTANTE');
}

console.log('nominas-propuestas-core: selección humana, neto/período exactos, sin wrapper/evidencia automática ni subset search.');
