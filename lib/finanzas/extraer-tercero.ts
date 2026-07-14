/**
 * Extracción del tercero (destinatario/ordenante) del concepto bancario.
 * 
 * Cada banco tiene un formato diferente para las transferencias.
 * Esta función analiza el concepto y extrae quién es la otra parte.
 * 
 * Si el tercero es "Internet Operadores" → es un traspaso entre cuentas propias.
 * Si es otra empresa → es un pago a proveedor o cobro de cliente.
 */

export interface InfoTercero {
  /** Nombre del tercero extraído del concepto */
  nombre: string | null;
  /** Si el tercero es Internet Operadores (traspaso entre cuentas propias) */
  esInternetOperadores: boolean;
  /** Concepto/referencia extraído (lo que queda después del tercero) */
  concepto: string | null;
  /** Tipo de movimiento detectado */
  tipo: 'traspaso' | 'pago_proveedor' | 'cobro_cliente' | 'desconocido';
}

/**
 * Determina si un nombre corresponde a Internet Operadores
 */
function esIO(nombre: string): boolean {
  return /internet\s*operadores/i.test(nombre);
}

/**
 * Limpia el nombre del tercero (quita puntuación final, espacios extra)
 */
function limpiarNombre(nombre: string): string {
  return nombre
    .replace(/[,.]$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae el tercero del concepto de SANTANDER.
 * 
 * Formatos:
 * - Salida: "Transferencia (Inmediata) A Favor De [DESTINATARIO] Concepto [CONCEPTO]"
 * - Entrada: "Transferencia (Inmediata) De [ORDENANTE], Concepto [CONCEPTO]"
 * - Entrada: "Transferencia De [ORDENANTE], Referencia: [REF] Concepto [CONCEPTO]"
 */
function extraerTerceroSantander(concepto: string, importe: number): InfoTercero {
  // Salida: "Transferencia (Inmediata) A Favor De [DESTINATARIO] (Sl/S.l./etc) Concepto [X]"
  const salidaMatch = concepto.match(/Transferencia\s*(?:Inmediata\s*)?A Favor De\s+(.+?)(?:\s+Concepto[\s:](.*))?$/i);
  if (salidaMatch) {
    const nombre = limpiarNombre(salidaMatch[1]);
    const ref = salidaMatch[2]?.trim() || null;
    let esTraspaso = esIO(nombre);
    
    // Si el destinatario es IO pero el concepto NO indica traspaso, es un pago a tercero
    // (ej: "A Favor De Internet Operadores Concepto Zoom Suara 2026")
    if (esTraspaso && ref) {
      const esConceptoTraspaso = /traspas|traspaso|enviado por banco/i.test(ref);
      if (!esConceptoTraspaso) {
        esTraspaso = false;
      }
    }
    
    return {
      nombre,
      esInternetOperadores: esTraspaso,
      concepto: ref,
      tipo: esTraspaso ? 'traspaso' : 'pago_proveedor',
    };
  }

  // Entrada: "Transferencia (Inmediata) De [ORDENANTE], Concepto [X]"
  const entradaMatch = concepto.match(/Transferencia\s*(?:Inmediata\s*)?De\s+(.+?)(?:,\s*(?:Referencia:.*?)?Concepto[\s:](.*))?$/i);
  if (entradaMatch) {
    const nombre = limpiarNombre(entradaMatch[1]);
    const ref = entradaMatch[2]?.trim() || null;
    return {
      nombre,
      esInternetOperadores: esIO(nombre),
      concepto: ref,
      tipo: esIO(nombre) ? 'traspaso' : 'cobro_cliente',
    };
  }

  return { nombre: null, esInternetOperadores: false, concepto: null, tipo: 'desconocido' };
}

/**
 * Extrae el tercero del concepto de BBVA.
 * 
 * Formato: "TRANSFERÈNCIES - [CONCEPTO_LIBRE]"
 * 
 * BBVA no tiene un formato estándar para el destinatario.
 * El campo después del guión es concepto libre. Pero podemos detectar patrones:
 * - Si contiene "TRASPAS/TRASPASO" + nombre de banco → traspaso
 * - Si contiene "INTERNET OPERADORES" como destinatario → traspaso
 * - Si contiene "FRA/FACTURA/PAGO" → pago a proveedor
 * - Si contiene "SU FRA" → cobro de factura emitida
 */
function extraerTerceroBBVA(concepto: string, importe: number): InfoTercero {
  // Formato TRANSFERÈNCIES
  const transferMatch = concepto.match(/TRANSFER(?:È|E)NCIES\s*-\s*(.+)$/i);
  if (transferMatch) {
    const contenido = transferMatch[1].trim();
    
    // Caso 1: TRASPAS/TRASPASO → traspaso entre cuentas propias
    if (/^(TRASPAS|TRASPASO)/i.test(contenido)) {
      return {
        nombre: 'INTERNET OPERADORES',
        esInternetOperadores: true,
        concepto: contenido,
        tipo: 'traspaso',
      };
    }
    
    // Caso 2: "traspas de bbva a..." → traspaso
    if (/traspas\s*de\s*(bbva|santander|guissona|vivid|caixa)/i.test(contenido)) {
      return {
        nombre: 'INTERNET OPERADORES',
        esInternetOperadores: true,
        concepto: contenido,
        tipo: 'traspaso',
      };
    }

    // Caso 3: "INTERNET OPERADORES GUISSONA/SANTANDER/BBVA" → traspaso
    if (/^INTERNET OPERADORES\s*(GUISSONA|SANTANDER|BBVA|VIVID|CAIXA)/i.test(contenido)) {
      return {
        nombre: 'INTERNET OPERADORES',
        esInternetOperadores: true,
        concepto: contenido,
        tipo: 'traspaso',
      };
    }

    // Caso 4: "Santander Internet Operadores" → traspaso
    if (/^(Santander|BBVA|Guissona|Vivid|CaixaBank)\s*Internet Operadores/i.test(contenido)) {
      return {
        nombre: 'INTERNET OPERADORES',
        esInternetOperadores: true,
        concepto: contenido,
        tipo: 'traspaso',
      };
    }

    // Caso 5: "INTERNET OPERADORES SL" (sin más) y es salida → traspaso a otra cuenta IO
    if (/^INTERNET OPERADORES\s*(SL|S\.?L\.?)?\s*$/i.test(contenido) && importe < 0) {
      return {
        nombre: 'INTERNET OPERADORES',
        esInternetOperadores: true,
        concepto: contenido,
        tipo: 'traspaso',
      };
    }

    // Caso 6: "INTERNET OPERADORES, SU FRA..." → cobro de factura emitida (cliente paga a IO)
    if (/INTERNET OPERADORES.*SU FRA/i.test(contenido)) {
      // Extraer referencia de factura
      const fraMatch = contenido.match(/SU FRA\s*(.+)/i);
      return {
        nombre: null, // El tercero es quien paga, pero BBVA no lo indica
        esInternetOperadores: false,
        concepto: fraMatch ? fraMatch[1].trim() : contenido,
        tipo: 'cobro_cliente',
      };
    }

    // Caso 7: "Internet Operadores- Pago factura..." → pago de factura (IO paga)
    if (/Internet Operadores.*Pago\s*(factura|fra)/i.test(contenido)) {
      return {
        nombre: null, // Destinatario no explícito en BBVA
        esInternetOperadores: false,
        concepto: contenido,
        tipo: 'pago_proveedor',
      };
    }

    // Caso 8: "Internet Operadores - XXXXXXX" (con referencia numérica) → pago a proveedor
    if (/^Internet Operadores\s*-\s*\d+/i.test(contenido)) {
      return {
        nombre: null,
        esInternetOperadores: false,
        concepto: contenido,
        tipo: 'pago_proveedor',
      };
    }

    // Caso 9: Contiene nombre de empresa conocida o concepto genérico
    // Si es un ingreso y NO menciona traspaso → cobro de cliente
    if (importe > 0 && !esIO(contenido)) {
      return {
        nombre: contenido.length < 60 ? contenido : null,
        esInternetOperadores: false,
        concepto: contenido,
        tipo: 'cobro_cliente',
      };
    }

    // Si es una salida → pago a proveedor
    if (importe < 0 && !esIO(contenido)) {
      return {
        nombre: contenido.length < 60 ? contenido : null,
        esInternetOperadores: false,
        concepto: contenido,
        tipo: 'pago_proveedor',
      };
    }

    return {
      nombre: contenido.length < 60 ? contenido : null,
      esInternetOperadores: esIO(contenido),
      concepto: contenido,
      tipo: esIO(contenido) ? 'traspaso' : 'desconocido',
    };
  }

  return { nombre: null, esInternetOperadores: false, concepto: null, tipo: 'desconocido' };
}

/**
 * Extrae el tercero del concepto de CAIXA GUISSONA.
 * 
 * Formato: "TF/[ORDENANTE] [CONCEPTO]"
 * El ordenante es siempre quien envía el dinero (ingresos en Guissona).
 */
function extraerTerceroCaixaGuissona(concepto: string, importe: number): InfoTercero {
  // Formato TF/[ORDENANTE] [CONCEPTO]
  const tfMatch = concepto.match(/^TF\/(.+?)(?:\s{2,}|\s+(?:TRASPAS|SIN CONCEPTO|NO\.|FRA|PAGO|TRASPASO|ENVIADO))(.*)?$/i);
  if (tfMatch) {
    const nombre = limpiarNombre(tfMatch[1]);
    const ref = (tfMatch[2]?.trim() || '') + concepto.substring(concepto.indexOf(tfMatch[0]) + tfMatch[0].indexOf(tfMatch[2] || '')).trim();
    const conceptoCompleto = concepto.substring(concepto.indexOf(nombre) + nombre.length).trim();
    
    let esTraspaso = esIO(nombre);
    // Si el ordenante es IO pero el concepto indica PAGO/FRA (no TRASPAS), NO es traspaso
    if (esTraspaso && conceptoCompleto) {
      const esConceptoTraspaso = /TRASPAS|TRASPASO|SIN CONCEPTO|ENVIADO POR/i.test(conceptoCompleto);
      const esConceptoPago = /PAGO|FRA\b|FACTURA/i.test(conceptoCompleto) && !esConceptoTraspaso;
      if (esConceptoPago) {
        esTraspaso = false;
      }
    }
    
    return {
      nombre,
      esInternetOperadores: esTraspaso,
      concepto: conceptoCompleto || null,
      tipo: esTraspaso ? 'traspaso' : (importe > 0 ? 'cobro_cliente' : 'pago_proveedor'),
    };
  }

  // Formato simple: TF/[ORDENANTE] sin concepto adicional claro
  const tfSimple = concepto.match(/^TF\/(.+)$/i);
  if (tfSimple) {
    const contenido = tfSimple[1].trim();
    // Separar ordenante del concepto: el ordenante suele ser las primeras palabras (nombre empresa)
    // Patrón: nombre empresa seguido de concepto
    const partes = contenido.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s.,]+?)(?:\s+(?:NO\.|FRA|PAGO|SIN|TRASPAS|TRASPASO|ENVIADO).*)?$/i);
    if (partes) {
      const nombre = limpiarNombre(partes[1]);
      return {
        nombre,
        esInternetOperadores: esIO(nombre),
        concepto: contenido.substring(partes[1].length).trim() || null,
        tipo: esIO(nombre) ? 'traspaso' : (importe > 0 ? 'cobro_cliente' : 'pago_proveedor'),
      };
    }
    return {
      nombre: contenido.length < 60 ? contenido : null,
      esInternetOperadores: esIO(contenido),
      concepto: null,
      tipo: esIO(contenido) ? 'traspaso' : 'desconocido',
    };
  }

  return { nombre: null, esInternetOperadores: false, concepto: null, tipo: 'desconocido' };
}

