import axios from 'axios';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

const API_URL = process.env.ISPGESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISPGESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISPGESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
const RAILWAY_PROXY_URL = 'https://ispgestion-middleware-production.up.railway.app/api/ispgestion-proxy';

const ispgestionDirect = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
  timeout: 30000,
});

async function request(endpoint: string, method = 'GET', data: any = null, params: any = null) {
  // Limpiar endpoint para evitar doble barra
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  // ISP Gestión filtra por IP. Desde Railway se puede llamar directamente.
  // Desde Vercel u otros entornos, usamos el proxy de Railway como intermediario.
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;
  
  if (isRailway) {
    console.log(`[ISPGestión] Petición directa ${method} a ${cleanEndpoint}`);
    const response = await ispgestionDirect({ 
      url: cleanEndpoint, 
      method, 
      data, 
      params 
    });
    return response.data;
  } else {
    console.log(`[ISPGestión] Petición via proxy Railway ${method} a ${cleanEndpoint}`);
    const response = await axios.post(RAILWAY_PROXY_URL, {
      endpoint: cleanEndpoint,
      method,
      data,
      params
    }, { timeout: 30000 });
    return response.data;
  }
}

export async function verifyClienteCredentials(email: string, pass: string): Promise<string | null> {
  try {
    const data = await request('clientes/login', 'POST', { email, pass });
    return data && data.success ? (data.cliente_id || data.id)?.toString() : null;
  } catch (error) {
    console.error('Error verificando credenciales en ISPGestión:', error);
    return null;
  }
}

export async function getClienteByEmail(email: string) {
  try {
    const data = await request('clientes', 'GET', null, { email });
    if (Array.isArray(data)) return data[0];
    if (data.clientes && Array.isArray(data.clientes)) return data.clientes[0];
    return null;
  } catch (error) {
    console.error('Error obteniendo cliente por email en ISPGestión:', error);
    return null;
  }
}

export async function syncClients() {
  try {
    const externalClients = await getAllClientes();
    let updated = 0;
    const defaultPasswordHash = await bcrypt.hash('cliente123', 10);

    for (const client of externalClients) {
      const email = client.email || client.correo;
      const ispgestionId = (client.id || client.cliente_id || client.isp_gestion_id)?.toString();
      
      if (!email || !ispgestionId) continue;

      await prisma.clienteWeb.upsert({
        where: { email },
        update: {
          nombre: client.nombre || client.name || 'Cliente Sin Nombre',
          ispGestionId: ispgestionId,
        },
        create: {
          email,
          nombre: client.nombre || client.name || 'Cliente Sin Nombre',
          passwordHash: defaultPasswordHash,
          ispGestionId: ispgestionId,
          newsletterSuscrito: false,
        },
      });
      
      updated++;
    }
    return { success: true, count: externalClients.length, updated };
  } catch (error: any) {
    console.error('Error en syncClients:', error);
    throw error;
  }
}

export async function getAllClientes() {
  // Probar el endpoint exacto de la documentación con parámetros de paginación
  const endpoints = [
    'clientes',
    'clientes/',
    'clientes?mostrar=100&pagina=1',
  ];
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`[ISPGestión] Probando endpoint: ${endpoint}`);
      const data = await request(endpoint);
      
      // Si recibimos un error de ISPGestión, continuar con el siguiente endpoint
      if (data && data.error) {
        console.log(`[ISPGestión] Endpoint ${endpoint} devolvió error: ${data.error}`);
        lastError = new Error(data.error);
        continue;
      }
      
      if (data) {
        if (Array.isArray(data)) return data;
        if (data.clientes && Array.isArray(data.clientes)) return data.clientes;
        if (data.data && Array.isArray(data.data)) return data.data;
        // Si es un objeto con datos de clientes
        if (typeof data === 'object' && !data.error) {
          const values = Object.values(data);
          if (values.length > 0 && Array.isArray(values[0])) return values[0];
        }
      }
    } catch (error: any) {
      console.log(`[ISPGestión] Error en endpoint ${endpoint}:`, error.message);
      lastError = error;
    }
  }
  throw lastError || new Error('No se pudo encontrar un endpoint válido para clientes');
}

