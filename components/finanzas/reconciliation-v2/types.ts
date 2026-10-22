export type EstadoB4 = 'SIN_DOCUMENTO' | 'JUSTIFICADO' | 'NO_REQUIERE';

export type MotivoNoRequiere =
  | 'COMISION_BANCARIA'
  | 'INTERES_BANCARIO'
  | 'REDONDEO_BANCARIO'
  | 'TRASPASO_INTERNO_SIN_DOCUMENTO'
  | 'MOVIMIENTO_TECNICO_BANCO'
  | 'CORRECCION_BANCARIA';

export type MotivoDiferencia = 'COMISION' | 'INTERESES' | 'REDONDEO';

export type LineaBorradorB4 =
  | {
      tipo: 'DOCUMENTO';
      documentoConciliableId: string;
      importeCentimos: number;
    }
  | {
      tipo: 'DIFERENCIA';
      motivoDiferencia: MotivoDiferencia;
      importeCentimos: number;
    };

export type MovimientoB4 = {
  id: string;
  fechaOperacion: string;
  importeCentimos: number | null;
  concepto: string;
  estado: EstadoB4;
  motivoNoRequiere: MotivoNoRequiere | null;
  version: number;
  cuenta: {
    id: string;
    banco: string;
    alias: string;
  };
  operacionAplicada: null | {
    id: string;
    lineas: Array<{ id: string; importeCentimos: number }>;
  };
  vinculos: Array<{
    id: string;
    tipo: 'DOCUMENTO' | 'DIFERENCIA';
    documentoConciliableId: string | null;
    motivoDiferencia: MotivoDiferencia | null;
    importeCentimos: number;
    referencia: string;
  }>;
};

export type DocumentoB4 = {
  id: string;
  tipo: string;
  importeObjetivoCentimos: number | null;
  version: number;
  stale: boolean;
  referencia: string;
  tercero: string | null;
  fecha: string | null;
  sourceId: string;
  asignadoCentimos: number;
  disponibleCentimos: number | null;
};

export type CatalogoB4 = {
  estados: EstadoB4[];
  motivosNoRequiere: MotivoNoRequiere[];
  tiposDocumento: string[];
  motivosDiferencia: MotivoDiferencia[];
};

export type PaginacionB4 = {
  movimientosTotal: number;
  documentosTotal: number;
  movimientosOffset: number;
  documentosOffset: number;
};

export type CuentaB4 = { id: string; banco: string; alias: string };

export type ReconciliationReadResponse = {
  catalogo: CatalogoB4;
  movimientos: MovimientoB4[];
  documentos: DocumentoB4[];
  sugerencias: [];
  paginacion: PaginacionB4;
  cuentas: CuentaB4[];
};

export type ConfirmarPayloadB4 = {
  action: 'confirmar';
  confirmacion: true;
  idempotencyKey: string;
  version: number;
  borrador: {
    movimientoId: string;
    importeMovimientoCentimos: number;
    estado: 'JUSTIFICADO' | 'NO_REQUIERE';
    motivoNoRequiere?: MotivoNoRequiere;
    lineas: LineaBorradorB4[];
  };
};

export type DeshacerPayloadB4 = {
  action: 'deshacer';
  confirmacion: true;
  idempotencyKey: string;
  version: number;
  operacionId: string;
  lineas: Array<{ id: string; importeCentimos: number }>;
};
