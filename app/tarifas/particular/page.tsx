import { getTarifasWeb } from '@/lib/tarifas-web';
import TarifasParticularClient from './TarifasParticularClient';

export const revalidate = 3600; // Revalidar cada hora

export const metadata = {
  title: 'Tarifas para Particulares | Internet Operadores',
  description: 'Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.',
};

export default async function TarifasParticularPage() {
  const { tarifas, categorias, total } = await getTarifasWeb('particular');

  return <TarifasParticularClient tarifas={tarifas} categorias={categorias} total={total} />;
}