export async function syncContratos() {
  try {
    let allContratos: any[] = [];
    let page = 1;
    const pageSize = 500;
    
    // Obtener todos los contratos con paginación
    while (true) {
      console.log(`[ISPGestión] Obteniendo contratos página ${page}...`);
      const data = await request('contratos_todos', 'GET', null, { mostrar: pageSize, pagina: page });
      
      if (Array.isArray(data) && data.length > 0) {
        allContratos = allContratos.concat(data);
        console.log(`[ISPGestión] Página ${page}: ${data.length} contratos (total: ${allContratos.length})`);
        if (data.length < pageSize) break;
        page++;
      } else {
        break;
      }
    }
    
    console.log(`[ISPGestión] Total contratos obtenidos: ${allContratos.length}`);
    
    let upserted = 0;
    let errors = 0;
    
    for (const contrato of allContratos) {
      try {
        const contratoId = parseInt(contrato.id);
        if (!contratoId || !contrato.clienteid) continue;
        
        const precio = parseFloat(contrato.precio) || 0;
        const importeRemesar = contrato.importe_remesar ? parseFloat(contrato.importe_remesar) : null;
        const descuentoTotal = contrato.descuento_total ? parseFloat(contrato.descuento_total) : null;
        const fechaInicio = contrato.fechainicio ? new Date(contrato.fechainicio) : null;
        const fechaBaja = contrato.fecha_baja ? new Date(contrato.fecha_baja) : null;
        const activo = !contrato.fecha_baja;
        
        await prisma.$executeRaw`
          INSERT INTO contratos_servicio (
            isp_gestion_contrato_id, cliente_id, titulo, tarifa, precio,
            importe_remesar, descuento_total, fecha_inicio, fecha_baja,
            causa_baja, concepto_facturacion, permanencia, fecha_permanencia,
            categoria, tipo_alta, telefonos_contrato, observaciones, activo,
            created_at, updated_at
          ) VALUES (
            ${contratoId}, ${contrato.clienteid}, ${contrato.titulo || ''}, ${contrato.tarifa || ''},
            ${precio}, ${importeRemesar}, ${descuentoTotal},
            ${fechaInicio}, ${fechaBaja},
            ${contrato.causa_baja || null}, ${contrato.concepto_facturacion || null},
            ${contrato.permanencia || 0}, ${contrato.fecha_permanencia ? new Date(contrato.fecha_permanencia) : null},
            ${contrato.categoria || null}, ${contrato.tipo_alta || null},
            ${contrato.telefonos_contrato || null}, ${contrato.observaciones || null},
            ${activo}, NOW(), NOW()
          )
          ON CONFLICT (isp_gestion_contrato_id) DO UPDATE SET
            cliente_id = EXCLUDED.cliente_id,
            titulo = EXCLUDED.titulo,
            tarifa = EXCLUDED.tarifa,
            precio = EXCLUDED.precio,
            importe_remesar = EXCLUDED.importe_remesar,
            descuento_total = EXCLUDED.descuento_total,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_baja = EXCLUDED.fecha_baja,
            causa_baja = EXCLUDED.causa_baja,
            concepto_facturacion = EXCLUDED.concepto_facturacion,
            permanencia = EXCLUDED.permanencia,
            fecha_permanencia = EXCLUDED.fecha_permanencia,
            categoria = EXCLUDED.categoria,
            tipo_alta = EXCLUDED.tipo_alta,
            telefonos_contrato = EXCLUDED.telefonos_contrato,
            observaciones = EXCLUDED.observaciones,
            activo = EXCLUDED.activo,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting contrato ${contrato.id}:`, err.message);
      }
    }
    
    return { 
      success: true, 
      total: allContratos.length, 
      upserted, 
      errors,
      activos: allContratos.filter(c => !c.fecha_baja).length,
      bajas: allContratos.filter(c => c.fecha_baja).length
    };
  } catch (error: any) {
    console.error('Error en syncContratos:', error);
    throw error;
  }
}

