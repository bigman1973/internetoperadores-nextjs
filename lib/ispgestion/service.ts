import axios from 'axios';
import { prisma } from '../prisma';
import bcrypt from 'bcryptjs';

const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
const RAILWAY_PROXY_URL = 'https://internetoperadores-production.up.railway.app/api/ispgestion-proxy';

const ispgestionDirect = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
});

async function request(endpoint: string, method = 'GET', data = null, params = null) {
  // Si estamos en Railway, vamos directo
  const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;
  
  if (isRailway) {
    console.log(`[ISPGestión] Petición directa a ${endpoint}`);
    const response = await ispgestionDirect({ 
      url: endpoint, 
      method, 
      data, 
      params 
    });
    return response.data;
  } else {
    // Si estamos en Vercel o Local, usamos el proxy de Railway
    console.log(`[ISPGestión] Usando PROXY de Railway para ${endpoint}`);
    const response = await axios.post(RAILWAY_PROXY_URL, {
      endpoint,
      method,
      data,
      params
    });
    return response.data;
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
  const endpoints = ['/clientes', '/clientes/lista', '/v1/clientes'];
  let lastError = null;
  
  for (const endpoint of endpoints) {
    try {
      const data = await request(endpoint);
      if (data) {
        if (Array.isArray(data)) return data;
        if (data.clientes && Array.isArray(data.clientes)) return data.clientes;
        if (data.data && Array.isArray(data.data)) return data.data;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No se pudo encontrar un endpoint válido para clientes');
}

export async function testConnection() {
  try {
    const data = await request('/clientes', 'GET', null, { limit: 1 });
    return { success: true, data };
  } catch (error: any) {
    return { 
      success: false, 
      error: error.response?.data?.error || error.message || 'Error desconocido' 
    };
  }
}

export default request;
