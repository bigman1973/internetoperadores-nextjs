import { getTarifasLandingParticular } from '@/lib/tarifas-web';
import ParticularLandingClient from './ParticularLandingClient';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Internet para tu hogar | Fibra, 4G y 5G donde vivas | Internet Operadores',
  description: 'Internet donde vivas. Sin excusas. Fibra óptica, 4G o 5G: te conectamos con la mejor tecnología disponible en tu zona. Sin permanencia, sin letra pequeña. Desde 29€/mes.',
  openGraph: {
    title: 'Internet donde vivas. Sin excusas. | Internet Operadores',
    description: 'Fibra, 4G o 5G: te conectamos con la mejor tecnología disponible en tu zona. Sin permanencia, sin subidas de precio.',
    images: ['/hero-b2c-familia.png'],
  },
};

export default async function ParticularPage() {
  noStore();
  const tarifasTop = await getTarifasLandingParticular();

  return <ParticularLandingClient tarifasTop={tarifasTop} />;
}
