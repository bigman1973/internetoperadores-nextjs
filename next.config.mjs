/** @type {import('next').NextConfig} */
const nextConfig = {
  // Forzar rebuild completo sin caché
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
  // Desactivar optimización de imágenes para forzar rebuild
  images: {
    unoptimized: true,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
};

export default nextConfig;