/**
 * Extrae el tercero del concepto de VIVID.
 * 
 * Formato: "[ORDENANTE] [CONCEPTO]" o "[ORDENANTE] - [CONCEPTO]"
 */
function extraerTerceroVivid(concepto: string, importe: number): InfoTercero {
  // "Internet Operadores Sl - TRASPAS..."
  const traspasMatch = concepto.match(/^(.+?)\s*-\s*(TRASPAS.*)$/i);
  if (traspasMatch) {
    const nombre = limpiarNombre(traspasMatch[1]);
    return {
      nombre,
      esInternetOperadores: esIO(nombre),
      concepto: traspasMatch[2].trim(),
      tipo: esIO(nombre) ? 'traspaso' : (importe > 0 ? 'cobro_cliente' : 'pago_proveedor'),
    };
  }

  // "Internet Operadores Sl NOTPROVIDE TRASPASO..."
  if (/NOTPROVIDE\s*TRASPASO/i.test(concepto)) {
    return {
      nombre: 'INTERNET OPERADORES',
      esInternetOperadores: true,
      concepto: concepto,
      tipo: 'traspaso',
    };
  }

  // "TRANSFER INMEDIATA Internet Operadores Sl"
  const transferMatch = concepto.match(/TRANSFER INMEDIATA\s+(.+)$/i);
  if (transferMatch) {
    const nombre = limpiarNombre(transferMatch[1]);
    return {
      nombre,
      esInternetOperadores: esIO(nombre),
      concepto: null,
      tipo: esIO(nombre) ? 'traspaso' : (importe > 0 ? 'cobro_cliente' : 'pago_proveedor'),
    };
  }

  return { nombre: null, esInternetOperadores: false, concepto: null, tipo: 'desconocido' };
}

