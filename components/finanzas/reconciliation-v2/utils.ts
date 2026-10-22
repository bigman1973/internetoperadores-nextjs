import type { DocumentoB4, LineaBorradorB4 } from './types';

/** Presentación únicamente: conserva signo y separa céntimos sin redondear. */
export function formatCentimos(centimos: number | null): string {
  if (centimos === null || !Number.isSafeInteger(centimos)) return 'Importe no disponible';
  const signed = String(centimos);
  const negativo = signed.startsWith('-');
  const digitos = negativo ? signed.slice(1) : signed;
  const normalizado = digitos.padStart(3, '0');
  const enteros = normalizado.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const decimales = normalizado.slice(-2);
  const signo = negativo ? '-' : centimos > 0 ? '+' : '';
  return `${signo}${enteros},${decimales} €`;
}

/** Valor inicial para un input UI; nunca se invoca con 0 para crear una línea. */
export function centimosAImporteUi(centimos: number): string {
  const signed = String(centimos);
  const negativo = signed.startsWith('-');
  const digitos = negativo ? signed.slice(1) : signed;
  const normalizado = digitos.padStart(3, '0');
  return `${negativo ? '-' : ''}${normalizado.slice(0, -2)},${normalizado.slice(-2)}`;
}

export function sumarCentimosFirmados(lineas: readonly LineaBorradorB4[], tipo?: LineaBorradorB4['tipo']): number {
  return lineas.reduce((suma, linea) => {
    if (tipo && linea.tipo !== tipo) return suma;
    return suma + linea.importeCentimos;
  }, 0);
}

/**
 * Comprueba capacidad manteniendo la orientación firmada. No transforma importes
 * en magnitudes: con saldo negativo, el borrador debe permanecer negativo y no
 * puede ser menor que el saldo disponible.
 */
export function dentroDeDisponibleFirmado(importe: number, disponible: number | null, documento?: DocumentoB4): boolean {
  if (!Number.isSafeInteger(importe) || importe === 0) return false;
  if (documento) {
    const objetivo = documento.importeObjetivoCentimos;
    const asignado = documento.asignadoCentimos;
    if (documento.stale || objetivo === null || objetivo === 0 || !Number.isSafeInteger(objetivo) || !Number.isSafeInteger(asignado)) return false;
    const neto = asignado + importe;
    return Number.isSafeInteger(neto) && (objetivo > 0 ? neto >= 0 && neto <= objetivo : neto >= objetivo && neto <= 0);
  }
  if (disponible === null || !Number.isSafeInteger(disponible) || disponible === 0) return false;
  if (disponible > 0) return importe > 0 && importe <= disponible;
  return importe < 0 && importe >= disponible;
}

export function documentoPuedeVincularse(documento: DocumentoB4): boolean {
  return !documento.stale
    && documento.importeObjetivoCentimos !== null
    && documento.importeObjetivoCentimos !== 0
    && Number.isSafeInteger(documento.importeObjetivoCentimos)
    && Number.isSafeInteger(documento.asignadoCentimos)
    && documento.disponibleCentimos !== null
    && Number.isSafeInteger(documento.disponibleCentimos);
}

export function etiquetaEstado(estado: string): string {
  switch (estado) {
    case 'SIN_DOCUMENTO': return 'Sin documento';
    case 'JUSTIFICADO': return 'Justificado';
    case 'NO_REQUIERE': return 'No requiere documento';
    default: return estado;
  }
}

export function etiquetaMotivo(motivo: string): string {
  return motivo.replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/g, letra => letra.toUpperCase());
}

export function fechaCorta(valor: string | null): string {
  if (!valor) return 'Sin fecha';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime())
    ? valor
    : new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(fecha);
}

export function textoBusquedaSeguro(value: string): string {
  return value.slice(0, 120);
}

export function crearClaveIdempotencia(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
}
