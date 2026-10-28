import assert from 'node:assert/strict';
import test from 'node:test';
import { mayManageAutomation, mayWriteEasyWorkspace, parseEasyAccessProfile, parseEasyStagingOnly, safeEasyPrivateHref } from '../components/finanzas/easy/easy-two-step-client';
import { maskPossibleIban, parseEasyCardRead } from '../components/finanzas/easy/newTarjetasReadPanel';
import { parseParaPedirRead } from '../lib/finanzas/para-pedir-contract';
import { parseAutomaticPreview } from '../components/finanzas/easy/newAutomaticRulesPanel';
import { parseThirdPartyRead, parseThirdPartySearchCandidates } from '../components/finanzas/easy/newThirdPartyWorkspace';
import { parseEasyReadResponse } from '../components/finanzas/easy/easy-contract';

test('el perfil de automatización falla cerrado ante ausencia o forma incompleta', () => {
  assert.equal(mayManageAutomation(null), false);
  assert.equal(mayManageAutomation(undefined), false);
  assert.equal(mayManageAutomation({ easyOnly: true, canWrite: true, canManageAutomation: true, environment: 'staging' }), false);
  assert.equal(mayManageAutomation({ easyOnly: false, canWrite: true, canManageAutomation: false, environment: 'staging' }), false);
  assert.equal(mayManageAutomation({ easyOnly: false, canWrite: true, canManageAutomation: true, environment: 'staging' }), true);
  assert.equal(mayManageAutomation({ easyOnly: true, canWrite: true, canManageAutomation: true, environment: 'production' }), false, 'MODO_FACIL_ONLY nunca recibe gestión aunque conserve rol heredado.');
  assert.equal(mayManageAutomation({ easyOnly: false, canWrite: true, canManageAutomation: true, environment: 'production' }), true, 'La producción conserva únicamente la capacidad viva ya verificada por servidor.');
  assert.equal(mayWriteEasyWorkspace(null), false);
  assert.equal(mayWriteEasyWorkspace({ easyOnly: true, canWrite: false, canManageAutomation: false, environment: 'staging' }), false);
  assert.equal(mayWriteEasyWorkspace({ easyOnly: true, canWrite: true, canManageAutomation: false, environment: 'staging' }), true);
  assert.deepEqual(parseEasyAccessProfile({ easyOnly: true, canWrite: true, canManageAutomation: false, environment: 'staging' }), { easyOnly: true, canWrite: true, canManageAutomation: false, environment: 'staging' });
  assert.deepEqual(parseEasyAccessProfile({ easyOnly: false, canWrite: false, canManageAutomation: true, environment: 'production' }), { easyOnly: false, canWrite: false, canManageAutomation: true, environment: 'production' });
  assert.throws(() => parseEasyAccessProfile({ easyOnly: false }));
  assert.throws(() => parseEasyAccessProfile({ easyOnly: 'false', canManageAutomation: true }));
  assert.throws(() => parseEasyAccessProfile({ easyOnly: false, canManageAutomation: false, environment: 'preview' }));
});

test('el flag stagingOnly del DTO es booleano explícito y no inventa staging en producción', () => {
  assert.equal(parseEasyStagingOnly(true), true);
  assert.equal(parseEasyStagingOnly(false), false);
  assert.throws(() => parseEasyStagingOnly(undefined));
  assert.throws(() => parseEasyStagingOnly('false'));
});

test('las descargas privadas aceptan sólo documento controlado y adjunto B5 exacto', () => {
  assert.equal(safeEasyPrivateHref('/api/admin/finanzas/modo-facil/documentos/doc_01/archivo'), '/api/admin/finanzas/modo-facil/documentos/doc_01/archivo');
  assert.equal(safeEasyPrivateHref('/api/admin/finanzas/movimientos/mov_01/archivos?archivoId=ADJUNTO_B5%3Aadj_01'), '/api/admin/finanzas/movimientos/mov_01/archivos?archivoId=ADJUNTO_B5%3Aadj_01');
  assert.equal(safeEasyPrivateHref('/api/admin/finanzas/movimientos/mov_01/archivos?archivoId=ADJUNTO_B5%3Aadj_01&otro=1'), null);
  assert.equal(safeEasyPrivateHref('/api/admin/finanzas/movimientos/mov_01/archivos?archivoId=OTRO%3Aadj_01'), null);
  assert.equal(safeEasyPrivateHref('https://example.invalid/api/admin/finanzas/modo-facil/documentos/doc_01/archivo'), null);
  assert.equal(safeEasyPrivateHref('/api/admin/finanzas/modo-facil/documentos/doc_01/archivo#fragmento'), null);
  assert.equal(safeEasyPrivateHref('/api/admin/finanzas/tickets/archivo'), null);
});

