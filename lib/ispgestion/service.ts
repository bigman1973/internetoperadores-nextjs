import axios from 'axios';

const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';

const ispgestionDirect = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
});

async function request(endpoint: string, method = 'GET', data = null, params = null) {
  const isServerWithAuthorizedIp = process.env.RAILWAY_ENVIRONMENT || process.env.IS_RAILWAY;

  if (isServerWithAuthorizedIp) {
    const response = await ispgestionDirect({ url: endpoint, method, data, params });
    return response.data;
  } else {
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

export async function verifyClienteCredentials(email: string, pass: string) {
  try {
    const data = await request('/clientes/login', 'POST', { email, pass });
    return data && data.success ? data.cliente : null;
  } catch (error) {
    console.error('Error verificando credenciales en ISPGestión:', error);
    return null;
  }
}

export async function getClienteByEmail(email: string) {
  try {
    const data = await request('/clientes', 'GET', null, { email });
    if (Array.isArray(data)) return data[0];
    if (data.clientes && Array.isArray(data.clientes)) return data.clientes[0];
    return null;
  } catch (error) {
    console.error('Error obteniendo cliente por email en ISPGestión:', error);
    return null;
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
    return { success: false, error: axios.isAxiosError(error) ? error.message : 'Error desconocido' };
  }
}

export default request;
