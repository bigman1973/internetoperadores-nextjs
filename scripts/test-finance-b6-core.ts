import {
  proponerConciliacionB6,
  proponerParaPendientesB5,
  type DocumentoConciliableB6,
  type EntradaPropuestaB6,
} from '../lib/finanzas/reconciliation-proposals';

let assertions = 0;
function assert(condition: unknown, message: string): asserts condition {
  assertions += 1;
  if (!condition) throw new Error(`Fallo: ${message}`);
}
function ok<T>(result: { ok: boolean; value?: T; errores?: readonly string[] }): T {
  assert(result.ok, `resultado esperado ok; errores=${(result.errores ?? []).join(',')}`);
  return result.value as T;
}
function equal(actual: unknown, expected: unknown, message: string) {
  assert(Object.is(actual, expected), `${message}; recibido=${String(actual)} esperado=${String(expected)}`);
}

const UUIDS = {
  fiDrax94: '11111111-1111-4111-8111-111111111111',
  fiDrax95: '22222222-2222-4222-8222-222222222222',
  fiCll1870: '33333333-3333-4333-8333-333333333333',
  frProveedor: '44444444-4444-4444-8444-444444444444',
  remesa: '55555555-5555-4555-8555-555555555555',
  stale: '66666666-6666-4666-8666-666666666666',
} as const;

function fi(
  id: string,
  numero: string,
  tercero: string,
  fecha: string,
  objetivo: number,
  asignado = 0,
): DocumentoConciliableB6 {
  return {
    documentoConciliableId: id,
    tipoDocumento: 'FACTURA_EMITIDA',
    stale: false,
    objetivoCentimos: objetivo,
    asignadoCentimos: asignado,
    factura: { source: 'FI', numero, tercero, fecha },
  };
}
function fr(
  id: string,
  numero: string,
  tercero: string,
  fecha: string,
  objetivo: number,
): DocumentoConciliableB6 {
  return {
    documentoConciliableId: id,
    tipoDocumento: 'FACTURA_RECIBIDA',
    stale: false,
    objetivoCentimos: objetivo,
    asignadoCentimos: 0,
    factura: { source: 'FR', numero, tercero, fecha },
  };
}
function remesa(asignado = 0): DocumentoConciliableB6 {
  return {
    documentoConciliableId: UUIDS.remesa,
    tipoDocumento: 'REMESA',
    stale: false,
    objetivoCentimos: 10000,
    asignadoCentimos: asignado,
    remesa: { remesaId: 10, ispGestionId: 987, foreignId: 'ISP-REM-987' },
  };
}
function entrada(overrides: Partial<EntradaPropuestaB6> = {}): EntradaPropuestaB6 {
  return {
    movimiento: {
      id: 'mov-1', fecha: '2026-10-22', concepto: '', tercero: null,
      cuentaId: 'cuenta-a', importeCentimos: 10000, referenciaBanco: null,
    },
    documentos: [],
    ...overrides,
  };
}

// Regla fuerte: importe firmado + tercero + fecha + referencia literal. Se
// relajan sólo acento/espacios/caso de la razón social, no la identidad.
{
  const input = entrada({
    movimiento: {
      id: 'mov-drax', fecha: '2026-10-22', cuentaId: 'cuenta-a', importeCentimos: 12345,
      concepto: 'Abono confirming factura Drax26/94', tercero: '  DRÁXTON   EUROPE, S.L. ', confirmingDraxton: false,
    },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe, S.L.', '2026-10-22', 12345)],
  });
  const before = JSON.stringify(input);
  const result = ok(proponerConciliacionB6(input));
  equal(result.estado, 'LISTA_PARA_CONFIRMACION_B4', 'factura exacta propone B4');
  equal(result.clase, 'FACTURA_EXACTA', 'clase de factura singular');
  equal(result.lineas.length, 1, 'una línea documental');
  equal(result.lineas[0].importeCentimos, 12345, 'importe positivo exacto');
  equal(JSON.stringify(input), before, 'motor no muta fixtures de lectura');
}

