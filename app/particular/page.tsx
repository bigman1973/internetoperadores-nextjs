import { getTarifasLandingParticular } from '@/lib/tarifas-web';
import ParticularLandingClient from './ParticularLandingClient';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Particulares | Internet Operadores',
  description: 'Fibra + Móvil sin complicaciones. Conectividad de alta velocidad para tu hogar.',
};

export default async function ParticularPage() {
  noStore();
  const tarifasTop = await getTarifasLandingParticular();

  return <ParticularLandingClient tarifasTop={tarifasTop} />;
}
