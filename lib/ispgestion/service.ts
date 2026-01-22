import axios from 'axios';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
const RAILWAY_PROXY_URL = 'https://ispgestion-middleware-production.up.railway.app/api/ispgestion-proxy';

const ispgestionDirect = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
});

async function request(endpoint: string, method = 'GET', data: any = null, params: any = null) {
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;
  
  // Limpiar endpoint para evitar doble barra
  const cleanEndpoint = endpoint.replace(/^\/+/, '');
  
  if (isRailway) {
    console.log(`[ISPGestión] Petición directa a ${cleanEndpoint}`);
    const response = await ispgestionDirect({ 
      url: cleanEndpoint, 
      method, 
      data, 
      params 
    });
    return response.data;
  } else {
    console.log(`[ISPGestión] Usando PROXY de Railway para ${cleanEndpoint}`);
    const response = await axios.post(RAILWAY_PROXY_URL, {
      endpoint: cleanEndpoint,
      method,
      data,
      params
    });
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