// La otra referencia literal solicitada, de fuente FI y signo de cobro.
{
  const result = ok(proponerConciliacionB6(entrada({
    movimiento: {
      id: 'mov-cll', fecha: '2026-10-23', cuentaId: 'cuenta-a', importeCentimos: 187000,
      concepto: 'COBRO CLL26/1870', tercero: 'Cliente CLL',
    },
    documentos: [fi(UUIDS.fiCll1870, 'CLL26/1870', 'CLIENTE  CLL', '2026-10-23', 187000)],
  })));
  equal(result.estado, 'LISTA_PARA_CONFIRMACION_B4', 'CLL literal exacta propone');
  equal(result.totalLineasCentimos, 187000, 'cierre exacto CLL');
}

// Sin referencia se ofrece sólo una candidata leída de mismo día: pendiente,
// tercero y fecha exactos. Sigue siendo PROPONE_ONLY y requiere revisión B4.
{
  const result = ok(proponerConciliacionB6(entrada({
    movimiento: {
      id: 'mov-same-amount', fecha: '2026-10-22', cuentaId: 'cuenta-a', importeCentimos: 12345,
      concepto: 'transferencia recibida', tercero: 'Draxton Europe, S.L.',
    },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe, S.L.', '2026-10-22', 12345)],
  })));
  equal(result.estado, 'LISTA_PARA_CONFIRMACION_B4', 'candidata mismo día exacta se propone, no se aplica');
  equal(result.confianza, 'SAME_DAY_EXACT', 'candidata sin referencia se distingue de literal');
  equal(result.requiereConfirmacionHumana, true, 'la candidata siempre conserva revisión humana');
}

// Una referencia literal madura permite pago semanas después: tercero, suma y
// fecha de factura no posterior son la evidencia; no se impone misma fecha.
{
  const monthLater = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-date', fecha: '2026-11-22', cuentaId: 'a', importeCentimos: 12345, concepto: 'DRAX26/94', tercero: 'Draxton Europe, S.L.' },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe, S.L.', '2026-10-22', 12345)],
  })));
  equal(monthLater.estado, 'LISTA_PARA_CONFIRMACION_B4', 'referencia fuerte admite el pago un mes después');
  equal(monthLater.confianza, 'LITERAL_REFERENCE', 'la referencia madura conserva su confianza propia');
  equal(monthLater.requiereConfirmacionHumana, true, 'la propuesta no sustituye la confirmación B4');

  // El signo negativo se conserva: una factura recibida madura puede pagarse
  // después y cierra exactamente sin abs(), tolerancia ni ajuste automático.
  const received = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-fr', fecha: '2026-11-22', cuentaId: 'a', importeCentimos: -9900, concepto: 'Factura PROV26/5', tercero: 'Proveedor Uno' },
    documentos: [fr(UUIDS.frProveedor, 'PROV26/5', 'Proveedor Uno', '2026-10-22', -9900)],
  })));
  equal(received.estado, 'LISTA_PARA_CONFIRMACION_B4', 'FR negativa madura conserva el signo exacto');
  equal(received.totalLineasCentimos, -9900, 'crédito/pago negativo no se invierte');
}

// Una factura fechada después del movimiento no se puede justificar por la
// referencia: se detiene para verificación documental manual, sin Date.now().
{
  const future = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-future', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 12345, concepto: 'DRAX26/94', tercero: 'Draxton Europe, S.L.' },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe, S.L.', '2026-10-23', 12345)],
  })));
  equal(future.estado, 'NECESITA_EVIDENCIA_MANUAL', 'factura futura no se propone');
  assert(future.razones.includes('FACTURA_POSTERIOR_AL_MOVIMIENTO_REQUIERE_VERIFICACION_DOCUMENTAL_MANUAL'), 'fecha futura deja razón documental explícita');
}

// Sin referencia no hay atajo por importe: tercero desconocido rechaza y dos
// candidatas exactas son ambiguas; el motor no toma el primer documento.
{
  const thirdUnknown = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-no-third', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 12345, concepto: 'abono', tercero: null },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe', '2026-10-22', 12345)],
  })));
  equal(thirdUnknown.estado, 'NECESITA_EVIDENCIA_MANUAL', 'sin tercero bancario no existe candidata sin referencia');

  const ambiguous = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-ambiguous-same-day', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 12345, concepto: 'abono', tercero: 'Cliente duplicado' },
    documentos: [
      fi(UUIDS.fiDrax94, 'A-100', 'Cliente duplicado', '2026-10-22', 12345),
      fi(UUIDS.fiDrax95, 'B-200', 'Cliente duplicado', '2026-10-22', 12345),
    ],
  })));
  equal(ambiguous.clase, 'FACTURA_REFERENCIA_FALTA_O_AMBIGUA', 'varios candidatos del mismo día quedan ambiguos');
  assert(ambiguous.razones.includes('VARIOS_CANDIDATOS_MISMO_DIA_EXACTOS_NO_SE_ELIGE_EL_PRIMERO'), 'ambigüedad no escoge el primero');
}