test('el parser P1 conserva signos y rechaza fuentes que no sean evidencia actual', () => {
  const candidateId = `p1_${'a'.repeat(64)}`;
  const parsed = parseThirdPartyRead({
    stagingOnly: true, automaticas: false, periodo: { desde: '2026-01-01', hasta: '2026-10-08' },
    contador: { cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: 1, cargos: { movimientos: 1, importeCentimos: '-1234', identificados: 0 }, cobros: { movimientos: 0, importeCentimos: '0', identificados: 0 }, identificados: 0, propuestosTexto: 1, sinIdentificar: 0 },
    total: 1, limit: 25, offset: 0,
    movimientos: [{ id: 'mov-01', fecha: '2026-01-03', concepto: 'COMPRA', importeCentimos: -1234, cuenta: { banco: 'Banco', alias: null }, paso1: { estadoPaso1: 'PROPUESTO', tipoTercero: null, etiqueta: null, origenPaso1: null, decisionId: null, version: 0, propuestaTexto: 'Texto del banco', candidatos: [{ id: candidateId, tipoTercero: 'PROVEEDOR', etiqueta: 'Proveedor acreditado', origenPaso1: 'ENTIDAD_FISCAL' }] }, paso2: { estadoPaso2: 'SIN_DOCUMENTO' } }],
  });
  assert.equal(parsed.movimientos[0].importeCentimos, -1234);
  assert.equal(parsed.movimientos[0].paso1.candidatos[0].origenPaso1, 'ENTIDAD_FISCAL');
  const invalid = structuredClone({
    stagingOnly: true, automaticas: false, periodo: { desde: '2026-01-01', hasta: '2026-10-08' },
    contador: { cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: 1, cargos: { movimientos: 1, importeCentimos: '-1234', identificados: 0 }, cobros: { movimientos: 0, importeCentimos: '0', identificados: 0 }, identificados: 0, propuestosTexto: 1, sinIdentificar: 0 },
    total: 1, limit: 25, offset: 0,
    movimientos: [{ id: 'mov-01', fecha: '2026-01-03', concepto: 'COMPRA', importeCentimos: -1234, cuenta: { banco: 'Banco', alias: null }, paso1: { estadoPaso1: 'PROPUESTO', tipoTercero: null, etiqueta: null, origenPaso1: null, decisionId: null, version: 0, propuestaTexto: 'Texto', candidatos: [{ id: candidateId, tipoTercero: 'PROVEEDOR', etiqueta: 'No permitido', origenPaso1: 'MANUAL' }] }, paso2: { estadoPaso2: 'SIN_DOCUMENTO' } }],
  });
  assert.throws(() => parseThirdPartyRead(invalid));
});

test('la búsqueda P1 sólo incorpora candidatos opacos y estables devueltos por el servidor', () => {
  const candidates = parseThirdPartySearchCandidates({
    candidatos: [
      { id: 'p1_cliente_actual', tipoTercero: 'CLIENTE', etiqueta: 'Cliente real', origenPaso1: 'CLIENTE_CONTRATO_ACTUAL' },
      { id: 'p1_proveedor_fiscal', tipoTercero: 'PROVEEDOR', etiqueta: 'Proveedor real', origenPaso1: 'ENTIDAD_FISCAL' },
    ],
  });
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].id, 'p1_cliente_actual');
  assert.equal(candidates[1].etiqueta, 'Proveedor real');
  assert.throws(() => parseThirdPartySearchCandidates({ candidatos: [{ id: 'proveedor-escrito', tipoTercero: 'PROVEEDOR', etiqueta: 'Texto libre', origenPaso1: 'ENTIDAD_FISCAL' }] }));
  assert.throws(() => parseThirdPartySearchCandidates({ candidatos: [{ id: 'p1_manual', tipoTercero: 'PROVEEDOR', etiqueta: 'Manual', origenPaso1: 'MANUAL' }] }));
});

