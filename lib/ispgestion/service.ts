import axios from 'axios';

const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';
const PROXY_URL = process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/api/ispgestion-proxy`
  : '/api/ispgestion-proxy';

/**
 * Cliente de Axios configurado para llamadas directas (usado en el servidor de Railway)
 */
const ispgestionDirect = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
});

/**
 * Función genérica para realizar peticiones a ISPGestión.
 * Si estamos en Vercel (cliente), usa el proxy de Railway.
 * Si estamos en Railway (servidor con IP autorizada), llama directo.
 */
async function request(endpoint: string, method = 'GET', data = null, params = null) {
  // Si existe la variable de entorno que indica que estamos en Railway, usamos conexión directa
  const isServerWithAuthorizedIp = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;

  if (isServerWithAuthorizedIp) {
    const response = await ispgestionDirect({ url: endpoint, method, data, params });
    return response.data;
  } else {
    // Estamos en Vercel, usamos el proxy de Railway
    // Nota: Necesitamos la URL completa de Railway si no estamos en el mismo dominio
    const railwayUrl = process.env.NEXT_PUBLIC_RAILWAY_URL || ''; 
    const response = await axios.post(`${railwayUrl}/api/ispgestion-proxy`, {
      endpoint,
      method,
      data,
      params
    });
    return response.data;
  }
}

export async function getAllClientes() {
  const endpoints = ['/clientes', '/clientes/lista', '/clientes/listado', '/v1/clientes'];
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
  } catch (error) {
    return {
      success: false,
      error: axios.isAxiosError(error) ? error.message : 'Error desconocido',
    };
  }
}

export default request;
