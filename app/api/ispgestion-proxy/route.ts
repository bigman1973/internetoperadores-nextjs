import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const { endpoint, method = 'GET', data = null, params = null } = await request.json();

    const API_URL = process.env.ISP_GESTION_API_URL || 'https://internetoperadores.ispgestion.com/api';
    const API_USER = process.env.ISP_GESTION_API_USER || 'VOLA';
    const API_HASH = process.env.ISP_GESTION_API_HASH || '04b7c2df9d9656133e54f5f4ca3ce2ec';

    console.log(`Proxying ${method} request to ISPGestión: ${endpoint}`);

    const response = await axios({
      url: `${API_URL}${endpoint}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${API_USER}:${API_HASH}`).toString('base64')}`,
      },
      params,
      data,
    });

    return NextResponse.json(response.data);
  } catch (error) {
    console.error('Error in ISPGestión Proxy:', axios.isAxiosError(error) ? error.message : error);
    
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(
        { error: error.message, details: error.response.data },
        { status: error.response.status }
      );
    }

    return NextResponse.json(
      { error: 'Error interno en el proxy' },
      { status: 500 }
    );
  }
}