export async function syncTarifas() {
  try {
    // Obtener TODAS las tarifas de ISP Gestión (incluyendo las no publicadas en web)
    const allTarifas = await request('tarifas', 'GET', null, { mostrar_todas: 1, todas: 1, campos_adicionales: 1 });
    
    if (!Array.isArray(allTarifas)) {
      throw new Error('La respuesta de tarifas no es un array');
    }
    
    // Filtrar solo las activas
    const activeTarifas = allTarifas.filter((t: any) => t.activo === 1);
    console.log(`[ISPGestión] Total tarifas: ${allTarifas.length}, Activas: ${activeTarifas.length}`);
    
    // Mapeo de tipo_id a categoría legible
    const TIPO_CATEGORIA: Record<number, string> = {
      159: 'EQUIPOS Y HARDWARE',
      47: 'INTERNET 4G/WIMAX',
      59: 'BACKUP Y CLOUD',
      56: 'TELEFONÍA MÓVIL',
      26: 'TELEFONÍA MÓVIL (BASE)',
      57: 'HOTSPOT Y GESTIÓN',
      58: 'FIBRA',
      52: 'TELEFONÍA FIJA',
      67: 'HOSTING',
      68: 'HOSTING',
      69: 'FIBRA FTTH',
      160: 'TELEFONÍA FIJA (TARIFA PLANA)',
      42: 'IP Y REDES',
      64: 'SERVICIOS IT',
      53: 'TERMINALES',
      161: 'SERVIDORES Y CLOUD',
      30: 'TELEFONÍA FIJA (TARIFA PLANA)',
      29: 'LÍNEA FIJA',
      158: 'CENTRALITAS PBX',
      62: 'INTERCONEXIÓN OPERADOR',
      46: 'BONOS MÓVIL',
      65: 'SERVICIOS CLOUD',
      63: 'SERVICIOS OPERADOR',
      61: 'DATACENTER',
      51: 'MANTENIMIENTO',
      36: 'PBX CLOUD WILDIX',
      54: 'ALQUILER Y SOFTWARE',
      162: 'BONOS FIJO',
      55: 'LÍNEA ADICIONAL',
      50: 'INTERNET COMUNITAT',
      41: 'HOTSPOT',
      28: 'CUOTAS DE ALTA',
      27: 'LÍNEA MÓVIL (BASE)',
      155: 'COMPARTE GB',
      60: 'BACKUP',
      70: 'FTTH VoIP',
    };
    
    // Función para determinar la categoría basada en tipo_id de ISP Gestión
    function getCategoria(tarifa: any): string {
      const tipoId = tarifa.tipo;
      if (tipoId && TIPO_CATEGORIA[tipoId]) return TIPO_CATEGORIA[tipoId];
      
      // Fallback por flags
      if (tarifa.movil === 1) return 'TELEFONÍA MÓVIL';
      if (tarifa.fijo === 1) return 'TELEFONÍA FIJA';
      if (tarifa.internet === 1) return 'INTERNET';
      
      return 'OTROS SERVICIOS';
    }
    
    // Función para determinar tipo_cliente
    function getTipoCliente(tarifa: any): string {
      const nombre = (tarifa.nombre || '').toUpperCase();
      if (nombre.includes('PARTICULAR')) return 'PARTICULAR';
      if (nombre.includes('EMPRESA')) return 'EMPRESA';
      // Por defecto empresa ya que es B2B
      return 'EMPRESA';
    }
    
    // Función para extraer velocidad combinada
    function getVelocidad(tarifa: any): string | null {
      const bajada = tarifa.bajada || tarifa.fibra_bajada;
      const subida = tarifa.subida || tarifa.fibra_subida;
      if (bajada && subida) return `${bajada}/${subida} Mbps`;
      if (bajada) return `${bajada} Mbps`;
      return null;
    }
    
    // Recoger los IDs de ISP Gestión de las tarifas activas
    const activeIspIds = activeTarifas.map((t: any) => t.id.toString());
    
    // Marcar como inactivas las tarifas que ya no están activas en ISP Gestión
    // (solo las que tienen isp_gestion_id, para no tocar tarifas manuales)
    const deactivated = await prisma.$executeRaw`
      UPDATE tarifas SET activa = false, updated_at = NOW()
      WHERE isp_gestion_id IS NOT NULL 
        AND isp_gestion_id != ''
        AND isp_gestion_id NOT IN (SELECT unnest(${activeIspIds}::text[]))
        AND activa = true
    `;
    console.log(`[ISPGestión] Tarifas marcadas como inactivas: ${deactivated}`);
    
    let upserted = 0;
    let created = 0;
    let updated = 0;
    let errors = 0;
    
    for (const t of activeTarifas) {
      try {
        const ispId = t.id.toString();
        const nombre = t.nombre_comercial || t.nombre || 'Sin nombre';
        const categoria = getCategoria(t);
        const tipoCliente = getTipoCliente(t);
        const precioSinIva = parseFloat(t.total || '0');
        let precioConIva = parseFloat(t.total_iva || '0');
        if (precioConIva === 0 && precioSinIva > 0) precioConIva = Math.round(precioSinIva * 1.21 * 100) / 100;
        const costeOperador = t.precio_costo && parseFloat(t.precio_costo) > 0 ? parseFloat(t.precio_costo) : null;
        const permanenciaTexto = t.duracion_permanencia ? `${t.duracion_permanencia} meses` : null;
        const penalizacion = t.penalizacion && parseFloat(t.penalizacion) > 0 ? `${t.penalizacion}€` : null;
        const velocidad = getVelocidad(t);
        const descripcionCorta = t.descripcion_web || null;
        const descripcionLarga = t.descripcion_web_ampliacion || null;
        const destacada = t.destacado === 1;
        const fechaInicio = t.desdefecha ? new Date(t.desdefecha) : null;
        let fechaFin = t.hastafecha ? new Date(t.hastafecha) : null;
        if (t.hastafecha === '2999-01-01') fechaFin = null;
        
        // Campos adicionales de producto
        const ispTipoId = t.tipo || null;
        const esMovil = t.movil === 1;
        const esFijo = t.fijo === 1;
        const esInternet = t.internet === 1;
        const esTv = t.tv === 1;
        const esCompuesta = t.compuesta === 1;
        const velocidadBajada = t.bajada ? String(t.bajada) : null;
        const velocidadSubida = t.subida ? String(t.subida) : null;
        const fibraBajada = t.fibra_bajada ? String(t.fibra_bajada) : null;
        const fibraSubida = t.fibra_subida ? String(t.fibra_subida) : null;
        const datosIncluidos = t.datos && t.datos !== '0' ? String(t.datos) : null;
        const minutosIncluidos = t.minutos ? String(t.minutos) : null;
        const smsIncluidos = t.sms ? String(t.sms) : null;
        const conceptoFacturacion = t.concepto_facturacion || null;
        const servicioPppoe = t.servicio || null;
        const duracionPermanenciaMeses = t.duracion_permanencia ? parseInt(t.duracion_permanencia) : null;
        const observacionesPermanencia = t.observaciones_permanencia || null;
        const tarifaPlanaId = t.tarifa_plana && t.tarifa_plana > 0 ? t.tarifa_plana : null;
        const noFacturar = t.no_facturar === 1;
        const noProrrateable = t.no_prorrateable === 1;
        const publicarWeb = t.publicar_web === 1;
        const tipoPeriodicidad = t.tipo_periocidad || 1;
        const precioPeriodo = t.total_periodo ? parseFloat(t.total_periodo) : null;
        const precioPeriodoIva = t.total_iva_periodo ? parseFloat(t.total_iva_periodo) : null;
        
        // Upsert: si ya existe por isp_gestion_id, actualizar; si no, crear
        const result = await prisma.$executeRaw`
          INSERT INTO tarifas (
            tipo_cliente, categoria, nombre, descripcion_corta, descripcion_larga,
            velocidad, precio_sin_iva, precio_con_iva, coste_operador,
            permanencia, penalizacion, destacada, activa,
            solo_clientes_existentes, fecha_inicio, fecha_fin, orden,
            isp_gestion_id, created_at, updated_at,
            isp_tipo_id, es_movil, es_fijo, es_internet, es_tv, es_compuesta,
            velocidad_bajada, velocidad_subida, fibra_bajada, fibra_subida,
            datos_incluidos, minutos_incluidos, sms_incluidos,
            concepto_facturacion, servicio_pppoe,
            duracion_permanencia_meses, observaciones_permanencia,
            tarifa_plana_id, no_facturar, no_prorrateable, publicar_web,
            tipo_periodicidad, precio_periodo, precio_periodo_iva
          ) VALUES (
            ${tipoCliente}::"TipoCliente", ${categoria}, ${nombre}, ${descripcionCorta}, ${descripcionLarga},
            ${velocidad}, ${precioSinIva}, ${precioConIva}, ${costeOperador},
            ${permanenciaTexto}, ${penalizacion}, ${destacada}, true,
            false, ${fechaInicio}, ${fechaFin}, 0,
            ${ispId}, NOW(), NOW(),
            ${ispTipoId}, ${esMovil}, ${esFijo}, ${esInternet}, ${esTv}, ${esCompuesta},
            ${velocidadBajada}, ${velocidadSubida}, ${fibraBajada}, ${fibraSubida},
            ${datosIncluidos}, ${minutosIncluidos}, ${smsIncluidos},
            ${conceptoFacturacion}, ${servicioPppoe},
            ${duracionPermanenciaMeses}, ${observacionesPermanencia},
            ${tarifaPlanaId}, ${noFacturar}, ${noProrrateable}, ${publicarWeb},
            ${tipoPeriodicidad}, ${precioPeriodo}, ${precioPeriodoIva}
          )
          ON CONFLICT (isp_gestion_id) DO UPDATE SET
            tipo_cliente = EXCLUDED.tipo_cliente,
            categoria = EXCLUDED.categoria,
            nombre = EXCLUDED.nombre,
            descripcion_corta = EXCLUDED.descripcion_corta,
            descripcion_larga = EXCLUDED.descripcion_larga,
            velocidad = EXCLUDED.velocidad,
            precio_sin_iva = EXCLUDED.precio_sin_iva,
            precio_con_iva = EXCLUDED.precio_con_iva,
            coste_operador = EXCLUDED.coste_operador,
            permanencia = EXCLUDED.permanencia,
            penalizacion = EXCLUDED.penalizacion,
            destacada = EXCLUDED.destacada,
            activa = true,
            fecha_inicio = EXCLUDED.fecha_inicio,
            fecha_fin = EXCLUDED.fecha_fin,
            isp_tipo_id = EXCLUDED.isp_tipo_id,
            es_movil = EXCLUDED.es_movil,
            es_fijo = EXCLUDED.es_fijo,
            es_internet = EXCLUDED.es_internet,
            es_tv = EXCLUDED.es_tv,
            es_compuesta = EXCLUDED.es_compuesta,
            velocidad_bajada = EXCLUDED.velocidad_bajada,
            velocidad_subida = EXCLUDED.velocidad_subida,
            fibra_bajada = EXCLUDED.fibra_bajada,
            fibra_subida = EXCLUDED.fibra_subida,
            datos_incluidos = EXCLUDED.datos_incluidos,
            minutos_incluidos = EXCLUDED.minutos_incluidos,
            sms_incluidos = EXCLUDED.sms_incluidos,
            concepto_facturacion = EXCLUDED.concepto_facturacion,
            servicio_pppoe = EXCLUDED.servicio_pppoe,
            duracion_permanencia_meses = EXCLUDED.duracion_permanencia_meses,
            observaciones_permanencia = EXCLUDED.observaciones_permanencia,
            tarifa_plana_id = EXCLUDED.tarifa_plana_id,
            no_facturar = EXCLUDED.no_facturar,
            no_prorrateable = EXCLUDED.no_prorrateable,
            publicar_web = EXCLUDED.publicar_web,
            tipo_periodicidad = EXCLUDED.tipo_periodicidad,
            precio_periodo = EXCLUDED.precio_periodo,
            precio_periodo_iva = EXCLUDED.precio_periodo_iva,
            updated_at = NOW()
        `;
        upserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error upserting tarifa ${t.id}:`, err.message);
      }
    }
    
    return {
      success: true,
      totalISP: allTarifas.length,
      activas: activeTarifas.length,
      upserted,
      deactivated: Number(deactivated),
      errors
    };
  } catch (error: any) {
    console.error('Error en syncTarifas:', error);
    throw error;
  }
}

export async function testConnection() {
  try {
    const data = await request('clientes', 'GET', null, { mostrar: 1 });
    return { success: true, data };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.response?.data?.error || error.message || 'Error desconocido' 
    };
  }
}

export default request;
