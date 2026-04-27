import { getTarifasWeb } from '@/lib/tarifas-web';
import TarifasParticularClient from './TarifasParticularClient';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tarifas para Particulares | Internet Operadores',
  description: 'Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.',
};

export default async function TarifasParticularPage() {
  noStore();
  const { tarifas, categorias, total } = await getTarifasWeb('particular');

  return <TarifasParticularClient tarifas={tarifas} categorias={categorias} total={total} />;
}
