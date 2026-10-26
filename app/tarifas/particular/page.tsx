import { getTarifasWeb } from '@/lib/tarifas-web';
import { prisma } from '@/lib/prisma';
import TarifasParticularClient from './TarifasParticularClient';

export const revalidate = 60;

export const metadata = {
  title: 'Tarifas para Particulares | Internet Operadores',
  description: 'Encuentra la tarifa perfecta para tu hogar. Internet, móvil y línea fija con la mejor cobertura.',
};

export default async function TarifasParticularPage() {
  const [{ tarifas, total }, masVendidoRows] = await Promise.all([
    getTarifasWeb('particular'),
    prisma.tarifaSeccionWebParticular.findMany({
      where: { seccion: 'mas-vendido' },
      select: { tarifaId: true },
    }),
  ]);
  const masVendidoIds = masVendidoRows.map(r => r.tarifaId);

  return (
    <TarifasParticularClient tarifas={tarifas} total={total} masVendidoIds={masVendidoIds} />
  );
}
