import Stripe from 'stripe';

// Validar que la clave secreta existe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    'STRIPE_SECRET_KEY no está configurada. Por favor, configura esta variable de entorno en Vercel.'
  );
}

// Inicializar Stripe con configuración optimizada para Vercel
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  maxNetworkRetries: 3,
  timeout: 30000, // 30 segundos
  httpAgent: null, // Usar el agente HTTP por defecto
});

