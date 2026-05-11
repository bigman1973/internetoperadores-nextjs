import { Suspense } from 'react';
import { getTarifasWeb } from '@/lib/tarifas-web';
import TarifasParticularClient from './TarifasParticularClient';

export const revalidate = 60;

export const metadata = {
  title: 'Tarifas para Particulares | Internet Operadores',
  description: 'Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.',
};

export default async function TarifasParticularPage() {
  const { tarifas, categorias, total } = await getTarifasWeb('particular');

  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div></div>}>
      <TarifasParticularClient tarifas={tarifas} categorias={categorias} total={total} />
    </Suspense>
  );
}
