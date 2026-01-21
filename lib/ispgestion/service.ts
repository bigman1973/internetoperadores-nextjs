import axios from 'axios';

// Credenciales de la API de ISPGestión
const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';

const ispgestion = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'X-Api-User': API_USER,
    'X-Api-Hash': API_HASH,
  },
});

/**
 * Busca un cliente en ISPGestión por su email.
 */
export async function getClienteByEmail(email: string) {
  try {
    const response = await ispgestion.get('/clientes/buscar', {
      params: { email: email },
    });

    if (response.data && response.data.clientes && response.data.clientes.length > 0) {
      return response.data.clientes[0];
    }
    return null;
  } catch (error) {
    console.error('Error al buscar cliente en ISPGestión:', error);
    return null;
  }
}

/**
 * Verifica las credenciales de un cliente en ISPGestión.
 */
export async function verifyClienteCredentials(email: string, password: string): Promise<string | null> {
  try {
    const response = await ispgestion.post('/clientes/verificar-credenciales', {
      email,
      password,
    });

    if (response.data && response.data.ispGestionId) {
      return response.data.ispGestionId;
    }
    return null;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      return null;
    }
    console.error('Error al verificar credenciales en ISPGestión:', error);
    return null;
  }
}

/**
 * Función de prueba para verificar la conexión.
 */
/**
 * Obtiene el listado completo de clientes desde ISPGestión.
 */
export async function getAllClientes() {
  try {
    // Intentamos obtener los clientes. El endpoint exacto puede variar según la versión de la API.
    // Probamos con /clientes o /clientes/lista
    const response = await ispgestion.get('/clientes');
    
    if (response.data && Array.isArray(response.data)) {
      return response.data;
    } else if (response.data && response.data.clientes) {
      return response.data.clientes;
    }
    
    return [];
  } catch (error) {
    console.error('Error al obtener clientes de ISPGestión:', error);
    throw error;
  }
}

export async function testConnection() {
  try {
    const response = await ispgestion.get('/clientes', {
      params: { limit: 1 }
    });
    
    return {
      success: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    console.error('Error en la prueba de conexión a ISPGestión:', error);
    return {
      success: false,
      error: axios.isAxiosError(error) ? error.message : 'Error desconocido',
    };
  }
}
