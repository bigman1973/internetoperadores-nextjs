// Utilidades de formateo

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d)
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`
}

export function calculateIVA(precioSinIva: number, porcentajeIVA: number = 21): number {
  return precioSinIva * (1 + porcentajeIVA / 100)
}

export function roundTo99(price: number): number {
  return Math.floor(price) + 0.99
}

export function roundTo95(price: number): number {
  return Math.floor(price) + 0.95
}

export function roundToNearest(price: number): number {
  return Math.round(price)
}
