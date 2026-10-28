/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Next.js 16 tiene un bug con RouteHandlerConfig en rutas con múltiples params dinámicos
    // El type check pasa con tsc --noEmit pero falla en next build
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['@prisma/client', 'pdf-parse'],

  // Aumentar límite de body para enviar imágenes de PDF a GPT Vision
  experimental: {
    // Evitar picos de memoria durante la generación de cientos de rutas en CI y entornos limitados
    cpus: 1,
    // Ensayo de entrega: elimina el viaje CSS inicial sin transformar HTML ni
    // recortar reglas. Next la aplica a todo el build: promoción explícita de
    // la versión validada, independiente de las guardas del sandbox financiero.
    inlineCss: process.env.FINANCE_STAGING_SANDBOX === '1'
      || (process.env.FINANCE_CONCILIAR_PRODUCTION_ENABLED === '1'
        && process.env.FINANCE_CONCILIAR_INLINE_CSS_ENABLED === '1'),
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },

  // Optimizar imágenes
  images: {
    formats: ['image/avif', 'image/webp'],
  },

  async headers() {
    return [
      // Admin y API: sin caché (datos dinámicos)
      {
        source: '/admin/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/login',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      {
        source: '/cliente/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
      // Assets estáticos: caché agresiva (1 año, inmutable por hash)
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Imágenes públicas: caché de 1 día
      {
        source: '/images/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=43200' },
        ],
      },
      // Páginas públicas: permitir caché con stale-while-revalidate
      {
        source: '/((?!admin|api|login|cliente).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=300' },
        ],
      },
    ];
  },
};

export default nextConfig;
