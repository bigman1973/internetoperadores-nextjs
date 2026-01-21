import axios from 'axios';

const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';

const ispgestion = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
  },
});

/**
 * Obtiene el listado completo de clientes desde ISPGestión probando varios endpoints comunes.
 */
export async function getAllClientes() {
  const endpoints = ['/clientes', '/clientes/lista', '/clientes/listado', '/v1/clientes'];
  let lastErrorDetail = '';

  for (const endpoint of endpoints) {
    try {
      const response = await ispgestion.get(endpoint);
      
      if (response.data) {
        if (Array.isArray(response.data)) return response.data;
        if (response.data.clientes && Array.isArray(response.data.clientes)) return response.data.clientes;
        if (response.data.data && Array.isArray(response.data.data)) return response.data.data;
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data;
        lastErrorDetail = `Status ${status}: ${JSON.stringify(data) || error.message}`;
        
        // Si es 401, el problema es de credenciales o IP, no de endpoint
        if (status === 401) {
          throw new Error(`Error de Autenticación (401): Verifica que el usuario VOLA tenga permisos y que la IP de Vercel esté habilitada. Detalle: ${lastErrorDetail}`);
        }
      }
    }
  }

  throw new Error(`No se pudo sincronizar: ${lastErrorDetail || 'Error desconocido'}`);
}

export async function testConnection() {
  try {
    const response = await ispgestion.get('/clientes', { params: { limit: 1 } }).catch(() => 
      ispgestion.get('/clientes/lista', { params: { limit: 1 } })
    );
    
    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    return {
      success: false,
      error: axios.isAxiosError(error) ? `Status ${error.response?.status}: ${error.message}` : 'Error desconocido',
    };
  }
}

export default ispgestion;