test('la revisión automática conserva bloqueos, fallos y recibos persistentes sin inventar candidatos', () => {
  const parsed = parseAutomaticPreview({
    stagingOnly: true, automaticas: true,
    policy: { id: 'pol_01', datosDesde: '2026-01-01', datosHasta: '2026-10-08', autorizadaEn: '2026-10-24', referenciaAutorizacion: 'Víctor Giró 24/10/2026; comisiones y traspasos propios staging' },
    counts: { examinados: 4, traspasos: 1, comisiones: 1, excluidos: 1, bloqueadosTitularidad: 1, fallosCadena: 1 },
    reviewHash: 'a'.repeat(64),
    candidates: [{ fingerprint: 'f_comision', clase: 'COMISION_BANCARIA', origen: 'REGLA', movimientos: [{ id: 'mov_c', cuentaId: 'cta_1', fecha: '2026-10-01', importeCentimos: -99, versionB4: 1 }], motivoNoRequiere: 'COMISION_BANCARIA', terceroBancoId: 'banco_1', controles: ['BANCO_COBRADOR_DERIVADO_DE_CUENTA'] }],
    fallosCadena: [{ cuenta: { cuentaId: 'cta_2', banco: 'Banco seguro', alias: null, ibanUltimos4: '1234' }, codigo: 'CADENA_SALDO_NO_ENCADENA' }],
    bloqueados: [{ fingerprint: 'f_transfer', clase: 'TRASPASO_PROPIO', movimientos: [{ id: 'mov_a', cuentaId: 'cta_3', fecha: '2026-10-02', importeCentimos: -100, versionB4: 2 }, { id: 'mov_b', cuentaId: 'cta_4', fecha: '2026-10-03', importeCentimos: 100, versionB4: 2 }], bloqueos: ['POR_TITULARIDAD_NO_ACREDITADA'], cuentasPendientes: [{ cuentaId: 'cta_3', banco: 'Banco propio', alias: 'Operativa', ibanUltimos4: '9876' }] }],
    fallos: [{ id: 'fail_1', fingerprint: 'f_old', clase: 'TRASPASO_PROPIO', codigo: 'CANDIDATO_OBSOLETO', mensaje: 'La revisión cambió.', createdAt: '2026-10-24T10:00:00.000Z' }],
    recibos: [{ operationId: '11111111-1111-4111-8111-111111111111', clase: 'COMISION_BANCARIA', origen: 'REGLA', operacionesB4: ['b4_1'], reversible: true, reverted: false, createdAt: '2026-10-24T11:00:00.000Z' }],
  });
  assert.equal(parsed.fallosCadena[0].codigo, 'CADENA_SALDO_NO_ENCADENA');
  assert.equal(parsed.bloqueados[0].cuentasPendientes[0].ibanUltimos4, '9876');
  assert.equal(parsed.candidates[0].terceroBancoId, 'banco_1');
  assert.equal(parsed.recibos[0].reversible, true);
  assert.equal(parseAutomaticPreview({ ...structuredClone(parsed), stagingOnly: false, automaticas: true }).reviewHash, parsed.reviewHash, 'El parser conserva un booleano production=false sin fingir staging.');
  assert.throws(() => parseAutomaticPreview({ ...structuredClone(parsed), stagingOnly: undefined, automaticas: true }));
  assert.throws(() => parseAutomaticPreview({ ...structuredClone(parsed), policy: null, reviewHash: 'b'.repeat(64) }));
});