// El formato de referencia no se limita a Drax/CLL: se compara el número
// literal de la factura de lectura. Un número puro exige seis cifras y las tres
// pruebas de mismo día para no confundir teléfono/NIF con una referencia.
{
  const ownFormat = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-own-format', fecha: '2026-11-22', cuentaId: 'a', importeCentimos: 4321, concepto: 'pago ref INV.2026-A/42', tercero: 'Proveedor Formato' },
    documentos: [fi('77777777-7777-4777-8777-777777777777', 'INV.2026-A/42', 'Proveedor Formato', '2026-10-22', 4321)],
  })));
  equal(ownFormat.estado, 'LISTA_PARA_CONFIRMACION_B4', 'formato propio literal no queda forzado a Drax/CLL');
  equal(ownFormat.confianza, 'LITERAL_REFERENCE', 'formato propio conserva la regla madura');

  const numeric = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-numeric-ref', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 4321, concepto: 'abono 123456', tercero: 'Cliente Numérico' },
    documentos: [fi('88888888-8888-4888-8888-888888888888', '123456', 'Cliente Numérico', '2026-10-22', 4321)],
  })));
  equal(numeric.confianza, 'LITERAL_REFERENCE', 'seis dígitos con límites se tratan como referencia literal');

  const shortNumber = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-short-number', fecha: '2026-11-22', cuentaId: 'a', importeCentimos: 4321, concepto: 'abono 12345', tercero: 'Cliente Corto' },
    documentos: [fi('99999999-9999-4999-8999-999999999999', '12345', 'Cliente Corto', '2026-10-22', 4321)],
  })));
  equal(shortNumber.estado, 'NECESITA_EVIDENCIA_MANUAL', 'cinco dígitos aislados no se usan como referencia');
}

// Grupo 1:N sólo cuando la suma firmada es exacta. Un céntimo no es tolerable.
{
  const docs = [
    fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe', '2026-10-22', 6000),
    fi(UUIDS.fiDrax95, 'DRAX26/95', 'Draxton Europe', '2026-10-22', 4000),
  ];
  const exact = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-group', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 10000, concepto: 'DRAX26/94 DRAX26/95', tercero: 'Draxton Europe' },
    documentos: docs,
  })));
  equal(exact.clase, 'GRUPO_FACTURAS_EXACTO', 'grupo exacto autorizado como propuesta');
  equal(exact.totalLineasCentimos, 10000, 'grupo cierra exacto');

  const residual = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-group-residual', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 10001, concepto: 'DRAX26/94 DRAX26/95', tercero: 'Draxton Europe' },
    documentos: docs,
  })));
  equal(residual.estado, 'NECESITA_EVIDENCIA_MANUAL', 'un céntimo residual bloquea');
  equal(residual.diferenciaPendienteCentimos, 1, 'residuo visible, no línea inventada');
  equal(residual.lineas.length, 0, 'no se devuelve una línea de ajuste');
}

// Confirming Draxton: multi-FI exacto; el interés sólo se acepta si llega como
// diferencia conocida y evidenciada, no se deriva del residuo.
{
  const docs = [
    fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe', '2026-10-22', 7000),
    fi(UUIDS.fiDrax95, 'DRAX26/95', 'Draxton Europe', '2026-10-22', 3000),
  ];
  const unknown = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-confirming-unknown', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 9900, concepto: 'DRAX26/94 DRAX26/95', tercero: 'Draxton Europe', confirmingDraxton: true },
    documentos: docs,
  })));
  equal(unknown.clase, 'CONFIRMING_DIFERENCIA_SIN_EVIDENCIA', 'interés desconocido requiere prueba');
  equal(unknown.diferenciaPendienteCentimos, -100, 'residuo confirming mostrado con signo');

  const known = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-confirming-known', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 9900, concepto: 'DRAX26/94 DRAX26/95', tercero: 'Draxton Europe', confirmingDraxton: true },
    documentos: docs,
    diferenciasConocidas: [{ movimientoId: 'mov-confirming-known', evidenciaId: 'pdf-confirming-1', motivo: 'INTERESES', importeCentimos: -100 }],
  })));
  equal(known.estado, 'LISTA_PARA_CONFIRMACION_B4', 'interés explícito permite propuesta');
  equal(known.clase, 'CONFIRMING_DRAXTON', 'tipo confirming');
  equal(known.lineas.length, 3, 'dos FI y un interés con evidencia');
}

