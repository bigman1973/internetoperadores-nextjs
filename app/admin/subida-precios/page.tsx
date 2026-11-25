import { requireSubidaPage } from '@/lib/subida-precios/auth';
import { datasetDisponible } from '@/lib/subida-precios/data';
import SubidaClient from './SubidaClient';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export default async function SubidaPreciosPage({ searchParams }: { searchParams: Promise<{ cliente?: string | string[] }> }) {
  const auth = await requireSubidaPage();
  const listo = await datasetDisponible();
  const p = await searchParams;
  const c = Array.isArray(p.cliente) ? p.cliente[0] : p.cliente;
  const clienteInicial = typeof c === 'string' ? c.slice(0, 120) : '';
  return <SubidaClient puedeAprobar={auth.puedeAprobar} rol={auth.rol} migracionLista={listo} clienteInicial={clienteInicial} />;
}
