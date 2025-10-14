import Stripe from 'stripe';

// Validar que la clave secreta existe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error(
    'STRIPE_SECRET_KEY no está configurada. Por favor, configura esta variable de entorno en Vercel.'
  );
}

// Inicializar Stripe con la clave secreta
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