// Remesa: el estado ISP o el importe no suplen el abono bancario. Una evidencia
// SEPA literal propone únicamente la REMESA y nunca marca sus facturas cobradas.
{
  const noBankEvidence = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-isp-only', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 10000, concepto: 'Estado ISP COBRADA', tercero: 'Cliente', referenciaBanco: null },
    documentos: [remesa()],
  })));
  equal(noBankEvidence.estado, 'NECESITA_EVIDENCIA_MANUAL', 'ISP sin abono confirmado no cobra');
  equal(noBankEvidence.facturasAMarcarCobradas.length, 0, 'no hay mutación de facturas');

  const sepa = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-sepa', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 10000, concepto: 'ABONO SEPA', tercero: null, referenciaBanco: 'SEPA-2026-10-22-001' },
    documentos: [remesa()],
    abonosSepa: [{
      movimientoId: 'mov-sepa', remesaIspGestionId: 987, remesaForeignId: 'ISP-REM-987',
      foreignIdBanco: 'ISP-REM-987', referenciaBanco: 'SEPA-2026-10-22-001', fechaBanco: '2026-10-22', importeCentimos: 10000, evidenciaId: 'sepa-row-1',
    }],
  })));
  equal(sepa.clase, 'ABONO_SEPA_REMESA', 'abono SEPA explícito propone remesa');
  assert(sepa.lineas[0]?.tipo === 'DOCUMENTO', 'abono SEPA contiene línea documental');
  equal(sepa.lineas[0].documentoConciliableId, UUIDS.remesa, 'vínculo B4 usa wrapper de remesa');
  equal(sepa.facturasAMarcarCobradas.length, 0, 'remesa no marca facturas cobradas');
}

// Las devoluciones son aportaciones negativas y no pueden deshacer más capacidad
// de la que la remesa ha consumido previamente.
{
  const accepted = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-dev-ok', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: -3000, concepto: 'DEVOLUCION SEPA', tercero: null, referenciaBanco: 'DEV-1' },
    documentos: [remesa(5000)],
    devoluciones: [{ movimientoId: 'mov-dev-ok', remesaIspGestionId: 987, remesaForeignId: 'ISP-REM-987', foreignIdBanco: 'ISP-REM-987', referenciaBanco: 'DEV-1', fechaBanco: '2026-10-22', importeCentimos: -3000, evidenciaId: 'dev-file-1' }],
  })));
  equal(accepted.clase, 'DEVOLUCION_REMESA', 'devolución dentro de capacidad propone');

  const exceeded = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-dev-over', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: -6000, concepto: 'DEVOLUCION SEPA', tercero: null, referenciaBanco: 'DEV-2' },
    documentos: [remesa(5000)],
    devoluciones: [{ movimientoId: 'mov-dev-over', remesaIspGestionId: 987, remesaForeignId: 'ISP-REM-987', foreignIdBanco: 'ISP-REM-987', referenciaBanco: 'DEV-2', fechaBanco: '2026-10-22', importeCentimos: -6000, evidenciaId: 'dev-file-2' }],
  })));
  equal(exceeded.clase, 'DEVOLUCION_SIN_EVIDENCIA_O_CAPACIDAD', 'devolución por encima de capacidad bloqueada');
}

// TRASSPAS sólo pasa a propuesta de pareja si B3/evidencia lo declara. No crea
// wrapper ni clasifica automáticamente; debe volver a revisión B3.
{
  const absent = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-tras-no', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: -5000, concepto: 'TRASSPAS A CUENTA PROPIA', tercero: 'Internet Operadores' },
  })));
  equal(absent.clase, 'TRASPASO_SIN_PAREJA_EXPLICITA', 'pista sin pareja no se concilia');

  const pair = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'mov-tras-ok', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: -5000, concepto: 'TRASSPAS A CUENTA PROPIA', tercero: 'Internet Operadores' },
    parejasTraspaso: [{ movimientoId: 'mov-tras-ok', movimientoParejaId: 'mov-tras-destino', cuentaOrigenPropiaId: 'a', cuentaDestinoPropiaId: 'b', fecha: '2026-10-22', importeParejaCentimos: 5000, evidenciaId: 'pair-review-1' }],
  })));
  equal(pair.estado, 'PROPUESTA_TRASPASO_PAREADO', 'pareja explícita sólo propone');
  assert(pair.estado === 'PROPUESTA_TRASPASO_PAREADO', 'salida de pareja conserva discriminante traspaso');
  equal(pair.noRequiereAutomatico, false, 'traspaso no marca no requiere');
  equal(pair.requiereRevisionCatalogoB3, true, 'catálogo B3 conserva su revisión');
}