/**
 * Extrae el tercero del concepto de CaixaBank (Préstamo).
 * Similar a Vivid.
 */
function extraerTerceroCaixaBank(concepto: string, importe: number): InfoTercero {
  // "TRANSFER INMEDIATA Internet Operadores Sl"
  const transferMatch = concepto.match(/TRANSFER INMEDIATA\s+(.+)$/i);
  if (transferMatch) {
    const nombre = limpiarNombre(transferMatch[1]);
    return {
      nombre,
      esInternetOperadores: esIO(nombre),
      concepto: null,
      tipo: esIO(nombre) ? 'traspaso' : (importe > 0 ? 'cobro_cliente' : 'pago_proveedor'),
    };
  }

  return { nombre: null, esInternetOperadores: false, concepto: null, tipo: 'desconocido' };
}

// Mapeo de cuentaId → banco (se configura dinámicamente)
const BANCO_POR_CUENTA: Record<string, string> = {
  '50910c7d-76f3-493e-8aed-962f22fc1413': 'santander',
  'f98259f4-d176-4c0d-83ae-bc088a8b6ffd': 'bbva',
  '7664fe6c-9dd0-4099-9275-bbe8b4fde301': 'guissona',
  '316a6921-906f-46eb-8ea0-57db8f898748': 'vivid',
  '52a05fd6-4bf0-4f6e-9f8d-86e4533772ba': 'caixabank',
  '019f0deb-3633-4f4d-bd53-8a280ee1a07b': 'wise',
};

/**
 * Función principal: extrae el tercero del concepto según el banco.
 */
export function extraerTercero(concepto: string, importe: number, cuentaId: string): InfoTercero {
  const banco = BANCO_POR_CUENTA[cuentaId] || 'desconocido';

  switch (banco) {
    case 'santander':
      return extraerTerceroSantander(concepto, importe);
    case 'bbva':
      return extraerTerceroBBVA(concepto, importe);
    case 'guissona':
      return extraerTerceroCaixaGuissona(concepto, importe);
    case 'vivid':
      return extraerTerceroVivid(concepto, importe);
    case 'caixabank':
      return extraerTerceroCaixaBank(concepto, importe);
    default:
      return { nombre: null, esInternetOperadores: false, concepto: null, tipo: 'desconocido' };
  }
}

/**
 * Determina si un movimiento es un traspaso entre cuentas propias
 * basándose en el tercero extraído del concepto.
 */
export function esMovimientoTraspaso(concepto: string, importe: number, cuentaId: string): boolean {
  const info = extraerTercero(concepto, importe, cuentaId);
  return info.esInternetOperadores || info.tipo === 'traspaso';
}
