import { getTarifasLandingParticular } from '@/lib/tarifas-web';
import ParticularLandingClient from './ParticularLandingClient';

// ISR: regenerar cada 60 segundos (las tarifas no cambian cada segundo)
export const revalidate = 60;

export const metadata = {
  title: 'Internet para tu hogar | Fibra, 4G y 5G donde vivas | Internet Operadores',
  description: 'Fibra, 4G o 5G: te conectamos con la mejor tecnología disponible en tu zona. Sin permanencia, sin letra pequeña, precio fijo garantizado.',
};

export default async function ParticularPage() {
  const tarifasTop = await getTarifasLandingParticular();

  return <ParticularLandingClient tarifasTop={tarifasTop} />;
}
