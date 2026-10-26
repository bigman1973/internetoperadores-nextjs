import type { TarifaWeb } from '@/lib/tarifas-web';

export const iconoCategoria: Record<string, string> = {
  'INTERNET': '🌐',
  'TELEFONÍA FIJA': '📞',
  'TELEFONÍA FIJA (TARIFA PLANA)': '📞',
  'LÍNEA FIJA': '📞',
  'TELEFONÍA MÓVIL': '📱',
  'TELEFONÍA MÓVIL (BASE)': '📱',
  'LÍNEA MÓVIL (BASE)': '📱',
  'LÍNEA ADICIONAL': '📱',
  'BONOS MÓVIL': '📱',
  'BONOS FIJO': '📞',
  'COMPARTE GB': '📱',
  'CENTRALITAS PBX': '💬',
  'PBX CLOUD WILDIX': '💬',
  'COMUNICACIONES UNIFICADAS': '🎥',
  'HOSTING': '☁️',
  'BACKUP Y CLOUD': '☁️',
  'BACKUP': '☁️',
  'SERVICIOS CLOUD': '☁️',
  'SERVIDORES Y CLOUD': '🖥️',
  'DATACENTER': '🖥️',
  'HOTSPOT Y GESTIÓN': '📶',
  'HOTSPOT': '📶',
  'EQUIPOS Y HARDWARE': '🔧',
  'TERMINALES': '📟',
  'MANTENIMIENTO': '🔧',
  'SERVICIOS IT': '💻',
  'IP Y REDES': '🌐',
  'INTERCONEXIÓN OPERADOR': '🔗',
  'SERVICIOS OPERADOR': '🔗',
  'ALQUILER Y SOFTWARE': '💿',
  'CUOTAS DE ALTA': '📋',
};

export function esCategoriaDeTabla(categoria: string) {
  return categoria.includes('FIBRA') || categoria.includes('INTERNET') || categoria.includes('TELEFONÍA') || categoria.includes('LÍNEA') || categoria.includes('MÓVIL') || categoria.includes('FTTH');
}

export function getDetalleConectividad(tarifa: TarifaWeb): string {
  const parts: string[] = [];

  if (tarifa.velocidad) {
    parts.push(tarifa.velocidad);
  } else if (tarifa.fibraBajada) {
    parts.push(`${tarifa.fibraBajada}/${tarifa.fibraSubida || '?'} Mbps Fibra`);
  } else if (tarifa.velocidadBajada) {
    parts.push(`${tarifa.velocidadBajada}/${tarifa.velocidadSubida || '?'} Mbps`);
  }

  if (tarifa.datosIncluidos) parts.push(`${tarifa.datosIncluidos} datos`);
  if (tarifa.minutosIncluidos) parts.push(`${tarifa.minutosIncluidos} min`);
  if (tarifa.smsIncluidos) parts.push(`${tarifa.smsIncluidos} SMS`);

  return parts.join(' · ') || tarifa.descripcionCorta || '';
}