test('los nuevos desgloses documentales de período y mes son opcionales y no sustituyen la cohorte pendiente', () => {
  const base = {
    stagingOnly: true, automaticas: false, criterio: 'lectura', periodo: { desde: '2026-01-01', hasta: '2026-10-08' }, total: 0, limit: 25, offset: 0,
    totales: { cargos: 0, cobros: 0, cargosCentimos: '0', cobrosCentimos: '0' }, meses: [], reglas: [], movimientos: [],
    pasos: { version: 'EASY_PASOS_V1', paso1: { cohorte: 'TODOS_MOVIMIENTOS_VENTANA', totalMovimientos: 2, cargos: { movimientos: 1, importeCentimos: '-100', identificados: 0 }, cobros: { movimientos: 1, importeCentimos: '200', identificados: 1 }, identificados: 1, propuestosTexto: 1, sinIdentificar: 0 }, paso2: { cohorte: 'PENDIENTES_B4_SIN_DOCUMENTO', totalMovimientos: 1, cargos: { movimientos: 1, importeCentimos: '-100' }, cobros: { movimientos: 0, importeCentimos: '0' }, criterio: 'B4_DOCUMENTAL_INDEPENDIENTE_DE_PASO_1', periodo: { documentoConfirmado: { movimientos: 3, importeCentimos: '-300' }, noRequiere: { movimientos: 2, importeCentimos: '-50' } }, meses: [{ mes: '2026-10', documentoConfirmado: { movimientos: 2, importeCentimos: '-200' }, noRequiere: { movimientos: 1, importeCentimos: '-25' } }] } },
  };
  const parsed = parseEasyReadResponse(base);
  assert.equal(parsed.pasos?.paso2.totalMovimientos, 1);
  assert.equal(parsed.pasos?.paso2.periodo?.documentoConfirmado.movimientos, 3);
  assert.equal(parsed.pasos?.paso2.meses?.[0].noRequiere?.importeCentimos, '-25');
  const compatible = structuredClone(base);
  delete (compatible.pasos.paso2 as { periodo?: unknown; meses?: unknown }).periodo;
  delete (compatible.pasos.paso2 as { periodo?: unknown; meses?: unknown }).meses;
  assert.equal(parseEasyReadResponse(compatible).pasos?.paso2.periodo, undefined);
});

test('la tarjeta privada conserva sólo los cuatro últimos dígitos y enmascara IBAN', () => {
  const parsed = parseEasyCardRead({ stagingOnly: true, tarjeta: '2390', periodo: { desde: '2026-01-01', hasta: '2026-10-08' }, total: 1, importeCargosCentimos: '-2500', cuentas: [{ banco: 'Banco', alias: null, ibanUltimos4: '1234' }], movimientos: [{ fecha: '2026-01-02', banco: 'Banco', cuentaAlias: null, concepto: 'Compra', importeCentimos: -2500, estadoDocumento: 'SIN_DOCUMENTO' }], limit: 50, offset: 0 });
  assert.equal(parsed.cuentas[0].ibanUltimos4, '1234');
  assert.equal(maskPossibleIban('ES91 2100 0418 4502 0005 1332'), '[cuenta protegida]');
  assert.equal(maskPossibleIban('Alias seguro'), 'Alias seguro');
});

test('Para Pedir sólo acepta la proyección documental B4 sin acciones externas', () => {
  const base = {
    stagingOnly: true, automaticas: false, accionExterna: 'NINGUNA', criterio: 'lectura',
    filtro: { estado: 'TODOS', q: null, tercero: null }, total: 1, limit: 25, offset: 0, totalPagina: 1,
    resumen: { movimientos: 1, pendienteCentimos: 2500 },
    proyeccion: { actualizadaEn: '2026-01-02T12:00:00.000Z', version: 1, pendienteActualizacion: false },
    agrupaciones: [{ tercero: 'Proveedor documental', movimientos: 1, pendienteCentimos: 2500, pedidos: 0, pedidosMas15Dias: 0 }],
    movimientos: [{ movimientoId: 'mov-01', tab: 'PAGOS', fecha: '2026-01-02', concepto: 'Cargo', importeCentimos: -2500, pendienteCentimos: -2500, banco: 'Banco', cuenta: null, tercero: 'Proveedor documental', grupoTercero: 'Proveedor documental', referenciaDocumento: null, motivo: 'Falta el papel', estadoPedido: 'SIN_PEDIR', pedido: null, conciliarPedir: null }],
  };
  const parsed = parseParaPedirRead(base);
  assert.equal(parsed.movimientos[0].importeCentimos, -2500);
  assert.equal(parsed.stagingOnly, true);
  assert.equal(parseParaPedirRead({ ...base, stagingOnly: false }).stagingOnly, false, 'Producción conserva la proyección manual con marcador false.');
  assert.equal(parsed.movimientos[0].estadoPedido, 'SIN_PEDIR');
  assert.equal(parsed.movimientos[0].pedido, null, 'No se inventa un pedido ni fecha de auditoría.');
  assert.equal(parsed.agrupaciones[0].movimientos, 1);
  assert.throws(() => parseParaPedirRead({ ...base, accionExterna: 'EMAIL' }));
  assert.throws(() => parseParaPedirRead({ ...base, stagingOnly: 'false' }));
});
