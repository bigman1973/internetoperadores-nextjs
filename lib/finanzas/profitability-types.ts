export type ProfitQuality = 'sin_costes' | 'provisional' | 'incidencia';
export interface ProfitMetrics {
  ventas: number;
  comprasDirectas: number;
  comprasCliente: number;
  personalDirecto: number;
  personalCliente: number;
  margenConocido: number;
  margenPct: number | null;
  totalFacturas: number;
  sinCosteDirecto: number;
  incidencias: number;
}
export interface ProfitClient extends ProfitMetrics {
  key: string;
  label: string;
  clienteWebId: number | null;
}
export interface ProfitService extends ProfitMetrics {
  key: string;
  label: string;
  pendienteReparto: boolean;
}
export interface ProfitInvoice {
  id: string;
  numFactura: string;
  cliente: string;
  fecha: string;
  concepto: string | null;
  actividad: string | null;
  ventas: number;
  comprasDirectas: number;
  personalDirecto: number;
  margenConocido: number;
  margenPct: number | null;
  numCompras: number;
  numHoras: number;
  calidad: ProfitQuality;
}
export interface ProfitPurchaseLink {
  id: string;
  fuenteId: string;
  numFactura: string | null;
  proveedor: string;
  fecha: string;
  base: number;
  porcentaje: number;
  coste: number;
  notas: string | null;
  incidencia: boolean;
}
export interface ProfitStaffLink {
  id: string;
  fuenteId: string;
  empleado: string;
  fecha: string;
  horas: number;
  porcentaje: number;
  coste: number | null;
  notas: string | null;
  incidencia: boolean;
}
export interface ProfitResponse {
  kpis: ProfitMetrics;
  servicios: ProfitService[];
  clientes: ProfitClient[];
  facturas: ProfitInvoice[];
  total: number;
  page: number;
  totalPages: number;
  periodo: { desde: string; hasta: string };
  actividades: string[];
  canWrite: boolean;
  avisos: string[];
  pendientes: { comprasSinVenta: number; personalSinVenta: number; horasSinCoste: number; conflictos: number };
}
export interface ProfitDetail {
  factura: ProfitInvoice;
  compras: ProfitPurchaseLink[];
  personal: ProfitStaffLink[];
  avisos: string[];
  canWrite: boolean;
}
export interface PurchaseCandidate {
  id: string;
  numFactura: string | null;
  proveedor: string;
  fecha: string;
  base: number;
  porcentajeDisponible: number;
  bloqueado: boolean;
  motivo: string | null;
}
export interface StaffCandidate {
  id: string;
  empleado: string;
  fecha: string;
  horas: number;
  coste: number | null;
  porcentajeDisponible: number;
  bloqueado: boolean;
  motivo: string | null;
}
export interface ProfitCandidates {
  compras: PurchaseCandidate[];
  personal: StaffCandidate[];
  total: number;
  page: number;
  totalPages: number;
}
