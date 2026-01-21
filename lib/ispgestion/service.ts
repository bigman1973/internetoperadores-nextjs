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
  let lastError = null;

  for (const endpoint of endpoints) {
    try {
      console.log(`Probando endpoint: ${endpoint}`);
      const response = await ispgestion.get(endpoint);
      
      if (response.data) {
        // Manejar diferentes formatos de respuesta
        if (Array.isArray(response.data)) return response.data;
        if (response.data.clientes && Array.isArray(response.data.clientes)) return response.data.clientes;
        if (response.data.data && Array.isArray(response.data.data)) return response.data.data;
      }
    } catch (error) {
      lastError = error;
      console.warn(`Fallo en endpoint ${endpoint}:`, axios.isAxiosError(error) ? error.message : error);
    }
  }

  throw lastError || new Error('No se pudo encontrar un endpoint válido para clientes');
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
      error: axios.isAxiosError(error) ? error.message : 'Error desconocido',
    };
  }
}

export default ispgestion;
