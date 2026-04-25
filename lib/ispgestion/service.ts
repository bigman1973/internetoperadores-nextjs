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
    
    // Función para determinar la categoría
    function getCategoria(tarifa: any): string {
      const nombre = (tarifa.nombre || '').toUpperCase();
      const nombreComercial = (tarifa.nombre_comercial || '').toUpperCase();
      
      if (nombre.includes('HOTSPOT') || nombreComercial.includes('HOTSPOT')) return 'VOLA HOTSPOT';
      if (nombre.includes('WILDIX') || nombre.includes('PBX')) return 'CENTRALITAS WILDIX';
      if (nombre.includes('ADAMO') || nombreComercial.includes('ADAMO')) return 'FIBRA ADAMO';
      if (nombre.includes('AN-FIBRA') || nombre.includes('AIRE')) return 'FIBRA AIRE NETWORKS';
      if (nombre.includes('STARLINK')) return 'STARLINK';
      if (nombre.includes('ROUTER 4G') || (nombre.includes('4G') && !nombre.includes('FIBRA'))) return 'ROUTER 4G';
      if (nombre.includes('MANTENIMIENTO')) return 'MANTENIMIENTO';
      if (nombre.includes('MICROSOFT') || nombre.includes('PANDA') || nombre.includes('BACKUP')) return 'SERVICIOS AÑADIDOS';
      
      if (tarifa.movil === 1) return 'TELEFONÍA MÓVIL';
      if (tarifa.fijo === 1) return 'TELEFONÍA FIJA';
      if (tarifa.internet === 1) return 'INTERNET';
      
      return 'SERVICIOS VARIOS';
    }
    
    // Función para extraer velocidad
    function getVelocidad(tarifa: any): string | null {
      const bajada = tarifa.bajada || tarifa.fibra_bajada;
      const subida = tarifa.subida || tarifa.fibra_subida;
      if (bajada && subida) return `${bajada}/${subida} Mbps`;
      if (bajada) return `${bajada} Mbps`;
      return null;
    }
    
    // Eliminar tarifas existentes y sus dependencias
    await prisma.$executeRaw`DELETE FROM estadisticas_tarifas`;
    await prisma.$executeRaw`DELETE FROM historial_cambios`;
    await prisma.$executeRaw`DELETE FROM tarifas`;
    await prisma.$executeRaw`ALTER SEQUENCE tarifas_id_seq RESTART WITH 1`;
    
    let inserted = 0;
    let errors = 0;
    
    for (const t of activeTarifas) {
      try {
        const ispId = t.id.toString();
        const nombre = t.nombre_comercial || t.nombre || 'Sin nombre';
        const categoria = getCategoria(t);
        const precioSinIva = parseFloat(t.total || '0');
        let precioConIva = parseFloat(t.total_iva || '0');
        if (precioConIva === 0 && precioSinIva > 0) precioConIva = Math.round(precioSinIva * 1.21 * 100) / 100;
        const costeOperador = t.precio_costo ? parseFloat(t.precio_costo) : null;
        const permanencia = t.duracion_permanencia ? `${t.duracion_permanencia} meses` : null;
        const penalizacion = t.penalizacion && parseFloat(t.penalizacion) > 0 ? `${t.penalizacion}€` : null;
        const velocidad = getVelocidad(t);
        const descripcionCorta = t.descripcion_web || null;
        const descripcionLarga = t.descripcion_web_ampliacion || null;
        const destacada = t.destacado === 1;
        const fechaInicio = t.desdefecha ? new Date(t.desdefecha) : null;
        let fechaFin = t.hastafecha ? new Date(t.hastafecha) : null;
        if (t.hastafecha === '2999-01-01') fechaFin = null;
        
        await prisma.$executeRaw`
          INSERT INTO tarifas (
            tipo_cliente, categoria, nombre, descripcion_corta, descripcion_larga,
            velocidad, precio_sin_iva, precio_con_iva, coste_operador,
            permanencia, penalizacion, destacada, activa,
            solo_clientes_existentes, fecha_inicio, fecha_fin, orden,
            isp_gestion_id, created_at, updated_at
          ) VALUES (
            'EMPRESA', ${categoria}, ${nombre}, ${descripcionCorta}, ${descripcionLarga},
            ${velocidad}, ${precioSinIva}, ${precioConIva}, ${costeOperador},
            ${permanencia}, ${penalizacion}, ${destacada}, true,
            false, ${fechaInicio}, ${fechaFin}, 0,
            ${ispId}, NOW(), NOW()
          )
        `;
        inserted++;
      } catch (err: any) {
        errors++;
        if (errors <= 5) console.error(`Error insertando tarifa ${t.id}:`, err.message);
      }
    }
    
    return {
      success: true,
      totalISP: allTarifas.length,
      activas: activeTarifas.length,
      inserted,
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
