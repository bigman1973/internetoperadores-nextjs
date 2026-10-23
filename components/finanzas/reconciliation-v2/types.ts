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
      /** Elección B8 opcional; no forma parte de la economía B4. */
      centroCosteFinanzasId?: string | null;
    }
  | {
      tipo: 'DIFERENCIA';
      motivoDiferencia: MotivoDiferencia;
      importeCentimos: number;
    };

/** Evidencia anterior de sólo lectura enviada opcionalmente por Parent API. */
export type ClasificacionHistoricoB4 = 'JUSTIFICADO' | 'PROPUESTA' | 'YA_B4';
export type ProcedenciaHistoricoB4 = 'MANUAL' | 'AUTOMATICO_TOLERANCIAS' | 'DESCONOCIDO';

export type DocumentoHistoricoB4 = Readonly<{
  tipo: string;
  sourceId: string;
  documentoConciliableId: string | null;
  referencia: string;
  importeObjetivoCentimos: number | null;
  archivoDisponible: boolean;
  /** La fuente puede no conservarlo; entonces prevalece el wrapper B4 actual. */
  version?: number;
  stale?: boolean;
}>;

export type HistoricoB4 = Readonly<{
  id: string;
  origen: 'HISTORICO';
  clasificacion: ClasificacionHistoricoB4;
  procedencia: ProcedenciaHistoricoB4;
  motivos: string[];
  documentos: DocumentoHistoricoB4[];
  creadoAt: string;
}>;

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
    centroCosteFinanzasId?: string | null;
    centroCosteCodigo?: string | null;
    centroCosteNombre?: string | null;
    versionCentroCoste?: number;
  }>;
  /** Su ausencia mantiene el comportamiento B4 existente. */
  historico?: HistoricoB4;
  /** DTOs B4 ya disponibles en esta lectura; nunca se solicitan ni se serializan. */
  documentosHistoricosDisponibles?: DocumentoB4[];
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
