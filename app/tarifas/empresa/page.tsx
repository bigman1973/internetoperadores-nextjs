import { getTarifasWeb } from '@/lib/tarifas-web';
import TarifasEmpresaClient from './TarifasEmpresaClient';
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Tarifas para Empresas | Internet Operadores',
  description: 'Soluciones de conectividad, comunicaciones y mantenimiento IT para tu negocio. Tarifas transparentes y sin sorpresas.',
};

export default async function TarifasEmpresaPage() {
  noStore();
  const { tarifas, categorias, total } = await getTarifasWeb('empresa');

  return <TarifasEmpresaClient tarifas={tarifas} categorias={categorias} total={total} />;
}