// Cero, stale y objetivos nulos no se convierten nunca en documentos usables.
{
  const zero = proponerConciliacionB6(entrada({
    movimiento: { id: 'zero', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 0, concepto: '', tercero: null },
  }));
  assert(!zero.ok, 'movimiento cero se rechaza en frontera DTO');

  const stale: DocumentoConciliableB6 = { ...fi(UUIDS.stale, 'STALE26/1', 'Cliente', '2026-10-22', 100), stale: true };
  const staleResult = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'stale', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 100, concepto: 'STALE26/1', tercero: 'Cliente' },
    documentos: [stale],
  })));
  equal(staleResult.estado, 'NECESITA_EVIDENCIA_MANUAL', 'stale no es seleccionable');
}

// El helper de B5 adelanta DTO escalar: no contiene la factura ni objetos Prisma
// y no afirma confirmación para un caso que todavía necesita evidencia.
{
  const dto = ok(proponerParaPendientesB5(entrada({
    movimiento: { id: 'b5', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 99, concepto: 'sin referencia', tercero: 'X' },
  })));
  equal(dto.puedeConfirmarB4, false, 'B5 no puede confirmar sin propuesta B4');
  equal(dto.requiereEvidenciaManual, true, 'B5 expone la necesidad de prueba');
  assert(Object.values(dto).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)), 'DTO B5 tiene sólo escalares');
}

// Un adaptador que agotó una lectura acotada no puede alegar unicidad ni tomar la
// primera fila. El motor deja una razón explícita para la UI/evidencia humana.
{
  const truncated = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'cut', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 100, concepto: 'DRAX26/94', tercero: 'Draxton Europe' },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe', '2026-10-22', 100)],
    lecturasCandidatasTruncadas: ['CONSULTA_REFERENCIA_LITERAL_LIMIT_201'],
  })));
  equal(truncated.estado, 'NECESITA_EVIDENCIA_MANUAL', 'consulta candidata truncada bloquea propuesta');
  equal(truncated.clase, 'CANDIDATOS_TRUNCADOS', 'el motivo de truncamiento es visible');
  assert(truncated.razones.includes('LECTURA_CANDIDATA_TRUNCADA_NO_SE_ELIGE_EL_PRIMERO'), 'no se elige una fila de lectura truncada');
}

// El adaptador puede preservar referencia/info adicional como fuente literal sin
// transformar el tercero. Una referencia allí conserva la misma regla fuerte.
{
  const auxiliaryReference = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'aux', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 100, concepto: 'abono', referenciaBanco: 'DRAX26/94', infoAdicional: 'origen banco', tercero: 'Draxton Europe' },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe', '2026-10-22', 100)],
  })));
  equal(auxiliaryReference.confianza, 'LITERAL_REFERENCE', 'referencia literal de extracto auxiliar se conserva');
}

// Un banco que etiqueta una remesa/devolución no puede caer a una factura por
// coincidencia casual: falta el foreign ID literal y B6 pide evidencia.
{
  const remesaWithoutForeignId = ok(proponerConciliacionB6(entrada({
    movimiento: { id: 'sepa-missing-id', fecha: '2026-10-22', cuentaId: 'a', importeCentimos: 100, concepto: 'ABONO SEPA DRAX26/94', tercero: 'Draxton Europe' },
    documentos: [fi(UUIDS.fiDrax94, 'DRAX26/94', 'Draxton Europe', '2026-10-22', 100)],
    evidenciaRemesaObligatoria: 'ABONO_SEPA',
  })));
  equal(remesaWithoutForeignId.clase, 'ABONO_SEPA_SIN_EVIDENCIA_EXPLICITA', 'SEPA sin ID extranjero literal no deriva a factura');
}

console.log(`B6 external readonly tests: ${assertions} assertions passed`);
